import { type StorageFamily, type StorageSystemConfig } from '../catalog/types'
import {
  PLATFORMS,
  STORAGE_FAMILIES,
  isSdsBlockFamily,
  storageFamilyHint,
  storageRestUrlHint,
  supportsAlternativeCloneMode,
  supportsImmutableSnapshots,
} from '../catalog/platforms'
import { HELP } from '../catalog/help'
import { getSiteStorage, setHrpcPair, withSiteStorage } from '../catalog/sites'
import { nextUniqueName, validateStorageSystem } from '../catalog/validation'
import { AlternativeCloneModeDiagram } from '../components/AlternativeCloneModeDiagram'
import { GadDataPathsDiagram } from '../components/GadDataPathsDiagram'
import { ResourceGroupOverviewDiagram } from '../components/ResourceGroupOverviewDiagram'
import { AdvancedSection } from '../components/AdvancedSection'
import { useWizard } from '../state/WizardContext'
import { useSiteTab } from '../state/useSiteTab'
import { Callout, Field, HelpTip, Section } from '../components/ui'

function newSystem(n: number): StorageSystemConfig {
  return {
    id: `storage-${n}`,
    name: n === 1 ? 'primary' : `array-${n}`,
    family: 'vsp-5000-g-e-f',
    serial: '',
    url: '',
    user: '',
    password: '',
    stretchedRole: n === 1 ? 'primary' : n === 2 ? 'secondary' : 'none',
  }
}

