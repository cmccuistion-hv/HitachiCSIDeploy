import { describe, expect, it, vi } from 'vitest'
import type { StorageClassConfig } from '../catalog/types'
import { filledState } from '../test/fixtures'
import {
  CATALOG_ONLY_KEYS,
  SECRET_PORT_MIGRATION_KEYS,
  allowedSecretKeys,
  allowedStorageClassParameterKeys,
  assertAllowedKeys,
  assertCsiContract,
  assertForbiddenKeys,
  assertNoPortMigrationSecretKeys,
  assertRequiredKeys,
  assertSecretCoherence,
  catalogKeysMissingFromSamples,
  forbiddenStorageClassParameterKeys,
  requiredStorageClassParameterKeys,
  sampleParameterKeys,
} from '../test/csiContract'
import { generateAll } from './yaml'

vi.mock('../services/versions', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/versions')>()
  return {
    ...actual,
    fetchFirstAvailable: vi.fn(async () =>
      ['apiVersion: v1', 'kind: ConfigMap', 'metadata:', '  name: mocked-upstream'].join('\n'),
    ),
  }
})

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

describe('catalog vs sample names', () => {
  it('every catalog Hitachi key is in a sample or CATALOG_ONLY_KEYS', () => {
    expect(catalogKeysMissingFromSamples()).toEqual([])
  })
})

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

describe('Secret contract', () => {
  it('allows catalog standard secret keys and rejects port migration', () => {
    expect(allowedSecretKeys('standard').has('url')).toBe(true)
    expect(allowedSecretKeys('standard').has('user')).toBe(true)
    expect(allowedSecretKeys('standard').has('password')).toBe(true)
    expect(() => assertNoPortMigrationSecretKeys('secret.yaml', ['url', 'user'])).not.toThrow()
    expect(() => assertNoPortMigrationSecretKeys('secret.yaml', ['portIP'])).toThrow(
      /secret.yaml: Secret must not emit port-migration key "portIP"/,
    )
    expect(SECRET_PORT_MIGRATION_KEYS).toContain('portIP')
  })

  it('matches stringData values to wizard state', () => {
    expect(() =>
      assertSecretCoherence(
        'secret.yaml',
        { stringData: { primarySerial: '400001' } },
        { primarySerial: '400001' },
      ),
    ).not.toThrow()
    expect(() =>
      assertSecretCoherence(
        'secret.yaml',
        { stringData: { primarySerial: '999' } },
        { primarySerial: '400001' },
      ),
    ).toThrow(/secret.yaml: primarySerial "999" !== wizard state/)
  })

  it('does not put the password in the error', () => {
    expect(() =>
      assertSecretCoherence(
        'secret.yaml',
        { stringData: { password: 'wrong' } },
        { password: 'fixture-password' },
      ),
    ).toThrow(/secret.yaml: password does not match wizard state/)
    expect(() =>
      assertSecretCoherence(
        'secret.yaml',
        { stringData: { password: 'wrong' } },
        { password: 'fixture-password' },
      ),
    ).not.toThrow(/fixture-password/)
  })
})

describe('assertCsiContract on generateAll', () => {
  it('accepts classic OpenShift FC', async () => {
    const state = filledState()
    const files = await generateAll(state)
    expect(() => assertCsiContract(files, state)).not.toThrow()
  })
})
