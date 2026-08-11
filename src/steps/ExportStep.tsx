import { useEffect, useMemo, useState } from 'react'
import JSZip from 'jszip'
import { DOCS, REPO } from '../catalog/components'
import { HELP } from '../catalog/help'
import { PLATFORMS } from '../catalog/platforms'
import type { WizardState } from '../catalog/types'
import { generateAll, type GeneratedFile } from '../generator/yaml'
import { useWizard } from '../state/WizardContext'
import { Callout, CodeBlock, CopyButton, DownloadButton, Section } from '../components/ui'

const FILE_GROUPS: {
  id: GeneratedFile['group']
  title: string
  folder: string
}[] = [
  { id: 'prereq', title: 'Prerequisites', folder: '00-prereq/' },
  { id: 'storage', title: 'Storage', folder: '01-storage/' },
  { id: 'driver', title: 'CSI Driver', folder: '02-driver/' },
  { id: 'replication', title: 'Replication', folder: '03-replication/' },
  { id: 'metrics', title: 'Performance Metrics', folder: '04-metrics/' },
  { id: 'console', title: 'Console Plugin', folder: '05-console/' },
  { id: 'quickstart', title: 'Test volume', folder: '06-quickstart/' },
  { id: 'scripts', title: 'Install script', folder: './' },
]

function fileKind(path: string): string {
  if (path.endsWith('.sh')) return 'sh'
  if (path.endsWith('.md')) return 'md'
  if (path.endsWith('.yaml') || path.endsWith('.yml')) return 'yaml'
  if (path.endsWith('.conf')) return 'conf'
  if (path.endsWith('.json')) return 'json'
  const parts = path.split('.')
  return parts.length > 1 ? parts[parts.length - 1] : 'file'
}

