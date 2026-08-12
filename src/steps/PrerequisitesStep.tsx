import {
  FIREWALL_DOMAINS,
  MULTIPATH_CONF,
  PLATFORMS,
  REQUIRED_LICENSES,
  effectiveMultipathDelivery,
  multipathFlagsForDelivery,
  type OpenShiftTopology,
} from '../catalog/platforms'
import { CONNECTION_TYPES } from '../catalog/platforms'
import { DOCS } from '../catalog/components'
import { HELP, RECAP } from '../catalog/help'
import {
  generateMultipathMachineConfig,
  generateMultipathMachineConfigs,
  getMultipathConf,
} from '../generator/multipath'
import { generateMultipathDaemonSetYaml } from '../generator/multipathDaemonSet'
import { AdvancedSection } from '../components/AdvancedSection'
import { useWizard } from '../state/WizardContext'
import { useUiMode } from '../state/UiModeContext'
import { Callout, ChoiceCard, CodeBlock, CopyButton, Field, Section } from '../components/ui'

/** Prerequisites 3.1 — multipath packaging / optional early apply */
export function PrerequisitesMultipathStep() {
  const { state, setState } = useWizard()
  const { isAdvanced } = useUiMode()
  const plat = PLATFORMS[state.platform]
  const conn = CONNECTION_TYPES.find((c) => c.id === state.connectionType)!
  const needsDm = conn.multipath === 'dm-multipath'
  const mp = state.multipath
  const confText = getMultipathConf(mp.customConf || undefined)
  const showMachineConfig = mp.enabled && mp.includeMachineConfig
  const showDaemonSet = mp.enabled && mp.includeDaemonSet
  const enableIscsi = state.connectionType === 'iscsi'

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

  const dsPreview = showDaemonSet
    ? generateMultipathDaemonSetYaml({
        name: mp.machineConfigName,
        conf: mp.customConf || undefined,
        enableIscsi,
      })
    : ''

  const ocDeliveryLabel = showDaemonSet ? 'DaemonSet' : 'MachineConfig'

  return (
    <div className="step-panel">
      <h2>Multipath</h2>
      <p className="lede">
        {RECAP.multipathLede}{' '}
        {isAdvanced
          ? 'This page does not talk to the cluster — you can optionally apply the preview from a terminal while you finish the wizard.'
          : 'This page does not talk to the cluster — install.sh will apply the packaged multipath payload after export (unless you mark it as already applied).'}
      </p>

      {plat.useOc && (
        <Section title="How to deliver multipath" help={HELP.openshiftTopology}>
          <div className="card-grid">
            {(
              [
                {
                  id: 'classic' as OpenShiftTopology,
                  title: 'Self-managed (MachineConfig)',
                  description:
                    'Classic OpenShift/ROSA with Machine Config Operator on the target cluster',
                },
                {
                  id: 'hosted' as OpenShiftTopology,
                  title: 'Hosted or HCP (DaemonSet)',
                  description:
                    'HyperShift / ROSA HCP / guests without MachineConfig — DaemonSet writes multipath.conf',
                },
              ] as const
            ).map((opt) => (
              <ChoiceCard
                key={opt.id}
                title={opt.title}
                description={opt.description}
                selected={state.openshiftTopology === opt.id}
                onClick={() => {
                  setState((s) => {
                    const needs = s.connectionType === 'fc' || s.connectionType === 'iscsi'
                    const delivery = effectiveMultipathDelivery({
                      platform: s.platform,
                      openshiftTopology: opt.id,
                      needsDm: needs && s.multipath.enabled,
                    })
                    const flags = multipathFlagsForDelivery(
                      s.multipath.enabled && needs ? delivery : 'none',
                    )
                    const deliveryActive = flags.includeMachineConfig || flags.includeDaemonSet
                    return {
                      ...s,
                      openshiftTopology: opt.id,
                      multipath: {
                        ...s.multipath,
                        ...flags,
                        alreadyApplied: deliveryActive ? s.multipath.alreadyApplied : false,
                      },
                    }
                  })
                }}
              />
            ))}
          </div>
        </Section>
      )}

      <Section title="Multipath configuration" help={HELP.multipath}>
        {!needsDm && (
          <Callout variant="warn">
            Your connection type uses Native NVMe Multipath, not Device Mapper Multipath. You can still
            package a DM multipath.conf if nodes need it for other paths.
          </Callout>
        )}

        <label className="toggle-row" style={{ marginBottom: '0.75rem' }}>
          <input
            type="checkbox"
            checked={mp.enabled}
            onChange={(e) =>
              setState((s) => {
                const on = e.target.checked
                const delivery = on
                  ? effectiveMultipathDelivery({
                      platform: s.platform,
                      openshiftTopology: s.openshiftTopology,
                      needsDm: true,
                    })
                  : 'none'
                const flags = multipathFlagsForDelivery(on ? delivery : 'none')
                return {
                  ...s,
                  multipath: {
                    ...s.multipath,
                    enabled: on,
                    ...flags,
                    alreadyApplied:
                      on && (flags.includeMachineConfig || flags.includeDaemonSet)
                        ? s.multipath.alreadyApplied
                        : false,
                  },
                }
              })
            }
          />
          <div>
            <strong>
              {plat.useOc
                ? `Include multipath ${ocDeliveryLabel} in the export`
                : 'Include multipath.conf in the export'}
            </strong>
            <p style={{ margin: '0.2rem 0 0', fontSize: '0.85rem', color: 'var(--hv-text-subtle)' }}>
              {showDaemonSet ? (
                <>
                  Packages a DaemonSet that writes the Hitachi <code>multipath.conf</code> on nodes (hosted/HCP).
                  Apply the preview now or let <code>install.sh</code> apply it after export. Required for Fibre
                  Channel and iSCSI.
                </>
              ) : plat.useOc ? (
                <>
                  Packages a MachineConfig that embeds the Hitachi <code>multipath-sample.conf</code>. You can
                  apply the preview now (nodes reboot while you finish the wizard) or let{' '}
                  <code>install.sh</code> apply it after export. Required for Fibre Channel and iSCSI.
                </>
              ) : (
                <>
                  Packages the Hitachi CSI sample (<code>multipath-sample.conf</code>) for workers.{' '}
                  <strong>You</strong> install it on nodes after export — <code>install.sh</code> does not push
                  it. Required for Fibre Channel and iSCSI.
                </>
              )}
            </p>
          </div>
        </label>

        {mp.enabled && (
          <>
            {showDaemonSet ? (
              mp.alreadyApplied ? (
                <Callout variant="ok">
                  <strong>Already applied:</strong> <code>install.sh</code> will skip applying the DaemonSet
                  (and will also skip if it detects the same name). YAML stays in <code>00-prereq/</code> for
                  reference.
                </Callout>
              ) : (
                <Callout variant="ok">
                  {isAdvanced ? (
                    <>
                      <strong>Optional early apply:</strong> copy the DaemonSet preview below and{' '}
                      <code>oc apply -f …</code> from a machine with cluster access now. Check the box when done
                      so <code>install.sh</code> skips re-apply. Or leave it unchecked and let{' '}
                      <code>install.sh</code> apply after export. Use this path for HyperShift / HCP guests
                      without MachineConfig.
                    </>
                  ) : (
                    <>
                      <strong>Packaged for export:</strong> <code>install.sh</code> will apply the DaemonSet
                      after export. If you apply it yourself outside this wizard, check the box below so{' '}
                      <code>install.sh</code> skips re-apply.
                    </>
                  )}
                </Callout>
              )
            ) : plat.useOc ? (
              mp.alreadyApplied ? (
                <Callout variant="ok">
                  <strong>Already applied:</strong> <code>install.sh</code> will skip applying the MachineConfig
                  (and will also skip if it detects the same name on the cluster). YAML stays in{' '}
                  <code>00-prereq/</code> for reference. <code>install.sh</code> waits on MachineConfigPool
                  health with a live status block and continues automatically when pools are{' '}
                  <code>UPDATED=True</code> / <code>UPDATING=False</code> (detail in{' '}
                  <code>logs/install-*.log</code>).
                </Callout>
              ) : (
                <Callout variant="ok">
                  {isAdvanced ? (
                    <>
                      <strong>Optional early apply:</strong> copy the MachineConfig preview below and{' '}
                      <code>oc apply -f …</code> from a machine with cluster access now — nodes can reboot while
                      you finish the wizard. Check the box when done so <code>install.sh</code> skips re-apply.
                      Or leave it unchecked and let <code>install.sh</code> apply after export.
                    </>
                  ) : (
                    <>
                      <strong>Packaged for export:</strong> <code>install.sh</code> will apply the
                      MachineConfig after export. If you apply it yourself outside this wizard, check the box
                      below so <code>install.sh</code> skips re-apply.
                    </>
                  )}
                </Callout>
              )
            ) : (
              <Callout variant="ok">
                <strong>Later (after export):</strong> copy <code>00-prereq/multipath.conf</code> to each worker
                and enable <code>multipathd</code>. You can preview/edit the conf here; <code>install.sh</code>{' '}
                will not install it for you.
              </Callout>
            )}

            <AdvancedSection
              title="Edit multipath payload"
            >
              {showMachineConfig && (
                <div className="field-grid" style={{ marginBottom: '0.85rem' }}>
                  <Field
                    label="MachineConfig name"
                    hint="OpenShift MachineConfig metadata.name written into the export package."
                  >
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
                label={
                  showDaemonSet
                    ? 'multipath.conf (embedded in DaemonSet)'
                    : plat.useOc
                      ? 'multipath.conf (embedded in MachineConfig)'
                      : 'multipath.conf contents'
                }
                hint={
                  plat.useOc
                    ? 'Hitachi CSI sample defaults. Edits update the export payload (keep user_friendly_names yes). If you already applied, re-apply after editing or install.sh will skip.'
                    : 'Hitachi CSI sample defaults. Edit if needed; install on workers after you download the ZIP (keep user_friendly_names yes).'
                }
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
                {showMachineConfig && (
                  <CopyButton text={mcPreview} label="Copy MachineConfig" />
                )}
                {showDaemonSet && <CopyButton text={dsPreview} label="Copy DaemonSet" />}
                {!plat.useOc && <CopyButton text={confText} label="Copy multipath.conf" />}
              </div>
            </AdvancedSection>

            {showMachineConfig && (
              <>
                <label className="toggle-row" style={{ margin: '0.85rem 0' }}>
                  <input
                    type="checkbox"
                    checked={mp.alreadyApplied}
                    onChange={(e) =>
                      setState((s) => ({
                        ...s,
                        multipath: { ...s.multipath, alreadyApplied: e.target.checked },
                      }))
                    }
                  />
                  <div>
                    <strong>I already applied this MachineConfig on the cluster</strong>
                    <p style={{ margin: '0.2rem 0 0', fontSize: '0.85rem', color: 'var(--hv-text-subtle)' }}>
                      Tells <code>install.sh</code> to skip apply. The script also auto-skips if a MachineConfig
                      with this name already exists.
                    </p>
                  </div>
                </label>

                <Callout variant="warn">
                  {mp.alreadyApplied ? (
                    <>
                      <strong>Pools may already be updating or updated.</strong>{' '}
                      <code>install.sh</code> will skip apply and wait with a live MachineConfigPool status
                      block, continuing automatically when every targeted pool shows{' '}
                      <code>UPDATED=True</code> / <code>UPDATING=False</code>. Detail snapshots go to{' '}
                      <code>logs/install-*.log</code>.
                    </>
                  ) : (
                    <>
                      <strong>Reboots when applied:</strong> MachineConfigPool updates <em>reboot each node</em>{' '}
                      in that pool (rolling). Plan a maintenance window. Do <strong>not</strong> create volumes
                      until pools show <code>UPDATED=True</code> / <code>UPDATING=False</code>.
                    </>
                  )}
                  {mp.machineConfigRole === 'master' || mp.machineConfigRole === 'all' ? (
                    <>
                      {' '}
                      Targeting <strong>master</strong> reboots control-plane nodes — prefer{' '}
                      <strong>worker</strong> unless CSI must run on masters.
                    </>
                  ) : null}
                </Callout>
                <p
                  style={{
                    margin: '0.75rem 0 0.35rem',
                    fontSize: '0.85rem',
                    color: 'var(--hv-text-subtle)',
                  }}
                >
                  {mp.alreadyApplied
                    ? 'MachineConfig YAML kept in 00-prereq/ for reference:'
                    : isAdvanced
                      ? 'Preview — copy and oc apply now, or leave for install.sh after export:'
                      : 'MachineConfig YAML is packaged into 00-prereq/ and applied by install.sh after export:'}
                </p>
                {!isAdvanced || mp.alreadyApplied ? null : (
                  <CodeBlock className="code-block" style={{ marginBottom: '0.5rem' }}>
                    {`# From a host with oc access (optional early apply):
# Save the preview to a file, then:
oc apply -f multipath-machineconfig.yaml
# Nodes reboot rolling — install.sh polls MCP status and auto-continues when healthy
# Proceed with the wizard while nodes reboot`}
                  </CodeBlock>
                )}
                {isAdvanced && (
                  <CodeBlock className="yaml-preview" style={{ maxHeight: 280 }}>
                    {mcPreview}
                  </CodeBlock>
                )}
              </>
            )}

            {showDaemonSet && (
              <>
                <label className="toggle-row" style={{ margin: '0.85rem 0' }}>
                  <input
                    type="checkbox"
                    checked={mp.alreadyApplied}
                    onChange={(e) =>
                      setState((s) => ({
                        ...s,
                        multipath: { ...s.multipath, alreadyApplied: e.target.checked },
                      }))
                    }
                  />
                  <div>
                    <strong>I already applied this DaemonSet on the cluster</strong>
                    <p style={{ margin: '0.2rem 0 0', fontSize: '0.85rem', color: 'var(--hv-text-subtle)' }}>
                      Tells <code>install.sh</code> to skip apply. The script also auto-skips if the DaemonSet
                      already exists.
                    </p>
                  </div>
                </label>

                <Callout variant="warn">
                  <strong>No MachineConfigPool reboot cycle.</strong> The DaemonSet init writes{' '}
                  <code>/etc/multipath.conf</code> and enables <code>multipathd</code> on each node. Confirm
                  multipath is healthy before creating volumes. Prefer Hosted/HCP topology when the guest API
                  has no MachineConfig.
                </Callout>
                <p
                  style={{
                    margin: '0.75rem 0 0.35rem',
                    fontSize: '0.85rem',
                    color: 'var(--hv-text-subtle)',
                  }}
                >
                  {mp.alreadyApplied
                    ? 'DaemonSet YAML kept in 00-prereq/ for reference:'
                    : isAdvanced
                      ? 'Preview — copy and oc apply now, or leave for install.sh after export:'
                      : 'DaemonSet YAML is packaged into 00-prereq/ and applied by install.sh after export:'}
                </p>
                {!isAdvanced || mp.alreadyApplied ? null : (
                  <CodeBlock className="code-block" style={{ marginBottom: '0.5rem' }}>
                    {`# From a host with oc access (optional early apply):
oc apply -f multipath-daemonset.yaml
oc rollout status ds/hitachi-csi-multipath -n kube-system`}
                  </CodeBlock>
                )}
                {isAdvanced && (
                  <CodeBlock className="yaml-preview" style={{ maxHeight: 280 }}>
                    {dsPreview}
                  </CodeBlock>
                )}
              </>
            )}
          </>
        )}
      </Section>
    </div>
  )
}

/** Prerequisites 3.2 (or lone step 3) — environment checklist */
export function PrerequisitesChecklistStep() {
  const { state, setState, visibleSteps } = useWizard()
  const plat = PLATFORMS[state.platform]
  const conn = CONNECTION_TYPES.find((c) => c.id === state.connectionType)!
  const cmd = plat.useOc ? 'oc' : 'kubectl'
  const needsDm = conn.multipath === 'dm-multipath'
  const mp = state.multipath
  const showMultipathSibling = visibleSteps.some((s) => s.id === 'prerequisites-multipath')

  const items = buildPrereqs(
    state.platform,
    state.connectionType,
    state.airGapped,
    cmd,
    mp.enabled,
    mp.alreadyApplied,
    state.openshiftTopology,
    mp.includeDaemonSet,
    state.telemetryEnabled,
  )

  const toggle = (id: string) => {
    setState((s) => ({
      ...s,
      prereqAcknowledged: { ...s.prereqAcknowledged, [id]: !s.prereqAcknowledged[id] },
    }))
  }

  const done = items.filter((i) => state.prereqAcknowledged[i.id]).length

  return (
    <div className="step-panel">
      <h2>{showMultipathSibling ? 'Checklist' : 'Prerequisites'}</h2>
      <p className="lede">
        Confirm what you should check before install—cluster access, array setup, and network reachability.
        Multipath packaging is on the Multipath substep when that option is enabled.
      </p>

      {!mp.enabled && needsDm && (
        <Callout variant="ok">
          <strong>Multipath packaging is off.</strong> Fibre Channel and iSCSI normally need it. Use{' '}
          <strong>Enable multipath</strong> to show the Multipath substep (3.1) again.
          <div style={{ marginTop: '0.65rem' }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() =>
                setState((s) => {
                  const delivery = effectiveMultipathDelivery({
                    platform: s.platform,
                    openshiftTopology: s.openshiftTopology,
                    needsDm: true,
                  })
                  const flags = multipathFlagsForDelivery(delivery)
                  return {
                    ...s,
                    multipath: {
                      ...s.multipath,
                      enabled: true,
                      ...flags,
                    },
                  }
                })
              }
            >
              Enable multipath
            </button>
          </div>
        </Callout>
      )}

      <Callout variant="ok">
        Progress: {done} / {items.length} acknowledged. You can continue without checking all boxes, but
        skipped environment checks are the most common cause of first-PV delays.
      </Callout>

      <Section title="Environment checklist">
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
                {item.snippet && <CodeBlock>{item.snippet}</CodeBlock>}
              </div>
            </li>
          ))}
        </ul>
      </Section>

      {state.telemetryEnabled && (
        <Callout variant="ok">
          <strong>Hitachi Telemetry egress:</strong> allow outbound HTTPS port 443 to Amazon Web Services
          (proxy CONNECT if applicable; trusted CAs; TLS 1.2+; DNS resolution). See the{' '}
          <a href={DOCS.hspc} target="_blank" rel="noreferrer">
            CSI Driver documentation
          </a>{' '}
          for network requirements.
        </Callout>
      )}

      <Section title="Firewall allowlist (online installs)">
        <ul style={{ margin: 0, paddingLeft: '1.2rem', fontSize: '0.9rem' }}>
          {FIREWALL_DOMAINS.map((d) => (
            <li key={d.domain}>
              <code>{d.domain}</code> — {d.purpose}
            </li>
          ))}
          {state.telemetryEnabled && (
            <li>
              Hitachi Telemetry — outbound HTTPS :443 to AWS (product telemetry, not registry redirects)
            </li>
          )}
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

/** @deprecated Use PrerequisitesMultipathStep / PrerequisitesChecklistStep */
export function PrerequisitesStep() {
  return <PrerequisitesChecklistStep />
}

function buildPrereqs(
  platform: string,
  connection: string,
  airGapped: boolean,
  cmd: string,
  multipathEnabled: boolean,
  multipathAlreadyApplied: boolean,
  _openshiftTopology: string,
  includeDaemonSet: boolean,
  telemetryEnabled: boolean,
): { id: string; title: string; body: string; snippet?: string }[] {
  const plat = PLATFORMS[platform as keyof typeof PLATFORMS]
  const items: { id: string; title: string; body: string; snippet?: string }[] = [
    {
      id: 'cluster-access',
      title: 'Cluster admin access',
      body: 'Confirm you can sign in to the cluster with administrator permissions. You need this level of access to install operators and change cluster-wide settings.',
      snippet: `${cmd} get nodes`,
    },
    {
      id: 'licenses',
      title: 'Array licenses for dynamic volumes',
      body: 'Your storage array must have the licenses needed for Kubernetes provisioning enabled: Dynamic Provisioning and Thin Image. On VSP One Block, HTIA is also required.',
    },
    {
      id: 'user-role',
      title: 'Storage user permissions',
      body: 'The storage user you will put in the Secret needs rights to create and manage volumes—typically Storage Administrator (View & Modify). SDS Block multitenancy also requires VpsStorage.',
    },
  ]

  if (connection === 'fc' || connection === 'iscsi' || multipathEnabled) {
    if (plat.useOc && includeDaemonSet) {
      items.push({
        id: 'multipath',
        title: multipathAlreadyApplied
          ? 'Multipath DaemonSet already applied'
          : 'Plan multipath DaemonSet setup',
        body: multipathAlreadyApplied
          ? 'You marked the multipath DaemonSet as already in place. install.sh will skip applying it (or detect an existing one). Before you test volumes, confirm multipathd is running on worker nodes.'
          : 'On hosted/HCP OpenShift, multipath runs as a DaemonSet (a pod on each node). Apply the preview from the Multipath substep now, or let install.sh apply it after export. Unlike MachineConfig, this path does not trigger a full node reboot cycle.',
        snippet: multipathAlreadyApplied
          ? `${cmd} get ds hitachi-csi-multipath -n kube-system`
          : undefined,
      })
    } else if (plat.useOc) {
      items.push({
        id: 'multipath',
        title: multipathAlreadyApplied
          ? 'Multipath MachineConfig already applied'
          : 'Plan multipath MachineConfig setup',
        body: multipathAlreadyApplied
          ? 'You marked the multipath MachineConfig as already in place. install.sh will skip applying it, wait for MachineConfigPools to finish updating, then continue automatically. Check logs/install-*.log for details.'
          : 'On classic OpenShift, multipath is applied via a MachineConfig (cluster-wide node configuration). You can apply the preview on the Multipath substep early—nodes will reboot while you finish the wizard—or leave it for install.sh after export.',
        snippet: multipathAlreadyApplied
          ? `${cmd} get mcp\n# install.sh polls MCP status and auto-continues; see logs/install-*.log`
          : undefined,
      })
    } else {
      items.push({
        id: 'multipath',
        title: 'Plan worker multipath.conf setup',
        body: 'After you download the export ZIP, copy multipath.conf to each worker node and start multipathd. install.sh does not push this file to nodes for you.',
      })
    }
  }

  if (connection === 'iscsi') {
    items.push({
      id: 'iscsi',
      title: 'iSCSI software on nodes',
      body: 'Each node needs an iSCSI initiator installed. The initiator IQN in /etc/iscsi/initiatorname.iscsi must use lowercase letters only.',
      snippet: 'cat /etc/iscsi/initiatorname.iscsi',
    })
  }

  if (connection === 'nvme-fc' || connection === 'nvme-tcp') {
    items.push({
      id: 'nvme',
      title: 'NVMe tools and multipath',
      body: 'Nodes should have NVMe multipath enabled and nvme-cli available (install nvme-cli on RHEL; RHCOS usually includes it). Use unique host NQNs—do not duplicate them across nodes.',
      snippet: 'nvme list && cat /sys/module/nvme_core/parameters/multipath',
    })
  }

  if (airGapped) {
    items.push({
      id: 'offline',
      title: 'Container images are mirrored locally',
      body: 'Run hvcsi-offline-bundle.sh and load the images into your private registry. On OpenShift, mirror the OperatorHub catalogs (including certified-operators) before install.',
    })
  } else {
    items.push({
      id: 'firewall',
      title: 'Outbound network access for images',
      body: 'Workers and the install host need HTTPS access to pull images and manifests—from GitHub, registry.hitachivantara.com, and registry.k8s.io (including redirects).',
    })
  }

  if (plat.operatorHub) {
    items.push({
      id: 'operatorhub',
      title: 'OperatorHub catalog is reachable',
      body: 'On OpenShift, install.sh installs the CSI Driver through OLM (Operator Lifecycle Manager) from OperatorHub—the catalog of certified operators. The Subscription uses Manual update approval. In air-gapped environments, mirror certified-operators first.',
    })
  }

  if (telemetryEnabled) {
    items.push({
      id: 'telemetry-egress',
      title: 'AWS network access for telemetry',
      body: 'If Hitachi Telemetry is enabled, nodes need outbound HTTPS (port 443) to Amazon Web Services. Corporate proxies must allow CONNECT; use trusted CAs, TLS 1.2+, and working DNS.',
    })
  }

  return items
}
