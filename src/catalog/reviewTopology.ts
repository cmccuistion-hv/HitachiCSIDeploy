/**
 * Live Review-step model: the objects this wizard configured, nested and
 * mapped to generated manifest paths (no READMEs).
 */

import { CONNECTION_TYPES, PLATFORMS, stretchedSecretPackagePath, supportsCsiVolumeSnapshots } from './platforms'
import { getSiteStorage, hrpcPairSystem, resolvedStorageClassName, type SiteId } from './sites'
import type { StorageClassConfig, StorageSystemConfig, WizardState } from './types'
import { effectiveSerialNumber } from './validation'

export const REVIEW_MAX_POOLS = 3
export const REVIEW_MAX_STORAGECLASSES = 4

export type ReviewTone = 'ctrl' | 'dr' | 'node' | 'pill' | 'card'

export type ReviewHit = {
  id: string
  title: string
  why: string
  files: string[]
}

export type ReviewChip = {
  id: string
  label: string
  sub?: string
  tone: ReviewTone
}

export type ReviewPoolView = {
  id: string
  title: string
  sub: string
  extra?: string
}

export type ReviewSiteView = {
  id: SiteId | 'single'
  title: string
  clusterLabel: string
  chips: ReviewChip[][]
  storageClasses: ReviewChip[]
  moreStorageClasses?: { id: string; label: string }
  snapshot?: ReviewChip
  testVolume?: ReviewChip
  array: {
    id: string
    title: string
    sub: string
    pools: ReviewPoolView[]
    morePools?: { id: string; label: string }
  }
  ghosts: { label: string }[]
}

export type ReviewTopologyModel = {
  subtitle: string
  dualSite: boolean
  protocolLabel: string
  sites: ReviewSiteView[]
  hits: Record<string, ReviewHit>
}

type FileRef = { path: string }

function t(v: string | undefined): string {
  return (v || '').trim()
}

function isManifest(path: string): boolean {
  const base = path.split('/').pop() || path
  if (base.toLowerCase().startsWith('readme')) return false
  if (path.endsWith('.md')) return false
  if (base === 'install.sh') return false
  return true
}

function under(files: FileRef[], folder: string, sitePrefix: string): string[] {
  const needle = sitePrefix ? `${sitePrefix}${folder}/` : `${folder}/`
  return files.filter((f) => f.path.startsWith(needle) && isManifest(f.path)).map((f) => f.path)
}

function pick(files: FileRef[], relatives: string[], sitePrefix: string): string[] {
  const want = relatives.map((r) => (sitePrefix ? `${sitePrefix}${r}` : r))
  const set = new Set(files.map((f) => f.path))
  return want.filter((p) => set.has(p) && isManifest(p))
}

function journalForSerial(state: WizardState, serial: string): string {
  const s = t(serial)
  if (!s) return ''
  const hit = (state.replication.storageSecrets || []).find((sec) => t(sec.serial) === s)
  return t(hit?.journal)
}

function poolIdsOnArray(
  sc: StorageClassConfig,
  sys: StorageSystemConfig,
  systems: StorageSystemConfig[],
): string[] {
  if (sc.kind === 'stretched' || sc.kind === 'stretched-adr') {
    if (sys.stretchedRole === 'secondary') return t(sc.secondaryPoolID) ? [t(sc.secondaryPoolID)] : ['']
    if (sys.stretchedRole === 'primary' || systems[0]?.id === sys.id) {
      return t(sc.primaryPoolID) ? [t(sc.primaryPoolID)] : ['']
    }
    return []
  }
  const serial = effectiveSerialNumber(sc, systems)
  if (t(sys.serial) && serial && serial !== t(sys.serial)) return []
  if (sc.kind === 'vsp-one-sds-block') return t(sc.poolID) ? [t(sc.poolID)] : ['']
  return [t(sc.poolID)]
}

function detailedArray(systems: StorageSystemConfig[], replicationOn: boolean): StorageSystemConfig | undefined {
  if (replicationOn) return hrpcPairSystem(systems) ?? systems[0]
  return systems.find((s) => s.stretchedRole === 'primary') ?? systems[0]
}