export function StorageStep() {
  const { state, setState } = useWizard()
  const replicationOn = state.components.replication
  const clusterLabel = PLATFORMS[state.platform].useOc ? 'OpenShift cluster' : 'Kubernetes cluster'
  const [site, setSite] = useSiteTab(replicationOn)
  const storage = replicationOn ? getSiteStorage(state, site) : null
  const storageSystems = replicationOn ? storage!.storageSystems : state.storageSystems

  const updateSys = (id: string, patch: Partial<StorageSystemConfig>) => {
    setState((s) => {
      if (!s.components.replication) {
        const storageSystems = s.storageSystems.map((sys) => (sys.id === id ? { ...sys, ...patch } : sys))
        const primary = storageSystems[0]
        const snapshotClass =
          s.snapshotClass.immutable && !supportsImmutableSnapshots(primary)
            ? { ...s.snapshotClass, immutable: false }
            : s.snapshotClass
        return { ...s, storageSystems, snapshotClass }
      }

      const current = getSiteStorage(s, site)
      const nextSystems = current.storageSystems.map((sys) => (sys.id === id ? { ...sys, ...patch } : sys))

      // Snapshot class is packaged per site; keep guardrails stable by keying off the primary site.
      const primaryArray =
        site === 'primary' ? nextSystems[0] : getSiteStorage(s, 'primary').storageSystems[0]
      const snapshotClass =
        s.snapshotClass.immutable && !supportsImmutableSnapshots(primaryArray)
          ? { ...s.snapshotClass, immutable: false }
          : s.snapshotClass

      const next = withSiteStorage(s, site, { ...current, storageSystems: nextSystems })
      return { ...next, snapshotClass }
    })
  }

  const removeSys = (id: string) => {
    setState((s) => {
      if (!s.components.replication) {
        return {
          ...s,
          storageSystems: s.storageSystems.filter((sys) => sys.id !== id),
        }
      }
      const current = getSiteStorage(s, site)
      return withSiteStorage(s, site, {
        ...current,
        storageSystems: current.storageSystems.filter((sys) => sys.id !== id),
      })
    })
  }

  return (
    <div className="step-panel">
      <h2>Storage systems</h2>
      <p className="lede">{replicationOn ? HELP.replicationSitesLede : HELP.secretVsStorageClass.storageLede}</p>

      <Callout>
        {HELP.secretVsStorageClass.storageCallout}
      </Callout>

      {replicationOn && (
        <>
          <div className="tabs" style={{ marginTop: '0.75rem' }}>
            <button
              type="button"
              className={`tab${site === 'primary' ? ' active' : ''}`}
              onClick={() => setSite('primary')}
            >
              Primary site
            </button>
            <button
              type="button"
              className={`tab${site === 'secondary' ? ' active' : ''}`}
              onClick={() => setSite('secondary')}
            >
              Secondary site
            </button>
          </div>

          <Callout>{HELP.replicationPairArrayCallout}</Callout>
        </>
      )}

      {storageSystems.map((sys, idx) => {
        const sysErrors = validateStorageSystem(sys, storageSystems)
        return (
        <Section
          key={sys.id}
          title={`Array: ${sys.name || sys.id}`}
          actions={
            storageSystems.length > 1 ? (
              <button type="button" className="btn btn-danger" onClick={() => removeSys(sys.id)}>
                Remove
              </button>
            ) : null
          }
        >
          {replicationOn && (
            <label className="toggle-row" style={{ marginBottom: '0.85rem' }}>
              <input
                type="checkbox"
                checked={!!sys.hrpcPair}
                onChange={(e) => {
                  if (!e.target.checked) return
                  const id = sys.id
                  setState((s) => {
                    const current = getSiteStorage(s, site)
                    const nextSystems = setHrpcPair(current.storageSystems, id)
                    return withSiteStorage(s, site, { ...current, storageSystems: nextSystems })
                  })
                }}
              />
              <div>
                <strong>Use this array for Replication</strong>
                <p style={{ margin: '0.2rem 0 0', fontSize: '0.85rem', color: 'var(--hv-text-subtle)' }}>
                  Each site picks exactly one array that Replication will use. Extra arrays stay on this
                  site for local or stretched (GAD) StorageClasses.
                </p>
              </div>
            </label>
          )}

          <div className="field-grid">
            <Field
              label="Display name"
              hint="Label used in this wizard only (not a Kubernetes name). Also used in generated Secret file names."
              error={sysErrors.name}
            >
              <input value={sys.name} onChange={(e) => updateSys(sys.id, { name: e.target.value })} />
            </Field>
            <Field label="Storage family" hint={storageFamilyHint(sys.family)}>
              <select
                value={sys.family}
                onChange={(e) => {
                  const family = e.target.value as StorageFamily
                  updateSys(sys.id, {
                    family,
                    alternativeCloneMode: supportsAlternativeCloneMode(family)
                      ? sys.alternativeCloneMode
                      : false,
                    serial: isSdsBlockFamily(family) ? '' : sys.serial,
                    stretchedRole: isSdsBlockFamily(family) ? 'none' : sys.stretchedRole,
                    resourceGroupID: isSdsBlockFamily(family) ? '' : sys.resourceGroupID,
                  })
                }}
              >
                {STORAGE_FAMILIES.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.label}
                  </option>
                ))}
              </select>
            </Field>
            {!isSdsBlockFamily(sys.family) && (
            <Field label="Serial number" hint="From the VSP storage system." error={sysErrors.serial}>
              <input
                value={sys.serial}
                onChange={(e) => updateSys(sys.id, { serial: e.target.value })}
                placeholder="54321"
              />
            </Field>
            )}
            <Field
              label="REST URL"
              hint={storageRestUrlHint(sys.family)}
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
            {replicationOn && sys.hrpcPair && !isSdsBlockFamily(sys.family) && (
              <Field
                label="Resource group ID (optional)"
                hint="If you use resource partitioning, set this on both sites’ Replication arrays. IDs are per array and do not need to match. CSI Driver and Replication use the same ID on this array."
                help={HELP.resourceGroupId}
                helpDiagram={<ResourceGroupOverviewDiagram resourceGroupID={sys.resourceGroupID} />}
              >
                <input
                  value={sys.resourceGroupID || ''}
                  onChange={(e) => updateSys(sys.id, { resourceGroupID: e.target.value })}
                />
              </Field>
            )}
            {!(replicationOn && sys.hrpcPair) && !isSdsBlockFamily(sys.family) && (
              <Field
                label="Stretched / GAD role"
                help={HELP.gad.role}
                helpDiagram={<GadDataPathsDiagram clusterLabel={clusterLabel} />}
              >
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
            )}
          </div>

          <AdvancedSection
            title="Advanced array options"
          >
            <div className="field-grid">
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
              {!isSdsBlockFamily(sys.family) && !(replicationOn && sys.hrpcPair) && (
                <Field
                  label="Resource group ID (optional)"
                  hint="Required only if the user can access multiple resource groups."
                  help={HELP.resourceGroupId}
                  helpDiagram={<ResourceGroupOverviewDiagram resourceGroupID={sys.resourceGroupID} />}
                >
                  <input
                    value={sys.resourceGroupID || ''}
                    onChange={(e) => updateSys(sys.id, { resourceGroupID: e.target.value })}
                  />
                </Field>
              )}
            </div>

            {supportsAlternativeCloneMode(sys.family) && (
              <div style={{ marginTop: '0.85rem' }}>
                <label className="toggle-row">
                  <input
                    type="checkbox"
                    checked={!!sys.alternativeCloneMode}
                    onChange={(e) => updateSys(sys.id, { alternativeCloneMode: e.target.checked })}
                  />
                  <div>
                    <strong>
                      Alternative clone mode
                      <HelpTip
                        text={HELP.alternativeCloneMode}
                        diagram={<AlternativeCloneModeDiagram />}
                      />
                    </strong>
                    <p style={{ margin: '0.2rem 0 0', fontSize: '0.85rem', color: 'var(--hv-text-subtle)' }}>
                      Create VMs from a template, or clone volumes, and still grow those disks. CSI deletes the
                      hidden parent — you do not have to delete clones first. Array clone rule — not an OpenShift
                      Virtualization limit. Cost: about 2× pool space. 20 Series and High End (B85) only.
                    </p>
                  </div>
                </label>
              </div>
            )}

            {isSdsBlockFamily(sys.family) && (
              <label className="toggle-row" style={{ marginTop: '0.85rem' }}>
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
            )}
          </AdvancedSection>

          {idx === 0 && !sys.url && (
            <Callout variant="warn">Enter at least URL, user, and password to generate a usable Secret.</Callout>
          )}
        </Section>
        )
      })}

      <button
        type="button"
        className="btn btn-secondary"
        onClick={() =>
          setState((s) => {
            const currentSystems = s.components.replication
              ? getSiteStorage(s, site).storageSystems
              : s.storageSystems
            const next = newSystem(currentSystems.length + 1)
            next.id = `storage-${Date.now()}`
            next.name = nextUniqueName(
              currentSystems.length === 0 ? 'primary' : 'array',
              currentSystems.map((x) => x.name),
            )
            if (!s.components.replication) {
              return { ...s, storageSystems: [...s.storageSystems, next] }
            }
            const current = getSiteStorage(s, site)
            return withSiteStorage(s, site, {
              ...current,
              storageSystems: [...current.storageSystems, next],
            })
          })
        }
      >
        Add storage system
      </button>
    </div>
  )
}
