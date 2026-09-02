import { PLATFORMS } from '../catalog/platforms'
import type { WizardState } from '../catalog/types'
import { wizardVersion } from '../wizardVersion'
import { offlineRegistryPaths } from './offline'

function t(v: string | undefined | null): string {
  return (v || '').trim()
}

export function generateMirrorScript(
  state: WizardState,
  opts?: {
    extrasImages?: string[]
  },
): string {
  const plat = PLATFORMS[state.platform]
  const registryBase = t(state.offline?.registryBase)
  const paths = offlineRegistryPaths(state)
  const extrasRegistryBase = t(paths.extras)
  const extrasImages = (opts?.extrasImages || []).map((s) => s.trim()).filter(Boolean)
  const catalogSourceName = t(state.offline?.catalogSourceName) || 'certified-operators'
  const catalogIndexImage = t(state.offline?.catalogIndexImage)

  const bundles: { plugin: 'hspc' | 'hrpc' | 'hspp'; version: string; registryPath: string }[] = []
  if (state.components.driver) bundles.push({ plugin: 'hspc', version: state.versions.driver, registryPath: paths.hspc })
  if (state.components.replication)
    bundles.push({ plugin: 'hrpc', version: state.versions.replication, registryPath: paths.hrpc })
  if (state.components.metrics) bundles.push({ plugin: 'hspp', version: state.versions.metrics, registryPath: paths.hspp })

  const bundleLines: string[] = [
    '# On a connected jump host (internet + private registry access):',
    '# 1) Run ./mirror.sh to clone the operator repo and mirror images.',
    '# 2) (Optional) Mirror wizard-owned gap-fill images with ./mirror.sh extras.',
    '#',
    '# Requirements on the jump host: git, skopeo, and access to Docker registries.',
    '',
    '# This ZIP includes hvcsi-offline-bundle.sh for convenience. mirror.sh will also clone',
    '# hitachi-vantara/csi-operator-hitachi and can use the script from that repo checkout.',
    '',
    '# Mirror component images (this package):',
    'chmod +x ./mirror.sh ./hvcsi-offline-bundle.sh',
    './mirror.sh',
    '',
    '# Under the hood, mirror.sh runs these offline bundle commands (one per enabled plugin):',
  ]

  for (const b of bundles) {
    bundleLines.push(`hvcsi-offline-bundle.sh -c -t ${b.plugin} -v ${b.version}`)
    bundleLines.push(`hvcsi-offline-bundle.sh -p -r ${b.registryPath}`)
    bundleLines.push('')
  }
  while (bundleLines.length && bundleLines[bundleLines.length - 1] === '') bundleLines.pop()

  if (extrasImages.length) {
    bundleLines.push(
      '',
      '# Optional: mirror wizard-owned gap-fill images (when needed by this ZIP):',
      'chmod +x ./mirror.sh && ./mirror.sh extras',
    )
  }

  const openshiftCatalogNotes = plat.operatorHub
    ? [
        '',
        '# OpenShift/ROSA (OperatorHub / OLM): mirrored catalogs',
        '# In an air-gapped cluster, OLM must see a mirrored OperatorHub catalog (separate from image mirroring).',
        '# Mirror the catalog with oc-mirror and apply the generated mirror policy (for example ImageDigestMirrorSet)',
        '# and the mirrored CatalogSource manifests in the disconnected environment.',
        `# This wizard’s Subscription uses CatalogSource name: ${catalogSourceName}`,
        catalogIndexImage
          ? `# This ZIP includes 02-driver/operatorhub-catalogsource.yaml (index image: ${catalogIndexImage}). install.sh applies it and waits for READY.`
          : '# If your mirrored CatalogSource already exists on-cluster, keep the wizard configured with that existing CatalogSource name.',
      ].join('\n')
    : ''

  const replicationInstallNotes = state.components.replication
    ? '# Replication exports a dual-site ZIP. Install order is primary then secondary (run primary/install.sh, then secondary/install.sh).'
    : '# Single-site exports run ./install.sh from the ZIP root.'

  const planText = [
    '# Air-gapped mirror plan',
    `# Wizard: ${wizardVersion()}`,
    '',
    '# Configure → Mirror → Install',
    '# 1) Configure (this wizard / ZIP): set the private registry base, then export the ZIP.',
    '# 2) Mirror (connected jump host): run mirror.sh to mirror images (and on OpenShift/ROSA, catalogs) into your private registry.',
    '# 3) Install (cluster admin host): in the disconnected environment, unzip and run install.sh.',
    '#',
    '# This wizard rewrites manifests to reference your private registry. It does not push images into that registry.',
    '',
    '# Private registry base:',
    `# ${registryBase}`,
    '',
    '# Component registry paths (this package):',
    state.components.driver ? `# - CSI Driver: ${paths.hspc}` : undefined,
    state.components.replication ? `# - Replication (includes DR Operator): ${paths.hrpc}` : undefined,
    state.components.metrics ? `# - Performance Metrics: ${paths.hspp}` : undefined,
    '',
    '# Mirror commands (connected jump host):',
    ...bundleLines.map((l) => `# ${l}`),
    openshiftCatalogNotes ? openshiftCatalogNotes.split('\n').map((l) => `# ${l}`).join('\n') : '',
    '',
    '# Install commands (cluster admin host):',
    '# - Unzip on a machine that can reach the cluster API and the private registry.',
    `# ${replicationInstallNotes}`,
  ]
    .filter((l): l is string => typeof l === 'string')
    .join('\n')
    .replaceAll('# #', '#')

  const extrasArray =
    extrasImages.length > 0 ? `EXTRAS_IMAGES=(${extrasImages.map((i) => JSON.stringify(i)).join(' ')})` : 'EXTRAS_IMAGES=()'

  return `#!/usr/bin/env bash
set -euo pipefail

# mirror.sh — air-gapped mirror entrypoint (plan + optional extras)

SCRIPT_DIR="$(cd "$(dirname "\${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

WIZARD_VERSION=${JSON.stringify(wizardVersion())}
REGISTRY_BASE=${JSON.stringify(registryBase)}
EXTRAS_REGISTRY_BASE=${JSON.stringify(extrasRegistryBase)}
${extrasArray}

REPO_URL="https://github.com/hitachi-vantara/csi-operator-hitachi.git"
REPO_REF="main"
REPO_DIR="\${SCRIPT_DIR}/csi-operator-hitachi"
BUNDLES=(${bundles.map((b) => JSON.stringify(`${b.plugin}|${b.version}|${b.registryPath}`)).join(' ')})

print_plan() {
  cat <<'EOF'
${planText}
EOF
}

usage() {
  cat <<'EOF'
Usage: ./mirror.sh [mirror|plan|extras]

  mirror Mirror component images into your private registry (default)
  plan   Print the mirror plan for this ZIP
  extras Mirror wizard-owned gap-fill images with skopeo (only if this ZIP needs them)
EOF
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || { echo "ERROR: missing required command: $1" >&2; exit 1; }
}

ensure_repo() {
  require_cmd git
  if [[ -d "\${REPO_DIR}/.git" ]]; then
    echo "==> Using existing repo clone: \${REPO_DIR}"
    return 0
  fi
  echo "==> Cloning \${REPO_URL} (\${REPO_REF}) to \${REPO_DIR}"
  git clone --depth 1 --branch "\${REPO_REF}" "\${REPO_URL}" "\${REPO_DIR}"
}

pick_bundle_script() {
  local bundled="\${SCRIPT_DIR}/hvcsi-offline-bundle.sh"
  local repo_script="\${REPO_DIR}/hvcsi-offline-bundle.sh"
  if [[ -f "\${bundled}" && -f "\${repo_script}" ]]; then
    if grep -q "WIZARD_OFFLINE_BUNDLE_PLACEHOLDER=1" "\${bundled}" 2>/dev/null; then
      echo "\${repo_script}"
      return 0
    fi
    # Prefer the wizard-packaged copy (day-0 UX); overwrite the repo copy to ensure consistency.
    cp -f "\${bundled}" "\${repo_script}"
  fi
  echo "\${repo_script}"
}

run_bundle() {
  local plugin="$1"
  local version="$2"
  local registry_path="$3"
  local script_path="$4"

  echo "==> Bundle: \${plugin} \${version}"
  (cd "\${REPO_DIR}" && chmod +x "\${script_path}" && "\${script_path}" -c -t "\${plugin}" -v "\${version}")

  local tarball="\${REPO_DIR}/hvcsi-\${plugin}-\${version}-bundle.tar.gz"
  if [[ ! -f "\${tarball}" ]]; then
    echo "ERROR: Expected bundle tarball not found: \${tarball}" >&2
    exit 1
  fi

  local out_base="\${SCRIPT_DIR}/offline-bundles"
  mkdir -p "\${out_base}"
  rm -rf "\${out_base}/hvcsi-\${plugin}-\${version}-bundle"
  tar -xzf "\${tarball}" -C "\${out_base}"

  local extracted="\${out_base}/hvcsi-\${plugin}-\${version}-bundle"
  echo "==> Push: \${plugin} images to \${registry_path}"
  (cd "\${extracted}" && "\${script_path}" -p -r "\${registry_path}")
}

run_mirror() {
  require_cmd skopeo
  ensure_repo
  local script_path
  script_path="$(pick_bundle_script)"
  if [[ ! -f "\${script_path}" ]]; then
    echo "ERROR: offline bundle helper not found at \${script_path}" >&2
    exit 1
  fi

  if [[ "\${#BUNDLES[@]}" -eq 0 ]]; then
    echo "No components enabled for mirroring in this ZIP."
    return 0
  fi

  local entry plugin version registry_path
  for entry in "\${BUNDLES[@]}"; do
    plugin="\${entry%%|*}"
    version="\${entry#*|}"; version="\${version%%|*}"
    registry_path="\${entry##*|}"
    run_bundle "\${plugin}" "\${version}" "\${registry_path}" "\${script_path}"
  done
}

run_extras() {
  if [[ "\${#EXTRAS_IMAGES[@]}" -eq 0 ]]; then
    echo "No wizard-owned gap-fill images are required for this ZIP."
    return 0
  fi
  if [[ -z "\${EXTRAS_REGISTRY_BASE:-}" ]]; then
    echo "ERROR: EXTRAS_REGISTRY_BASE is empty (wizard did not compute an extras path)." >&2
    exit 1
  fi
  command -v skopeo >/dev/null 2>&1 || { echo "ERROR: skopeo is required." >&2; exit 1; }

  echo "==> Mirroring wizard-owned images to \$EXTRAS_REGISTRY_BASE"
  local src dst
  for src in "\${EXTRAS_IMAGES[@]}"; do
    dst="\${src##*/}"
    skopeo copy "docker://\${src}" "docker://\${EXTRAS_REGISTRY_BASE}/\${dst}"
  done
}

cmd="\${1:-mirror}"
case "$cmd" in
  mirror|--mirror|run)
    run_mirror
    ;;
  plan|--plan|-p|'')
    print_plan
    ;;
  extras|--extras)
    run_extras
    ;;
  -h|--help|help)
    usage
    ;;
  *)
    echo "ERROR: unknown command: $cmd" >&2
    echo >&2
    usage >&2
    exit 2
    ;;
esac
`
}

