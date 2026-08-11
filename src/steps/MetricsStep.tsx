import { DOCS } from '../catalog/components'
import { PLATFORMS } from '../catalog/platforms'
import { useWizard } from '../state/WizardContext'
import { Callout, Field, Section } from '../components/ui'

export function MetricsStep() {
  const { state, setState } = useWizard()
  const plat = PLATFORMS[state.platform]
  const storages = state.metrics.storages.length
    ? state.metrics.storages
    : state.storageSystems.map((s) => ({
        serial: s.serial,
        url: s.url,
        user: s.user,
        password: s.password,
      }))

  return (
    <div className="step-panel">
      <h2>Performance Metrics</h2>
      <p className="lede">
        Deploy the storage metrics exporter for Prometheus (and optional Grafana). On OpenShift an SCC
        manifest is required.
      </p>

      <Callout variant="ok">
        Version <strong>{state.versions.metrics}</strong>
      </Callout>

      <Section title="Deployment options">
        <div className="field-grid">
          <Field label="Namespace" hint="Where the metrics exporter Deployment runs.">
            <input
              value={state.metrics.namespace}
              onChange={(e) => {
                const ns = e.target.value
                setState((s) => ({
                  ...s,
                  metrics: { ...s.metrics, namespace: ns },
                  consolePlugin: s.metrics.deployPrometheus
                    ? { ...s.consolePlugin, prometheusNamespace: ns }
                    : s.consolePlugin,
                }))
              }}
            />
          </Field>
          <Field
            label="Secret name"
            hint="Secret listing the arrays the exporter scrapes for metrics."
          >
            <input
              value={state.metrics.secretName}
              onChange={(e) =>
                setState((s) => ({
                  ...s,
                  metrics: { ...s.metrics, secretName: e.target.value },
                }))
              }
            />
          </Field>
          <Field
            label="Max batch size"
            hint="Increasing batch size or worker count may raise memory use."
          >
            <input
              value={state.metrics.maxBatchSize}
              onChange={(e) =>
                setState((s) => ({
                  ...s,
                  metrics: { ...s.metrics, maxBatchSize: e.target.value },
                }))
              }
            />
          </Field>
          <Field
            label="Max worker count"
            hint="Parallel workers for metric collection. Higher values may use more memory."
          >
            <input
              value={state.metrics.maxWorkerCount}
              onChange={(e) =>
                setState((s) => ({
                  ...s,
                  metrics: { ...s.metrics, maxWorkerCount: e.target.value },
                }))
              }
            />
          </Field>
        </div>
        <label className="toggle-row" style={{ marginTop: '0.75rem' }}>
          <input
            type="checkbox"
            checked={state.metrics.enableDebugLog}
            onChange={(e) =>
              setState((s) => ({
                ...s,
                metrics: { ...s.metrics, enableDebugLog: e.target.checked },
              }))
            }
          />
          <div>
            <strong>Enable debug logging</strong>
            <p style={{ margin: '0.2rem 0 0', fontSize: '0.85rem', color: 'var(--hv-text-subtle)' }}>
              Disable in production to reduce log volume.
            </p>
          </div>
        </label>
        <label className="toggle-row" style={{ marginTop: '0.65rem' }}>
          <input
            type="checkbox"
            checked={state.metrics.deployPrometheus}
            onChange={(e) => {
              const on = e.target.checked
              setState((s) => ({
                ...s,
                metrics: { ...s.metrics, deployPrometheus: on },
                consolePlugin: on
                  ? {
                      ...s.consolePlugin,
                      prometheusNamespace: s.metrics.namespace,
                      prometheusService: 'prometheus',
                      prometheusPort: '9090',
                    }
                  : s.consolePlugin,
              }))
            }}
          />
          <div>
            <strong>Include Prometheus</strong>
            <p style={{ margin: '0.2rem 0 0', fontSize: '0.85rem', color: 'var(--hv-text-subtle)' }}>
              Deploys Prometheus into the metrics namespace. Turn off if you already run Prometheus
              elsewhere.{' '}
              <a href={DOCS.prometheusOverview} target="_blank" rel="noreferrer">
                What is Prometheus?
              </a>
            </p>
          </div>
        </label>
        <label className="toggle-row" style={{ marginTop: '0.65rem' }}>
          <input
            type="checkbox"
            checked={state.metrics.deployGrafana}
            onChange={(e) =>
              setState((s) => ({
                ...s,
                metrics: { ...s.metrics, deployGrafana: e.target.checked },
              }))
            }
          />
          <div>
            <strong>Include Grafana</strong>
            <p style={{ margin: '0.2rem 0 0', fontSize: '0.85rem', color: 'var(--hv-text-subtle)' }}>
              Deploys Grafana with the Hitachi dashboard provisioned. Optional if you only need metrics
              scrape.{' '}
              <a href={DOCS.grafanaIntro} target="_blank" rel="noreferrer">
                What is Grafana?
              </a>
            </p>
          </div>
        </label>
        {plat.supportsConsolePlugin && (
          <Callout>
            On OpenShift, the <strong>Console Plugin</strong> already shows about 24 hours of metrics in
            the web console — Grafana is often optional there. For longer historical views with the
            current Console Plugin release, keep Grafana (or another long-term metrics UI) in addition to
            the plugin.
          </Callout>
        )}
        {state.metrics.deployGrafana && !state.metrics.deployPrometheus && (
          <>
            <div className="field-grid" style={{ marginTop: '0.75rem' }}>
              <Field label="Prometheus namespace" hint="Namespace of the existing Prometheus Service.">
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
              <Field
                label="Prometheus service"
                hint="Service name Grafana (and the Console Plugin) will query."
              >
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
            {(!state.consolePlugin.prometheusNamespace.trim() ||
              !state.consolePlugin.prometheusService.trim() ||
              !state.consolePlugin.prometheusPort.trim()) && (
              <Callout variant="warn">
                Prometheus namespace, service, and port are required so Grafana can reach your existing
                Prometheus.
              </Callout>
            )}
          </>
        )}
        {plat.useOc && (
          <Callout>OpenShift: the export guide applies <code>scc-for-openshift.yaml</code>.</Callout>
        )}
      </Section>

      <Section title="Exporter storage credentials">
        <p style={{ marginTop: 0, fontSize: '0.9rem', color: 'var(--hv-text-subtle)' }}>
          Arrays the exporter authenticates to when collecting performance metrics.
        </p>
        {storages.map((sec, idx) => (
          <div key={idx} className="field-grid" style={{ marginBottom: '0.75rem' }}>
            <Field label="Serial">
              <input
                value={sec.serial}
                onChange={(e) => {
                  const next = [...storages]
                  next[idx] = { ...next[idx], serial: e.target.value }
                  setState((s) => ({ ...s, metrics: { ...s.metrics, storages: next } }))
                }}
              />
            </Field>
            <Field label="URL" hint="Prefer storage controller IP where documented.">
              <input
                value={sec.url}
                onChange={(e) => {
                  const next = [...storages]
                  next[idx] = { ...next[idx], url: e.target.value }
                  setState((s) => ({ ...s, metrics: { ...s.metrics, storages: next } }))
                }}
              />
            </Field>
            <Field label="User">
              <input
                value={sec.user}
                onChange={(e) => {
                  const next = [...storages]
                  next[idx] = { ...next[idx], user: e.target.value }
                  setState((s) => ({ ...s, metrics: { ...s.metrics, storages: next } }))
                }}
              />
            </Field>
            <Field label="Password">
              <input
                type="password"
                value={sec.password}
                onChange={(e) => {
                  const next = [...storages]
                  next[idx] = { ...next[idx], password: e.target.value }
                  setState((s) => ({ ...s, metrics: { ...s.metrics, storages: next } }))
                }}
              />
            </Field>
          </div>
        ))}
        {!state.metrics.storages.length && (
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() =>
              setState((s) => ({
                ...s,
                metrics: { ...s.metrics, storages },
              }))
            }
          >
            Use storage systems as metrics credentials
          </button>
        )}
      </Section>
    </div>
  )
}