export function ExportStep() {
  const { state, exportConfig, importConfig, reset } = useWizard()
  const plat = PLATFORMS[state.platform]
  const cmd = plat.useOc ? 'oc' : 'kubectl'
  const files = useMemo(() => generateAll(state), [state])
  const [activePath, setActivePath] = useState<string>('')
  const [importText, setImportText] = useState('')

  useEffect(() => {
    if (!files.length) {
      setActivePath('')
      return
    }
    if (!files.some((f) => f.path === activePath)) {
      setActivePath(files[0].path)
    }
  }, [files, activePath])

  const guide = buildGuide(state, files, cmd)
  const current = files.find((f) => f.path === activePath) || files[0]
  const grouped = FILE_GROUPS.map((g) => ({
    ...g,
    files: files.filter((f) => f.group === g.id),
  })).filter((g) => g.files.length > 0)

  const downloadZip = async () => {
    const zip = new JSZip()
    zip.file('INSTALL.md', guide)
    zip.file('wizard-config.json', exportConfig())
    for (const f of files) {
      zip.file(f.path, f.content)
    }
    const blob = await zip.generateAsync({ type: 'blob' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `hitachi-csi-deployment-${state.versions.driver}.zip`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="step-panel">
      <h2>Review &amp; export</h2>
      <p className="lede">
        Download a complete package: ordered install guide, manifests, and <code>install.sh</code>. Config
        is also saved in this browser for resume.
      </p>

      <Callout>{HELP.configuratorVsApply}</Callout>

      <Section
        title="Actions"
        actions={
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-primary" onClick={downloadZip}>
              Download ZIP
            </button>
            <CopyButton text={guide} label="Copy install guide" />
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                const blob = new Blob([exportConfig()], { type: 'application/json' })
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = url
                a.download = 'hitachi-csi-wizard-config.json'
                a.click()
                URL.revokeObjectURL(url)
              }}
            >
              Export config JSON
            </button>
            <button type="button" className="btn btn-danger" onClick={reset}>
              Reset wizard
            </button>
          </div>
        }
      >
        <Callout variant="ok">
          Generated {files.length} files for <strong>{plat.displayName}</strong> / CSI Driver{' '}
          <strong>{state.versions.driver}</strong>. Upstream templates:{' '}
          <a href={REPO.githubUrl} target="_blank" rel="noreferrer">
            {REPO.owner}/{REPO.name}
          </a>
        </Callout>
      </Section>

      <Section title="Install guide">
        <CodeBlock className="yaml-preview" style={{ maxHeight: 360 }}>
          {guide}
        </CodeBlock>
      </Section>

      <Section
        title="Generated files"
        actions={
          current ? (
            <DownloadButton
              filename={current.path.split('/').pop() || 'file'}
              content={current.content}
              label="Download file"
            />
          ) : null
        }
      >
        <div className="file-browser">
          {grouped.map((group) => (
            <div key={group.id} className="file-group">
              <div className="file-group-header">
                <h4 className="file-group-title">
                  {group.title}{' '}
                  <span className="file-group-path">{group.folder}</span>
                </h4>
                <span className="file-group-count">
                  {group.files.length} file{group.files.length === 1 ? '' : 's'}
                </span>
              </div>
              <div className="file-group-files">
                {group.files.map((f) => {
                  const name = f.path.split('/').pop() || f.path
                  const kind = fileKind(f.path)
                  const selected = current?.path === f.path
                  return (
                    <button
                      key={f.path}
                      type="button"
                      className={`file-chip${selected ? ' active' : ''}`}
                      onClick={() => setActivePath(f.path)}
                      title={`${f.path} — ${f.description}`}
                    >
                      <span className="file-chip-kind">{kind}</span>
                      <span className="file-chip-name">{name}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
        {current && (
          <>
            <p style={{ fontSize: '0.85rem', color: 'var(--hv-text-subtle)', marginTop: 0 }}>
              <code>{current.path}</code> — {current.description}
            </p>
            <CodeBlock className="yaml-preview">{current.content}</CodeBlock>
          </>
        )}
      </Section>

      <Section title="Import saved config">
        <textarea
          rows={5}
          style={{ width: '100%', fontFamily: 'var(--hv-mono)', fontSize: '0.8rem' }}
          placeholder="Paste wizard-config.json here"
          value={importText}
          onChange={(e) => setImportText(e.target.value)}
        />
        <button
          type="button"
          className="btn btn-secondary"
          style={{ marginTop: '0.5rem' }}
          onClick={() => {
            try {
              importConfig(importText)
              alert('Config imported.')
            } catch {
              alert('Invalid JSON config.')
            }
          }}
        >
          Import
        </button>
      </Section>

      <Section title="Documentation">
        <ul>
          <li>
            <a href={DOCS.hspc} target="_blank" rel="noreferrer">
              CSI Driver installation &amp; user guide
            </a>
          </li>
          <li>
            <a href={DOCS.hrpc} target="_blank" rel="noreferrer">
              Replication installation &amp; user guide
            </a>
          </li>
          <li>
            <a href={DOCS.hspp} target="_blank" rel="noreferrer">
              Performance Metrics installation &amp; user guide
            </a>
          </li>
        </ul>
      </Section>
    </div>
  )
}

function buildGuide(state: WizardState, files: GeneratedFile[], cmd: string): string {
  const plat = PLATFORMS[state.platform]
  const lines: string[] = [
    '# Hitachi CSI Deployment Guide',
    '',
    `Platform: ${plat.displayName} ${state.platformVersion}`,
    `Worker nodes: ${state.nodeEnvironment === 'virtual-machine' ? 'Virtual machine' : 'Bare metal'}`,
    `Connection: ${state.connectionType}`,
    `CSI Driver: ${state.versions.driver}`,
    state.components.replication ? `Replication: ${state.versions.replication}` : '',
    state.components.metrics ? `Performance Metrics: ${state.versions.metrics}` : '',
    '',
    '## After install',
    '',
    '1. Prerequisites complete (multipath / initiator / licenses as required).',
    '2. Run `./install.sh` — applies driver path, Secret, StorageClass, and the test PVC/Pod.',
    '3. Confirm PVC Bound and test Pod Running.',
    '',
  ]

  if (state.multipath.enabled) {
    lines.push('## Multipath', '')
    if (state.multipath.includeConf) {
      lines.push('- `00-prereq/multipath.conf` — Hitachi CSI Device Mapper Multipath sample')
    }
    if (plat.useOc && state.multipath.includeMachineConfig) {
      lines.push(
        '- OpenShift MachineConfig(s) under `00-prereq/` embedding that conf into `/etc/multipath.conf`',
        '',
        '> **Reboots:** Applying MachineConfig **reboots nodes** in the pool (rolling). Wait until',
        '> `UPDATED=True` / `UPDATING=False` before installing the CSI Driver.',
        '',
        '```bash',
        `${cmd} apply -f 00-prereq/`,
        `${cmd} get mcp -w`,
        '# Proceed only when UPDATED=True and UPDATING=False',
        '```',
        '',
      )
    } else if (state.multipath.includeConf) {
      lines.push(
        '',
        '```bash',
        'sudo cp 00-prereq/multipath.conf /etc/multipath.conf',
        'sudo systemctl enable --now multipathd',
        '```',
        '',
      )
    }
  }

  if (plat.operatorHub) {
    lines.push(
      '## Install CSI Driver (OpenShift OperatorHub)',
      '',
      '1. Open OperatorHub / Software Catalog.',
      '2. Search **Hitachi Storage Plug-in for Containers**.',
      `3. Install into namespace \`${state.operatorNamespace}\` with **Manual** update approval.`,
      '4. Wait for Operator status Succeeded.',
      `5. Create the CSI Driver instance in the same namespace (\`${state.driverNamespace}\`), or apply \`02-driver/hspc-cr.yaml\`.`,
      '6. Verify:',
      '',
      '```bash',
      `${cmd} get hspc -n ${state.driverNamespace}`,
      '```',
      '',
    )
  } else {
    lines.push(
      '## Install CSI Driver (Kubernetes)',
      '',
      '```bash',
      `${cmd} apply -f https://raw.githubusercontent.com/hitachi-vantara/csi-operator-hitachi/main/hspc/${state.versions.driver}/operator/hspc-operator-namespace.yaml`,
      `${cmd} apply -f https://raw.githubusercontent.com/hitachi-vantara/csi-operator-hitachi/main/hspc/${state.versions.driver}/operator/hspc-operator.yaml`,
      `${cmd} apply -f 02-driver/hspc-cr.yaml`,
      `${cmd} get hspc -n ${state.driverNamespace}`,
      '```',
      '',
    )
  }

  lines.push(
    '## Apply storage configuration',
    '',
    '```bash',
    ...files.filter((f) => f.group === 'storage').map((f) => `${cmd} apply -f ${f.path}`),
    '```',
    '',
  )

  if (state.components.replication) {
    lines.push(
      '## Replication + Disaster Recovery',
      '',
      '`install.sh` applies the Replication operator, storage secrets, cert-manager, and the DR operator.',
      '',
      '**Your only input:** set both kubeconfig paths before running `install.sh` so remote Secrets are created automatically:',
      '',
      '```bash',
      'export KUBECONFIG_P=/path/to/primary-kubeconfig',
      'export KUBECONFIG_S=/path/to/secondary-kubeconfig',
      './install.sh',
      '```',
      '',
      'See `03-replication/README.md` and `03-replication/remote-kubeconfig-notes.md`.',
      '',
    )
  }
  if (state.components.metrics) {
    lines.push('## Performance Metrics', '', 'See `04-metrics/README.md`.', '')
  }
  if (state.components.consolePlugin) {
    lines.push('## OpenShift Console Plugin', '', 'See `05-console/README.md`.', '')
  }

  lines.push(
    '## Test volume (smoke check)',
    '',
    '`install.sh` applies these automatically. To re-apply or verify by hand:',
    '',
    '```bash',
    `${cmd} apply -f 06-quickstart/pvc.yaml`,
    `${cmd} wait --for=jsonpath='{.status.phase}'=Bound pvc/${state.quickstart.pvcName} --timeout=180s`,
    `${cmd} apply -f 06-quickstart/pod.yaml`,
    `${cmd} get pvc ${state.quickstart.pvcName}`,
    `${cmd} get pod ${state.quickstart.podName}`,
    '```',
    '',
  )

  if (state.airGapped) {
    lines.push(
      '## Air-gapped notes',
      '',
      'Use `hvcsi-offline-bundle.sh` from the operator repository and rewrite image references to your private registry.',
      '',
    )
  }

  return lines.filter((l) => l !== undefined).join('\n')
}
