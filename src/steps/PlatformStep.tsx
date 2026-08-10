import { CONNECTION_TYPES, PLATFORMS, type PlatformId } from '../catalog/platforms'
import { useWizard } from '../state/WizardContext'
import { Callout, ChoiceCard, Field, Section } from '../components/ui'

export function PlatformStep() {
  const { state, patch, setState } = useWizard()
  const plat = PLATFORMS[state.platform]

  return (
    <div className="step-panel">
      <h2>Platform & connectivity</h2>
      <p className="lede">
        Choose your orchestrator and storage protocol. This drives install steps, multipath guidance,
        and which Hitachi CSI components are available.
      </p>

      <Section title="Container platform">
        <div className="card-grid">
          {(Object.keys(PLATFORMS) as PlatformId[]).map((id) => (
            <ChoiceCard
              key={id}
              title={PLATFORMS[id].displayName}
              description={`Supported: ${PLATFORMS[id].versions.join(', ')}`}
              selected={state.platform === id}
              onClick={() => {
                const p = PLATFORMS[id]
                // OperatorHub (OwnNamespace): driver CR must share the operator namespace.
                // Kubernetes YAML path: upstream sample deploys the driver into kube-system.
                const operatorNs = 'hspc-operator-system'
                const driverNs = p.operatorHub ? operatorNs : 'kube-system'
                const needsDm =
                  state.connectionType === 'fc' || state.connectionType === 'iscsi'
                patch({
                  platform: id,
                  platformVersion: p.versions[p.versions.length - 1],
                  operatorNamespace: operatorNs,
                  driverNamespace: driverNs,
                  multipath: {
                    ...state.multipath,
                    enabled: needsDm,
                    includeConf: true,
                    // OpenShift / ROSA: MachineConfig is the supported delivery method
                    includeMachineConfig: p.useOc && needsDm,
                  },
                  components: {
                    ...state.components,
                    consolePlugin: p.supportsConsolePlugin ? state.components.consolePlugin : false,
                  },
                })
              }}
            />
          ))}
        </div>
        <div className="field-grid" style={{ marginTop: '1rem' }}>
          <Field label="Platform version" hint="Match your cluster version for supportability.">
            <select
              value={state.platformVersion}
              onChange={(e) => patch({ platformVersion: e.target.value })}
            >
              {plat.versions.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
        </div>
        {plat.operatorHub && (
          <Callout>
            On OpenShift, the <strong>CSI Driver</strong> is installed from OperatorHub / Software Catalog
            (not by applying operator YAML). The wizard will generate OperatorHub steps and the driver CR.
          </Callout>
        )}
      </Section>

      <Section title="Storage connection type">
        <div className="card-grid">
          {CONNECTION_TYPES.map((c) => (
            <ChoiceCard
              key={c.id}
              title={c.label}
              description={
                c.multipath === 'dm-multipath'
                  ? 'Uses Device Mapper Multipath'
                  : 'Uses Native NVMe Multipath'
              }
              selected={state.connectionType === c.id}
              onClick={() => {
                setState((s) => {
                  const needsDm = c.id === 'fc' || c.id === 'iscsi'
                  const plat = PLATFORMS[s.platform]
                  return {
                    ...s,
                    connectionType: c.id,
                    multipath: {
                      ...s.multipath,
                      enabled: needsDm,
                      includeConf: true,
                      includeMachineConfig: needsDm && plat.useOc,
                    },
                    storageClasses: s.storageClasses.map((sc, i) =>
                      i === 0 ? { ...sc, connectionType: c.id } : sc,
                    ),
                  }
                })
              }}
            />
          ))}
        </div>
        {(state.connectionType === 'nvme-tcp' || state.connectionType === 'nvme-fc') && (
          <Callout variant="warn">
            NVMe connections require <code>nvmSubsystemID</code> on the StorageClass. Port ID is not used.
            NVMe/TCP is supported on VSP One Block High End and VSP One Block 20 series.
          </Callout>
        )}
        {state.connectionType === 'iscsi' && (
          <Callout variant="warn">
            IQNs must be lowercase. Storage Plug-in for Containers does not support uppercase IQNs.
          </Callout>
        )}
      </Section>

      <Section title="Network access">
        <ToggleAirGapped />
      </Section>
    </div>
  )
}

function ToggleAirGapped() {
  const { state, patch } = useWizard()
  return (
    <>
      <label className="toggle-row">
        <input
          type="checkbox"
          checked={state.airGapped}
          onChange={(e) => patch({ airGapped: e.target.checked })}
        />
        <div>
          <strong>Air-gapped / disconnected cluster</strong>
          <p style={{ margin: '0.25rem 0 0', fontSize: '0.85rem', color: 'var(--hv-text-subtle)' }}>
            Use the offline bundle workflow (<code>hvcsi-offline-bundle.sh</code>) and mirror registries /
            OperatorHub catalogs before install.
          </p>
        </div>
      </label>
      {state.airGapped && (
        <Callout variant="warn">
          Mirror <code>registry.hitachivantara.com</code> and CSI sidecar images. On OpenShift, mirror the
          certified-operators catalog before installing the CSI Driver from Software Catalog.
        </Callout>
      )}
    </>
  )
}
