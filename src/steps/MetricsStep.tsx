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
          <Field label="Namespace">
            <input
              value={state.metrics.namespace}
              onChange={(e) => {
                const ns = e.target.value
                setState((s) => ({
                  ...s,
                  metrics: { ...s.metrics, namespace: ns },
                  consolePlugin: { ...s.consolePlugin, prometheusNamespace: ns },
                }))
              }}
            />
          </Field>
          <Field label="Secret name">
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
          <Field label="Max batch size">
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
          <Field label="Max worker count">
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
            checked={state.metrics.deployTestStack}
            onChange={(e) =>
              setState((s) => ({
                ...s,
                metrics: { ...s.metrics, deployTestStack: e.target.checked },
              }))
            }
          />
          <div>
            <strong>Include sample Prometheus + Grafana stack</strong>
            <p style={{ margin: '0.2rem 0 0', fontSize: '0.85rem', color: 'var(--hv-text-subtle)' }}>
              For lab/test only. Production should point at your existing Prometheus.
            </p>
          </div>
        </label>
        {plat.useOc && (
          <Callout>OpenShift: the export guide applies <code>scc-for-openshift.yaml</code>.</Callout>
        )}
      </Section>

      <Section title="Exporter storage credentials">
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
