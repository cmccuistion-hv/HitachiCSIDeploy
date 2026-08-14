import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse } from 'yaml'
import {
  SC_FIELDS_SDS,
  SC_FIELDS_STANDARD,
  SC_FIELDS_STRETCHED,
  SECRET_FIELDS_STANDARD,
  SECRET_FIELDS_STRETCHED,
} from '../catalog/parameters'
import { CONNECTION_TYPES } from '../catalog/platforms'
import type { StorageClassConfig, StorageClassKind } from '../catalog/types'

export const UPSTREAM_SAMPLE_VERSION = 'v3.18.3'

export const CATALOG_ONLY_KEYS: Record<string, string> = {
  nvmSubsystemID: 'NVMe StorageClass; not in sc-sample.yaml',
  storageEfficiency: 'optional; not in sc-sample.yaml',
  storageEfficiencyMode: 'optional; not in sc-sample.yaml',
  copyPairName: 'optional stretched; not in sc-sample-stretched.yaml',
  retentionPeriod: 'immutable snapshots; not in volumesnapshotclass-sample.yaml',
  resourceGroupID: 'optional; not in secret-sample.yaml',
}

export const SECRET_PORT_MIGRATION_KEYS = [
  'portID',
  'portIP',
  'primaryPortID',
  'secondaryPortID',
  'primaryPortIP',
  'secondaryPortIP',
] as const

const CSI_PARAM_KEYS = [
  'csi.storage.k8s.io/fstype',
  'csi.storage.k8s.io/node-publish-secret-name',
  'csi.storage.k8s.io/node-publish-secret-namespace',
  'csi.storage.k8s.io/provisioner-secret-name',
  'csi.storage.k8s.io/provisioner-secret-namespace',
  'csi.storage.k8s.io/controller-publish-secret-name',
  'csi.storage.k8s.io/controller-publish-secret-namespace',
  'csi.storage.k8s.io/node-stage-secret-name',
  'csi.storage.k8s.io/node-stage-secret-namespace',
  'csi.storage.k8s.io/controller-expand-secret-name',
  'csi.storage.k8s.io/controller-expand-secret-namespace',
] as const

const samplesDir = join(
  dirname(fileURLToPath(import.meta.url)),
  'upstream-samples',
  UPSTREAM_SAMPLE_VERSION,
)

const SAMPLE_FOR_KIND: Record<StorageClassKind, string> = {
  standard: 'sc-sample.yaml',
  stretched: 'sc-sample-stretched.yaml',
  'stretched-adr': 'sc-sample-stretched-adr.yaml',
  'vsp-one-sds-block': 'sc-sample-vsp-one-sds-block.yaml',
}

const UI_ONLY_SC_KEYS = new Set([
  'name',
  'reclaimPolicy',
  'volumeBindingMode',
  'allowVolumeExpansion',
  'virtualStorageSerialNumber',
])

export function sampleParameterKeys(sampleFile: string): string[] {
  const doc = parse(readFileSync(join(samplesDir, sampleFile), 'utf8')) as {
    parameters?: Record<string, unknown>
  }
  return Object.keys(doc.parameters ?? {})
}

function catalogKeyInSample(catalogKey: string, sampleKeys: string[]): boolean {
  if (catalogKey === 'fstype') return sampleKeys.includes('csi.storage.k8s.io/fstype')
  return sampleKeys.includes(catalogKey)
}

function missingCatalogKeysFromSample(
  label: string,
  fields: { key: string }[],
  sampleFile: string,
): string[] {
  const sampleKeys = sampleParameterKeys(sampleFile)
  const missing: string[] = []
  for (const field of fields) {
    const key = field.key
    if (UI_ONLY_SC_KEYS.has(key)) continue
    if (CATALOG_ONLY_KEYS[key]) continue
    if (!catalogKeyInSample(key, sampleKeys)) missing.push(`${label}: ${key}`)
  }
  return missing
}

