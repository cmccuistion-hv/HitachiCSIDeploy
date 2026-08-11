import { useEffect, useRef, useState } from 'react'
import { ThemeControls } from './components/ThemeControls'
import { WelcomeModal, shouldShowWelcome } from './components/WelcomeModal'
import { useTheme } from './state/ThemeContext'
import { useWizard } from './state/WizardContext'
import { PlatformStep } from './steps/PlatformStep'
import { ComponentsStep } from './steps/ComponentsStep'
import { PrerequisitesStep } from './steps/PrerequisitesStep'
import { StorageStep } from './steps/StorageStep'
import { StorageClassesStep } from './steps/StorageClassesStep'
import { ReplicationStep } from './steps/ReplicationStep'
import { MetricsStep } from './steps/MetricsStep'
import { ConsolePluginStep } from './steps/ConsolePluginStep'
import { QuickstartStep } from './steps/QuickstartStep'
import { ExportStep } from './steps/ExportStep'

const REPO_ISSUES_URL = 'https://github.com/cmccuistion-hv/HitachiCSIDeploy/issues'

function StepBody({ id }: { id: string }) {
  switch (id) {
    case 'platform':
      return <PlatformStep />
    case 'components':
      return <ComponentsStep />
    case 'prerequisites':
      return <PrerequisitesStep />
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
            onClick={() => setWelcomeOpen(true)}
          >
            About
          </button>
          <a
            className="btn btn-ghost"
            href={REPO_ISSUES_URL}
            target="_blank"
            rel="noopener noreferrer"
          >
            Report issue
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
            onClick={() => importRef.current?.click()}
          >
            Import config
          </button>
          <button
            type="button"
            className="btn btn-ghost"
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
            Save config
          </button>
        </div>
      </header>

      <aside className="app-sidebar">
        <ol className="step-list">
          {visibleSteps.map((step, i) => (
            <li key={step.id}>
              <button
                type="button"
                className={`step-item${i === stepIndex ? ' active' : ''}${i < stepIndex ? ' done' : ''}`}
                onClick={() => setStepIndex(i)}
              >
                <span className="step-num">{i + 1}</span>
                <span className="step-label">
                  <strong>{step.title}</strong>
                  <span>{step.description}</span>
                </span>
              </button>
            </li>
          ))}
        </ol>
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
            Step {stepIndex + 1} of {visibleSteps.length}
            {current ? ` — ${current.title}` : ''}
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
