import { useWizard } from '../state/WizardContext'
import { Callout, CodeBlock, Field, Section } from '../components/ui'

export function ConsolePluginStep() {
  const { state, setState } = useWizard()

  return (
    <div className="step-panel">
      <h2>OpenShift Console Plugin</h2>
      <p className="lede">
        Deploys the Hitachi dashboard tab in the OpenShift web console. Prometheus settings should match
        your Performance Metrics deployment — that is where the plugin finds metrics.
      </p>

      <Callout>
        Manifest version tracks the CSI Driver release (<strong>{state.versions.driver}</strong>). After
        apply, a Job patches the cluster Console operator to enable the plugin.
      </Callout>

      <Section title="Plugin settings">
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
      </Section>

      <Section title="Verify after install">
        <CodeBlock>{`oc apply -f consoleplugin-ocp-ui.yaml
oc get consoleplugin console-plugin-vsp360-dcm
# Enable in Console → Administration → Cluster Settings → Configuration → Console
# (or rely on the patcher Job in the manifest)`}</CodeBlock>
      </Section>
    </div>
  )
}
