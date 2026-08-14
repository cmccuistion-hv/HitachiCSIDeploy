import { describe, expect, it } from 'vitest'
import {
  CATALOG_ONLY_KEYS,
  allowedStorageClassParameterKeys,
  assertAllowedKeys,
  sampleParameterKeys,
} from '../test/csiContract'

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
