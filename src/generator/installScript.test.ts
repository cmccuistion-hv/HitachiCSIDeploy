import { execFileSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import { filledReplicationState, filledState } from '../test/fixtures'
import { wizardVersion } from '../wizardVersion'
import { generateInstallScript, type GeneratedFile } from './yaml'

function yamlFile(path: string, group: GeneratedFile['group'] = 'driver'): GeneratedFile {
  return {
    path,
    content: 'apiVersion: v1',
    description: path,
    group,
  }
}

describe('generateInstallScript', () => {
  it('installs and approves the OpenShift OperatorHub subscription', () => {
    const script = generateInstallScript(filledState(), [
      yamlFile('02-driver/operatorhub-namespace.yaml'),
      yamlFile('02-driver/operatorhub-operatorgroup.yaml'),
      yamlFile('02-driver/operatorhub-subscription.yaml'),
      yamlFile('02-driver/hspc-cr.yaml'),
    ])

    expect(script).toContain('CMD="oc"')
    expect(script).toContain('apply "02-driver/operatorhub-subscription.yaml"')
    expect(script).toContain('approve_installplan')
    expect(script).toContain('wait_csv_succeeded')
  })

  it('waits for the HSPC CRD before applying the CSI Driver instance', () => {
    const script = generateInstallScript(filledState(), [
      yamlFile('02-driver/operatorhub-namespace.yaml'),
      yamlFile('02-driver/operatorhub-operatorgroup.yaml'),
      yamlFile('02-driver/operatorhub-subscription.yaml'),
      yamlFile('02-driver/hspc-cr.yaml'),
    ])

    const csvWait = script.indexOf('wait_csv_succeeded "$OPERATOR_NS" "$OPERATOR_SUB"')
    const crdWait = script.indexOf('wait_hspc_crd')
    const applyCr = script.indexOf('apply "02-driver/hspc-cr.yaml"')

    expect(csvWait).toBeGreaterThan(-1)
    expect(crdWait).toBeGreaterThan(csvWait)
    expect(applyCr).toBeGreaterThan(crdWait)
    expect(script).toContain('hspcs.csi.hitachi.com')
    expect(script).toContain('condition=Established')
    expect(script).toContain('wait_crd hspcs.csi.hitachi.com hspc')
    execFileSync('bash', ['-n'], { input: script, encoding: 'utf8' })
  })

  it('waits for cert-manager Certificate and Issuer APIs before applying the DR operator', () => {
    const script = generateInstallScript(filledReplicationState(), [
      yamlFile('03-replication/cert-manager.yaml', 'replication'),
      yamlFile('03-replication/dr-operator-install.yaml', 'replication'),
    ])

    const webhookWait = script.lastIndexOf('wait_cert_manager')
    const certCrd = script.indexOf('wait_crd certificates.cert-manager.io')
    const issuerCrd = script.indexOf('wait_crd issuers.cert-manager.io')
    const applyDr = script.indexOf('apply "03-replication/dr-operator-install.yaml"')

    expect(webhookWait).toBeGreaterThan(-1)
    expect(certCrd).toBeGreaterThan(webhookWait)
    expect(issuerCrd).toBeGreaterThan(certCrd)
    expect(applyDr).toBeGreaterThan(issuerCrd)
    expect(script).toContain('condition=Established')
    execFileSync('bash', ['-n'], { input: script, encoding: 'utf8' })
  })

  it('sets DR operator fsGroup from the OpenShift namespace supplemental-groups range before apply', () => {
    const script = generateInstallScript(filledReplicationState(), [
      yamlFile('03-replication/cert-manager.yaml', 'replication'),
      yamlFile('03-replication/dr-operator-install.yaml', 'replication'),
    ])

    const patch = script.indexOf('ensure_dr_operator_fsgroup')
    const applyDr = script.indexOf('apply "03-replication/dr-operator-install.yaml"')
    expect(patch).toBeGreaterThan(-1)
    expect(applyDr).toBeGreaterThan(patch)
    expect(script).toContain('openshift.io/sa.scc.supplemental-groups')
    expect(script).toContain('hspc-replication-operator-system')
    expect(script).toMatch(/sed -i/)
    execFileSync('bash', ['-n'], { input: script, encoding: 'utf8' })
  })

  it('does not patch DR operator fsGroup on Kubernetes', () => {
    const script = generateInstallScript(
      filledReplicationState({
        platform: 'kubernetes',
        driverNamespace: 'kube-system',
        operatorNamespace: 'hspc-operator-system',
      }),
      [
        yamlFile('03-replication/cert-manager.yaml', 'replication'),
        yamlFile('03-replication/dr-operator-install.yaml', 'replication'),
      ],
    )

    expect(script).toContain('CMD="kubectl"')
    expect(script).not.toContain('ensure_dr_operator_fsgroup')
    expect(script).toContain('apply "03-replication/dr-operator-install.yaml"')
  })

  it('rewrites fsGroup in dr-operator-install.yaml from the namespace supplemental-groups start', () => {
    const script = generateInstallScript(filledReplicationState(), [
      yamlFile('03-replication/dr-operator-install.yaml', 'replication'),
    ])
    const start = script.indexOf('ensure_dr_operator_fsgroup() {')
    expect(start).toBeGreaterThan(-1)
    const end = script.indexOf('\n}', start)
    const fn = script.slice(start, end + 3)

    const yaml = [
      'spec:',
      '  template:',
      '    spec:',
      '      securityContext:',
      '        fsGroup: 2000',
      '        runAsNonRoot: true',
      '',
    ].join('\n')

    const out = execFileSync(
      'bash',
      [
        '-c',
        `${fn}
set -euo pipefail
file=$(mktemp)
printf '%s' ${JSON.stringify(yaml)} > "$file"
oc() {
  if [[ "$1" == get && "$2" == ns ]]; then
    echo '1000830000/10000'
    return 0
  fi
  return 0
}
CMD=oc
ensure_dr_operator_fsgroup "$file" hspc-replication-operator-system
grep -F 'fsGroup: 1000830000' "$file"
grep -F 'runAsNonRoot: true' "$file"
`,
      ],
      { encoding: 'utf8' },
    )
    expect(out).toContain('fsGroup: 1000830000')
  })

  it('retries every apply when kubectl cannot map a CRD kind yet', () => {
    const script = generateInstallScript(filledReplicationState(), [
      yamlFile('03-replication/cert-manager.yaml', 'replication'),
      yamlFile('03-replication/dr-operator-install.yaml', 'replication'),
    ])

    const rawApply = [...script.matchAll(/"\$CMD" apply -f[^\n]*/g)].map((m) => m[0])
    expect(rawApply).toHaveLength(1)
    expect(rawApply[0]).toContain('"$CMD" apply -f "$src"')
    expect(script).toContain('apply_manifest()')
    expect(script).toContain('is_crd_discovery_error')
    expect(script).toContain('no matches for kind')
    expect(script).toContain('ensure CRDs are installed first')
    expect(script).toContain('apply_manifest "$1"')
    expect(script).toContain('apply_manifest "$f"')
    expect(script).not.toMatch(/apply_url\(\) \{ echo "==> Applying \$1"; "\$CMD" apply -f "\$1"; \}/)
    execFileSync('bash', ['-n'], { input: script, encoding: 'utf8' })
  })

  it('retries apply_manifest until the CRD kind is discoverable and fails other apply errors immediately', () => {
    const script = generateInstallScript(filledState(), [yamlFile('02-driver/hspc-cr.yaml')])
    const start = script.indexOf('APPLY_CRD_WAIT_SEC="${APPLY_CRD_WAIT_SEC:-300}"')
    const end = script.indexOf('# Wait until a CRD is Established')
    expect(start).toBeGreaterThan(-1)
    expect(end).toBeGreaterThan(start)
    const helpers = script.slice(start, end)

    const retryThenOk = execFileSync(
      'bash',
      [
        '-c',
        `${helpers}
set -euo pipefail
attempts_file=$(mktemp)
echo 0 > "$attempts_file"
kubectl() {
  if [[ "$1" == apply ]]; then
    local n
    n=$(($(cat "$attempts_file") + 1))
    echo "$n" > "$attempts_file"
    if (( n < 3 )); then
      echo 'error: resource mapping not found for name: "hspc" namespace: "ns" from "cr.yaml": no matches for kind "HSPC" in version "csi.hitachi.com/v1"' >&2
      echo 'ensure CRDs are installed first' >&2
      return 1
    fi
    echo 'hspc.csi.hitachi.com/hspc created'
    return 0
  fi
  return 0
}
CMD=kubectl
APPLY_CRD_WAIT_SEC=30
APPLY_CRD_POLL_SEC=0
apply_manifest cr.yaml
echo attempts=$(cat "$attempts_file")
`,
      ],
      { encoding: 'utf8' },
    )
    expect(retryThenOk).toContain('hspc.csi.hitachi.com/hspc created')
    expect(retryThenOk).toContain('attempts=3')

    expect(() =>
      execFileSync(
        'bash',
        [
          '-c',
          `${helpers}
set -euo pipefail
attempts=0
kubectl() {
  attempts=$((attempts + 1))
  echo 'error: error validating "bad.yaml": invalid' >&2
  return 1
}
CMD=kubectl
apply_manifest bad.yaml
`,
        ],
        { encoding: 'utf8' },
      ),
    ).toThrow(/error validating/)
  })

  it('skips day-0 InstallPlan approval when the operator CSV already succeeded', () => {
    const script = generateInstallScript(filledState(), [
      yamlFile('02-driver/operatorhub-namespace.yaml'),
      yamlFile('02-driver/operatorhub-operatorgroup.yaml'),
      yamlFile('02-driver/operatorhub-subscription.yaml'),
      yamlFile('02-driver/hspc-cr.yaml'),
    ])

    expect(script).toContain('existing_csv_succeeded()')
    expect(script).toContain('if existing_csv_succeeded "$ns" "$pkg"; then')
    expect(script).toContain('Operator CSV already Succeeded; no day-0 InstallPlan approval is needed.')
    expect(script).toContain('approve_installplan "$OPERATOR_NS" "$OPERATOR_SUB"')
  })

  it('after applying MachineConfig, waits for a new MCP rendered configuration', () => {
    const script = generateInstallScript(filledState(), [
      yamlFile('00-prereq/hitachi-csi-multipath.yaml', 'prereq'),
    ])

    const record = script.indexOf('record_mcp_rendered')
    const applyMc = script.indexOf('apply "00-prereq/hitachi-csi-multipath.yaml"')
    const requireNew = script.indexOf('MCP_REQUIRE_NEW_RENDERED=1')
    const wait = script.lastIndexOf('wait_mcp_healthy')

    expect(record).toBeGreaterThan(-1)
    expect(applyMc).toBeGreaterThan(record)
    expect(requireNew).toBeGreaterThan(applyMc)
    expect(wait).toBeGreaterThan(requireNew)
    expect(script).toContain('status.configuration.name')
    expect(script).toContain('status.configuration.source')
    execFileSync('bash', ['-n'], { input: script, encoding: 'utf8' })
  })

  it('uses kubectl without applying OperatorHub manifests on Kubernetes', () => {
    const script = generateInstallScript(
      filledState({
        platform: 'kubernetes',
        driverNamespace: 'kube-system',
        operatorNamespace: 'hspc-operator-system',
      }),
      [yamlFile('02-driver/hspc-cr.yaml')],
    )

    expect(script).toContain('CMD="kubectl"')
    expect(script).not.toContain('operatorhub-namespace.yaml')
    expect(script).not.toContain('operatorhub-operatorgroup.yaml')
    expect(script).not.toContain('operatorhub-subscription.yaml')
  })

  it('stamps the wizard build id in the header and after logging starts', () => {
    const stamp = wizardVersion()
    const script = generateInstallScript(filledState(), [yamlFile('02-driver/hspc-cr.yaml')])
    const lines = script.split('\n')
    const teeIdx = lines.findIndex((line) => line.includes('exec > >(tee -a "$INSTALL_LOG") 2>&1'))
    expect(script).toContain(`# Wizard: ${stamp}`)
    expect(teeIdx).toBeGreaterThan(-1)
    expect(lines.slice(teeIdx + 1).some((line) => line === `echo "==> Wizard ${stamp}"`)).toBe(true)
  })

  it('quotes MCP jsonpath filters so bash command substitution can parse them', () => {
    const script = generateInstallScript(filledState(), [
      {
        path: '00-prereq/hitachi-csi-multipath.yaml',
        content: 'apiVersion: machineconfiguration.openshift.io/v1',
        description: 'multipath MachineConfig',
        group: 'prereq',
      },
    ])
    const lines = script.split('\n').filter((l) => l.includes('get mcp') && l.includes('jsonpath='))
    expect(lines.length).toBeGreaterThan(0)
    for (const line of lines) {
      expect(line, line).toMatch(/jsonpath="/)
      execFileSync('bash', ['-c', `CMD=true; p=worker; ${line.trim()}`], { encoding: 'utf8' })
    }
  })
})
