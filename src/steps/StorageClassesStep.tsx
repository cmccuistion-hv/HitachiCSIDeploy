import { CONNECTION_TYPES, SDS_BLOCK_CONNECTIONS } from '../catalog/platforms'
import { HELP } from '../catalog/help'
import type { StorageClassConfig, StorageClassKind } from '../catalog/types'
import { generateSnapshotClass, generateStorageClass } from '../generator/yaml'
import { useWizard } from '../state/WizardContext'
import { Callout, CodeBlock, Field, Section } from '../components/ui'

function defaultSc(kind: StorageClassKind, connectionType: StorageClassConfig['connectionType']): StorageClassConfig {
  const base: StorageClassConfig = {
    id: `sc-${Date.now()}`,
    kind,
    name:
      kind === 'standard'
        ? 'hitachi-csi'
        : kind === 'vsp-one-sds-block'
          ? 'hitachi-csi-sds'
          : kind === 'stretched-adr'
            ? 'hitachi-csi-stretched-adr'
            : 'hitachi-csi-stretched',
    connectionType,
    secretName: 'hitachi-csi-secret',
    secretNamespace: 'default',
    reclaimPolicy: 'Delete',
    volumeBindingMode: 'Immediate',
    allowVolumeExpansion: kind === 'stretched' || kind === 'stretched-adr' ? false : true,
    fstype: 'ext4',
    storageEfficiency: 'Disabled',
  }
  if (kind === 'stretched' || kind === 'stretched-adr') {
    base.stretchedSecretName = 'hitachi-csi-secret-stretched'
    base.copyGroupName = 'spc-cpg1'
  }
  return base
}

