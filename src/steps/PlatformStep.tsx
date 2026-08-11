import {
  CONNECTION_TYPES,
  PLATFORMS,
  coerceConnectionType,
  connectionsForNodeEnvironment,
  connectionsForStorageClassKind,
  type NodeEnvironment,
  type PlatformId,
} from '../catalog/platforms'
import { HELP } from '../catalog/help'
import { useWizard } from '../state/WizardContext'
import { Callout, ChoiceCard, Field, Section } from '../components/ui'

function applyConnectionSideEffects(
  connectionId: ReturnType<typeof coerceConnectionType>,
  platform: PlatformId,
  multipath: { enabled: boolean; includeConf: boolean; includeMachineConfig: boolean },
) {
  const needsDm = connectionId === 'fc' || connectionId === 'iscsi'
  const plat = PLATFORMS[platform]
  return {
    connectionType: connectionId,
    multipath: {
      ...multipath,
      enabled: needsDm,
      includeConf: true,
      includeMachineConfig: needsDm && plat.useOc,
    },
  }
}

export function PlatformStep() {
  const { state, patch, setState } = useWizard()
  const plat = PLATFORMS[state.platform]
  const allowedConnections = connectionsForNodeEnvironment(state.nodeEnvironment)

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

      <Section title="Worker node environment">
        <div className="card-grid">
          {(
            [
              {
                id: 'bare-metal' as NodeEnvironment,
                title: 'Bare metal',
                description: 'FC, iSCSI, NVMe over FC, and NVMe/TCP',
              },
              {
                id: 'virtual-machine' as NodeEnvironment,
                title: 'Virtual machine',
                description: 'iSCSI and NVMe/TCP only',
              },
            ] as const
          ).map((opt) => (
            <ChoiceCard
              key={opt.id}
              title={opt.title}
              description={opt.description}
              selected={state.nodeEnvironment === opt.id}
              onClick={() => {
                setState((s) => {
                  const allowed = connectionsForNodeEnvironment(opt.id)
                  const nextConn = coerceConnectionType(s.connectionType, allowed)
                  const side = applyConnectionSideEffects(nextConn, s.platform, s.multipath)
                  return {
                    ...s,
                    nodeEnvironment: opt.id,
                    ...side,
                    storageClasses: s.storageClasses.map((sc) => ({
                      ...sc,
                      connectionType: coerceConnectionType(
                        sc.connectionType,
                        connectionsForStorageClassKind(sc.kind, opt.id),
                      ),
                    })),
                  }
                })
              }}
            />
          ))}
        </div>
        {state.nodeEnvironment === 'virtual-machine' && (
          <Callout>
            Fibre Channel and NVMe over FC require bare metal hosts. Choose iSCSI or NVMe/TCP for VMs.
          </Callout>
        )}
      </Section>

      <Section title="Storage connection type" help={HELP.protocolMultipath}>
        <div className="card-grid">
          {CONNECTION_TYPES.filter((c) => allowedConnections.includes(c.id)).map((c) => (
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
                  const side = applyConnectionSideEffects(c.id, s.platform, s.multipath)
                  return {
                    ...s,
                    ...side,
                    storageClasses: s.storageClasses.map((sc, i) =>
                      i === 0
                        ? {
                            ...sc,
                            connectionType: coerceConnectionType(
                              c.id,
                              connectionsForStorageClassKind(sc.kind, s.nodeEnvironment),
                            ),
                          }
                        : sc,
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
          </Callout>
        )}
        {state.connectionType === 'nvme-tcp' && (
          <Callout variant="warn">
            NVMe/TCP is supported on VSP One Block High End and VSP One Block 20 series (and on VSP One SDS
            Block when that StorageClass type is used).
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
            You’ll mirror images and catalogs offline — see Prerequisites. Uses the offline bundle workflow
            (<code>hvcsi-offline-bundle.sh</code>).
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