function missingSecretCatalogKeys(
  label: string,
  fields: { key: string }[],
  sampleFile: string,
): string[] {
  const sample = parse(readFileSync(join(samplesDir, sampleFile), 'utf8')) as {
    data?: Record<string, string>
    stringData?: Record<string, string>
  }
  const sampleKeys = secretKeys(sample)
  const missing: string[] = []
  for (const field of fields) {
    const key = field.key
    if (CATALOG_ONLY_KEYS[key]) continue
    if (!sampleKeys.includes(key)) missing.push(`${label}: ${key}`)
  }
  return missing
}

export function catalogKeysMissingFromSamples(): string[] {
  return [
    ...missingCatalogKeysFromSample('standard SC', SC_FIELDS_STANDARD, 'sc-sample.yaml'),
    ...missingCatalogKeysFromSample('stretched SC', SC_FIELDS_STRETCHED, 'sc-sample-stretched.yaml'),
    ...missingCatalogKeysFromSample(
      'stretched-adr SC',
      SC_FIELDS_STRETCHED,
      'sc-sample-stretched-adr.yaml',
    ),
    ...missingCatalogKeysFromSample(
      'SDS SC',
      SC_FIELDS_SDS,
      'sc-sample-vsp-one-sds-block.yaml',
    ),
    ...missingSecretCatalogKeys('standard Secret', SECRET_FIELDS_STANDARD, 'secret-sample.yaml'),
    ...missingSecretCatalogKeys(
      'stretched Secret',
      SECRET_FIELDS_STRETCHED,
      'secret-sample-stretched.yaml',
    ),
  ]
}

function catalogParameterKeys(kind: StorageClassKind): string[] {
  const fields =
    kind === 'vsp-one-sds-block'
      ? SC_FIELDS_SDS
      : kind === 'stretched' || kind === 'stretched-adr'
        ? SC_FIELDS_STRETCHED
        : SC_FIELDS_STANDARD
  return fields.map((field) => field.key).filter((key) => !UI_ONLY_SC_KEYS.has(key))
}

export function allowedStorageClassParameterKeys(kind: StorageClassKind): Set<string> {
  const keys = new Set<string>([
    ...sampleParameterKeys(SAMPLE_FOR_KIND[kind]),
    ...catalogParameterKeys(kind),
    ...Object.keys(CATALOG_ONLY_KEYS),
    ...CSI_PARAM_KEYS,
  ])
  if (kind === 'vsp-one-sds-block') keys.add('storageType')
  if (kind === 'stretched' || kind === 'stretched-adr') keys.add('replicationType')
  keys.add('connectionType')
  if (catalogParameterKeys(kind).includes('fstype') || kind === 'vsp-one-sds-block') {
    keys.add('csi.storage.k8s.io/fstype')
  }
  return keys
}

export function assertAllowedKeys(path: string, emitted: string[], allowed: Set<string>): void {
  for (const key of emitted) {
    if (!allowed.has(key)) {
      throw new Error(`${path}: unknown parameter "${key}" (not in sample or catalog)`)
    }
  }
}

export function requiredStorageClassParameterKeys(sc: StorageClassConfig): string[] {
  if (sc.kind === 'vsp-one-sds-block') return ['storageType', 'connectionType']
  if (sc.kind === 'stretched' || sc.kind === 'stretched-adr') {
    const fromCatalog = SC_FIELDS_STRETCHED.filter((field) => field.required)
      .map((field) => field.key)
      .filter((key) => key !== 'name' && key !== 'virtualStorageSerialNumber')
    return ['connectionType', 'replicationType', ...fromCatalog]
  }
  const conn = CONNECTION_TYPES.find((item) => item.id === sc.connectionType)
  const keys = ['connectionType', 'serialNumber', 'poolID']
  if (conn?.needsPortId) keys.push('portID')
  if (conn?.needsNvmSubsystem) keys.push('nvmSubsystemID')
  return keys
}

