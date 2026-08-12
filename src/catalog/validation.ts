import { CONNECTION_TYPES } from './platforms'
import type { StorageClassConfig, StorageSystemConfig, WizardState } from './types'
import { ensureSitesForReplication, getSiteStorage, hrpcPairSystem } from './sites'

function t(v: string | undefined | null): string {
  return (v || '').trim()
}

function systemsWithHrpcFirst(systems: StorageSystemConfig[]): StorageSystemConfig[] {
  const pair = hrpcPairSystem(systems)
  if (!pair) return systems
  return [pair, ...systems.filter((s) => s !== pair)]
}

function hrpcPairCount(systems: StorageSystemConfig[]): number {
  return systems.filter((s) => !!s.hrpcPair).length
}

function siteLabel(site: 'primary' | 'secondary'): string {
  return site === 'primary' ? 'Primary site' : 'Secondary site'
}

/** Resource group IDs on the arrays marked for Replication (Storage step). */
export function hrpcPairResourceGroupIds(state: WizardState): { primary: string; secondary: string } {
  const ensured = ensureSitesForReplication(state)
  const primary = getSiteStorage(ensured, 'primary')
  const secondary = getSiteStorage(ensured, 'secondary')
  return {
    primary: t(hrpcPairSystem(primary.storageSystems)?.resourceGroupID),
    secondary: t(hrpcPairSystem(secondary.storageSystems)?.resourceGroupID),
  }
}

/**
 * Null when resource partitioning is consistent across both Replication arrays.
 * Resource group IDs are per-array (they need not match across sites).
 * When requireBoth is false, empty on both sites is allowed.
 */
export function hrpcResourceGroupIdReason(
  state: WizardState,
  opts: { requireBoth?: boolean } = {},
): string | null {
  const { primary, secondary } = hrpcPairResourceGroupIds(state)
  if (!primary && !secondary) {
    return opts.requireBoth
      ? 'Resource partitioning is on: set Resource group ID on both sites’ Replication arrays (Storage step, Advanced array options).'
      : null
  }
  if (!primary || !secondary) {
    return 'Resource partitioning must be configured on both sites. Set Resource group ID on both Replication arrays (Storage step, Advanced array options).'
  }
  return null
}

export function effectiveSerialNumber(
  sc: StorageClassConfig,
  storageSystems: StorageSystemConfig[],
): string {
  const trimmed = (sc.serialNumber || '').trim()
  if (trimmed) return trimmed
  const primary = storageSystems.find((s) => s.stretchedRole === 'primary') || storageSystems[0]
  return (primary?.serial || '').trim()
}

export function nextUniqueName(base: string, taken: string[]): string {
  const used = new Set(taken.map((n) => n.trim()).filter(Boolean))
  const stem = (base || '').trim() || 'item'
  if (!used.has(stem)) return stem
  let n = 2
  while (used.has(`${stem}-${n}`)) n += 1
  return `${stem}-${n}`
}

