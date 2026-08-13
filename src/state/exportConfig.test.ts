import { describe, expect, it } from 'vitest'
import { filledState } from '../test/fixtures'
import { exportConfigJson } from './exportConfig'

describe('exportConfigJson', () => {
  it('omits kubeconfig values from exported state', () => {
    const state = filledState()
    state.replication.primaryKubeconfig = 'primary-kubeconfig'
    state.replication.secondaryKubeconfig = 'secondary-kubeconfig'

    const exported = JSON.parse(exportConfigJson(state))

    expect(exported.replication.primaryKubeconfig).toBeUndefined()
    expect(exported.replication.secondaryKubeconfig).toBeUndefined()
  })
})

describe('filledState', () => {
  it('provides a configured storage system and StorageClass', () => {
    const state = filledState()

    expect(state.storageSystems[0].family).toBe('vsp-5000-g-e-f')
    expect(state.storageSystems[0].serial).toBe('400001')
    expect(state.storageClasses[0].poolID).toBe('0')
  })

  it('deep-merges nested object overrides', () => {
    const state = filledState({ components: { replication: true } })

    expect(state.components.driver).toBe(true)
    expect(state.components.replication).toBe(true)
  })

  it('replaces nested array overrides', () => {
    const oneSystem = filledState().storageSystems[0]
    const state = filledState({ storageSystems: [oneSystem] })

    expect(state.storageSystems).toEqual([oneSystem])
    expect(state.storageSystems).toHaveLength(1)
  })
})
