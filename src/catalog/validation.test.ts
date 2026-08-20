import { describe, expect, it } from 'vitest'
import { filledState } from '../test/fixtures'
import {
  hasGadPair,
  storageClassKindsForSystems,
  stretchedSecretPackagePath,
} from './platforms'
import { ensureSitesForReplication } from './sites'
import { createDefaultState, type WizardState } from './types'
import {
  siteStorageClassesReady,
  siteStorageSystemsReady,
  storageArtifactsValid,
  storageArtifactsValidForContinue,
  storageSystemsValidForContinue,
  validateHrpc,
  validateStorageClass,
} from './validation'

function validReplicationState(): WizardState {
  const state = ensureSitesForReplication(
    filledState({
      components: { replication: true, disasterRecovery: true },
      replication: { enabled: true, disasterRecovery: true },
    }),
  )
  const primary = state.sites!.primary
  const secondary = state.sites!.secondary

  return {
    ...state,
    sites: {
      primary,
      secondary: {
        storageSystems: secondary.storageSystems.map((system) => ({
          ...system,
          family: 'vsp-5000-g-e-f',
          serial: '400002',
          url: 'https://192.0.2.11',
          user: 'maintenance',
          password: 'fixture-password',
        })),
        storageClasses: secondary.storageClasses.map((storageClass) => ({
          ...storageClass,
          serialNumber: '400002',
          poolID: '1',
          portID: 'CL2-A',
        })),
      },
    },
  }
}

describe('storage system Continue validation', () => {
  it('rejects a storage system without a family', () => {
    expect(storageSystemsValidForContinue(createDefaultState())).toBe(false)
  })

  it('rejects duplicate storage system serial numbers', () => {
    const state = filledState()
    state.storageSystems.push({
      ...state.storageSystems[0],
      id: 'storage-2',
      name: 'secondary',
    })

    expect(storageSystemsValidForContinue(state)).toBe(false)
  })

  it('accepts filledState', () => {
    expect(storageSystemsValidForContinue(filledState())).toBe(true)
  })

  it('requires exactly one complete Replication array on each site', () => {
    const seeded = ensureSitesForReplication(
      filledState({
        components: { replication: true, disasterRecovery: true },
        replication: { enabled: true, disasterRecovery: true },
      }),
    )

    expect(storageSystemsValidForContinue(seeded)).toBe(false)

    const valid = validReplicationState()
    expect(storageSystemsValidForContinue(valid)).toBe(true)

    const noPrimaryPair = structuredClone(valid)
    noPrimaryPair.sites!.primary.storageSystems[0].hrpcPair = false
    expect(storageSystemsValidForContinue(noPrimaryPair)).toBe(false)

    const twoPrimaryPairs = structuredClone(valid)
    twoPrimaryPairs.sites!.primary.storageSystems.push({
      ...twoPrimaryPairs.sites!.primary.storageSystems[0],
      id: 'storage-2',
      name: 'another-primary-array',
      serial: '452339',
    })
    expect(storageSystemsValidForContinue(twoPrimaryPairs)).toBe(false)
  })
})

describe('per-site readiness for the site switcher', () => {
  it('treats seeded Replication primary arrays as ready and secondary as not', () => {
    const seeded = ensureSitesForReplication(
      filledState({
        components: { replication: true, disasterRecovery: true },
        replication: { enabled: true, disasterRecovery: true },
      }),
    )

    expect(siteStorageSystemsReady(seeded, 'primary')).toBe(true)
    expect(siteStorageSystemsReady(seeded, 'secondary')).toBe(false)
    expect(storageSystemsValidForContinue(seeded)).toBe(false)
  })

  it('treats validReplicationState arrays as ready on both sites', () => {
    const state = validReplicationState()
    expect(siteStorageSystemsReady(state, 'primary')).toBe(true)
    expect(siteStorageSystemsReady(state, 'secondary')).toBe(true)
    expect(siteStorageClassesReady(state, 'primary')).toBe(true)
    expect(siteStorageClassesReady(state, 'secondary')).toBe(true)
  })

  it('treats both StorageClass sites as ready when generation is off', () => {
    const state = { ...validReplicationState(), storageClassesEnabled: false }
    expect(siteStorageClassesReady(state, 'primary')).toBe(true)
    expect(siteStorageClassesReady(state, 'secondary')).toBe(true)
  })

  it('badges Secondary when the matching Replication StorageClass is incomplete', () => {
    const state = structuredClone(validReplicationState())
    state.sites!.secondary.storageClasses[0].poolID = ''

    expect(siteStorageClassesReady(state, 'primary')).toBe(true)
    expect(siteStorageClassesReady(state, 'secondary')).toBe(false)
  })
})

