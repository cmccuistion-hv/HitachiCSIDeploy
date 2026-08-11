import { useEffect, useState } from 'react'
import JSZip from 'jszip'
import { DOCS, REPO } from '../catalog/components'
import { HELP } from '../catalog/help'
import { PLATFORMS } from '../catalog/platforms'
import { storageArtifactsInvalidReason, storageArtifactsValid } from '../catalog/validation'
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
  const [files, setFiles] = useState<GeneratedFile[]>([])
  const [activePath, setActivePath] = useState<string>('')
  const [importText, setImportText] = useState('')
  const [generating, setGenerating] = useState(false)
  const [downloading, setDownloading] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setGenerating(true)
      try {
        const next = await generateAll(state)
        if (!cancelled) setFiles(next)
      } finally {
        if (!cancelled) setGenerating(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [state])

  useEffect(() => {
    if (!files.length) {
      setActivePath('')
      return
    }
    if (!files.some((f) => f.path === activePath)) {
      setActivePath(files[0].path)
    }
  }, [files, activePath])

  const storageExportBlocked = !storageArtifactsValid(state)
  const storageExportReason = storageExportBlocked ? storageArtifactsInvalidReason(state) : null
  const guide = buildGuide(state, files, cmd)
  const current = files.find((f) => f.path === activePath) || files[0]
  const grouped = FILE_GROUPS.map((g) => ({
    ...g,
    files: files.filter((f) => f.group === g.id),
  })).filter((g) => g.files.length > 0)

  const downloadZip = async () => {
    setDownloading(true)
    try {
      // Always regenerate at click time so Secret/SC YAML match the latest Storage step edits.
      const latest = await generateAll(state)
      setFiles(latest)
      const zip = new JSZip()
      zip.file('INSTALL.md', buildGuide(state, latest, cmd))
      zip.file('wizard-config.json', exportConfig())
      for (const f of latest) {
        zip.file(f.path, f.content)
      }
      const blob = await zip.generateAsync({ type: 'blob' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `hitachi-csi-deployment-${state.versions.driver}.zip`
      a.click()
      URL.revokeObjectURL(url)
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className="step-panel">
      <h2>Review &amp; export</h2>
      <p className="lede">
        Download a complete package: ordered install guide, manifests, and <code>install.sh</code>. Answers
        are saved in this browser for resume. <strong>Download ZIP</strong> rebuilds from your current
        answers — re-download after edits; an already-unzipped folder is not updated.
      </p>

      <Callout>{HELP.configuratorVsApply}</Callout>

      <Section
        title="Actions"
        actions={
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn btn-primary"
              disabled={storageExportBlocked || downloading || generating}
              onClick={() => void downloadZip()}
            >
              {downloading ? 'Building ZIP…' : 'Download ZIP'}
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
        {storageExportReason ? (
          <Callout variant="warn">{storageExportReason}</Callout>
        ) : (
          <Callout variant="ok">
            Generated {files.length} files for <strong>{plat.displayName}</strong> / CSI Driver{' '}
            <strong>{state.versions.driver}</strong>
            {generating ? ' (updating preview…)' : ''}. Upstream templates:{' '}
            <a href={REPO.githubUrl} target="_blank" rel="noreferrer">
              {REPO.owner}/{REPO.name}
            </a>
          </Callout>
        )}
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
  const hasQuickstart =
    state.storageClassesEnabled || files.some((f) => f.group === 'quickstart')
  const storageFiles = files.filter((f) => f.group === 'storage')

  const installShTail = hasQuickstart
    ? 'then storage Secrets / StorageClass / test PVC.'
    : 'then storage Secrets (if generated). StorageClass and test PVC are not included — add your own after the driver is READY.'

  const lines: string[] = [
    '# Hitachi CSI Deployment Guide',
    '',
    `Platform: ${plat.displayName} ${state.platformVersion}`,
    `Worker nodes: ${state.nodeEnvironment === 'virtual-machine' ? 'Virtual machine' : 'Bare metal'}`,
    plat.useOc
      ? `Control plane: ${
          state.openshiftTopology === 'hosted'
            ? 'Hosted or HCP (DaemonSet)'
            : 'Self-managed (MachineConfig)'
        }`
      : '',
    `Connection: ${state.connectionType}`,
    `CSI Driver: ${state.versions.driver}`,
    state.components.replication ? `Replication: ${state.versions.replication}` : '',
    state.components.metrics ? `Performance Metrics: ${state.versions.metrics}` : '',
    '',
    '## After install',
    '',
    plat.useOc
      ? state.multipath.includeDaemonSet
        ? '1. Prerequisites: finish this wizard and download the ZIP. On hosted/HCP OpenShift you may apply the multipath DaemonSet early or let install.sh apply it.'
        : '1. Prerequisites: finish this wizard and download the ZIP. On OpenShift you may apply the multipath MachineConfig early (while finishing the wizard) or let install.sh apply it.'
      : '1. Prerequisites: finish this wizard and download the ZIP. Install multipath on workers if required, then run install.sh.',
    plat.operatorHub
      ? state.multipath.includeDaemonSet
        ? `2. Run \`./install.sh\` — multipath DaemonSet (if enabled), then OLM operator install (approve day-0 InstallPlan), HSPC CR + READY wait, ${installShTail}`
        : state.multipath.includeMachineConfig
          ? `2. Run \`./install.sh\` — multipath MachineConfig (if enabled), then OLM operator install (approve day-0 InstallPlan), HSPC CR + READY wait, ${installShTail}`
          : `2. Run \`./install.sh\` — OLM operator install (approve day-0 InstallPlan), HSPC CR + READY wait, ${installShTail}`
      : hasQuickstart
        ? '2. Run `./install.sh` — applies operator YAML / driver CR, storage Secrets, StorageClass, and test PVC.'
        : '2. Run `./install.sh` — applies operator YAML / driver CR, and storage Secrets (if generated). Add StorageClass and test workloads separately.',
    state.telemetryEnabled
      ? ''
      : '- Hitachi Telemetry is disabled in this package. `install.sh` applies `hspc-csi-telemetry-config` (awsEnabled=false) after HSPC is READY.',
    hasQuickstart ? '3. Confirm PVC Bound and test Pod Running.' : '',
    '',
  ]

  if (state.multipath.enabled) {
    lines.push('## Multipath', '')
    if (plat.useOc && state.multipath.includeMachineConfig) {
      lines.push(
        '- OpenShift MachineConfig(s) under `00-prereq/` embedding multipath.conf into `/etc/multipath.conf`',
        state.multipath.alreadyApplied
          ? '- **Already applied:** `install.sh` skips apply (also auto-skips if the MC exists) and asks you to confirm MCP health.'
          : '- **Apply path:** optional early `oc apply` during Prerequisites, or let `install.sh` apply (auto-skips if MC already exists).',
        '',
        '> **Reboots:** Applying MachineConfig **reboots nodes** in the pool (rolling). Wait until',
        '> `UPDATED=True` / `UPDATING=False` before installing the CSI Driver.',
        '',
      )
    } else if (plat.useOc && state.multipath.includeDaemonSet) {
      lines.push(
        '- Hosted/HCP DaemonSet under `00-prereq/` writing multipath.conf and enabling multipathd',
        state.multipath.alreadyApplied
          ? '- **Already applied:** `install.sh` skips apply (also auto-skips if the DaemonSet exists).'
          : '- **Apply path:** optional early `oc apply` during Prerequisites, or let `install.sh` apply (auto-skips if DaemonSet exists).',
        '',
        '> No MachineConfigPool reboot cycle. Confirm multipathd on workers before CSI Driver install.',
        '',
      )
    } else if (!plat.useOc && state.multipath.includeConf) {
      lines.push(
        '- `00-prereq/multipath.conf` — Hitachi CSI Device Mapper Multipath sample',
        '- **You** install this on workers (`install.sh` does not push it to nodes):',
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
      '`install.sh` applies OLM Namespace / OperatorGroup / Subscription (`hspc-operator` from',
      '`certified-operators`, channel `stable`, **Manual** update approval), approves the day-0',
      'InstallPlan, waits for CSV Succeeded, applies `02-driver/hspc-cr.yaml`, and waits until READY.',
      '',
      '```bash',
      `${cmd} get csv -n ${state.operatorNamespace}`,
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

  if (storageFiles.length) {
    lines.push(
      '## Apply storage configuration',
      '',
      hasQuickstart
        ? ''
        : 'StorageClass generation is off in this export — apply Secrets only, then create StorageClasses separately.',
      '```bash',
      ...storageFiles.map((f) => `${cmd} apply -f ${f.path}`),
      '```',
      '',
    )
  }

  if (state.components.replication) {
    lines.push(
      '## Replication + Disaster Recovery',
      '',
      '`install.sh` applies the Replication operator, storage secrets, cert-manager (waits for webhook), then the DR operator with your StorageClass on the DR PVC.',
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

  if (hasQuickstart) {
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
  }

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