export function validateStorageClass(
  sc: StorageClassConfig,
  ctx: {
    storageSystems: StorageSystemConfig[]
    siblings?: StorageClassConfig[]
  },
): Record<string, string> {
  const errors: Record<string, string> = {}
  if (!(sc.name || '').trim()) errors.name = 'Name is required.'
  else if (ctx.siblings?.some((o) => o.id !== sc.id && t(o.name) === t(sc.name))) {
    errors.name = 'This StorageClass name is already used on this site.'
  }

  const secretNs = t(sc.secretNamespace)
  if (t(sc.secretName) && ctx.siblings) {
    const secretClash = ctx.siblings.some(
      (o) =>
        o.id !== sc.id &&
        t(o.secretName) === t(sc.secretName) &&
        t(o.secretNamespace) === secretNs &&
        t(effectiveSerialNumber(o, ctx.storageSystems)) !== t(effectiveSerialNumber(sc, ctx.storageSystems)),
    )
    if (secretClash) {
      errors.secretName = 'This Secret name is already used on this site for a different array.'
    }
    const stretchedClash = ctx.siblings.some(
      (o) =>
        o.id !== sc.id &&
        (o.kind === 'stretched' || o.kind === 'stretched-adr') &&
        t(o.stretchedSecretName || o.secretName) === t(sc.secretName) &&
        t(o.secretNamespace) === secretNs,
    )
    if (stretchedClash) {
      errors.secretName = 'This Secret name is already used by a stretched StorageClass on this site.'
    }
  }

  if (sc.kind === 'vsp-one-sds-block') {
    return errors
  }

  if (sc.kind === 'stretched' || sc.kind === 'stretched-adr') {
    if (!(sc.quorumID || '').trim()) errors.quorumID = 'Quorum ID is required.'
    if (!(sc.copyGroupName || '').trim()) errors.copyGroupName = 'Copy group name is required.'
    if (!(sc.consistencyGroupId || '').trim()) errors.consistencyGroupId = 'Consistency group ID is required.'
    if (!(sc.primaryPoolID || '').trim()) errors.primaryPoolID = 'Primary pool ID is required.'
    if (!(sc.primaryPortID || '').trim()) errors.primaryPortID = 'Primary port ID is required.'
    if (!(sc.secondaryPoolID || '').trim()) errors.secondaryPoolID = 'Secondary pool ID is required.'
    if (!(sc.secondaryPortID || '').trim()) errors.secondaryPortID = 'Secondary port ID is required.'
    if (!(sc.stretchedSecretName || sc.secretName || '').trim()) {
      errors.stretchedSecretName = 'Stretched secret name is required.'
    } else if (ctx.siblings) {
      const sname = t(sc.stretchedSecretName || sc.secretName)
      const standardTaken = ctx.siblings.some(
        (o) =>
          o.id !== sc.id &&
          o.kind !== 'stretched' &&
          o.kind !== 'stretched-adr' &&
          t(o.secretName) === sname &&
          t(o.secretNamespace) === secretNs,
      )
      if (standardTaken) {
        errors.stretchedSecretName = 'This Secret name is already used by another StorageClass on this site.'
      }
    }
    return errors
  }

  // standard
  if (!effectiveSerialNumber(sc, ctx.storageSystems)) {
    errors.serialNumber = 'Serial number is required (from StorageClass or linked array).'
  }
  if (!(sc.poolID || '').trim()) errors.poolID = 'Pool ID is required.'
  const conn = CONNECTION_TYPES.find((c) => c.id === sc.connectionType)
  if (conn?.needsPortId && !(sc.portID || '').trim()) {
    errors.portID = 'Port ID is required for this connection type.'
  }
  if (conn?.needsNvmSubsystem && !(sc.nvmSubsystemID || '').trim()) {
    errors.nvmSubsystemID = 'NVMe subsystem ID is required.'
  }
  return errors
}

export function validateStorageSystem(
  sys: StorageSystemConfig,
  siblings: StorageSystemConfig[],
): Record<string, string> {
  const errors: Record<string, string> = {}
  if (!t(sys.name)) errors.name = 'Display name is required.'
  else if (siblings.some((o) => o.id !== sys.id && t(o.name) === t(sys.name))) {
    errors.name = 'This array name is already used on this site.'
  }
  if (t(sys.serial) && siblings.some((o) => o.id !== sys.id && t(o.serial) === t(sys.serial))) {
    errors.serial = 'This serial number is already used on this site.'
  }
  return errors
}

