import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse } from 'yaml'
import {
  SC_FIELDS_SDS,
  SC_FIELDS_STANDARD,
  SC_FIELDS_STRETCHED,
} from '../catalog/parameters'
import type { StorageClassKind } from '../catalog/types'

export const UPSTREAM_SAMPLE_VERSION = 'v3.18.3'

export const CATALOG_ONLY_KEYS: Record<string, string> = {
  nvmSubsystemID: 'NVMe StorageClass; not in sc-sample.yaml',
  storageEfficiency: 'optional; not in sc-sample.yaml',
  storageEfficiencyMode: 'optional; not in sc-sample.yaml',
  copyPairName: 'optional stretched; not in sc-sample-stretched.yaml',
  retentionPeriod: 'immutable snapshots; not in volumesnapshotclass-sample.yaml',
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
