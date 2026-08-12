import { useRef, useState } from 'react'
import { useWizard } from '../state/WizardContext'
import { Callout, CodeBlock, DownloadButton, Field, Section } from '../components/ui'
import { PLATFORMS } from '../catalog/platforms'
import { HELP } from '../catalog/help'
import { ensureSitesForReplication, getSiteStorage, hrpcPairSystem } from '../catalog/sites'
import { useUiMode } from '../state/UiModeContext'
import {
  generateRemoteKubeconfigSecret,
  generateRemoteKubeconfigScript,
  REMOTE_KUBECONFIG_SECRET_NAME,
} from '../generator/remoteKubeconfig'

export function ReplicationStep() {
  const { state, setState } = useWizard()
  const { isAdvanced } = useUiMode()
  const [stepAdvanced, setStepAdvanced] = useState(false)
  const showFull = isAdvanced || stepAdvanced
  const plat = PLATFORMS[state.platform]
  const cmd = plat.useOc ? 'oc' : 'kubectl'
  const primaryFileRef = useRef<HTMLInputElement>(null)
  const secondaryFileRef = useRef<HTMLInputElement>(null)

  const ensured = ensureSitesForReplication(state)
  const primarySite = getSiteStorage(ensured, 'primary')
  const secondarySite = getSiteStorage(ensured, 'secondary')
  const primaryPair = hrpcPairSystem(primarySite.storageSystems) ?? primarySite.storageSystems[0]
  const secondaryPair = hrpcPairSystem(secondarySite.storageSystems) ?? secondarySite.storageSystems[0]

  const seededSecrets = [primaryPair, secondaryPair]
    .filter(Boolean)
    .map((sys, i) => ({
      serial: sys.serial,
      url: sys.url,
      user: sys.user,
      password: sys.password,
      journal: String(i + 1),
    }))

  const secrets = state.replication.storageSecrets.length ? state.replication.storageSecrets : seededSecrets

  const secretName =
    state.replication.remoteKubeconfigSecretName || REMOTE_KUBECONFIG_SECRET_NAME
  const ns = state.replication.namespace

  const helperScript = generateRemoteKubeconfigScript({
    namespace: ns,
    cmd: cmd as 'oc' | 'kubectl',
    secretName,
  })

  const primarySecretYaml = state.replication.secondaryKubeconfig?.trim()
    ? generateRemoteKubeconfigSecret({
        namespace: ns,
        kubeconfig: state.replication.secondaryKubeconfig,
        secretName,
      })
    : null

  const secondarySecretYaml = state.replication.primaryKubeconfig?.trim()
    ? generateRemoteKubeconfigSecret({
        namespace: ns,
        kubeconfig: state.replication.primaryKubeconfig,
        secretName,
      })
    : null

  const updateSecret = (idx: number, patch: Partial<(typeof secrets)[number]>) => {
    const next = [...secrets]
    next[idx] = { ...next[idx], ...patch }
    setState((s) => ({
      ...s,
      replication: { ...s.replication, storageSecrets: next },
    }))
  }

  const readFile = (file: File, which: 'primary' | 'secondary') => {
    const reader = new FileReader()
    reader.onload = () => {
      const text = String(reader.result || '')
      setState((s) => ({
        ...s,
        replication: {
          ...s.replication,
          ...(which === 'primary'
            ? { primaryKubeconfig: text }
            : { secondaryKubeconfig: text }),
        },
      }))
    }
    reader.readAsText(file)
  }

  const siteLabel = (idx: number) => (idx === 0 ? 'Primary' : 'Secondary')

  const kubeconfigFields = (
    <div className="field-grid" style={{ marginTop: showFull ? '0.75rem' : 0 }}>
      <Field label="Primary site kubeconfig" hint="Becomes the Secret applied on the secondary site.">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
          <input
            ref={primaryFileRef}
            type="file"
            accept=".yaml,.yml,.conf,.kubeconfig,text/plain,*/*"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) readFile(f, 'primary')
            }}
          />
          <textarea
            rows={6}
            style={{ fontFamily: 'var(--hv-mono)', fontSize: '0.75rem', width: '100%' }}
            placeholder="Paste primary kubeconfig YAML…"
            value={state.replication.primaryKubeconfig || ''}
            onChange={(e) =>
              setState((s) => ({
                ...s,
                replication: { ...s.replication, primaryKubeconfig: e.target.value },
              }))
            }
          />
          {(state.replication.primaryKubeconfig || '').trim() && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() =>
                setState((s) => ({
                  ...s,
                  replication: { ...s.replication, primaryKubeconfig: '' },
                }))
              }
            >
              Clear primary
            </button>
          )}
        </div>
      </Field>

      <Field label="Secondary site kubeconfig" hint="Becomes the Secret applied on the primary site.">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
          <input
            ref={secondaryFileRef}
            type="file"
            accept=".yaml,.yml,.conf,.kubeconfig,text/plain,*/*"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) readFile(f, 'secondary')
            }}
          />
          <textarea
            rows={6}
            style={{ fontFamily: 'var(--hv-mono)', fontSize: '0.75rem', width: '100%' }}
            placeholder="Paste secondary kubeconfig YAML…"
            value={state.replication.secondaryKubeconfig || ''}
            onChange={(e) =>
              setState((s) => ({
                ...s,
                replication: { ...s.replication, secondaryKubeconfig: e.target.value },
              }))
            }
          />
          {(state.replication.secondaryKubeconfig || '').trim() && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() =>
                setState((s) => ({
                  ...s,
                  replication: { ...s.replication, secondaryKubeconfig: '' },
                }))
              }
            >
              Clear secondary
            </button>
          )}
        </div>
      </Field>
    </div>
  )

  const secretYamlDownloads = (primarySecretYaml || secondarySecretYaml) && (
    <div style={{ marginTop: '1rem' }}>
      {primarySecretYaml && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <strong style={{ fontSize: '0.9rem' }}>
              Secret for primary site (contains secondary kubeconfig)
            </strong>
            <DownloadButton
              filename="remote-kubeconfig-for-primary-site.yaml"
              content={primarySecretYaml}
              label="Download"
            />
          </div>
          {showFull && (
            <CodeBlock
              className="yaml-preview"
              style={{ maxHeight: 180, marginTop: '0.35rem' }}
              text={primarySecretYaml}
            >
              {primarySecretYaml.slice(0, 400)}…
            </CodeBlock>
          )}
        </>
      )}
      {secondarySecretYaml && (
        <>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginTop: '0.75rem',
            }}
          >
            <strong style={{ fontSize: '0.9rem' }}>
              Secret for secondary site (contains primary kubeconfig)
            </strong>
            <DownloadButton
              filename="remote-kubeconfig-for-secondary-site.yaml"
              content={secondarySecretYaml}
              label="Download"
            />
          </div>
          {showFull && (
            <CodeBlock
              className="yaml-preview"
              style={{ maxHeight: 180, marginTop: '0.35rem' }}
              text={secondarySecretYaml}
            >
              {secondarySecretYaml.slice(0, 400)}…
            </CodeBlock>
          )}
        </>
      )}
    </div>
  )

  return (
    <div className="step-panel">
      <h2>Replication</h2>
      <p className="lede">
        {showFull
          ? 'Configure journals and remote access for the primary and secondary sites. The export packages both sites (including the Replication operator and the included DR Operator) — you do not run install commands by hand on this step.'
          : 'Provide the journal IDs for the primary and secondary sites. If you want the wizard to generate the remote-kubeconfig Secret YAML, paste the kubeconfigs below; otherwise leave them blank and supply the Secret later.'}
      </p>

      <Callout variant="ok">
        Version <strong>{state.versions.replication}</strong> — Replication operator and Disaster Recovery
        operator are both included. Day-2 protection is managed through DR policies after install.
      </Callout>

      <label className="toggle-row" style={{ marginBottom: '0.85rem' }}>
        <input
          type="checkbox"
          checked={!!state.replication.resourcePartitioningGuide}
          onChange={(e) =>
            setState((s) => ({
              ...s,
              replication: { ...s.replication, resourcePartitioningGuide: e.target.checked },
            }))
          }
        />
        <div>
          <strong>Using resource partitioning for Replication?</strong>
          <p style={{ margin: '0.2rem 0 0', fontSize: '0.85rem', color: 'var(--hv-text-subtle)' }}>
            Shows a short checklist for journal and access requirements on both sites.
          </p>
        </div>
      </label>

      {state.replication.resourcePartitioningGuide && (
        <Callout>
          <ul className="checklist">
            <li>
              <strong>Journal access</strong>
              <p style={{ margin: '0.2rem 0 0', fontSize: '0.85rem', color: 'var(--hv-text-subtle)' }}>
                The journal volume is in the Replication resource group and the Replication user can access it.
              </p>
            </li>
            <li>
              <strong>Both sites configured</strong>
              <p style={{ margin: '0.2rem 0 0', fontSize: '0.85rem', color: 'var(--hv-text-subtle)' }}>
                Resource partitioning settings are applied on both the primary and secondary arrays.
              </p>
            </li>
            <li>
              <strong>Host group</strong>
              <p style={{ margin: '0.2rem 0 0', fontSize: '0.85rem', color: 'var(--hv-text-subtle)' }}>
                The Replication host group (for example <code>spc-replication</code>) exists and is reachable by
                the nodes.
              </p>
            </li>
            <li>
              <strong>Same user across sites</strong>
              <p style={{ margin: '0.2rem 0 0', fontSize: '0.85rem', color: 'var(--hv-text-subtle)' }}>
                Use the same storage user name and password for Replication on both sites.
              </p>
            </li>
          </ul>
        </Callout>
      )}

      {showFull ? (
        <>
          <Section title="Operator namespace">
            <Field
              label="Replication operator namespace"
              hint="Upstream default is hspc-replication-operator-system."
            >
              <input
                value={state.replication.namespace}
                onChange={(e) =>
                  setState((s) => ({
                    ...s,
                    replication: { ...s.replication, namespace: e.target.value },
                  }))
                }
              />
            </Field>
          </Section>

          <Section title="Storage secrets (journals)" help={HELP.journalsVsRemote}>
            <p style={{ marginTop: 0, fontSize: '0.9rem', color: 'var(--hv-text-subtle)' }}>
              Primary and secondary site arrays with journal IDs used by the Replication operator. These become{' '}
              <code>storage-secrets.yaml</code> in the export. Journals are the storage side; remote kubeconfig
              is the cluster side.
            </p>
            {secrets.map((sec, idx) => (
              <div key={idx} className="field-grid" style={{ marginBottom: '0.75rem' }}>
                <Field label={`${siteLabel(idx)} serial`} hint="Array serial for this replication site.">
                  <input value={sec.serial} onChange={(e) => updateSecret(idx, { serial: e.target.value })} />
                </Field>
                <Field label={`${siteLabel(idx)} URL`} hint="Array REST endpoint for this site.">
                  <input value={sec.url} onChange={(e) => updateSecret(idx, { url: e.target.value })} />
                </Field>
                <Field label={`${siteLabel(idx)} user`}>
                  <input value={sec.user} onChange={(e) => updateSecret(idx, { user: e.target.value })} />
                </Field>
                <Field label={`${siteLabel(idx)} password`}>
                  <input
                    type="password"
                    value={sec.password}
                    onChange={(e) => updateSecret(idx, { password: e.target.value })}
                  />
                </Field>
                <Field label={`${siteLabel(idx)} journal ID`} help={HELP.journal}>
                  <input value={sec.journal} onChange={(e) => updateSecret(idx, { journal: e.target.value })} />
                </Field>
              </div>
            ))}
            {!state.replication.storageSecrets.length && (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() =>
                  setState((s) => ({
                    ...s,
                    replication: { ...s.replication, storageSecrets: seededSecrets },
                  }))
                }
              >
                Use each site’s Replication array as secrets
              </button>
            )}
          </Section>

          <Section title="Remote kubeconfig (both sites)" help={HELP.remoteKubeconfig}>
            <p style={{ marginTop: 0, fontSize: '0.9rem', color: 'var(--hv-text-subtle)' }}>
              Each site needs Secret <code>{secretName}</code> in <code>{ns}</code> containing the{' '}
              <em>other</em> site&apos;s kubeconfig (data key <code>remote-kubeconfig</code>). Use either path
              below — both produce the same Secret.
            </p>
            <div className="option-stack">
              <div className="option-panel">
                <h4 className="option-panel-title">At install time (helper script)</h4>
                <p className="option-panel-body">
                  The export ZIP already includes <code>create-remote-kubeconfig-secrets.sh</code>. Set these
                  paths on the machine that runs <code>install.sh</code> (or run the helper alone); the script
                  builds and applies the Secret on each site.
                </p>
                <CodeBlock>{`export KUBECONFIG_P=/path/to/primary-kubeconfig
export KUBECONFIG_S=/path/to/secondary-kubeconfig`}</CodeBlock>
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem', flexWrap: 'wrap' }}>
                  <DownloadButton
                    filename="create-remote-kubeconfig-secrets.sh"
                    content={helperScript}
                    label="Download helper script (.sh)"
                    mime="text/x-shellscript"
                  />
                </div>
                <p style={{ margin: '0.5rem 0 0', fontSize: '0.8rem', color: 'var(--hv-text-subtle)' }}>
                  Optional early download — the same script ships in <code>03-replication/</code> inside the ZIP.
                </p>
              </div>
              <div className="option-panel">
                <h4 className="option-panel-title">In this wizard (Secret YAML)</h4>
                <p className="option-panel-body">
                  Upload or paste both kubeconfigs to generate the Secret YAML now. Download and apply with{' '}
                  <code>{cmd} apply -f …</code> on each site. Values stay in this session only — they are not
                  written to browser storage or the exported config JSON.
                </p>
                {kubeconfigFields}
                {secretYamlDownloads}
              </div>
            </div>
          </Section>
        </>
      ) : (
        <>
          <Section title="Storage secrets (journals)" help={HELP.journal}>
            <p style={{ marginTop: 0, fontSize: '0.9rem', color: 'var(--hv-text-subtle)' }}>
              Journal volume IDs on each site’s Replication array. Array credentials come from the Storage
              systems step.
            </p>
            <div className="field-grid" style={{ marginBottom: '0.75rem' }}>
              <Field label="Primary journal ID" help={HELP.journal}>
                <input
                  value={secrets[0]?.journal || ''}
                  onChange={(e) => updateSecret(0, { journal: e.target.value })}
                />
              </Field>
              <Field label="Secondary journal ID" help={HELP.journal}>
                <input
                  value={secrets[1]?.journal || ''}
                  onChange={(e) => updateSecret(1, { journal: e.target.value })}
                />
              </Field>
            </div>
          </Section>

          <Section title="Remote kubeconfig (both sites)">
            <p style={{ marginTop: 0, fontSize: '0.9rem', color: 'var(--hv-text-subtle)' }}>
              Optional: upload or paste each site&apos;s kubeconfig so the wizard can generate the cross-site
              Secret YAML now. Values stay in this session only (not saved to browser storage or config JSON).
              You can also skip this and create the Secret at install time from the ZIP.
            </p>
            {kubeconfigFields}
            {secretYamlDownloads}
          </Section>
        </>
      )}

      {!isAdvanced && (
        <div className="advanced-section">
          <button
            type="button"
            className="advanced-section-toggle"
            onClick={() => setStepAdvanced((v) => !v)}
          >
            {stepAdvanced ? 'Hide advanced on this step' : 'Show advanced on this step'}
          </button>
        </div>
      )}
    </div>
  )
}