export function forbiddenStorageClassParameterKeys(sc: StorageClassConfig): string[] {
  const stretchedKeys = [
    'replicationType',
    'quorumID',
    'copyGroupName',
    'consistencyGroupId',
    'primaryPoolID',
    'primaryPortID',
    'secondaryPoolID',
    'secondaryPortID',
  ]
  if (sc.kind === 'vsp-one-sds-block') {
    return ['serialNumber', 'poolID', 'portID', 'nvmSubsystemID', ...stretchedKeys]
  }
  if (sc.kind === 'stretched' || sc.kind === 'stretched-adr') {
    return ['serialNumber', 'poolID', 'portID', 'nvmSubsystemID', 'storageType']
  }
  const conn = CONNECTION_TYPES.find((item) => item.id === sc.connectionType)
  const keys = ['storageType', ...stretchedKeys]
  if (conn?.needsPortId) keys.push('nvmSubsystemID')
  if (conn?.needsNvmSubsystem) keys.push('portID')
  return keys
}

export function assertRequiredKeys(
  path: string,
  params: Record<string, unknown>,
  required: string[],
  reason = 'this StorageClass',
): void {
  for (const key of required) {
    const value = params[key]
    if (value === undefined || value === null || String(value).trim() === '') {
      throw new Error(`${path}: ${reason} requires ${key}`)
    }
  }
}

export function assertForbiddenKeys(
  path: string,
  params: Record<string, unknown>,
  forbidden: string[],
  reason: string,
): void {
  for (const key of forbidden) {
    if (params[key] !== undefined) {
      throw new Error(`${path}: ${reason} must not emit ${key}`)
    }
  }
}

export function secretKeys(doc: {
  data?: Record<string, string>
  stringData?: Record<string, string>
}): string[] {
  return [...Object.keys(doc.data ?? {}), ...Object.keys(doc.stringData ?? {})]
}

export function allowedSecretKeys(kind: 'standard' | 'stretched'): Set<string> {
  const fields = kind === 'stretched' ? SECRET_FIELDS_STRETCHED : SECRET_FIELDS_STANDARD
  const fromCatalog = fields.map((field) => field.key)
  const sampleFile = kind === 'stretched' ? 'secret-sample-stretched.yaml' : 'secret-sample.yaml'
  const sample = parse(readFileSync(join(samplesDir, sampleFile), 'utf8')) as {
    data?: Record<string, string>
    stringData?: Record<string, string>
  }
  return new Set([...fromCatalog, ...secretKeys(sample)])
}

export function assertNoPortMigrationSecretKeys(path: string, keys: string[]): void {
  for (const key of keys) {
    if ((SECRET_PORT_MIGRATION_KEYS as readonly string[]).includes(key)) {
      throw new Error(`${path}: Secret must not emit port-migration key "${key}"`)
    }
  }
}

function decodeSecretValue(
  doc: { data?: Record<string, string>; stringData?: Record<string, string> },
  key: string,
): string | undefined {
  if (doc.stringData?.[key] !== undefined) return doc.stringData[key]
  if (doc.data?.[key] !== undefined) {
    return Buffer.from(doc.data[key], 'base64').toString('utf8')
  }
  return undefined
}

const PASSWORD_KEYS = new Set(['password', 'primaryPassword', 'secondaryPassword'])

export function assertSecretCoherence(
  path: string,
  doc: { data?: Record<string, string>; stringData?: Record<string, string> },
  expected: Record<string, string>,
): void {
  for (const [key, want] of Object.entries(expected)) {
    const actual = decodeSecretValue(doc, key)
    if (actual !== want) {
      if (PASSWORD_KEYS.has(key)) {
        throw new Error(`${path}: ${key} does not match wizard state`)
      }
      throw new Error(`${path}: ${key} "${actual ?? ''}" !== wizard state`)
    }
  }
}

export function assertSecretEmittedKeys(
  path: string,
  keys: string[],
  kind: 'standard' | 'stretched',
): void {
  const catalog = new Set(
    (kind === 'stretched' ? SECRET_FIELDS_STRETCHED : SECRET_FIELDS_STANDARD).map(
      (field) => field.key,
    ),
  )
  for (const key of keys) {
    if (!catalog.has(key)) {
      throw new Error(`${path}: unknown parameter "${key}" (not in sample or catalog)`)
    }
  }
  assertNoPortMigrationSecretKeys(path, keys)
}
