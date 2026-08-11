import type { StorageFamily, StorageSystemConfig } from '../catalog/types'
import { HELP } from '../catalog/help'
import { useWizard } from '../state/WizardContext'
import { Callout, Field, Section } from '../components/ui'

function newSystem(n: number): StorageSystemConfig {
  return {
    id: `storage-${n}`,
    name: n === 1 ? 'primary' : `array-${n}`,
    family: 'vsp',
    serial: '',
    url: '',
    user: '',
    password: '',
    stretchedRole: n === 1 ? 'primary' : n === 2 ? 'secondary' : 'none',
  }
}

export function StorageStep() {
  const { state, setState } = useWizard()

  const updateSys = (id: string, patch: Partial<StorageSystemConfig>) => {
    setState((s) => ({
      ...s,
      storageSystems: s.storageSystems.map((sys) => (sys.id === id ? { ...sys, ...patch } : sys)),
    }))
  }

  const removeSys = (id: string) => {
    setState((s) => ({
      ...s,
      storageSystems: s.storageSystems.filter((sys) => sys.id !== id),
    }))
  }

  return (
    <div className="step-panel">
      <h2>Storage systems</h2>
      <p className="lede">{HELP.secretVsStorageClass.storageLede}</p>

      <Callout>{HELP.secretVsStorageClass.storageCallout}</Callout>

      {state.storageSystems.map((sys, idx) => (
        <Section
          key={sys.id}
          title={`Array: ${sys.name || sys.id}`}
          actions={
            state.storageSystems.length > 1 ? (
              <button type="button" className="btn btn-danger" onClick={() => removeSys(sys.id)}>
                Remove
              </button>
            ) : null
          }
        >
          <div className="field-grid">
            <Field label="Display name" hint="Label used in this wizard only (not a Kubernetes name).">
              <input value={sys.name} onChange={(e) => updateSys(sys.id, { name: e.target.value })} />
            </Field>
            <Field
              label="Storage family"
              hint="VSP / VSP One Block vs VSP One SDS Block — changes StorageClass shape later."
            >
              <select
                value={sys.family}
                onChange={(e) => updateSys(sys.id, { family: e.target.value as StorageFamily })}
              >
                <option value="vsp">VSP family / VSP One Block</option>
                <option value="vsp-one-sds-block">VSP One SDS Block</option>
              </select>
            </Field>
            <Field label="Serial number" hint="Required for standard StorageClasses.">
              <input
                value={sys.serial}
                onChange={(e) => updateSys(sys.id, { serial: e.target.value })}
                placeholder="54321"
              />
            </Field>
            <Field
              label="REST URL"
              hint="Controller / SVP URL. Use service IP for VSP One B20 / Block High End. IPv4 only (80/443)."
            >
              <input
                value={sys.url}
                onChange={(e) => updateSys(sys.id, { url: e.target.value })}
                placeholder="https://172.16.1.1"
              />
            </Field>
            <Field
              label="Username"
              hint="Storage Administrator (View & Modify) or equivalent. SDS Block with multitenancy: VpsStorage role."
            >
              <input value={sys.user} onChange={(e) => updateSys(sys.id, { user: e.target.value })} />
            </Field>
            <Field label="Password" hint="Encoded into the generated Kubernetes Secret.">
              <input
                type="password"
                value={sys.password}
                onChange={(e) => updateSys(sys.id, { password: e.target.value })}
              />
            </Field>
            <Field
              label="Host mode options (optional)"
              hint="Comma-separated. Driver defaults include 2,22,25,68,91 — specify only additional options."
            >
              <input
                value={sys.hostModeOptions || ''}
                onChange={(e) => updateSys(sys.id, { hostModeOptions: e.target.value })}
                placeholder="88,81"
              />
            </Field>
            <Field
              label="Resource group ID (optional)"
              hint="Required only if the user can access multiple resource groups."
            >
              <input
                value={sys.resourceGroupID || ''}
                onChange={(e) => updateSys(sys.id, { resourceGroupID: e.target.value })}
              />
            </Field>
            <Field label="Stretched / GAD role" help={HELP.gad.role}>
              <select
                value={sys.stretchedRole || 'none'}
                onChange={(e) =>
                  updateSys(sys.id, {
                    stretchedRole: e.target.value as StorageSystemConfig['stretchedRole'],
                  })
                }
              >
                <option value="none">None</option>
                <option value="primary">Primary</option>
                <option value="secondary">Secondary</option>
              </select>
            </Field>
          </div>

          {sys.family === 'vsp' && (
            <div style={{ marginTop: '0.85rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <label className="toggle-row">
                <input
                  type="checkbox"
                  checked={!!sys.isB20Series}
                  onChange={(e) => updateSys(sys.id, { isB20Series: e.target.checked })}
                />
                <div>
                  <strong>VSP One Block 20 series</strong>
                  <p style={{ margin: '0.2rem 0 0', fontSize: '0.85rem', color: 'var(--hv-text-subtle)' }}>
                    Disables &quot;Disabled&quot; storage efficiency (defaults to CompressionDeduplication).
                  </p>
                </div>
              </label>
              <label className="toggle-row">
                <input
                  type="checkbox"
                  checked={!!sys.alternativeCloneMode}
                  onChange={(e) => updateSys(sys.id, { alternativeCloneMode: e.target.checked })}
                />
                <div>
                  <strong>Alternative clone mode</strong>
                  <p style={{ margin: '0.2rem 0 0', fontSize: '0.85rem', color: 'var(--hv-text-subtle)' }}>
                    VSP One Block High End / 20 series only. Enables expandable clones from a retained base
                    volume.
                  </p>
                </div>
              </label>
            </div>
          )}

          {sys.family === 'vsp-one-sds-block' && (
            <>
              <Callout>
                SDS Block StorageClasses use <code>storageType: vsp-one-sds-block</code> and do not set
                serial/pool/port on the SC. Connections: FC, iSCSI, NVMe/TCP.
              </Callout>
              <label className="toggle-row" style={{ marginTop: '0.75rem' }}>
                <input
                  type="checkbox"
                  checked={!!sys.multitenancy}
                  onChange={(e) => updateSys(sys.id, { multitenancy: e.target.checked })}
                />
                <div>
                  <strong>Multitenancy / VPS enabled</strong>
                  <p style={{ margin: '0.2rem 0 0', fontSize: '0.85rem', color: 'var(--hv-text-subtle)' }}>
                    One VPS per cluster; user must have VpsStorage role. Storage efficiency follows VPS
                    settings.
                  </p>
                </div>
              </label>
            </>
          )}

          {idx === 0 && !sys.url && (
            <Callout variant="warn">Enter at least URL, user, and password to generate a usable Secret.</Callout>
          )}
        </Section>
      ))}

      <button
        type="button"
        className="btn btn-secondary"
        onClick={() =>
          setState((s) => ({
            ...s,
            storageSystems: [...s.storageSystems, newSystem(s.storageSystems.length + 1)],
          }))
        }
      >
        Add storage system
      </button>
    </div>
  )
}
