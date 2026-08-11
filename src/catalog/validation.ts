import { CONNECTION_TYPES } from './platforms'
import type { StorageClassConfig, StorageSystemConfig, WizardState } from './types'

export function effectiveSerialNumber(
  sc: StorageClassConfig,
  storageSystems: StorageSystemConfig[],
): string {
  const trimmed = (sc.serialNumber || '').trim()
  if (trimmed) return trimmed
  const primary = storageSystems.find((s) => s.stretchedRole === 'primary') || storageSystems[0]
  return (primary?.serial || '').trim()
}

export function validateStorageClass(
  sc: StorageClassConfig,
  ctx: { storageSystems: StorageSystemConfig[] },
): Record<string, string> {
  const errors: Record<string, string> = {}
  if (!(sc.name || '').trim()) errors.name = 'Name is required.'

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

export function storageArtifactsValid(state: WizardState): boolean {
  if (!state.storageClassesEnabled) return true
  return state.storageClasses.every(
    (sc) => Object.keys(validateStorageClass(sc, { storageSystems: state.storageSystems })).length === 0,
  )
}

export function storageArtifactsInvalidReason(state: WizardState): string | null {
  if (storageArtifactsValid(state)) return null
  return 'Fill required StorageClass fields (serial, pool, ports/NVMe as applicable) or turn off Generate StorageClass(es).'
}
