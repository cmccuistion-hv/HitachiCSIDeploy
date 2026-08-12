import type {
  SiteId,
  SiteStorageConfig,
  StorageClassConfig,
  StorageSystemConfig,
  WizardState,
} from './types'

export type { SiteId }

function withoutHrpcPair(sys: StorageSystemConfig): StorageSystemConfig {
  // Omit `hrpcPair` rather than setting false, to keep JSON minimal.
  const next: StorageSystemConfig = { ...sys }
  delete (next as Partial<StorageSystemConfig>).hrpcPair
  return next
}

function withoutHrpcPairId(sc: StorageClassConfig): StorageClassConfig {
  // Omit `hrpcPairId` rather than setting empty string, to keep JSON minimal.
  const next: StorageClassConfig = { ...sc }
  delete (next as Partial<StorageClassConfig>).hrpcPairId
  return next
}

export function createEmptySiteStorage(
  partial?: Partial<SiteStorageConfig>,
): SiteStorageConfig {
  return {
    storageSystems: partial?.storageSystems ?? [],
    storageClasses: partial?.storageClasses ?? [],
  }
}

export function hrpcPairSystem(
  systems: StorageSystemConfig[],
): StorageSystemConfig | undefined {
  return systems.find((s) => !!s.hrpcPair)
}

export function setHrpcPair(
  systems: StorageSystemConfig[],
  id: string,
): StorageSystemConfig[] {
  return systems.map((sys) =>
    sys.id === id
      ? { ...sys, hrpcPair: true, stretchedRole: 'none' as const }
      : withoutHrpcPair(sys),
  )
}

function primaryHrpcStorageClass(
  primary: SiteStorageConfig,
): StorageClassConfig | undefined {
  return (
    primary.storageClasses.find((sc) => !!sc.hrpcPairId) ??
    primary.storageClasses.find((sc) => sc.kind === 'standard') ??
    primary.storageClasses[0]
  )
}

export function seedSecondaryFromPrimary(
  primary: SiteStorageConfig,
): SiteStorageConfig {
  const pairSys =
    hrpcPairSystem(primary.storageSystems) ?? primary.storageSystems[0]
  const seededSystem: StorageSystemConfig = pairSys
    ? {
        ...pairSys,
        id: `${pairSys.id}-secondary`,
        name: 'secondary',
        serial: '',
        url: '',
        user: '',
        password: '',
        hrpcPair: true,
        stretchedRole: 'none',
      }
    : {
        id: 'storage-1-secondary',
        name: 'secondary',
        family: 'vsp',
        serial: '',
        url: '',
        user: '',
        password: '',
        hrpcPair: true,
        stretchedRole: 'none',
      }
  if (seededSystem.resourceGroupID !== undefined) {
    delete (seededSystem as Partial<StorageSystemConfig>).resourceGroupID
  }

  const primaryHrpcSc = primaryHrpcStorageClass(primary)
  const pairId = primaryHrpcSc?.hrpcPairId || 'hrpc-sc-1'
  const seededSc: StorageClassConfig = primaryHrpcSc
    ? {
        ...primaryHrpcSc,
        id: `${primaryHrpcSc.id}-secondary`,
        hrpcPairId: pairId,
        serialNumber: '',
        poolID: '',
        portID: '',
        nvmSubsystemID: '',
      }
    : {
        id: 'sc-hrpc-1-secondary',
        kind: 'standard',
        name: 'hitachi-csi',
        connectionType: 'fc',
        secretName: 'hitachi-csi-secret',
        secretNamespace: 'hspc-operator-system',
        hrpcPairId: pairId,
        serialNumber: '',
        poolID: '',
        portID: '',
        fstype: 'ext4',
        reclaimPolicy: 'Delete',
        volumeBindingMode: 'Immediate',
        allowVolumeExpansion: true,
      }

  // Enforce paired SC invariants: name/fstype must match across sites.
  seededSc.name = primaryHrpcSc?.name ?? seededSc.name
  seededSc.fstype = primaryHrpcSc?.fstype ?? seededSc.fstype

  return {
    storageSystems: [seededSystem],
    storageClasses: [seededSc],
  }
}

function buildPrimaryFromTopLevel(state: WizardState): SiteStorageConfig {
  const primarySystems = (state.storageSystems || []).map((sys, idx) =>
    idx === 0 ? { ...sys, hrpcPair: true, stretchedRole: 'none' as const } : withoutHrpcPair(sys),
  )

  const primaryStorageClasses = (state.storageClasses || []).map((sc) =>
    withoutHrpcPairId(sc),
  )

  let pairIdx = primaryStorageClasses.findIndex((sc) => sc.kind === 'standard')
  if (pairIdx < 0 && primaryStorageClasses.length > 0) pairIdx = 0
  if (pairIdx >= 0) {
    primaryStorageClasses[pairIdx] = {
      ...primaryStorageClasses[pairIdx],
      hrpcPairId: primaryStorageClasses[pairIdx].hrpcPairId || 'hrpc-sc-1',
    }
  }

  return createEmptySiteStorage({
    storageSystems: primarySystems,
    storageClasses: primaryStorageClasses,
  })
}

function clearGadRoleOnReplicationArrays(site: SiteStorageConfig): SiteStorageConfig {
  let changed = false
  const storageSystems = site.storageSystems.map((sys) => {
    if (!sys.hrpcPair) return sys
    if ((sys.stretchedRole || 'none') === 'none') return sys
    changed = true
    return { ...sys, stretchedRole: 'none' as const }
  })
  return changed ? { ...site, storageSystems } : site
}

export function ensureSitesForReplication(state: WizardState): WizardState {
  if (!state.components.replication) return state

  const primary = clearGadRoleOnReplicationArrays(
    state.sites?.primary ?? buildPrimaryFromTopLevel(state),
  )
  const secondary = clearGadRoleOnReplicationArrays(
    state.sites?.secondary ?? seedSecondaryFromPrimary(primary),
  )

  if (
    state.sites?.primary === primary &&
    state.sites?.secondary === secondary
  ) {
    return state
  }

  return {
    ...state,
    sites: { primary, secondary },
  }
}

export function getSiteStorage(
  state: WizardState,
  site: SiteId,
): SiteStorageConfig {
  if (state.components.replication) {
    const ensured = ensureSitesForReplication(state)
    return (
      ensured.sites?.[site] ??
      (site === 'primary'
        ? buildPrimaryFromTopLevel(state)
        : createEmptySiteStorage())
    )
  }
  if (site === 'primary') {
    return createEmptySiteStorage({
      storageSystems: state.storageSystems || [],
      storageClasses: state.storageClasses || [],
    })
  }
  return createEmptySiteStorage()
}

export function withSiteStorage(
  state: WizardState,
  site: SiteId,
  next: SiteStorageConfig,
): WizardState {
  if (!state.components.replication) {
    if (site !== 'primary') return state
    return {
      ...state,
      storageSystems: next.storageSystems,
      storageClasses: next.storageClasses,
    }
  }

  const ensured = ensureSitesForReplication(state)
  return {
    ...ensured,
    sites: {
      primary: ensured.sites!.primary,
      secondary: ensured.sites!.secondary,
      [site]: next,
    },
  }
}

// Back-compat aliases for earlier task wording.
export const ensureSites = ensureSitesForReplication
export const seedSecondarySite = seedSecondaryFromPrimary

export function updateSiteStorage(
  state: WizardState,
  site: SiteId,
  patch: Partial<SiteStorageConfig>,
): WizardState {
  const current = getSiteStorage(state, site)
  return withSiteStorage(state, site, { ...current, ...patch })
}