function arrayTitle(sys: StorageSystemConfig | undefined): string {
  if (!sys) return 'Storage array'
  const serial = t(sys.serial)
  const name = t(sys.name)
  if (serial) return `Array ${serial}`
  if (name) return `Array (${name})`
  return 'Storage array'
}

function ghostLabel(sys: StorageSystemConfig): string {
  const serial = t(sys.serial)
  if (serial) return `Array ${serial}`
  const name = t(sys.name)
  return name ? `Array (${name})` : 'Another array'
}

function multipathChip(state: WizardState, id: string): ReviewChip {
  let label = 'Multipath'
  if (state.multipath.includeMachineConfig) label = 'Multipath MachineConfig'
  else if (state.multipath.includeDaemonSet) label = 'Multipath DaemonSet'
  else if (state.multipath.includeConf) label = 'multipath.conf'
  return { id, label, tone: 'pill' }
}

function buildSite(
  state: WizardState,
  files: FileRef[],
  site: SiteId | 'single',
  hits: Record<string, ReviewHit>,
): ReviewSiteView {
  const dual = state.components.replication
  const siteId: SiteId = site === 'single' ? 'primary' : site
  const prefix = dual ? `${siteId}/` : ''
  const storage = getSiteStorage(state, siteId)
  const systems = storage.storageSystems
  const classes = state.storageClassesEnabled ? storage.storageClasses : []
  const plat = PLATFORMS[state.platform]
  const clusterLabel = plat.useOc ? 'OpenShift cluster' : 'Kubernetes cluster'
  const title =
    site === 'single' ? clusterLabel : siteId === 'primary' ? 'Primary cluster' : 'Secondary cluster'

  const addHit = (hit: ReviewHit) => {
    hits[hit.id] = hit
  }

  const csiId = `${site}:csi`
  const csiFiles = [
    ...pick(
      files,
      [
        '02-driver/hspc-cr.yaml',
        '02-driver/hspc-csi-telemetry-config.yaml',
        '02-driver/operatorhub-namespace.yaml',
        '02-driver/operatorhub-operatorgroup.yaml',
        '02-driver/operatorhub-subscription.yaml',
      ],
      prefix,
    ),
  ]
  addHit({
    id: csiId,
    title: 'CSI Driver',
    why: state.telemetryEnabled
      ? 'Operator install plus the CSI Driver custom resource.'
      : 'Operator install, CSI Driver custom resource, and the ConfigMap that turns Hitachi Telemetry off.',
    files: csiFiles,
  })

  const chipRows: ReviewChip[][] = []
  if (state.multipath.enabled) {
    const id = `${site}:multipath`
    addHit({
      id,
      title: 'Multipath',
      why: 'Worker nodes need this so redundant paths to a LUN look like one disk.',
      files: under(files, '00-prereq', prefix),
    })
    chipRows.push([multipathChip(state, id)])
  }
  chipRows.push([
    {
      id: csiId,
      label: 'CSI Driver',
      sub: state.telemetryEnabled ? 'telemetry on' : 'telemetry off',
      tone: 'ctrl',
    },
  ])

  if (state.components.replication) {
    const replId = `${site}:replication`
    addHit({
      id: replId,
      title: 'Replication',
      why: 'Replication and the DR Operator install together. Journals Secret, remote kubeconfig, and DR Operator manifests.',
      files: under(files, '03-replication', prefix),
    })
    chipRows.push([
      { id: replId, label: 'Replication', sub: 'DR Operator included', tone: 'dr' },
    ])
  }

  const metricsConsole: ReviewChip[] = []
  if (state.components.metrics) {
    const id = `${site}:metrics`
    const metricFiles = under(files, '04-metrics', prefix)
    addHit({
      id,
      title: 'Performance Metrics',
      why: 'Exporter, array credentials, and optional Prometheus / Grafana stacks from this package.',
      files: metricFiles,
    })
    metricsConsole.push({
      id,
      label: 'Performance Metrics',
      sub: [
        state.metrics.deployPrometheus ? 'Prometheus' : '',
        state.metrics.deployGrafana ? 'Grafana' : '',
      ]
        .filter(Boolean)
        .join(' + ') || 'exporter',
      tone: 'node',
    })
  }
  if (state.components.consolePlugin && plat.supportsConsolePlugin) {
    const id = `${site}:console`
    addHit({
      id,
      title: 'OpenShift Console plugin',
      why: 'ConsolePlugin that reads Prometheus in the cluster.',
      files: under(files, '05-console', prefix),
    })
    metricsConsole.push({ id, label: 'Console plugin', tone: 'pill' })
  }
  if (metricsConsole.length) chipRows.push(metricsConsole)

  const scChips: ReviewChip[] = classes.map((sc) => {
    const id = `${site}:sc:${sc.id}`
    const name = t(sc.name) || 'unnamed'
    const filesForSc = pick(files, [`01-storage/storageclass-${sc.name}.yaml`], prefix)
    const stretched =
      sc.kind === 'stretched' || sc.kind === 'stretched-adr'
        ? pick(files, [stretchedSecretPackagePath(sc.stretchedSecretName || 'hitachi-csi-secret-stretched')], prefix)
        : []
    addHit({
      id,
      title: `StorageClass ${name}`,
      why:
        sc.kind === 'stretched' || sc.kind === 'stretched-adr'
          ? 'Stretched class — primary and secondary pools live on the two arrays.'
          : `Provisioning profile for this cluster. Pool and ports are fields on this StorageClass.`,
      files: [...filesForSc, ...stretched],
    })
    return { id, label: 'StorageClass', sub: name, tone: 'card' as const }
  })
  const shownSc = scChips.slice(0, REVIEW_MAX_STORAGECLASSES)
  const hiddenSc = scChips.slice(REVIEW_MAX_STORAGECLASSES)
  let moreStorageClasses: { id: string; label: string } | undefined
  if (hiddenSc.length) {
    const id = `${site}:sc-more`
    addHit({
      id,
      title: 'More StorageClasses',
      why: 'Additional StorageClasses on this cluster.',
      files: [...new Set(hiddenSc.flatMap((c) => hits[c.id]?.files || []))],
    })
    moreStorageClasses = {
      id,
      label: `+${hiddenSc.length} more StorageClass${hiddenSc.length === 1 ? '' : 'es'}`,
    }
  }

  let snapshot: ReviewChip | undefined
  if (
    state.storageClassesEnabled &&
    state.snapshotClass.enabled &&
    supportsCsiVolumeSnapshots(classes)
  ) {
    const id = `${site}:snapshot`
    addHit({
      id,
      title: 'VolumeSnapshotClass',
      why: 'Snapshot profile packaged with the StorageClasses.',
      files: pick(files, [`01-storage/volumesnapshotclass-${state.snapshotClass.name}.yaml`], prefix),
    })
    snapshot = {
      id,
      label: 'VolumeSnapshotClass',
      sub: t(state.snapshotClass.name) || 'snapshot',
      tone: 'pill',
    }
  }

  let testVolume: ReviewChip | undefined
  if (state.storageClassesEnabled) {
    const id = `${site}:testvol`
    addHit({
      id,
      title: 'Test volume',
      why: `PersistentVolumeClaim ${state.quickstart.pvcName || 'test-pvc'} binds to StorageClass ${resolvedStorageClassName(state)}; the Pod mounts it.`,
      files: pick(files, ['06-quickstart/pvc.yaml', '06-quickstart/pod.yaml'], prefix),
    })
    testVolume = {
      id,
      label: 'Test volume',
      sub: `${state.quickstart.pvcName || 'test-pvc'} → ${state.quickstart.podName || 'test-pod'}`,
      tone: 'card',
    }
  }

  const detailed = detailedArray(systems, dual)
  const ghosts = systems.filter((s) => s.id !== detailed?.id).map((s) => ({ label: ghostLabel(s) }))
  const arrayId = `${site}:array`
  const secretFiles = detailed
    ? pick(files, [`01-storage/secret-${detailed.name || detailed.id}.yaml`], prefix)
    : []
  const rg = t(detailed?.resourceGroupID)
  const journal = detailed ? journalForSerial(state, detailed.serial) : ''
  addHit({
    id: arrayId,
    title: arrayTitle(detailed),
    why: 'CSI Driver Secret for this array’s REST API.',
    files: secretFiles,
  })

  const testScName = t(resolvedStorageClassName(state))
  type Bucket = { key: string; poolId: string; scNames: string[]; test: boolean; gad?: 'primary' | 'secondary' }
  const buckets = new Map<string, Bucket>()
  if (detailed) {
    for (const sc of classes) {
      const ids = poolIdsOnArray(sc, detailed, systems)
      for (const poolId of ids) {
        const key = poolId || `unset-${sc.id}`
        const cur = buckets.get(key) || { key, poolId, scNames: [], test: false }
        if (!cur.scNames.includes(t(sc.name) || 'unnamed')) cur.scNames.push(t(sc.name) || 'unnamed')
        if (t(sc.name) === testScName && siteId === 'primary') cur.test = true
        if (sc.kind === 'stretched' || sc.kind === 'stretched-adr') {
          cur.gad = detailed.stretchedRole === 'secondary' ? 'secondary' : 'primary'
        }
        buckets.set(key, cur)
      }
    }
  }
  const allPools = [...buckets.values()].sort((a, b) => Number(b.test) - Number(a.test))
  const shown = allPools.slice(0, REVIEW_MAX_POOLS)
  const hidden = allPools.slice(REVIEW_MAX_POOLS)
  const pools: ReviewPoolView[] = shown.map((b) => {
    const id = `${site}:pool:${b.key}`
    const scFiles = b.scNames.flatMap((name) => pick(files, [`01-storage/storageclass-${name}.yaml`], prefix))
    addHit({
      id,
      title: t(b.poolId) ? `Pool ${b.poolId}` : 'Pool not set yet',
      why: 'A pool is a field on the StorageClass, not its own YAML.',
      files: [...new Set(scFiles)],
    })
    return {
      id,
      title: t(b.poolId) ? `Pool ${b.poolId}` : 'Pool not set yet',
      sub: b.scNames.join(', ') || 'No StorageClass yet',
      extra: b.test ? 'volume for test PVC' : b.gad ? `GAD ${b.gad}` : undefined,
    }
  })

  let morePools: { id: string; label: string } | undefined
  if (hidden.length) {
    const id = `${site}:pools-more`
    const scFiles = hidden.flatMap((b) =>
      b.scNames.flatMap((name) => pick(files, [`01-storage/storageclass-${name}.yaml`], prefix)),
    )
    addHit({
      id,
      title: 'More pools',
      why: 'Additional pools from StorageClasses on this array.',
      files: [...new Set(scFiles)],
    })
    morePools = { id, label: `+${hidden.length} more pool${hidden.length === 1 ? '' : 's'}` }
  }

  const subParts = [
    rg ? `Resource group ID ${rg}` : '',
    journal ? `journal ${journal}` : dual && detailed?.hrpcPair ? 'journal not set yet' : '',
  ].filter(Boolean)

  return {
    id: site,
    title,
    clusterLabel: dual ? clusterLabel : '',
    chips: chipRows,
    storageClasses: shownSc,
    moreStorageClasses,
    snapshot,
    testVolume,
    array: {
      id: arrayId,
      title: arrayTitle(detailed),
      sub: subParts.join(' · ') || 'Array credentials Secret',
      pools,
      morePools,
    },
    ghosts,
  }
}

export function buildReviewTopology(state: WizardState, files: FileRef[]): ReviewTopologyModel {
  const plat = PLATFORMS[state.platform]
  const protocol = CONNECTION_TYPES.find((c) => c.id === state.connectionType)?.label ?? state.connectionType
  const dualSite = !!state.components.replication
  const hits: Record<string, ReviewHit> = {}

  const sites = dualSite
    ? [buildSite(state, files, 'primary', hits), buildSite(state, files, 'secondary', hits)]
    : [buildSite(state, files, 'single', hits)]

  if (dualSite) {
    hits.journals = {
      id: 'journals',
      title: 'Journals / copy',
      why: 'Journal volume IDs live on the Replication storage Secret, not a separate custom resource.',
      files: files
        .map((f) => f.path)
        .filter((p) => p.endsWith('03-replication/storage-secrets.yaml')),
    }
  }

  const bits = [
    plat.displayName,
    state.platformVersion,
    `CSI Driver ${state.versions.driver}`,
    protocol,
  ]
  return {
    subtitle: bits.join(' · '),
    dualSite,
    protocolLabel: protocol,
    sites,
    hits,
  }
}
