import { execFileSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import { filledState } from '../test/fixtures'
import { wizardVersion } from '../wizardVersion'
import { generateInstallScript, type GeneratedFile } from './yaml'

function yamlFile(path: string): GeneratedFile {
  return {
    path,
    content: 'apiVersion: v1',
    description: path,
    group: 'driver',
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
