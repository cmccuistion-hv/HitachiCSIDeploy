import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ThemeControls } from './components/ThemeControls'
import { WelcomeModal, shouldShowWelcome } from './components/WelcomeModal'
import { useTheme } from './state/ThemeContext'
import { useWizard } from './state/WizardContext'
import { buildNavEntries, footerStepLabel, type NavEntry } from './state/steps'
import { PlatformStep } from './steps/PlatformStep'
import { ComponentsStep } from './steps/ComponentsStep'
import {
  PrerequisitesChecklistStep,
  PrerequisitesMultipathStep,
} from './steps/PrerequisitesStep'
import { StorageStep } from './steps/StorageStep'
import { StorageClassesStep } from './steps/StorageClassesStep'
import { ReplicationStep } from './steps/ReplicationStep'
import { MetricsStep } from './steps/MetricsStep'
import { ConsolePluginStep } from './steps/ConsolePluginStep'
import { QuickstartStep } from './steps/QuickstartStep'
import { ExportStep } from './steps/ExportStep'

const REPO_ISSUES_URL = 'https://github.com/cmccuistion-hv/HitachiCSIDeploy/issues'

function HeaderIcon({
  children,
}: {
  children: ReactNode
}) {
  return (
    <svg
      className="header-action-icon"
      viewBox="0 0 24 24"
      width="18"
      height="18"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  )
}

