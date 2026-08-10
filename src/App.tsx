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
  const { visibleSteps, stepIndex, setStepIndex, exportConfig } = useWizard()
  const current = visibleSteps[stepIndex]

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand">
          <div className="brand-mark">HV</div>
          <div>
            <h1>Hitachi CSI Deployment Wizard</h1>
          </div>
        </div>
        <div className="header-actions">
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
        <div className="main-scroll">{current && <StepBody id={current.id} />}</div>
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
    </div>
  )
}
