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

  const bundleLines: string[] = [
    '# On a connected jump host (internet + private registry access):',
    '# 1) Get the offline bundle helper from the CSI operator repository.',
    '# 2) Mirror images into your private registry paths for this package.',
    '',
    '# Initialize the bundle helper (downloads its required metadata):',
    'hvcsi-offline-bundle.sh -c',
  ]

  if (state.components.driver) bundleLines.push(`hvcsi-offline-bundle.sh -p -r ${paths.hspc}`)
  if (state.components.replication) bundleLines.push(`hvcsi-offline-bundle.sh -p -r ${paths.hrpc}`)
  if (state.components.metrics) bundleLines.push(`hvcsi-offline-bundle.sh -p -r ${paths.hspp}`)

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
    '# 2) Mirror (connected jump host): mirror images (and on OpenShift/ROSA, catalogs) into your private registry.',
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

print_plan() {
  cat <<'EOF'
${planText}
EOF
}

usage() {
  cat <<'EOF'
Usage: ./mirror.sh [plan|extras]

  plan   Print the mirror plan for this ZIP (default)
  extras Mirror wizard-owned gap-fill images with skopeo (only if this ZIP needs them)
EOF
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

cmd="\${1:-plan}"
case "$cmd" in
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