describe('storage artifact validation', () => {
  it('allows Continue without journals but requires both journals for Export', () => {
    const state = validReplicationState()

    expect(storageArtifactsValidForContinue(state)).toBe(true)
    expect(storageArtifactsValid(state)).toBe(false)
    expect(validateHrpc(state)).not.toBeNull()

    const withJournals: WizardState = {
      ...state,
      replication: {
        ...state.replication,
        storageSecrets: [
          {
            serial: '400001',
            url: 'https://192.0.2.10',
            user: 'maintenance',
            password: 'fixture-password',
            journal: '0',
          },
          {
            serial: '400002',
            url: 'https://192.0.2.11',
            user: 'maintenance',
            password: 'fixture-password',
            journal: '1',
          },
        ],
      },
    }

    expect(storageArtifactsValid(withJournals)).toBe(true)
  })

  it('allows Continue and Export when StorageClasses are off', () => {
    const state = filledState({ storageClassesEnabled: false })
    state.storageClasses[0].poolID = ''
    state.storageClasses[0].portID = ''

    expect(storageArtifactsValidForContinue(state)).toBe(true)
    expect(storageArtifactsValid(state)).toBe(true)
  })

  it('requires NVMe subsystem ID (and not Port ID) for NVMe/TCP', () => {
    const state = filledState()
    const nvme = {
      ...state.storageClasses[0],
      connectionType: 'nvme-tcp' as const,
      portID: '',
      nvmSubsystemID: '',
    }

    expect(validateStorageClass(nvme, { storageSystems: state.storageSystems })).toEqual(
      expect.objectContaining({ nvmSubsystemID: expect.any(String) }),
    )
    expect(validateStorageClass(nvme, { storageSystems: state.storageSystems })).not.toHaveProperty(
      'portID',
    )

    expect(
      validateStorageClass(
        { ...nvme, nvmSubsystemID: '1' },
        { storageSystems: state.storageSystems },
      ),
    ).toEqual({})
  })

  it('does not require serial, pool, or port on a VSP One SDS Block StorageClass', () => {
    const state = filledState()
    const sds = {
      ...state.storageClasses[0],
      kind: 'vsp-one-sds-block' as const,
      serialNumber: '',
      poolID: '',
      portID: '',
    }

    expect(validateStorageClass(sds, { storageSystems: state.storageSystems })).toEqual({})
  })
})

describe('GAD and stretched StorageClass constraints', () => {
  const gadSystems = [
    { family: 'vsp-5000-g-e-f' as const, stretchedRole: 'primary' as const },
    { family: 'vsp-one-block-20' as const, stretchedRole: 'secondary' as const },
  ]

  it('recognizes exactly one VSP primary and secondary as a GAD pair', () => {
    expect(hasGadPair(gadSystems)).toBe(true)
    expect(hasGadPair(gadSystems.slice(0, 1))).toBe(false)
    expect(
      hasGadPair([
        { family: 'vsp-one-sds-block', stretchedRole: 'primary' },
        { family: 'vsp-one-sds-block', stretchedRole: 'secondary' },
      ]),
    ).toBe(false)
  })

  it('offers stretched StorageClasses for a GAD pair', () => {
    expect(storageClassKindsForSystems(gadSystems)).toContain('stretched')
  })

  it('reports required stretched StorageClass fields', () => {
    const state = filledState()
    const stretched = {
      ...state.storageClasses[0],
      kind: 'stretched' as const,
      quorumID: '',
      copyGroupName: '',
      consistencyGroupId: '',
      primaryPoolID: '',
      primaryPortID: '',
      secondaryPoolID: '',
      secondaryPortID: '',
    }

    const errors = validateStorageClass(stretched, { storageSystems: state.storageSystems })

    expect(errors).toHaveProperty('quorumID')
    expect(errors).toHaveProperty('copyGroupName')
    expect(errors).toHaveProperty('consistencyGroupId')
    expect(errors).toHaveProperty('primaryPoolID')
    expect(errors).toHaveProperty('primaryPortID')
    expect(errors).toHaveProperty('secondaryPoolID')
    expect(errors).toHaveProperty('secondaryPortID')
  })

  it('derives stable package paths for stretched Secrets', () => {
    expect(stretchedSecretPackagePath('hitachi-csi-secret-stretched')).toBe(
      '01-storage/secret-stretched.yaml',
    )
    expect(stretchedSecretPackagePath('custom-gad')).toBe('01-storage/secret-custom-gad.yaml')
  })
})
