import { useWizard } from '../state/WizardContext'
import { Callout, Field, Section } from '../components/ui'

export function ConsolePluginStep() {
  const { state, setState } = useWizard()

  return (
    <div className="step-panel">
      <h2>OpenShift Console Plugin</h2>
      <p className="lede">
        Deploys the Hitachi dashboard tab in the OpenShift web console. Prometheus settings should match
        your Performance Metrics deployment.
      </p>

      <Callout>
        Manifest version tracks the CSI Driver release (<strong>{state.versions.driver}</strong>). After
        apply, a Job patches the cluster Console operator to enable the plugin.
      </Callout>

      <Section title="Plugin settings">
        <div className="field-grid">
          <Field label="Plugin namespace">
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
          <Field label="Prometheus namespace">
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
          <Field label="Prometheus service">
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
          <Field label="Prometheus port">
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
        <pre className="code-block">{`oc apply -f consoleplugin-ocp-ui.yaml
oc get consoleplugin console-plugin-vsp360-dcm
# Enable in Console → Administration → Cluster Settings → Configuration → Console
# (or rely on the patcher Job in the manifest)`}</pre>
      </Section>
    </div>
  )
}
