import { describe, expect, it } from 'vitest'
import { filledReplicationState } from '../test/fixtures'
import {
  DEFAULT_PRIMARY_CLUSTER_NAME,
  DEFAULT_SECONDARY_CLUSTER_NAME,
  DR_REMOTE_KUBECONFIG_SECRET_NAME,
  resolvedDrClusterNames,
} from './remoteKubeconfig'

describe('resolvedDrClusterNames', () => {
  it('defaults to primary and secondary', () => {
    expect(resolvedDrClusterNames(filledReplicationState())).toEqual({
      primary: DEFAULT_PRIMARY_CLUSTER_NAME,
      secondary: DEFAULT_SECONDARY_CLUSTER_NAME,
    })
  })

  it('trims and falls back when empty', () => {
    const state = filledReplicationState({
      replication: { primaryClusterName: '  ', secondaryClusterName: ' dc2 ' },
    })
    expect(resolvedDrClusterNames(state)).toEqual({ primary: 'primary', secondary: 'dc2' })
  })
})

describe('DR secret constants', () => {
  it('names the in-cluster Secret remote-kubeconfig', () => {
    expect(DR_REMOTE_KUBECONFIG_SECRET_NAME).toBe('remote-kubeconfig')
  })
})
