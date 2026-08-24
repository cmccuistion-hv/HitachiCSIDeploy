import { getSiteStorage, type SiteId } from './sites'
import type { MetricsConfig, StorageSystemConfig, WizardState } from './types'

export {
  applySiteMetricsToState,
  copyPrimarySiteMetricsToTopLevel,
  metricsForSite,
  metricsInstalledForSite,
  prometheusTargetForSite,
  resolvedFlattenedMetricsPvcStorageClassName,
  resolvedMetricsPvcStorageClassName,
  siteMetricsFromGlobal,
  withSiteMetrics,
} from './siteMetrics'

export type MetricsStorage = MetricsConfig['storages'][number]

export function metricsStoragesFromSystems(systems: StorageSystemConfig[]): MetricsStorage[] {
  return systems.map((sys) => ({
    serial: sys.serial,
    url: sys.url,
    user: sys.user,
    password: sys.password,
  }))
}

function hasCredentialData(storage: MetricsStorage): boolean {
  return Boolean(
    storage.serial.trim() || storage.url.trim() || storage.user.trim() || storage.password.trim(),
  )
}

export function filledMetricsStorages(storages: MetricsStorage[]): MetricsStorage[] {
  return storages.filter((storage) => storage.serial.trim() || storage.url.trim())
}

/**
 * Exporter credentials for the current (possibly site-flattened) wizard state.
 * Replication packages always use this site's storage systems so a leftover
 * primary copy in metrics.storages is not applied to the secondary cluster.
 */
export function resolvedMetricsStorages(state: WizardState): MetricsStorage[] {
  const fromSystems = filledMetricsStorages(metricsStoragesFromSystems(state.storageSystems || []))
  if (state.components.replication) return fromSystems
  if (state.metrics.storages.some(hasCredentialData)) {
    return filledMetricsStorages(state.metrics.storages)
  }
  return fromSystems
}

/** Values shown on the Performance Metrics step (includes empty rows). */
export function displayMetricsStorages(state: WizardState, site: SiteId = 'primary'): MetricsStorage[] {
  if (state.components.replication) {
    return metricsStoragesFromSystems(getSiteStorage(state, site).storageSystems)
  }
  if (state.metrics.storages.length) return state.metrics.storages
  return metricsStoragesFromSystems(state.storageSystems || [])
}
