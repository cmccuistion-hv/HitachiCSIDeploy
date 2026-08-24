import { describe, expect, it } from 'vitest'
import { filledReplicationState, filledState } from '../test/fixtures'
import { buildReviewTopology } from './reviewTopology'
import type { StorageSystemConfig } from './types'

function extraArray(partial: Partial<StorageSystemConfig> & Pick<StorageSystemConfig, 'id' | 'name' | 'serial'>): StorageSystemConfig {
  return {
    ...filledState().storageSystems[0],
    url: 'https://192.0.2.11',
    csiSecretName: 'hitachi-csi-secret-2',
    ...partial,
  }
}

function gadState(extra?: StorageSystemConfig[]) {
  const base = filledState()
  const secondary = extraArray({ id: 'storage-2', name: 'secondary', serial: '400002' })
  return filledState({
    storageSystems: [base.storageSystems[0], secondary, ...(extra ?? [])],
    storageClasses: [
      {
        ...base.storageClasses[0],
        kind: 'stretched',
        name: 'hitachi-csi-stretched',
        storageSystemId: undefined,
        serialNumber: '',
        primaryStorageSystemId: 'storage-1',
        secondaryStorageSystemId: 'storage-2',
        primaryPoolID: '0',
        secondaryPoolID: '1',
        stretchedSecretName: 'hitachi-csi-secret-stretched',
      },
    ],
  })
}

describe('buildReviewTopology', () => {
  it('shows one array card for a single-array site', () => {
    const model = buildReviewTopology(filledState(), [])
    expect(model.sites).toHaveLength(1)
    expect(model.sites[0].arrays).toHaveLength(1)
    expect(model.sites[0].arrays[0].title).toContain('400001')
    expect(model.sites[0].arrays[0].pools[0]?.title).toBe('Pool 0')
  })

  it('shows both GAD arrays with their own pools', () => {
    const model = buildReviewTopology(gadState(), [])
    const site = model.sites[0]
    expect(site.arrays.map((a) => a.title)).toEqual(['Array 400001', 'Array 400002'])
    expect(site.arrays[0].pools.map((p) => p.title)).toEqual(['Pool 0'])
    expect(site.arrays[0].pools[0].extra).toMatch(/GAD primary/)
    expect(site.arrays[1].pools.map((p) => p.title)).toEqual(['Pool 1'])
    expect(site.arrays[1].pools[0].extra).toMatch(/GAD secondary/)
    expect(site.gadLinks).toEqual([
      { id: expect.any(String), fromSystemId: 'storage-1', toSystemId: 'storage-2' },
    ])
    expect(new Set(site.arrays.map((a) => a.id)).size).toBe(2)
    expect(site.arrays[0].pools[0].id).not.toBe(site.arrays[1].pools[0].id)
  })

  it('still lists an unused third array', () => {
    const unused = extraArray({
      id: 'storage-3',
      name: 'unused',
      serial: '400003',
      url: 'https://192.0.2.12',
      csiSecretName: 'hitachi-csi-secret-3',
    })
    const site = buildReviewTopology(gadState([unused]), []).sites[0]
    expect(site.arrays.map((a) => a.title)).toEqual(['Array 400001', 'Array 400002', 'Array 400003'])
    expect(site.arrays[2].pools).toEqual([])
  })

  it('shows a site-local extra array next to the Replication array', () => {
    const state = filledReplicationState()
    const extra = extraArray({
      id: 'storage-local',
      name: 'local',
      serial: '400099',
      url: 'https://192.0.2.99',
      csiSecretName: 'hitachi-csi-secret-local',
    })
    state.sites = {
      ...state.sites!,
      primary: {
        ...state.sites!.primary,
        storageSystems: [...state.sites!.primary.storageSystems, extra],
      },
    }
    const primary = buildReviewTopology(state, []).sites[0]
    expect(primary.arrays.map((a) => a.title)).toEqual(
      expect.arrayContaining(['Array 400001', 'Array 400099']),
    )
    expect(primary.arrays).toHaveLength(2)
  })

  it('points the test volume at the StorageClass array', () => {
    const site = buildReviewTopology(filledState(), []).sites[0]
    expect(site.testVolumeArrayIds).toEqual(['storage-1'])
  })

  it('points the test volume at both GAD arrays', () => {
    const site = buildReviewTopology(gadState(), []).sites[0]
    expect(site.testVolumeArrayIds).toEqual(['storage-1', 'storage-2'])
  })
})