function siteHasDuplicateNames(systems: StorageSystemConfig[], classes: StorageClassConfig[]): string | null {
  if (systems.some((sys) => !t(sys.name))) {
    return 'Each array on this site must have a display name.'
  }
  const sysNames = new Map<string, number>()
  const sysSerials = new Map<string, number>()
  for (const sys of systems) {
    if (t(sys.name)) sysNames.set(t(sys.name), (sysNames.get(t(sys.name)) || 0) + 1)
    if (t(sys.serial)) sysSerials.set(t(sys.serial), (sysSerials.get(t(sys.serial)) || 0) + 1)
  }
  if ([...sysNames.values()].some((n) => n > 1)) {
    return 'Each array on this site must have a unique display name.'
  }
  if ([...sysSerials.values()].some((n) => n > 1)) {
    return 'Each array on this site must have a unique serial number.'
  }
  const scNames = new Map<string, number>()
  for (const sc of classes) {
    if (t(sc.name)) scNames.set(t(sc.name), (scNames.get(t(sc.name)) || 0) + 1)
  }
  if ([...scNames.values()].some((n) => n > 1)) {
    return 'Each StorageClass on this site must have a unique name.'
  }

  const secretOwners = new Map<string, string>()
  for (const sc of classes) {
    const name = t(sc.secretName)
    if (!name) continue
    const key = `${t(sc.secretNamespace)}/${name}`
    const serial = t(effectiveSerialNumber(sc, systems))
    const prev = secretOwners.get(key)
    if (prev && serial && prev !== serial) {
      return 'Each Secret name on this site can only be used for one array.'
    }
    if (serial) secretOwners.set(key, serial)
    else if (!secretOwners.has(key)) secretOwners.set(key, serial)
  }

  for (const sc of classes) {
    if (sc.kind !== 'stretched' && sc.kind !== 'stretched-adr') continue
    const sname = t(sc.stretchedSecretName || sc.secretName)
    if (!sname) continue
    const clash = classes.some(
      (o) =>
        o.id !== sc.id &&
        o.kind !== 'stretched' &&
        o.kind !== 'stretched-adr' &&
        t(o.secretName) === sname &&
        t(o.secretNamespace) === t(sc.secretNamespace),
    )
    if (clash) {
      return 'Stretched secret names must be different from other Secret names on this site.'
    }
  }

  return null
}

function replicationArrayMissingFields(
  sys: StorageSystemConfig | undefined,
  site: 'primary' | 'secondary',
): string | null {
  const label = siteLabel(site)
  if (!sys) {
    return `${label} must have exactly one storage system marked for Replication.`
  }
  const missing: string[] = []
  if (!t(sys.serial)) missing.push('serial number')
  if (!t(sys.url)) missing.push('REST URL')
  if (!t(sys.user)) missing.push('username')
  if (!t(sys.password)) missing.push('password')
  if (!missing.length) return null
  const fields = missing.join(', ')
  if (site === 'secondary') {
    return `Open the Secondary site tab and enter ${fields} for the array used for Replication.`
  }
  return `Enter ${fields} for the primary site's array used for Replication.`
}

/** Arrays marked for Replication must be complete on both sites (Continue on Storage systems). */
export function validateHrpcReplicationArrays(state: WizardState): string | null {
  if (!state.components.replication) return null

  const ensured = ensureSitesForReplication(state)
  const primary = getSiteStorage(ensured, 'primary')
  const secondary = getSiteStorage(ensured, 'secondary')

  for (const site of ['primary', 'secondary'] as const) {
    const storage = site === 'primary' ? primary : secondary
    if (storage.storageSystems.length < 1) {
      return site === 'secondary'
        ? 'Open the Secondary site tab and add the storage system used for Replication.'
        : `${siteLabel(site)} must have at least one storage system.`
    }
    if (hrpcPairCount(storage.storageSystems) !== 1) {
      return site === 'secondary'
        ? 'Open the Secondary site tab and mark exactly one array for Replication.'
        : `${siteLabel(site)} must have exactly one storage system marked for Replication.`
    }
  }

  return (
    siteHasDuplicateNames(primary.storageSystems, primary.storageClasses) ||
    siteHasDuplicateNames(secondary.storageSystems, secondary.storageClasses) ||
    replicationArrayMissingFields(hrpcPairSystem(primary.storageSystems), 'primary') ||
    replicationArrayMissingFields(hrpcPairSystem(secondary.storageSystems), 'secondary')
  )
}

export function storageSystemsValidForContinue(state: WizardState): boolean {
  return storageSystemsContinueInvalidReason(state) === null
}

export function storageSystemsContinueInvalidReason(state: WizardState): string | null {
  if (state.components.replication) {
    return validateHrpcReplicationArrays(state)
  }
  return siteHasDuplicateNames(state.storageSystems || [], state.storageClasses || [])
}

