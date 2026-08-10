import { FIREWALL_DOMAINS, MULTIPATH_CONF, PLATFORMS, REQUIRED_LICENSES } from '../catalog/platforms'
import { CONNECTION_TYPES } from '../catalog/platforms'
import {
  generateMultipathMachineConfig,
  generateMultipathMachineConfigs,
  getMultipathConf,
} from '../generator/multipath'
import { useWizard } from '../state/WizardContext'
import { Callout, CopyButton, Field, Section } from '../components/ui'

export function PrerequisitesStep() {
  const { state, setState } = useWizard()
  const plat = PLATFORMS[state.platform]
  const conn = CONNECTION_TYPES.find((c) => c.id === state.connectionType)!
  const cmd = plat.useOc ? 'oc' : 'kubectl'
  const needsDm = conn.multipath === 'dm-multipath'
  const mp = state.multipath
  const confText = getMultipathConf(mp.customConf || undefined)
  const showMachineConfig = mp.enabled && plat.useOc && mp.includeMachineConfig

  const items = buildPrereqs(state.platform, state.connectionType, state.airGapped, cmd, mp.enabled)

  const toggle = (id: string) => {
    setState((s) => ({
      ...s,
      prereqAcknowledged: { ...s.prereqAcknowledged, [id]: !s.prereqAcknowledged[id] },
    }))
  }

  const done = items.filter((i) => state.prereqAcknowledged[i.id]).length

  const mcPreview =
    showMachineConfig && mp.machineConfigRole !== 'all'
      ? generateMultipathMachineConfig({
          name: mp.machineConfigName,
          role: mp.machineConfigRole,
          conf: mp.customConf || undefined,
        })
      : showMachineConfig
        ? generateMultipathMachineConfigs({
            name: mp.machineConfigName,
            role: 'all',
            conf: mp.customConf || undefined,
          })
            .map((f) => `---\n# ${f.path}\n${f.content}`)
            .join('\n')
        : ''

  return (
    <div className="step-panel">
      <h2>Prerequisites</h2>
      <p className="lede">
        Complete these environment checks before applying manifests. Items adapt to{' '}
        <strong>{plat.displayName}</strong> and <strong>{conn.label}</strong>.
      </p>

      <Callout>
        Progress: {done} / {items.length} acknowledged. You can continue without checking all boxes, but
        skipped prerequisites are the most common cause of first-PV delays.
      </Callout>

      {(needsDm || mp.enabled) && (
        <Section title="Multipath configuration">
          {!needsDm && (
            <Callout variant="warn">
              Your connection type uses Native NVMe Multipath, not Device Mapper Multipath. You can still
              generate a DM multipath.conf if nodes need it for other paths.
            </Callout>
          )}

          <label className="toggle-row" style={{ marginBottom: '0.75rem' }}>
            <input
              type="checkbox"
              checked={mp.enabled}
              onChange={(e) =>
                setState((s) => ({
                  ...s,
                  multipath: {
                    ...s.multipath,
                    enabled: e.target.checked,
                    includeConf: true,
                    includeMachineConfig: e.target.checked && plat.useOc,
                  },
                }))
              }
            />
            <div>
              <strong>Generate Device Mapper Multipath config</strong>
              <p style={{ margin: '0.2rem 0 0', fontSize: '0.85rem', color: 'var(--hv-text-subtle)' }}>
                Starts from the Hitachi CSI sample (<code>multipath-sample.conf</code>) and includes it in
                the export package. Required for Fibre Channel and iSCSI.
              </p>
            </div>
          </label>

          {mp.enabled && (
            <>
              {!plat.useOc && (
                <Callout>
                  On Kubernetes / RKE2 / EKS, export includes <code>multipath.conf</code> to install on each
                  node. OpenShift MachineConfig is only offered when OpenShift or ROSA is selected.
                </Callout>
              )}

              {plat.useOc && (
                <div className="field-grid" style={{ marginBottom: '0.85rem' }}>
                  <Field label="MachineConfig name">
                    <input
                      value={mp.machineConfigName}
                      onChange={(e) =>
                        setState((s) => ({
                          ...s,
                          multipath: { ...s.multipath, machineConfigName: e.target.value },
                        }))
                      }
                    />
                  </Field>
                  <Field
                    label="MachineConfig role"
                    hint="Worker is recommended. Master/all will reboot control-plane nodes."
                  >
                    <select
                      value={mp.machineConfigRole}
                      onChange={(e) =>
                        setState((s) => ({
                          ...s,
                          multipath: {
                            ...s.multipath,
                            machineConfigRole: e.target.value as typeof mp.machineConfigRole,
                          },
                        }))
                      }
                    >
                      <option value="worker">worker</option>
                      <option value="master">master</option>
                      <option value="all">worker + master</option>
                    </select>
                  </Field>
                </div>
              )}

              <Field
                label="multipath.conf contents"
                hint="Hitachi CSI sample defaults. Edit if your environment needs changes (keep user_friendly_names yes)."
              >
                <textarea
                  rows={16}
                  style={{ fontFamily: 'var(--hv-mono)', fontSize: '0.78rem', width: '100%' }}
                  value={mp.customConf || MULTIPATH_CONF}
                  onChange={(e) =>
                    setState((s) => ({
                      ...s,
                      multipath: { ...s.multipath, customConf: e.target.value },
                    }))
                  }
                />
              </Field>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
                <CopyButton text={confText} label="Copy multipath.conf" />
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() =>
                    setState((s) => ({
                      ...s,
                      multipath: { ...s.multipath, customConf: '' },
                    }))
                  }
                >
                  Reset to sample
                </button>
                {showMachineConfig && <CopyButton text={mcPreview} label="Copy MachineConfig" />}
              </div>

              {showMachineConfig && (
                <>
                  <Callout variant="warn">
                    <strong>Node reboots required.</strong> Applying a MachineConfig updates the
                    MachineConfigPool and <em>reboots each node</em> in that pool (rolling, one or a few at
                    a time). Plan a maintenance window. Do <strong>not</strong> install the CSI Driver or
                    create volumes until every targeted pool shows <code>UPDATED=True</code> and{' '}
                    <code>UPDATING=False</code>.
                    {mp.machineConfigRole === 'master' || mp.machineConfigRole === 'all' ? (
                      <>
                        {' '}
                        Targeting <strong>master</strong> reboots control-plane nodes — prefer{' '}
                        <strong>worker</strong> unless CSI must run on masters.
                      </>
                    ) : null}
                    {plat.id === 'rosa' && (
                      <>
                        {' '}
                        On ROSA, if MachineConfig is restricted, use the upstream{' '}
                        <code>rosa-daemonset.yaml</code> approach instead.
                      </>
                    )}
                  </Callout>
                  <pre className="code-block" style={{ marginTop: '0.75rem' }}>{`${cmd} apply -f 00-prereq/
# Watch pools — nodes reboot while UPDATING=True
${cmd} get mcp -w
# When ready:
# NAME     CONFIG             UPDATED   UPDATING   DEGRADED
# worker   rendered-worker-…  True      False      False

${cmd} get mc | grep multipath
# On a rebooted node:
# cat /etc/multipath.conf && multipath -ll`}</pre>
                  <pre className="yaml-preview" style={{ marginTop: '0.75rem', maxHeight: 280 }}>
                    {mcPreview}
                  </pre>
                </>
              )}

              {!plat.useOc && mp.includeConf && (
                <Callout>
                  Copy <code>multipath.conf</code> to <code>/etc/multipath.conf</code> on each worker, then{' '}
                  <code>systemctl enable --now multipathd</code>.
                </Callout>
              )}
            </>
          )}
        </Section>
      )}

      <Section title="Checklist">
        <ul className="checklist">
          {items.map((item) => (
            <li key={item.id}>
              <input
                type="checkbox"
                checked={!!state.prereqAcknowledged[item.id]}
                onChange={() => toggle(item.id)}
                style={{ width: 18, height: 18, accentColor: 'var(--hv-primary)', marginTop: 4 }}
              />
              <div>
                <strong>{item.title}</strong>
                <p style={{ margin: '0.25rem 0', fontSize: '0.9rem', color: 'var(--hv-text-subtle)' }}>
                  {item.body}
                </p>
                {item.snippet && (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                      <CopyButton text={item.snippet} label="Copy snippet" />
                    </div>
                    <pre>{item.snippet}</pre>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Firewall allowlist (online installs)">
        <ul style={{ margin: 0, paddingLeft: '1.2rem', fontSize: '0.9rem' }}>
          {FIREWALL_DOMAINS.map((d) => (
            <li key={d.domain}>
              <code>{d.domain}</code> — {d.purpose}
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Required storage licenses">
        <ul style={{ margin: 0, paddingLeft: '1.2rem' }}>
          {REQUIRED_LICENSES.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      </Section>
    </div>
  )
}

function buildPrereqs(
  platform: string,
  connection: string,
  airGapped: boolean,
  cmd: string,
  multipathEnabled: boolean,
): { id: string; title: string; body: string; snippet?: string }[] {
  const plat = PLATFORMS[platform as keyof typeof PLATFORMS]
  const items: { id: string; title: string; body: string; snippet?: string }[] = [
    {
      id: 'cluster-access',
      title: 'Cluster admin access',
      body: `Verify you can talk to the API server as a cluster-admin.`,
      snippet: `${cmd} get nodes`,
    },
    {
      id: 'licenses',
      title: 'Storage licenses enabled',
      body: 'Dynamic Provisioning, Thin Image (and HTIA for VSP One Block) must be enabled on the array.',
    },
    {
      id: 'user-role',
      title: 'Storage user role',
      body: 'Use Storage Administrator (View & Modify) or equivalent. SDS Block multitenancy needs VpsStorage.',
    },
  ]

  if (connection === 'fc' || connection === 'iscsi' || multipathEnabled) {
    items.push({
      id: 'multipath',
      title: 'Device Mapper Multipath configured',
      body: plat.useOc
        ? 'Apply the generated MachineConfig, then wait for node reboots to finish (MCP UPDATED=True). Only then install the CSI Driver.'
        : 'Install the generated multipath.conf on every worker and ensure multipathd is running.',
      snippet: plat.useOc
        ? `${cmd} apply -f 00-prereq/\n# Nodes reboot while the pool updates — do not proceed early\n${cmd} get mcp -w\n# Proceed only when UPDATED=True and UPDATING=False\n${cmd} get mc | grep multipath`
        : 'sudo cp multipath.conf /etc/multipath.conf\nsudo systemctl enable --now multipathd\nmultipath -ll',
    })
  }

  if (connection === 'iscsi') {
    items.push({
      id: 'iscsi',
      title: 'iSCSI initiator installed',
      body: 'Initiator software present on nodes; IQNs must be lowercase only.',
      snippet: 'cat /etc/iscsi/initiatorname.iscsi',
    })
  }

  if (connection === 'nvme-fc' || connection === 'nvme-tcp') {
    items.push({
      id: 'nvme',
      title: 'NVMe multipath / nvme-cli',
      body: 'Native NVMe Multipath enabled. On RHEL install nvme-cli; RHCOS usually includes it. Do not duplicate host NQNs.',
      snippet: 'nvme list && cat /sys/module/nvme_core/parameters/multipath',
    })
  }

  if (airGapped) {
    items.push({
      id: 'offline',
      title: 'Offline images mirrored',
      body: 'Run hvcsi-offline-bundle.sh and load images into your private registry. Mirror OperatorHub catalogs on OpenShift.',
    })
  } else {
    items.push({
      id: 'firewall',
      title: 'Firewall / proxy allowlist',
      body: 'Allow GitHub, registry.hitachivantara.com, and registry.k8s.io (and redirects).',
    })
  }

  if (plat.operatorHub) {
    items.push({
      id: 'operatorhub',
      title: 'OperatorHub / Software Catalog reachable',
      body: 'You will install Hitachi Storage Plug-in for Containers from OperatorHub with Manual approval.',
    })
  }

  return items
}
