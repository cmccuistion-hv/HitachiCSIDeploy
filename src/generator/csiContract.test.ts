import { describe, expect, it } from 'vitest'
import type { StorageClassConfig } from '../catalog/types'
import {
  CATALOG_ONLY_KEYS,
  allowedStorageClassParameterKeys,
  assertAllowedKeys,
  assertForbiddenKeys,
  assertRequiredKeys,
  forbiddenStorageClassParameterKeys,
  requiredStorageClassParameterKeys,
  sampleParameterKeys,
} from '../test/csiContract'

function sc(partial: Partial<StorageClassConfig>): StorageClassConfig {
  return {
    id: 'sc-1',
    kind: 'standard',
    name: 'hitachi-csi',
    connectionType: 'fc',
    secretName: 'hitachi-csi-secret',
    secretNamespace: 'hspc-operator-system',
    reclaimPolicy: 'Delete',
    volumeBindingMode: 'Immediate',
    allowVolumeExpansion: true,
    ...partial,
  }
}

describe('allowed StorageClass parameter keys', () => {
  it('accepts keys from the standard sample', () => {
    const allowed = allowedStorageClassParameterKeys('standard')
    expect(() =>
      assertAllowedKeys('sc.yaml', ['serialNumber', 'poolID', 'portID', 'connectionType'], allowed),
    ).not.toThrow()
  })

  it('rejects a misspelled Hitachi key', () => {
    const allowed = allowedStorageClassParameterKeys('standard')
    expect(() => assertAllowedKeys('sc.yaml', ['nvmSubsystemId'], allowed)).toThrow(
      /sc.yaml: unknown parameter "nvmSubsystemId" \(not in sample or catalog\)/,
    )
  })

  it('allows catalog-only nvmSubsystemID on standard', () => {
    const allowed = allowedStorageClassParameterKeys('standard')
    expect(allowed.has('nvmSubsystemID')).toBe(true)
    expect(CATALOG_ONLY_KEYS.nvmSubsystemID).toMatch(/NVMe/)
  })

  it('standard sample does not include nvmSubsystemID', () => {
    expect(sampleParameterKeys('sc-sample.yaml')).not.toContain('nvmSubsystemID')
  })
})

describe('required and forbidden StorageClass parameters', () => {
  it('requires portID and forbids nvmSubsystemID for FC', () => {
    const cfg = sc({ connectionType: 'fc' })
    expect(requiredStorageClassParameterKeys(cfg)).toEqual(
      expect.arrayContaining(['connectionType', 'serialNumber', 'poolID', 'portID']),
    )
    expect(forbiddenStorageClassParameterKeys(cfg)).toEqual(
      expect.arrayContaining(['nvmSubsystemID', 'storageType', 'replicationType']),
    )
  })

  it('requires nvmSubsystemID and forbids portID for NVMe/TCP', () => {
    const cfg = sc({ connectionType: 'nvme-tcp' })
    expect(requiredStorageClassParameterKeys(cfg)).toContain('nvmSubsystemID')
    expect(requiredStorageClassParameterKeys(cfg)).not.toContain('portID')
    expect(forbiddenStorageClassParameterKeys(cfg)).toContain('portID')
  })

  it('forbids serial/pool/port on SDS Block', () => {
    const cfg = sc({ kind: 'vsp-one-sds-block', connectionType: 'iscsi' })
    expect(requiredStorageClassParameterKeys(cfg)).toEqual(
      expect.arrayContaining(['storageType', 'connectionType']),
    )
    expect(forbiddenStorageClassParameterKeys(cfg)).toEqual(
      expect.arrayContaining(['serialNumber', 'poolID', 'portID', 'nvmSubsystemID']),
    )
  })

  it('throws a path-qualified missing-key error', () => {
    expect(() =>
      assertRequiredKeys('sc.yaml', { connectionType: 'nvme-tcp' }, ['nvmSubsystemID']),
    ).toThrow(/sc.yaml: .*nvmSubsystemID/)
  })

  it('throws a path-qualified forbidden-key error', () => {
    expect(() =>
      assertForbiddenKeys('sc.yaml', { portID: 'CL1-A' }, ['portID'], 'NVMe/TCP'),
    ).toThrow(/sc.yaml: NVMe\/TCP must not emit portID/)
  })
})