export function StorageClassesStep() {
  const { state, setState } = useWizard()
  const primary = state.storageSystems[0]
  const previewSc = state.storageClasses[0]

  const updateSc = (id: string, patch: Partial<StorageClassConfig>) => {
    setState((s) => ({
      ...s,
      storageClasses: s.storageClasses.map((sc) => {
        if (sc.id !== id) return sc
        const next = { ...sc, ...patch }
        if (next.kind === 'stretched' || next.kind === 'stretched-adr') {
          next.allowVolumeExpansion = false
        }
        return next
      }),
      quickstart: {
        ...s.quickstart,
        storageClassName:
          s.storageClasses[0]?.id === id && patch.name ? patch.name : s.quickstart.storageClassName,
      },
    }))
  }

  return (
    <div className="step-panel">
      <h2>StorageClasses & snapshots</h2>
      <p className="lede">{HELP.secretVsStorageClass.storageClassLede}</p>

      <Callout>{HELP.secretVsStorageClass.storageClassCallout}</Callout>

      {state.storageClasses.map((sc) => {
        const conn = CONNECTION_TYPES.find((c) => c.id === sc.connectionType)!
        const efficiencyBlocked =
          primary?.isB20Series && sc.storageEfficiency === 'Disabled' && sc.kind === 'standard'
        const sdsConnOk =
          sc.kind !== 'vsp-one-sds-block' || SDS_BLOCK_CONNECTIONS.includes(sc.connectionType)

        return (
          <Section
            key={sc.id}
            title={`StorageClass: ${sc.name}`}
            actions={
              state.storageClasses.length > 1 ? (
                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={() =>
                    setState((s) => ({
                      ...s,
                      storageClasses: s.storageClasses.filter((x) => x.id !== sc.id),
                    }))
                  }
                >
                  Remove
                </button>
              ) : null
            }
          >
            <div className="field-grid">
              <Field label="Type" help={HELP.gad.type}>
                <select
                  value={sc.kind}
                  onChange={(e) => {
                    const kind = e.target.value as StorageClassKind
                    updateSc(sc.id, {
                      ...defaultSc(kind, sc.connectionType),
                      id: sc.id,
                      secretName: sc.secretName,
                      secretNamespace: sc.secretNamespace,
                    })
                  }}
                >
                  <option value="standard">Standard (VSP / VSP One Block)</option>
                  <option value="stretched">Stretched / GAD</option>
                  <option value="stretched-adr">Stretched + ADR</option>
                  <option value="vsp-one-sds-block">VSP One SDS Block</option>
                </select>
              </Field>
              <Field label="Name" hint="Kubernetes StorageClass metadata.name referenced by PVCs.">
                <input value={sc.name} onChange={(e) => updateSc(sc.id, { name: e.target.value })} />
              </Field>
              <Field label="Connection type" help={HELP.protocolMultipath}>
                <select
                  value={sc.connectionType}
                  onChange={(e) =>
                    updateSc(sc.id, {
                      connectionType: e.target.value as StorageClassConfig['connectionType'],
                    })
                  }
                >
                  {CONNECTION_TYPES.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Secret name" hint="Must match the Secret generated from the Storage systems step.">
                <input
                  value={sc.secretName}
                  onChange={(e) => updateSc(sc.id, { secretName: e.target.value })}
                />
              </Field>
              <Field label="Secret namespace" hint="Namespace where that storage Secret will be applied.">
                <input
                  value={sc.secretNamespace}
                  onChange={(e) => updateSc(sc.id, { secretNamespace: e.target.value })}
                />
              </Field>
            </div>

            {!sdsConnOk && (
              <Callout variant="warn">
                VSP One SDS Block supports FC, iSCSI, and NVMe/TCP only (not NVMe over FC).
              </Callout>
            )}

            {sc.kind === 'standard' && (
              <div className="field-grid" style={{ marginTop: '1rem' }}>
                <Field label="Serial number" hint="Storage system serial number.">
                  <input
                    value={sc.serialNumber || primary?.serial || ''}
                    onChange={(e) => updateSc(sc.id, { serialNumber: e.target.value })}
                    placeholder={primary?.serial || '54321'}
                  />
                </Field>
                <Field label="Pool ID" hint="HDP pool ID used for dynamic provisioning.">
                  <input
                    value={sc.poolID || ''}
                    onChange={(e) => updateSc(sc.id, { poolID: e.target.value })}
                    placeholder="1"
                  />
                </Field>
                {conn.needsPortId && (
                  <Field
                    label="Port ID(s)"
                    hint="Comma-separated ports for multipath (e.g. CL1-A,CL2-A). Not used for NVMe."
                  >
                    <input
                      value={sc.portID || ''}
                      onChange={(e) => updateSc(sc.id, { portID: e.target.value })}
                      placeholder="CL1-A,CL2-A"
                    />
                  </Field>
                )}
                {conn.needsNvmSubsystem && (
                  <Field
                    label="NVMe subsystem ID"
                    hint="Required for NVMe-FC and NVMe/TCP — Port ID is not used."
                  >
                    <input
                      value={sc.nvmSubsystemID || ''}
                      onChange={(e) => updateSc(sc.id, { nvmSubsystemID: e.target.value })}
                    />
                  </Field>
                )}
                <Field
                  label="Storage efficiency"
                  hint="Adaptive data reduction. VSP One B20 does not support Disabled."
                  error={
                    efficiencyBlocked
                      ? 'VSP One B20 does not support Disabled — use Compression or CompressionDeduplication.'
                      : undefined
                  }
                >
                  <select
                    value={sc.storageEfficiency || 'Disabled'}
                    onChange={(e) =>
                      updateSc(sc.id, {
                        storageEfficiency: e.target.value as StorageClassConfig['storageEfficiency'],
                      })
                    }
                  >
                    <option value="Disabled" disabled={!!primary?.isB20Series}>
                      Disabled
                    </option>
                    <option value="Compression">Compression</option>
                    <option value="CompressionDeduplication">Compression + Deduplication</option>
                  </select>
                </Field>
                {sc.storageEfficiency && sc.storageEfficiency !== 'Disabled' && (
                  <Field
                    label="Efficiency mode"
                    hint="Inline compresses on write; PostProcess reduces data after write."
                  >
                    <select
                      value={sc.storageEfficiencyMode || 'PostProcess'}
                      onChange={(e) =>
                        updateSc(sc.id, {
                          storageEfficiencyMode: e.target
                            .value as StorageClassConfig['storageEfficiencyMode'],
                        })
                      }
                    >
                      <option value="Inline">Inline</option>
                      <option value="PostProcess">PostProcess</option>
                    </select>
                  </Field>
                )}
                <Field label="Filesystem" hint="ext4 (default) or xfs. Ignored for raw Block volumeMode.">
                  <select
                    value={sc.fstype || 'ext4'}
                    onChange={(e) => updateSc(sc.id, { fstype: e.target.value })}
                  >
                    <option value="ext4">ext4</option>
                    <option value="xfs">xfs</option>
                  </select>
                </Field>
                <Field
                  label="Allow volume expansion"
                  hint="Must be false for stretched StorageClasses."
                >
                  <select
                    value={String(sc.allowVolumeExpansion)}
                    onChange={(e) =>
                      updateSc(sc.id, { allowVolumeExpansion: e.target.value === 'true' })
                    }
                  >
                    <option value="true">true</option>
                    <option value="false">false</option>
                  </select>
                </Field>
              </div>
            )}

            {(sc.kind === 'stretched' || sc.kind === 'stretched-adr') && (
              <>
                <Callout>
                  Stretched StorageClasses require a dual-array Secret and set{' '}
                  <code>allowVolumeExpansion: false</code>.
                </Callout>
                <div className="field-grid" style={{ marginTop: '1rem' }}>
                  <Field label="Stretched secret name" hint="Secret that holds primary and secondary array credentials.">
                    <input
                      value={sc.stretchedSecretName || ''}
                      onChange={(e) => updateSc(sc.id, { stretchedSecretName: e.target.value })}
                    />
                  </Field>
                  <Field label="Quorum ID" hint="Quorum disk ID for GAD.">
                    <input
                      value={sc.quorumID || ''}
                      onChange={(e) => updateSc(sc.id, { quorumID: e.target.value })}
                    />
                  </Field>
                  <Field label="Copy group name" hint="GAD copy group name on the arrays.">
                    <input
                      value={sc.copyGroupName || ''}
                      onChange={(e) => updateSc(sc.id, { copyGroupName: e.target.value })}
                    />
                  </Field>
                  <Field label="Consistency group ID" hint="Consistency group identifier for coordinated pairs.">
                    <input
                      value={sc.consistencyGroupId || ''}
                      onChange={(e) => updateSc(sc.id, { consistencyGroupId: e.target.value })}
                    />
                  </Field>
                  <Field label="Primary pool ID" hint="HDP pool on the primary array.">
                    <input
                      value={sc.primaryPoolID || ''}
                      onChange={(e) => updateSc(sc.id, { primaryPoolID: e.target.value })}
                    />
                  </Field>
                  <Field label="Primary port ID(s)" hint="Comma-separated primary ports (e.g. CL1-A,CL2-A).">
                    <input
                      value={sc.primaryPortID || ''}
                      onChange={(e) => updateSc(sc.id, { primaryPortID: e.target.value })}
                    />
                  </Field>
                  <Field label="Secondary pool ID" hint="HDP pool on the secondary array.">
                    <input
                      value={sc.secondaryPoolID || ''}
                      onChange={(e) => updateSc(sc.id, { secondaryPoolID: e.target.value })}
                    />
                  </Field>
                  <Field label="Secondary port ID(s)" hint="Comma-separated secondary ports.">
                    <input
                      value={sc.secondaryPortID || ''}
                      onChange={(e) => updateSc(sc.id, { secondaryPortID: e.target.value })}
                    />
                  </Field>
                </div>
              </>
            )}

            {sc.kind === 'vsp-one-sds-block' && (
              <div className="field-grid" style={{ marginTop: '1rem' }}>
                <Field
                  label="Storage efficiency"
                  hint={
                    primary?.multitenancy
                      ? 'Cannot set when multitenancy is enabled — follows VPS.'
                      : 'Compression or Disabled. SDS Block does not use CompressionDeduplication here.'
                  }
                >
                  <select
                    value={sc.storageEfficiency || 'Disabled'}
                    disabled={!!primary?.multitenancy}
                    onChange={(e) =>
                      updateSc(sc.id, {
                        storageEfficiency: e.target.value as StorageClassConfig['storageEfficiency'],
                      })
                    }
                  >
                    <option value="Disabled">Disabled</option>
                    <option value="Compression">Compression</option>
                  </select>
                </Field>
                <Field label="Filesystem" hint="ext4 (default) or xfs.">
                  <select
                    value={sc.fstype || 'ext4'}
                    onChange={(e) => updateSc(sc.id, { fstype: e.target.value })}
                  >
                    <option value="ext4">ext4</option>
                    <option value="xfs">xfs</option>
                  </select>
                </Field>
              </div>
            )}
          </Section>
        )
      })}

      <button
        type="button"
        className="btn btn-secondary"
        style={{ marginBottom: '1.25rem' }}
        onClick={() =>
          setState((s) => ({
            ...s,
            storageClasses: [...s.storageClasses, defaultSc('standard', s.connectionType)],
          }))
        }
      >
        Add StorageClass
      </button>

      <Section
        title="VolumeSnapshotClass"
        help="Enables CSI volume snapshots. Deletion policy controls whether snapshot content is removed when the VolumeSnapshot is deleted."
      >
        <label className="toggle-row" style={{ marginBottom: '0.85rem' }}>
          <input
            type="checkbox"
            checked={state.snapshotClass.enabled}
            onChange={(e) =>
              setState((s) => ({
                ...s,
                snapshotClass: { ...s.snapshotClass, enabled: e.target.checked },
              }))
            }
          />
          <div>
            <strong>Generate VolumeSnapshotClass</strong>
          </div>
        </label>
        {state.snapshotClass.enabled && (
          <div className="field-grid">
            <Field label="Name" hint="Kubernetes VolumeSnapshotClass metadata.name.">
              <input
                value={state.snapshotClass.name}
                onChange={(e) =>
                  setState((s) => ({
                    ...s,
                    snapshotClass: { ...s.snapshotClass, name: e.target.value },
                  }))
                }
              />
            </Field>
            <Field
              label="Deletion policy"
              hint="Delete removes snapshot content with the VolumeSnapshot; Retain keeps it."
            >
              <select
                value={state.snapshotClass.deletionPolicy}
                onChange={(e) =>
                  setState((s) => ({
                    ...s,
                    snapshotClass: {
                      ...s.snapshotClass,
                      deletionPolicy: e.target.value as 'Delete' | 'Retain',
                    },
                  }))
                }
              >
                <option value="Delete">Delete</option>
                <option value="Retain">Retain</option>
              </select>
            </Field>
            <label className="toggle-row">
              <input
                type="checkbox"
                checked={state.snapshotClass.immutable}
                onChange={(e) =>
                  setState((s) => ({
                    ...s,
                    snapshotClass: { ...s.snapshotClass, immutable: e.target.checked },
                  }))
                }
              />
              <div>
                <strong>Immutable snapshot class variant</strong>
                <p style={{ margin: '0.2rem 0 0', fontSize: '0.85rem', color: 'var(--hv-text-subtle)' }}>
                  Generates the immutable VolumeSnapshotClass sample when enabled.
                </p>
              </div>
            </label>
          </div>
        )}
      </Section>

      {previewSc && (
        <Section title="Live YAML preview">
          <CodeBlock className="yaml-preview">{generateStorageClass(previewSc)}</CodeBlock>
          {state.snapshotClass.enabled && (
            <CodeBlock className="yaml-preview" style={{ marginTop: '0.75rem' }}>
              {generateSnapshotClass(state.snapshotClass)}
            </CodeBlock>
          )}
        </Section>
      )}
    </div>
  )
}