function validateHrpcStorageClasses(state: WizardState): string | null {
  if (!state.components.replication) return null

  const arrayReason = validateHrpcReplicationArrays(state)
  if (arrayReason) return arrayReason

  const ensured = ensureSitesForReplication(state)
  const primary = getSiteStorage(ensured, 'primary')
  const secondary = getSiteStorage(ensured, 'secondary')

  if (!state.storageClassesEnabled) return null

  const primaryPairSys = hrpcPairSystem(primary.storageSystems)
  const secondaryPairSys = hrpcPairSystem(secondary.storageSystems)
  const primaryPairSerial = t(primaryPairSys?.serial)
  const secondaryPairSerial = t(secondaryPairSys?.serial)

  const primaryPairs = primary.storageClasses.filter((sc) => !!t(sc.hrpcPairId))
  if (primaryPairs.length < 1) {
    // Replication can install without a StorageClass marked for it; the wizard warns on Continue.
    return null
  }

  for (const primarySc of primaryPairs) {
    const pairId = t(primarySc.hrpcPairId)
    const secondarySc = secondary.storageClasses.find((sc) => t(sc.hrpcPairId) === pairId)
    if (!secondarySc) {
      return `Secondary site is missing the matching StorageClass for Replication "${primarySc.name}".`
    }

    if (t(primarySc.name) !== t(secondarySc.name) || t(primarySc.fstype) !== t(secondarySc.fstype)) {
      return `StorageClass "${primarySc.name}" used for Replication must have the same name and filesystem type on both sites.`
    }

    const primaryErrors = validateStorageClass(primarySc, {
      storageSystems: systemsWithHrpcFirst(primary.storageSystems),
      siblings: primary.storageClasses,
    })
    if (Object.keys(primaryErrors).length) {
      return `Fill required fields for StorageClass "${primarySc.name}" (used for Replication) on the primary site.`
    }

    const secondaryErrors = validateStorageClass(secondarySc, {
      storageSystems: systemsWithHrpcFirst(secondary.storageSystems),
      siblings: secondary.storageClasses,
    })
    if (Object.keys(secondaryErrors).length) {
      return `Open the Secondary site tab and fill required fields for StorageClass "${primarySc.name}" (used for Replication).`
    }

    if (primaryPairSerial) {
      const eff = t(effectiveSerialNumber(primarySc, systemsWithHrpcFirst(primary.storageSystems)))
      if (eff && eff !== primaryPairSerial) {
        return `StorageClass "${primarySc.name}" used for Replication must reference the primary site's Replication array serial (${primaryPairSerial}).`
      }
    }
    if (secondaryPairSerial) {
      const eff = t(effectiveSerialNumber(secondarySc, systemsWithHrpcFirst(secondary.storageSystems)))
      if (eff && eff !== secondaryPairSerial) {
        return `StorageClass "${primarySc.name}" used for Replication must reference the secondary site's Replication array serial (${secondaryPairSerial}).`
      }
    }
  }

  return null
}

/** True when at least one StorageClass is marked for Replication on either site. */
export function hasStorageClassUsedForReplication(state: WizardState): boolean {
  if (!state.components.replication) return false
  const ensured = ensureSitesForReplication(state)
  const primary = getSiteStorage(ensured, 'primary')
  const secondary = getSiteStorage(ensured, 'secondary')
  return (
    primary.storageClasses.some((sc) => !!t(sc.hrpcPairId)) ||
    secondary.storageClasses.some((sc) => !!t(sc.hrpcPairId))
  )
}

/** Show the Continue warning when Replication is on, SCs are generated, and none are marked for it. */
export function needsNoReplicationStorageClassConfirm(state: WizardState): boolean {
  return !!(
    state.components.replication &&
    state.storageClassesEnabled &&
    !hasStorageClassUsedForReplication(state)
  )
}

