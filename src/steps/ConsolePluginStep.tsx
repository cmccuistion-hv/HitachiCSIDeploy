import { useWizard } from '../state/WizardContext'
import { AdvancedSection } from '../components/AdvancedSection'
import { useUiMode } from '../state/UiModeContext'
import { Callout, Field, Section } from '../components/ui'

export function ConsolePluginStep() {
  const { state, setState } = useWizard()
  const { isAdvanced } = useUiMode()
  const needsPromWiring = !state.metrics.deployPrometheus

  return (
    <div className="step-panel">
      <h2>OpenShift Console Plugin</h2>
      <p className="lede">
        {!isAdvanced && !needsPromWiring
          ? 'This export installs the OpenShift Console Plugin, adding the Hitachi dashboard tab in the OpenShift web console.'
          : 'Deploys the Hitachi dashboard tab in the OpenShift web console. Prometheus settings should match where metrics are scraped. If you set them on Performance Metrics (Grafana with an existing Prometheus), those values appear here.'}
      </p>

      {!isAdvanced && !needsPromWiring && (
        <Callout variant="ok">
          <strong>Included in this package:</strong> the Console Plugin and Prometheus (so no additional wiring
          is required on this page).
        </Callout>
      )}

      <Callout>
        Manifest version tracks the CSI Driver release (<strong>{state.versions.driver}</strong>). After
        apply, a Job patches the cluster Console operator to enable the plugin.
      </Callout>

      <Section title="Plugin settings">
        {needsPromWiring && (
          <div className="field-grid">
            <Field
              label="Prometheus namespace"
              hint="Namespace of the Prometheus service the plugin queries (often the metrics exporter NS)."
            >
              <input
                value={state.consolePlugin.prometheusNamespace}
                onChange={(e) =>
                  setState((s) => ({
                    ...s,
                    consolePlugin: { ...s.consolePlugin, prometheusNamespace: e.target.value },
                  }))
                }
              />
            </Field>
            <Field label="Prometheus service" hint="Kubernetes Service name for Prometheus.">
              <input
                value={state.consolePlugin.prometheusService}
                onChange={(e) =>
                  setState((s) => ({
                    ...s,
                    consolePlugin: { ...s.consolePlugin, prometheusService: e.target.value },
                  }))
                }
              />
            </Field>
            <Field label="Prometheus port" hint="Service port Prometheus listens on.">
              <input
                value={state.consolePlugin.prometheusPort}
                onChange={(e) =>
                  setState((s) => ({
                    ...s,
                    consolePlugin: { ...s.consolePlugin, prometheusPort: e.target.value },
                  }))
                }
              />
            </Field>
          </div>
        )}

        <AdvancedSection
          title="Advanced plugin settings"
        >
          <div className="field-grid">
            <Field label="Plugin namespace" hint="Namespace where the console plugin pods run.">
              <input
                value={state.consolePlugin.namespace}
                onChange={(e) =>
                  setState((s) => ({
                    ...s,
                    consolePlugin: { ...s.consolePlugin, namespace: e.target.value },
                  }))
                }
              />
            </Field>
            {!needsPromWiring && (
              <>
                <Field
                  label="Prometheus namespace"
                  hint="Namespace of the Prometheus service the plugin queries (often the metrics exporter NS)."
                >
                  <input
                    value={state.consolePlugin.prometheusNamespace}
                    onChange={(e) =>
                      setState((s) => ({
                        ...s,
                        consolePlugin: { ...s.consolePlugin, prometheusNamespace: e.target.value },
                      }))
                    }
                  />
                </Field>
                <Field label="Prometheus service" hint="Kubernetes Service name for Prometheus.">
                  <input
                    value={state.consolePlugin.prometheusService}
                    onChange={(e) =>
                      setState((s) => ({
                        ...s,
                        consolePlugin: { ...s.consolePlugin, prometheusService: e.target.value },
                      }))
                    }
                  />
                </Field>
                <Field label="Prometheus port" hint="Service port Prometheus listens on.">
                  <input
                    value={state.consolePlugin.prometheusPort}
                    onChange={(e) =>
                      setState((s) => ({
                        ...s,
                        consolePlugin: { ...s.consolePlugin, prometheusPort: e.target.value },
                      }))
                    }
                  />
                </Field>
              </>
            )}
          </div>
        </AdvancedSection>
      </Section>
    </div>
  )
}
