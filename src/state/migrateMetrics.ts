import type { MetricsConfig } from '../catalog/types'

/** Normalize persisted/imported metrics blobs onto the current MetricsConfig shape. */
export function migrateMetricsConfig(raw: unknown, defaults: MetricsConfig): MetricsConfig {
  const incoming = (raw && typeof raw === 'object' ? raw : {}) as Partial<MetricsConfig> & {
    deployTestStack?: boolean
  }
  const { deployTestStack, ...rest } = incoming
  const merged: MetricsConfig = { ...defaults, ...rest }

  if (typeof merged.deployPrometheus !== 'boolean' || typeof merged.deployGrafana !== 'boolean') {
    const both = deployTestStack !== false // undefined or true → both on; explicit false → both off
    merged.deployPrometheus = typeof merged.deployPrometheus === 'boolean' ? merged.deployPrometheus : both
    merged.deployGrafana = typeof merged.deployGrafana === 'boolean' ? merged.deployGrafana : both
  }

  return merged
}