export function validateHrpc(state: WizardState): string | null {
  if (!state.components.replication) return null

  const ensured = ensureSitesForReplication(state)
  const primary = getSiteStorage(ensured, 'primary')
  const secondary = getSiteStorage(ensured, 'secondary')

  const scReason = validateHrpcStorageClasses(ensured)
  if (scReason) return scReason

  const primaryPairSys = hrpcPairSystem(primary.storageSystems)
  const secondaryPairSys = hrpcPairSystem(secondary.storageSystems)
  const primaryPairSerial = t(primaryPairSys?.serial)
  const secondaryPairSerial = t(secondaryPairSys?.serial)

  const rgReason = hrpcResourceGroupIdReason(ensured)
  if (rgReason) return rgReason

  const secrets = ensured.replication.storageSecrets || []
  if (secrets.length < 1) {
    return 'Set journals on the Replication step (storage secrets).'
  }

  for (const serial of [primaryPairSerial, secondaryPairSerial]) {
    const match = secrets.find((s) => t(s.serial) === serial)
    if (!match) {
      return `Add a Replication storage secret entry for array serial ${serial} (on the Replication step).`
    }
    if (!t(match.journal)) {
      return `Set a Journal ID for array serial ${serial} (on the Replication step).`
    }
  }

  return null
}

export function storageArtifactsValidForContinue(state: WizardState): boolean {
  if (!state.storageClassesEnabled) return true

  if (state.components.replication) {
    const ensured = ensureSitesForReplication(state)
    const primary = getSiteStorage(ensured, 'primary')
    const secondary = getSiteStorage(ensured, 'secondary')

    if (validateHrpcStorageClasses(ensured)) return false

    const sites = [
      { id: 'primary' as const, storage: primary },
      { id: 'secondary' as const, storage: secondary },
    ]

    return sites.every(({ storage }) =>
      storage.storageClasses.every((sc) => {
        const ctxSystems = t(sc.hrpcPairId)
          ? systemsWithHrpcFirst(storage.storageSystems)
          : storage.storageSystems
        return Object.keys(
          validateStorageClass(sc, {
            storageSystems: ctxSystems,
            siblings: storage.storageClasses,
          }),
        ).length === 0
      }),
    )
  }

  return state.storageClasses.every(
    (sc) =>
      Object.keys(
        validateStorageClass(sc, { storageSystems: state.storageSystems, siblings: state.storageClasses }),
      ).length === 0,
  )
}

export function storageArtifactsValid(state: WizardState): boolean {
  if (state.components.replication) {
    const ensured = ensureSitesForReplication(state)
    if (validateHrpc(ensured)) return false
    if (!ensured.storageClassesEnabled) return true

    const primary = getSiteStorage(ensured, 'primary')
    const secondary = getSiteStorage(ensured, 'secondary')
    const sites = [
      { storage: primary },
      { storage: secondary },
    ]

    return sites.every(({ storage }) =>
      storage.storageClasses.every((sc) => {
        const ctxSystems = t(sc.hrpcPairId)
          ? systemsWithHrpcFirst(storage.storageSystems)
          : storage.storageSystems
        return Object.keys(
          validateStorageClass(sc, {
            storageSystems: ctxSystems,
            siblings: storage.storageClasses,
          }),
        ).length === 0
      }),
    )
  }

  if (!state.storageClassesEnabled) return true
  return state.storageClasses.every(
    (sc) =>
      Object.keys(
        validateStorageClass(sc, { storageSystems: state.storageSystems, siblings: state.storageClasses }),
      ).length === 0,
  )
}

export function storageArtifactsInvalidReason(state: WizardState): string | null {
  if (storageArtifactsValid(state)) return null
  if (state.components.replication) {
    return (
      validateHrpc(state) ||
      'Fill required StorageClass fields for both sites (serial, pool, ports/NVMe as applicable) or turn off Generate StorageClass(es).'
    )
  }
  return 'Fill required StorageClass fields (serial, pool, ports/NVMe as applicable) or turn off Generate StorageClass(es).'
}

export function storageArtifactsContinueInvalidReason(state: WizardState): string | null {
  if (storageArtifactsValidForContinue(state)) return null
  if (state.components.replication) {
    return (
      validateHrpcStorageClasses(state) ||
      'Fill required StorageClass fields for both sites (serial, pool, ports/NVMe as applicable) or turn off Generate StorageClass(es).'
    )
  }
  return 'Fill required StorageClass fields (serial, pool, ports/NVMe as applicable) or turn off Generate StorageClass(es).'
}
