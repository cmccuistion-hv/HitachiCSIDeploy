import { PLATFORMS } from '../catalog/platforms'
import { AdvancedSection } from '../components/AdvancedSection'
import { useWizard } from '../state/WizardContext'
import { Callout, Field, Section } from '../components/ui'

export function QuickstartStep() {
  const { state, setState } = useWizard()
  const plat = PLATFORMS[state.platform]
  const qs = state.quickstart

  return (
    <div className="step-panel">
      <h2>Test volume</h2>
      <p className="lede">
        Configure the sample PVC and Pod packaged into the export. After prerequisites and{' '}
        <code>install.sh</code> have applied the driver, Secret, and StorageClass, these manifests confirm
        provisioning works (Bound PVC + Running Pod).
        {plat.useOc && state.multipath.enabled ? (
          <>
            {' '}
            On OpenShift, finish multipath MachineConfig / node reboots before expecting a Bound volume.
          </>
        ) : null}
      </p>

      <Callout>
        <code>install.sh</code> applies <code>06-quickstart/</code> automatically and waits for the PVC to
        become Bound and the Pod to become Running.
      </Callout>

      <Section title="Test workload">
        <AdvancedSection
          title="Advanced test workload options"
        >
          <div className="field-grid">
            <Field label="PVC name">
              <input
                value={qs.pvcName}
                onChange={(e) =>
                  setState((s) => ({ ...s, quickstart: { ...s.quickstart, pvcName: e.target.value } }))
                }
              />
            </Field>
            <Field
              label="Access mode"
              hint="ReadWriteOnce: one node at a time. ReadWriteMany: shared filesystem across nodes (when supported)."
            >
              <select
                value={qs.accessMode}
                onChange={(e) =>
                  setState((s) => ({
                    ...s,
                    quickstart: {
                      ...s.quickstart,
                      accessMode: e.target.value as typeof qs.accessMode,
                    },
                  }))
                }
              >
                <option value="ReadWriteOnce">ReadWriteOnce</option>
                <option value="ReadWriteMany">ReadWriteMany</option>
                <option value="ReadOnlyMany">ReadOnlyMany</option>
              </select>
            </Field>
            <Field
              label="Volume mode"
              hint="Filesystem mounts a formatted volume. Block presents a raw device to the container."
            >
              <select
                value={qs.volumeMode}
                onChange={(e) =>
                  setState((s) => ({
                    ...s,
                    quickstart: {
                      ...s.quickstart,
                      volumeMode: e.target.value as typeof qs.volumeMode,
                    },
                  }))
                }
              >
                <option value="Filesystem">Filesystem</option>
                <option value="Block">Block</option>
              </select>
            </Field>
            <Field label="Pod name">
              <input
                value={qs.podName}
                onChange={(e) =>
                  setState((s) => ({ ...s, quickstart: { ...s.quickstart, podName: e.target.value } }))
                }
              />
            </Field>
          </div>
        </AdvancedSection>

        <div className="field-grid">
          <Field label="Size" hint="Requested capacity for the test PVC (for example 1Gi).">
            <input
              value={qs.pvcSize}
              onChange={(e) =>
                setState((s) => ({ ...s, quickstart: { ...s.quickstart, pvcSize: e.target.value } }))
              }
            />
          </Field>
          {state.storageClasses.length > 1 ? (
            <Field label="StorageClass">
              <select
                value={qs.storageClassName || state.storageClasses[0]?.name}
                onChange={(e) =>
                  setState((s) => ({
                    ...s,
                    quickstart: { ...s.quickstart, storageClassName: e.target.value },
                  }))
                }
              >
                {state.storageClasses.map((sc) => (
                  <option key={sc.id} value={sc.name}>
                    {sc.name}
                  </option>
                ))}
              </select>
            </Field>
          ) : (
            <Field label="StorageClass" hint="Uses the only StorageClass in this package.">
              <input value={state.storageClasses[0]?.name || ''} disabled readOnly />
            </Field>
          )}
        </div>
      </Section>
    </div>
  )
}
