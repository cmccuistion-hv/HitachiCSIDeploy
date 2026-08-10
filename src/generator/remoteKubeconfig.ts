/** Build HRPC remote-kubeconfig Secrets and automation script (upstream naming). */

const DEFAULT_SECRET_NAME = 'hspc-replication-operator-remote-kubeconfig'
const DEFAULT_DATA_KEY = 'remote-kubeconfig'

function b64utf8(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let binary = ''
  bytes.forEach((b) => {
    binary += String.fromCharCode(b)
  })
  return btoa(binary)
}

export function generateRemoteKubeconfigSecret(opts: {
  namespace: string
  /** Raw kubeconfig YAML for the *remote* cluster (the other site) */
  kubeconfig: string
  secretName?: string
  dataKey?: string
}): string {
  const name = opts.secretName || DEFAULT_SECRET_NAME
  const key = opts.dataKey || DEFAULT_DATA_KEY
  const conf = opts.kubeconfig.replace(/\r\n/g, '\n').trimEnd() + '\n'
  return `apiVersion: v1
kind: Secret
metadata:
  name: ${name}
  namespace: ${opts.namespace}
type: Opaque
data:
  ${key}: ${b64utf8(conf)}
`
}

/**
 * Script that builds both primary↔secondary remote-kubeconfig Secrets from local files
 * (matches the official guide: KUBECONFIG_P / KUBECONFIG_S) without pasting into the browser.
 */
export function generateRemoteKubeconfigScript(opts: {
  namespace: string
  cmd: 'oc' | 'kubectl'
  secretName?: string
}): string {
  const name = opts.secretName || DEFAULT_SECRET_NAME
  const ns = opts.namespace
  const cmd = opts.cmd
  return `#!/usr/bin/env bash
# Hitachi CSI — remote-kubeconfig Secrets for Replication (both sites)
#
# YOU PROVIDE (only):
#   KUBECONFIG_P  path to primary cluster kubeconfig
#   KUBECONFIG_S  path to secondary cluster kubeconfig
#
# THIS SCRIPT DOES AUTOMATICALLY:
#   - base64-encodes each kubeconfig
#   - writes Secret YAML with the correct name/namespace/data key
#   - with APPLY=1: applies primary Secret via KUBECONFIG_P and secondary via KUBECONFIG_S
#     (each site gets the *other* site's kubeconfig)
#
# Run once from a host that can reach both cluster APIs:
#   export KUBECONFIG_P=/path/to/primary-kubeconfig
#   export KUBECONFIG_S=/path/to/secondary-kubeconfig
#   APPLY=1 ./create-remote-kubeconfig-secrets.sh
#
# Optional: OUT_DIR=./out (default .)

set -euo pipefail

NS="${ns}"
SECRET_NAME="${name}"
OUT_DIR="\${OUT_DIR:-.}"
CMD="${cmd}"

if [[ -z "\${KUBECONFIG_P:-}" || -z "\${KUBECONFIG_S:-}" ]]; then
  echo "Set KUBECONFIG_P and KUBECONFIG_S to kubeconfig file paths." >&2
  echo "  export KUBECONFIG_P=/path/to/primary-kubeconfig" >&2
  echo "  export KUBECONFIG_S=/path/to/secondary-kubeconfig" >&2
  exit 1
fi

if [[ ! -f "\$KUBECONFIG_P" || ! -f "\$KUBECONFIG_S" ]]; then
  echo "Kubeconfig file not found." >&2
  exit 1
fi

mkdir -p "\$OUT_DIR"

# Secret applied ON the primary cluster — data is the secondary kubeconfig
B64_S=\$(base64 -w0 < "\$KUBECONFIG_S" 2>/dev/null || base64 < "\$KUBECONFIG_S" | tr -d '\\n')
cat > "\$OUT_DIR/remote-kubeconfig-for-primary-site.yaml" <<EOF
apiVersion: v1
kind: Secret
metadata:
  name: \${SECRET_NAME}
  namespace: \${NS}
type: Opaque
data:
  remote-kubeconfig: \${B64_S}
EOF

# Secret applied ON the secondary cluster — data is the primary kubeconfig
B64_P=\$(base64 -w0 < "\$KUBECONFIG_P" 2>/dev/null || base64 < "\$KUBECONFIG_P" | tr -d '\\n')
cat > "\$OUT_DIR/remote-kubeconfig-for-secondary-site.yaml" <<EOF
apiVersion: v1
kind: Secret
metadata:
  name: \${SECRET_NAME}
  namespace: \${NS}
type: Opaque
data:
  remote-kubeconfig: \${B64_P}
EOF

echo "Wrote:"
echo "  \$OUT_DIR/remote-kubeconfig-for-primary-site.yaml   (apply on PRIMARY)"
echo "  \$OUT_DIR/remote-kubeconfig-for-secondary-site.yaml (apply on SECONDARY)"

if [[ "\${APPLY:-0}" == "1" ]]; then
  echo "Applying to primary (KUBECONFIG=\$KUBECONFIG_P)..."
  KUBECONFIG="\$KUBECONFIG_P" "\$CMD" apply -f "\$OUT_DIR/remote-kubeconfig-for-primary-site.yaml"
  echo "Applying to secondary (KUBECONFIG=\$KUBECONFIG_S)..."
  KUBECONFIG="\$KUBECONFIG_S" "\$CMD" apply -f "\$OUT_DIR/remote-kubeconfig-for-secondary-site.yaml"
  echo "Done."
else
  echo
  echo "Apply manually:"
  echo "  KUBECONFIG=\\\$KUBECONFIG_P $CMD apply -f \$OUT_DIR/remote-kubeconfig-for-primary-site.yaml"
  echo "  KUBECONFIG=\\\$KUBECONFIG_S $CMD apply -f \$OUT_DIR/remote-kubeconfig-for-secondary-site.yaml"
  echo "Or re-run with APPLY=1 to apply both automatically."
fi
`
}

export const REMOTE_KUBECONFIG_SECRET_NAME = DEFAULT_SECRET_NAME
export const REMOTE_KUBECONFIG_DATA_KEY = DEFAULT_DATA_KEY
