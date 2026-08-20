import { describe, expect, it } from 'vitest'
import {
  pickStorageClassName,
  standardSecretNameForSystem,
} from './sites'
import type { StorageClassConfig, StorageSystemConfig } from './types'

function sys(partial: Partial<StorageSystemConfig> & Pick<StorageSystemConfig, 'id' | 'name'>): StorageSystemConfig {
  return {
    serial: '',
    url: '',
    user: '',
    password: '',
    ...partial,
  }
}

function sc(partial: Partial<StorageClassConfig> & Pick<StorageClassConfig, 'id' | 'name'>): StorageClassConfig {
  return {
    kind: 'standard',
    connectionType: 'iscsi',
    secretName: 'hitachi-csi-secret',
    secretNamespace: 'hspc-operator-system',
    reclaimPolicy: 'Delete',
    volumeBindingMode: 'Immediate',
    allowVolumeExpansion: true,
    ...partial,
  }
}

describe('pickStorageClassName', () => {
  it('keeps the saved name when it exists on this site', () => {
    expect(
      pickStorageClassName(
        [
          sc({ id: 'a', name: 'hitachi-csi-b85', isDefault: true }),
          sc({ id: 'b', name: 'hitachi-csi-dr' }),
        ],
        'hitachi-csi-b85',
      ),
    ).toBe('hitachi-csi-b85')
  })

  it('falls back to this site’s default when the saved name is from the other site', () => {
    expect(
      pickStorageClassName(
        [
          sc({ id: 'a', name: 'hitachi-csi-dr' }),
          sc({ id: 'b', name: 'sc-b28', isDefault: true }),
        ],
        'hitachi-csi-b85',
      ),
    ).toBe('sc-b28')
  })
})

describe('standardSecretNameForSystem', () => {
  it('uses StorageClass secretName for a single array even when the system is named secondary', () => {
    const systems = [sys({ id: 'storage-1-secondary', name: 'secondary', serial: '810138' })]
    const classes = [
      sc({ id: 'sc-1', name: 'hitachi-csi-dr', secretName: 'hitachi-csi-secret' }),
      sc({ id: 'sc-2', name: 'sc-b28', secretName: 'hitachi-csi-secret', isDefault: true }),
    ]
    expect(standardSecretNameForSystem(systems[0], systems, classes)).toBe('hitachi-csi-secret')
  })

  it('keeps unique Secret names for a second GAD array with no standard StorageClass', () => {
    const systems = [
      sys({ id: 'storage-1', name: 'primary', serial: '400001', stretchedRole: 'primary' }),
      sys({ id: 'storage-2', name: 'secondary', serial: '400002', stretchedRole: 'secondary' }),
    ]
    const classes = [
      sc({
        id: 'sc-1',
        name: 'hitachi-csi',
        kind: 'stretched',
        secretName: 'hitachi-csi-secret',
        stretchedSecretName: 'hitachi-csi-secret-stretched',
      }),
    ]
    expect(standardSecretNameForSystem(systems[0], systems, classes)).toBe('hitachi-csi-secret')
    expect(standardSecretNameForSystem(systems[1], systems, classes)).toBe('hitachi-csi-secret-secondary')
  })
})
