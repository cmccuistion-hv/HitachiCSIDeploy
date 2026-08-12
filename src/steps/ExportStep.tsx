import { useEffect, useState } from 'react'
import JSZip from 'jszip'
import { DOCS, REPO } from '../catalog/components'
import { PLATFORMS } from '../catalog/platforms'
import { storageArtifactsInvalidReason, storageArtifactsValid } from '../catalog/validation'
import { buildNextSteps, nextStepsToMarkdown } from '../generator/nextSteps'
import { generateAll, type GeneratedFile } from '../generator/yaml'
import { useWizard } from '../state/WizardContext'
import { Callout, CodeBlock, DownloadButton, Section } from '../components/ui'

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
  const nextSteps = buildNextSteps(state)
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
      zip.file(
        'INSTALL.md',
        nextStepsToMarkdown(buildNextSteps(state), {
          platformDisplayName: plat.displayName,
          platformVersion: state.platformVersion,
          driverVersion: state.versions.driver,
        }),
      )
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
        Download a complete ZIP package with next steps, manifests, and <code>install.sh</code>. Answers are
        saved in this browser for resume. <strong>Download ZIP</strong> rebuilds from your current answers —
        re-download after edits; an already-unzipped folder is not updated.
      </p>

      <Section
        title="Actions"
        actions={
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn btn-success"
              disabled={storageExportBlocked || downloading || generating}
              onClick={() => void downloadZip()}
            >
              {downloading ? 'Building ZIP…' : 'Download ZIP'}
            </button>
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
            <button type="button" className="btn btn-primary" onClick={reset}>
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

      <Section title="Next steps">
        <ol style={{ margin: 0, paddingLeft: '1.5rem' }}>
          {nextSteps.map((step) => (
            <li key={step.id} style={{ marginBottom: '1rem', paddingLeft: '0.25rem' }}>
              <strong>{step.title}</strong>
              <p style={{ margin: '0.35rem 0' }}>{step.body}</p>
              {step.command ? <CodeBlock text={step.command} style={{ marginTop: '0.5rem' }} /> : null}
            </li>
          ))}
        </ol>
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
