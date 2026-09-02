export type OfflineRegistryConfig = {
  registryBase: string
  hspcPath?: string
  hrpcPath?: string
  hsppPath?: string
}

const DIGEST_IMAGE_RE =
  /(image:\s*["']?)([^"' \t]+\/)?([^/"' \t@:]+)@sha256:/g
const TAGGED_IMAGE_RE =
  /(image:\s*["']?)([^"' \t]+\/)?([^/"' \t@:]+):([^"' \t]+)/g
const BARE_IMAGE_LINE_RE =
  /^(\s*-?\s*image:\s*["']?)([A-Za-z0-9._-]+)(["']?)\s*$/

function trimRegistryBase(base: string): string {
  return base.replace(/\/+$/, '')
}

function pluginPath(base: string, override: string | undefined, suffix: string): string {
  const trimmedOverride = override?.trim()
  if (trimmedOverride) return trimmedOverride
  return `${base}/${suffix}`
}

export function offlineRegistryPaths(state: {
  offline?: OfflineRegistryConfig
}): { hspc: string; hrpc: string; hspp: string; extras: string } {
  const base = trimRegistryBase(state.offline?.registryBase?.trim() ?? '')
  if (!base) {
    return { hspc: '', hrpc: '', hspp: '', extras: '' }
  }

  return {
    hspc: pluginPath(base, state.offline?.hspcPath, 'hspc'),
    hrpc: pluginPath(base, state.offline?.hrpcPath, 'hrpc'),
    hspp: pluginPath(base, state.offline?.hsppPath, 'hspp'),
    extras: base,
  }
}

export function rewriteImagesToRegistry(yaml: string, registryPath: string): string {
  const withDigests = yaml.replace(
    DIGEST_IMAGE_RE,
    `$1${registryPath}/$3@sha256:`,
  )
  const withTags = withDigests.replace(
    TAGGED_IMAGE_RE,
    `$1${registryPath}/$3:$4`,
  )

  return withTags
    .split('\n')
    .map((line) =>
      line.replace(
        BARE_IMAGE_LINE_RE,
        `$1${registryPath}/$2:latest$3`,
      ),
    )
    .join('\n')
}

export function extractImages(yaml: string): string[] {
  const images = new Set<string>()

  for (const line of yaml.split('\n')) {
    if (!line.includes('image:')) continue
    const match = line.match(/image:\s*(['"]?)([^\s'"]+)\1/)
    if (match) images.add(match[2])
  }

  return [...images].sort()
}