function renderSidebarNav(
  navEntries: NavEntry[],
  visibleSteps: { id: string }[],
  setStepIndex: (i: number) => void,
): ReactNode[] {
  const nodes: ReactNode[] = []
  let i = 0
  while (i < navEntries.length) {
    const entry = navEntries[i]
    if (entry.kind === 'parent') {
      const children: Extract<NavEntry, { kind: 'step' }>[] = []
      i += 1
      while (i < navEntries.length) {
        const next = navEntries[i]
        if (next.kind !== 'step' || !next.nested) break
        children.push(next)
        i += 1
      }
      nodes.push(
        <li key={`group-${entry.major}`} className="step-group-block">
          <div
            className={`step-item step-item-parent${entry.childActive ? ' child-active' : ''}${
              entry.done ? ' done' : ''
            }`}
            aria-hidden="true"
          >
            <span className="step-num">{entry.major}</span>
            <span className="step-label">
              <strong>{entry.title}</strong>
            </span>
          </div>
          <ol className="step-sublist">
            {children.map((child) => (
              <li key={visibleSteps[child.stepIndex]?.id ?? child.stepIndex}>
                <button
                  type="button"
                  className={`step-item nested${child.active ? ' active' : ''}${child.done ? ' done' : ''}`}
                  onClick={() => setStepIndex(child.stepIndex)}
                >
                  <span className="step-num">{child.label}</span>
                  <span className="step-label">
                    <strong>{child.title}</strong>
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </li>,
      )
      continue
    }

    nodes.push(
      <li key={visibleSteps[entry.stepIndex]?.id ?? entry.stepIndex}>
        <button
          type="button"
          className={`step-item${entry.active ? ' active' : ''}${entry.done ? ' done' : ''}`}
          onClick={() => setStepIndex(entry.stepIndex)}
        >
          <span className="step-num">{entry.label}</span>
          <span className="step-label">
            <strong>{entry.title}</strong>
            <span>{entry.description}</span>
          </span>
        </button>
      </li>,
    )
    i += 1
  }
  return nodes
}

function StepBody({ id }: { id: string }) {
  switch (id) {
    case 'platform':
      return <PlatformStep />
    case 'components':
      return <ComponentsStep />
    case 'prerequisites-multipath':
      return <PrerequisitesMultipathStep />
    case 'prerequisites-checklist':
      return <PrerequisitesChecklistStep />
    case 'storage':
      return <StorageStep />
    case 'storageclasses':
      return <StorageClassesStep />
    case 'replication':
      return <ReplicationStep />
    case 'metrics':
      return <MetricsStep />
    case 'console':
      return <ConsolePluginStep />
    case 'quickstart':
      return <QuickstartStep />
    case 'export':
      return <ExportStep />
    default:
      return null
  }
}

export default function App() {
  const { visibleSteps, stepIndex, setStepIndex, exportConfig, importConfig } = useWizard()
  const { palette, mode, setPalette, setMode, headerLight } = useTheme()
  const current = visibleSteps[stepIndex]
  const importRef = useRef<HTMLInputElement>(null)
  const mainScrollRef = useRef<HTMLDivElement>(null)
  const [welcomeOpen, setWelcomeOpen] = useState(() => shouldShowWelcome())

  const navEntries = useMemo(
    () => buildNavEntries(visibleSteps, stepIndex),
    [visibleSteps, stepIndex],
  )
  const footerLabel = footerStepLabel(navEntries, stepIndex)

  useEffect(() => {
    const el = mainScrollRef.current
    if (el) el.scrollTop = 0
    window.scrollTo(0, 0)
    document.documentElement.scrollTop = 0
    document.body.scrollTop = 0
  }, [stepIndex, current?.id])

  const onImportFile = (file: File) => {
    const reader = new FileReader()
    reader.onload = () => {
      try {
        importConfig(String(reader.result || ''))
        setStepIndex(0)
      } catch {
        alert('Could not import that file. Choose a hitachi-csi-wizard-config.json export.')
      }
    }
    reader.onerror = () => alert('Could not read the selected file.')
    reader.readAsText(file)
  }

  const logoSrc = headerLight
    ? './hitachi-vantara-logo.svg'
    : './hitachi-vantara-logo-white.svg'

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand">
          <img
            className="brand-logo"
            src={logoSrc}
            alt="Hitachi Vantara"
            width={201}
            height={28}
          />
          <span className="brand-divider" aria-hidden="true" />
          <div className="brand-product">
            <h1>CSI Deployment Wizard</h1>
          </div>
        </div>
        <div className="header-actions">
          <ThemeControls
            palette={palette}
            mode={mode}
            onPalette={setPalette}
            onMode={setMode}
          />
          <button
            type="button"
            className="btn btn-ghost"
            title="About this wizard"
            aria-label="About this wizard"
            onClick={() => setWelcomeOpen(true)}
          >
            <HeaderIcon>
              <circle cx="12" cy="12" r="9" />
              <path d="M12 10.5v6" />
              <circle cx="12" cy="7.5" r="0.85" fill="currentColor" stroke="none" />
            </HeaderIcon>
            <span className="header-action-label">About</span>
          </button>
          <a
            className="btn btn-ghost"
            href={REPO_ISSUES_URL}
            target="_blank"
            rel="noopener noreferrer"
            title="Report issue"
            aria-label="Report issue"
          >
            <HeaderIcon>
              <path d="M7 8h10M7 12h7" />
              <path d="M6 4h12a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-5l-4 3v-3H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z" />
            </HeaderIcon>
            <span className="header-action-label">Report issue</span>
          </a>
          <input
            ref={importRef}
            type="file"
            accept="application/json,.json"
            style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files?.[0]
              e.target.value = ''
              if (file) onImportFile(file)
            }}
          />
          <button
            type="button"
            className="btn btn-ghost"
            title="Import config"
            aria-label="Import config"
            onClick={() => importRef.current?.click()}
          >
            <HeaderIcon>
              <path d="M12 3v10" />
              <path d="m8 9 4 4 4-4" />
              <path d="M5 18h14" />
            </HeaderIcon>
            <span className="header-action-label">Import config</span>
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            title="Save config"
            aria-label="Save config"
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
            <HeaderIcon>
              <path d="M12 15V5" />
              <path d="m8 9 4-4 4 4" />
              <path d="M5 18h14" />
            </HeaderIcon>
            <span className="header-action-label">Save config</span>
          </button>
        </div>
      </header>

      <aside className="app-sidebar">
        <ol className="step-list">{renderSidebarNav(navEntries, visibleSteps, setStepIndex)}</ol>
      </aside>

      <main className="app-main">
        <div className="main-scroll" ref={mainScrollRef}>
          {current && <StepBody id={current.id} />}
        </div>
        <footer className="footer-bar">
          <button
            type="button"
            className="btn btn-secondary"
            disabled={stepIndex === 0}
            onClick={() => setStepIndex(stepIndex - 1)}
          >
            Back
          </button>
          <span style={{ fontSize: '0.85rem', color: 'var(--hv-text-subtle)' }}>
            {footerLabel ||
              `Step ${stepIndex + 1} of ${visibleSteps.length}${current ? ` — ${current.title}` : ''}`}
          </span>
          <button
            type="button"
            className="btn btn-primary"
            disabled={stepIndex >= visibleSteps.length - 1}
            onClick={() => setStepIndex(stepIndex + 1)}
          >
            Continue
          </button>
        </footer>
      </main>

      <WelcomeModal open={welcomeOpen} onClose={() => setWelcomeOpen(false)} />
    </div>
  )
}
