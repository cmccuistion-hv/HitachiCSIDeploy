import { PLATFORMS } from '../catalog/platforms'
import { generatePvc, generateTestPod } from '../generator/yaml'
import { useWizard } from '../state/WizardContext'
import { Callout, CopyButton, Field, Section } from '../components/ui'

export function QuickstartStep() {
  const { state, setState } = useWizard()
  const plat = PLATFORMS[state.platform]
  const cmd = plat.useOc ? 'oc' : 'kubectl'
  const qs = state.quickstart

  // Keep SC name synced if empty
  if (!qs.storageClassName && state.storageClasses[0]) {
    // render-time sync avoided; use effect-less default in select
  }

  const checklist = [
    {
      mins: '2–15+',
      label: 'Prereqs & multipath',
      detail: plat.useOc
        ? 'MachineConfig reboots workers — wait for MCP updated before continuing.'
        : 'Confirm multipath / initiator and storage reachability.',
    },
    {
      mins: '3',
      label: 'Install CSI Driver',
      detail: plat.operatorHub
        ? 'OperatorHub install + create HSPC instance.'
        : 'Apply operator YAML + HSPC CR.',
    },
    {
      mins: '2',
      label: 'Secret + StorageClass',
      detail: 'Apply generated Secret and StorageClass.',
    },
    {
      mins: '3',
      label: 'PVC + Pod',
      detail: 'Create test PVC, wait Bound, run test Pod.',
    },
  ]

  return (
    <div className="step-panel">
      <h2>First PV in 10 minutes</h2>
      <p className="lede">
        A focused path to your first Bound volume. Tune the test PVC, then follow the timed checklist on
        Review &amp; export.
        {plat.useOc && state.multipath.enabled ? (
          <>
            {' '}
            On OpenShift, apply multipath MachineConfig <strong>first</strong> and wait for node reboots to
            finish — that step is outside the 10-minute driver/PVC window.
          </>
        ) : null}
      </p>

      <div className="time-budget">
        {checklist.map((c) => (
          <div key={c.label} className="time-card">
            <div className="mins">{c.mins}m</div>
            <div className="label">
              <strong>{c.label}</strong>
              <div>{c.detail}</div>
            </div>
          </div>
        ))}
      </div>

      <Section title="Test workload">
        <div className="field-grid">
          <Field label="PVC name">
            <input
              value={qs.pvcName}
              onChange={(e) =>
                setState((s) => ({ ...s, quickstart: { ...s.quickstart, pvcName: e.target.value } }))
              }
            />
          </Field>
          <Field label="Size">
            <input
              value={qs.pvcSize}
              onChange={(e) =>
                setState((s) => ({ ...s, quickstart: { ...s.quickstart, pvcSize: e.target.value } }))
              }
            />
          </Field>
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
          <Field label="Access mode">
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
          <Field label="Volume mode">
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
      </Section>

      <Section title="Verification commands" actions={<CopyButton text={`${cmd} get pvc ${qs.pvcName}\n${cmd} get pod ${qs.podName}\n${cmd} get pv`} />}>
        <pre className="code-block">{`# After applying Secret, StorageClass, PVC, Pod:
${cmd} get hspc -n ${state.driverNamespace}
${cmd} get pvc ${qs.pvcName}
# Expect: STATUS Bound
${cmd} get pod ${qs.podName}
# Expect: Running
${cmd} get pv
# Expect: a PV provisioned by hspc.csi.hitachi.com`}</pre>
      </Section>

      <div className="split-layout">
        <Section title="PVC YAML" actions={<CopyButton text={generatePvc({ ...qs, storageClassName: qs.storageClassName || state.storageClasses[0]?.name || 'hitachi-csi' })} />}>
          <pre className="yaml-preview">
            {generatePvc({
              ...qs,
              storageClassName: qs.storageClassName || state.storageClasses[0]?.name || 'hitachi-csi',
            })}
          </pre>
        </Section>
        <Section title="Pod YAML" actions={<CopyButton text={generateTestPod(qs)} />}>
          <pre className="yaml-preview">{generateTestPod(qs)}</pre>
        </Section>
      </div>

      <Callout variant="ok">
        Tip: fill storage credentials and StorageClass fields before export so <code>install.sh</code> can
        apply a complete path without edits.
      </Callout>
    </div>
  )
}
