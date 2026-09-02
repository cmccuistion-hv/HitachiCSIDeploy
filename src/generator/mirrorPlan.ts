import { PLATFORMS } from '../catalog/platforms'
import type { WizardState } from '../catalog/types'
import { wizardVersion } from '../wizardVersion'
import { offlineRegistryPaths } from './offline'

function t(v: string | undefined | null): string {
  return (v || '').trim()
}

export function generateMirrorPlanMarkdown(
  state: WizardState,
  opts?: { includeMirrorExtras?: boolean },
): string {
  const plat = PLATFORMS[state.platform]
  const registryBase = t(state.offline?.registryBase)
  const paths = offlineRegistryPaths(state)
  const catalogSourceName = t(state.offline?.catalogSourceName) || 'certified-operators'
  const catalogIndexImage = t(state.offline?.catalogIndexImage)
  const includeMirrorExtras = Boolean(opts?.includeMirrorExtras)

  const hasAnyOfflinePlugin =
    state.components.driver || state.components.replication || state.components.metrics

  const bundleLines: string[] = [
    '# On a connected jump host (internet + private registry access):',
    '# 1) Get the offline bundle helper from the CSI operator repository.',
    '# 2) Mirror images into your private registry paths for this package.',
    '',
    '# Initialize the bundle helper (downloads its required metadata):',
    'hvcsi-offline-bundle.sh -c',
  ]

  if (state.components.driver) {
    bundleLines.push(`hvcsi-offline-bundle.sh -p -r ${paths.hspc}`)
  }
  if (state.components.replication) {
    bundleLines.push(`hvcsi-offline-bundle.sh -p -r ${paths.hrpc}`)
  }
  if (state.components.metrics) {
    bundleLines.push(`hvcsi-offline-bundle.sh -p -r ${paths.hspp}`)
  }

  if (includeMirrorExtras) {
    bundleLines.push('', '# Mirror wizard-owned gap-fill images (only when this ZIP includes mirror-extras.sh):')
    bundleLines.push('chmod +x ./mirror-extras.sh && ./mirror-extras.sh')
  }

  const openshiftCatalogNotes = plat.operatorHub
    ? `## OpenShift/ROSA: mirrored catalogs (OperatorHub / OLM)

On OpenShift/ROSA, the CSI Driver is installed via **OperatorHub / OLM**. In an air-gapped cluster, OLM must see a **mirrored catalog** (separate from image mirroring).

- Mirror the OperatorHub catalog with \`oc-mirror\` and apply the generated mirror policy (for example **ImageDigestMirrorSet**) and **CatalogSource** manifests in the disconnected environment.
- This wizard’s Subscription uses CatalogSource name: \`${catalogSourceName}\`.
${catalogIndexImage ? `- This ZIP includes \`02-driver/operatorhub-catalogsource.yaml\` (index image: \`${catalogIndexImage}\`). \`install.sh\` applies it and waits for READY before creating the Subscription.` : `- If your mirrored CatalogSource already exists on-cluster, you can leave the index image blank and keep the wizard configured with the existing CatalogSource name.`}
`
    : ''

  const replicationInstallNotes = state.components.replication
    ? `- Replication exports a dual-site ZIP. Install order is **primary** then **secondary** (run \`primary/install.sh\`, then \`secondary/install.sh\`).`
    : `- Single-site exports run \`./install.sh\` from the ZIP root.`

  return `# Air-gapped mirror plan

Wizard: **${wizardVersion()}**

This plan is generated for this ZIP. It prints the exact private registry paths for the components you enabled.

## Configure → Mirror → Install

1. **Configure (this wizard / ZIP)**: set the private registry base (and OpenShift CatalogSource settings when applicable), then export the ZIP.
2. **Mirror (connected jump host)**: mirror images (and on OpenShift/ROSA, catalogs) into your private registry.
3. **Install (cluster admin host)**: in the disconnected environment, unzip and run \`install.sh\`.

> This wizard rewrites manifests to reference your private registry. It does **not** push images into that registry — mirroring is a separate step.

## Private registry base

\`${registryBase}\`

## Component registry paths (this package)

${hasAnyOfflinePlugin ? [
  state.components.driver ? `- CSI Driver: \`${paths.hspc}\`` : undefined,
  state.components.replication ? `- Replication (includes DR Operator): \`${paths.hrpc}\`` : undefined,
  state.components.metrics ? `- Performance Metrics: \`${paths.hspp}\`` : undefined,
].filter(Boolean).join('\n') : '- (No components selected that use offline bundle paths)'}

## Mirror commands (connected jump host)

\`\`\`bash
${bundleLines.join('\n')}
\`\`\`

${openshiftCatalogNotes}

## Install commands (cluster admin host)

- Unzip on a machine that can reach the cluster API and the private registry.
${replicationInstallNotes}
- **Before** running \`install.sh\` on OpenShift/ROSA, apply the \`oc-mirror\` generated mirror policy (for example IDMS) and CatalogSource so OLM can discover the operator offline.
`
}

export function generateMirrorPlanScript(): string {
  return `#!/usr/bin/env bash
set -euo pipefail

# mirror-plan.sh — prints mirror-plan.md

SCRIPT_DIR="$(cd "$(dirname "\${BASH_SOURCE[0]}")" && pwd)"
PLAN="\${SCRIPT_DIR}/mirror-plan.md"

if [[ ! -f "$PLAN" ]]; then
  echo "ERROR: mirror-plan.md not found next to this script." >&2
  exit 1
fi

cat "$PLAN"
`
}

