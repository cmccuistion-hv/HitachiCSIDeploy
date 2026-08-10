import { useRef } from 'react'
import { useWizard } from '../state/WizardContext'
import { Callout, CopyButton, DownloadButton, Field, Section } from '../components/ui'
import { PLATFORMS } from '../catalog/platforms'
import {
  generateRemoteKubeconfigSecret,
  generateRemoteKubeconfigScript,
  REMOTE_KUBECONFIG_SECRET_NAME,
} from '../generator/remoteKubeconfig'

export function ReplicationStep() {
  const { state, setState } = useWizard()
  const plat = PLATFORMS[state.platform]
  const cmd = plat.useOc ? 'oc' : 'kubectl'
  const primaryFileRef = useRef<HTMLInputElement>(null)
  const secondaryFileRef = useRef<HTMLInputElement>(null)

  const secrets = state.replication.storageSecrets.length
    ? state.replication.storageSecrets
    : state.storageSystems.slice(0, 2).map((sys, i) => ({
        serial: sys.serial,
        url: sys.url,
        user: sys.user,
        password: sys.password,
        journal: String(i + 1),
      }))

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

  return (
    <div className="step-panel">
      <h2>Replication</h2>
      <p className="lede">
        Configure journals and remote access. Operator and Disaster Recovery install are packaged into the
        export — you do not run those commands by hand on this step.
      </p>

      <Callout variant="ok">
        Version <strong>{state.versions.replication}</strong> — Replication operator and Disaster Recovery
        operator are both included. Day-2 protection is managed through DR policies after install.
      </Callout>

      <Section title="Operator namespace">
        <Field label="Replication operator namespace">
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

      <Section title="Storage secrets (journals)">
        <p style={{ marginTop: 0, fontSize: '0.9rem', color: 'var(--hv-text-subtle)' }}>
          Primary and secondary arrays with journal IDs used by the Replication operator. These become{' '}
          <code>storage-secrets.yaml</code> in the export.
        </p>
        {secrets.map((sec, idx) => (
          <div key={idx} className="field-grid" style={{ marginBottom: '0.75rem' }}>
            <Field label="Serial">
              <input
                value={sec.serial}
                onChange={(e) => {
                  const next = [...secrets]
                  next[idx] = { ...next[idx], serial: e.target.value }
                  setState((s) => ({
                    ...s,
                    replication: { ...s.replication, storageSecrets: next },
                  }))
                }}
              />
            </Field>
            <Field label="URL">
              <input
                value={sec.url}
                onChange={(e) => {
                  const next = [...secrets]
                  next[idx] = { ...next[idx], url: e.target.value }
                  setState((s) => ({
                    ...s,
                    replication: { ...s.replication, storageSecrets: next },
                  }))
                }}
              />
            </Field>
            <Field label="User">
              <input
                value={sec.user}
                onChange={(e) => {
                  const next = [...secrets]
                  next[idx] = { ...next[idx], user: e.target.value }
                  setState((s) => ({
                    ...s,
                    replication: { ...s.replication, storageSecrets: next },
                  }))
                }}
              />
            </Field>
            <Field label="Password">
              <input
                type="password"
                value={sec.password}
                onChange={(e) => {
                  const next = [...secrets]
                  next[idx] = { ...next[idx], password: e.target.value }
                  setState((s) => ({
                    ...s,
                    replication: { ...s.replication, storageSecrets: next },
                  }))
                }}
              />
            </Field>
            <Field label="Journal ID">
              <input
                value={sec.journal}
                onChange={(e) => {
                  const next = [...secrets]
                  next[idx] = { ...next[idx], journal: e.target.value }
                  setState((s) => ({
                    ...s,
                    replication: { ...s.replication, storageSecrets: next },
                  }))
                }}
              />
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
                replication: { ...s.replication, storageSecrets: secrets },
              }))
            }
          >
            Use storage systems as replication secrets
          </button>
        )}
      </Section>

      <Section title="Remote kubeconfig (both sites)">
        <Callout variant="ok">
          <strong>Nothing to run on this step.</strong> The export ZIP includes{' '}
          <code>create-remote-kubeconfig-secrets.sh</code>. When you run <code>install.sh</code> with both
          kubeconfig paths set, that script builds Secret <code>{secretName}</code> in <code>{ns}</code> and
          applies it on each site (each gets the other site&apos;s kubeconfig).
        </Callout>

        <p style={{ fontSize: '0.9rem', margin: '0.75rem 0 0.35rem' }}>
          <strong>Your only input later:</strong> set these two environment variables to real file paths
          before <code>./install.sh</code> (or before running the helper script alone).
        </p>
        <pre className="code-block">{`export KUBECONFIG_P=/path/to/primary-kubeconfig
export KUBECONFIG_S=/path/to/secondary-kubeconfig`}</pre>

        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem', flexWrap: 'wrap' }}>
          <DownloadButton
            filename="create-remote-kubeconfig-secrets.sh"
            content={helperScript}
            label="Download helper script (.sh)"
            mime="text/x-shellscript"
          />
        </div>
        <p style={{ margin: '0.5rem 0 0', fontSize: '0.8rem', color: 'var(--hv-text-subtle)' }}>
          Prefer the ZIP export — the same script is already inside{' '}
          <code>03-replication/</code>. Download here only if you want the file early.
        </p>

        <details style={{ marginTop: '1rem' }}>
          <summary style={{ cursor: 'pointer', fontSize: '0.9rem', fontWeight: 600 }}>
            Advanced: preview Secret YAML in the browser
          </summary>
          <Callout variant="warn">
            Optional. Upload/paste builds YAML for inspection only — not saved in browser storage. Prefer
            the helper script so kubeconfigs never enter the browser.
          </Callout>

          <div className="field-grid" style={{ marginTop: '0.75rem' }}>
            <Field
              label="Primary site kubeconfig"
              hint="Becomes the Secret applied on the secondary site."
            >
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

            <Field
              label="Secondary site kubeconfig"
              hint="Becomes the Secret applied on the primary site."
            >
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

          {(primarySecretYaml || secondarySecretYaml) && (
            <div style={{ marginTop: '1rem' }}>
              {primarySecretYaml && (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <strong style={{ fontSize: '0.9rem' }}>Primary-site Secret (preview)</strong>
                    <div style={{ display: 'flex', gap: '0.35rem' }}>
                      <CopyButton text={primarySecretYaml} label="Copy YAML" />
                      <DownloadButton
                        filename="remote-kubeconfig-for-primary-site.yaml"
                        content={primarySecretYaml}
                        label="Download"
                      />
                    </div>
                  </div>
                  <pre className="yaml-preview" style={{ maxHeight: 180, marginTop: '0.35rem' }}>
                    {primarySecretYaml.slice(0, 400)}…
                  </pre>
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
                    <strong style={{ fontSize: '0.9rem' }}>Secondary-site Secret (preview)</strong>
                    <div style={{ display: 'flex', gap: '0.35rem' }}>
                      <CopyButton text={secondarySecretYaml} label="Copy YAML" />
                      <DownloadButton
                        filename="remote-kubeconfig-for-secondary-site.yaml"
                        content={secondarySecretYaml}
                        label="Download"
                      />
                    </div>
                  </div>
                  <pre className="yaml-preview" style={{ maxHeight: 180, marginTop: '0.35rem' }}>
                    {secondarySecretYaml.slice(0, 400)}…
                  </pre>
                </>
              )}
            </div>
          )}
        </details>
      </Section>

    </div>
  )
}
