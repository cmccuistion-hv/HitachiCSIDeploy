import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  createDefaultState,
  STORAGE_KEY,
  WIZARD_STATE_VERSION,
  type WizardState,
} from '../catalog/types'
import { PLATFORMS, coerceConnectionType, connectionsForStorageClassKind } from '../catalog/platforms'
import { fetchVersions, type VersionInfo } from '../services/versions'
import { STEPS_BASE } from './steps'

interface WizardContextValue {
  state: WizardState
  setState: React.Dispatch<React.SetStateAction<WizardState>>
  update: <K extends keyof WizardState>(key: K, value: WizardState[K]) => void
  patch: (partial: Partial<WizardState>) => void
  reset: () => void
  exportConfig: () => string
  importConfig: (json: string) => void
  versions: VersionInfo | null
  versionsLoading: boolean
  stepIndex: number
  setStepIndex: (i: number) => void
  visibleSteps: { id: string; title: string; description: string }[]
}

const WizardContext = createContext<WizardContextValue | null>(null)

function loadState(): WizardState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return createDefaultState()
    const parsed = JSON.parse(raw) as WizardState
    if (parsed.version !== WIZARD_STATE_VERSION) return createDefaultState()
    const merged = { ...createDefaultState(), ...parsed }
    // Deep-merge nested objects that may be missing from older saves
    merged.multipath = { ...createDefaultState().multipath, ...(parsed.multipath || {}) }
    merged.components = { ...createDefaultState().components, ...(parsed.components || {}) }
    merged.replication = {
      ...createDefaultState().replication,
      ...(parsed.replication || {}),
      primaryKubeconfig: undefined,
      secondaryKubeconfig: undefined,
    }
    // Migrate stale OpenShift default: CR must share OperatorHub namespace
    const plat = PLATFORMS[merged.platform]
    if (plat?.operatorHub && merged.driverNamespace === 'kube-system') {
      merged.driverNamespace = merged.operatorNamespace || 'hspc-operator-system'
      merged.operatorNamespace = merged.operatorNamespace || 'hspc-operator-system'
    }
    if (plat?.useOc && merged.multipath.enabled) {
      merged.multipath.includeMachineConfig = true
      merged.multipath.includeConf = true
    } else if (!plat?.useOc) {
      merged.multipath.includeMachineConfig = false
      merged.multipath.includeConf = true
    }
    // Coerce connection types against node environment + StorageClass kind limits
    const env = merged.nodeEnvironment || 'bare-metal'
    merged.nodeEnvironment = env
    merged.connectionType = coerceConnectionType(
      merged.connectionType,
      connectionsForStorageClassKind('standard', env),
    )
    merged.storageClasses = (merged.storageClasses || []).map((sc) => ({
      ...sc,
      connectionType: coerceConnectionType(
        sc.connectionType,
        connectionsForStorageClassKind(sc.kind, env),
      ),
    }))
    return merged
  } catch {
    return createDefaultState()
  }
}

export function WizardProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<WizardState>(loadState)
  const [stepIndex, setStepIndex] = useState(0)
  const [versions, setVersions] = useState<VersionInfo | null>(null)
  const [versionsLoading, setVersionsLoading] = useState(true)

  useEffect(() => {
    const toStore = {
      ...state,
      replication: {
        ...state.replication,
        // Never persist kubeconfig credentials in localStorage
        primaryKubeconfig: undefined,
        secondaryKubeconfig: undefined,
      },
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toStore))
  }, [state])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setVersionsLoading(true)
      const v = await fetchVersions()
      if (cancelled) return
      setVersions(v)
      setState((s) => ({
        ...s,
        versions: {
          driver: s.versions.driver || v.latest.hspc,
          replication: s.versions.replication || v.latest.hrpc,
          metrics: s.versions.metrics || v.latest.hspp,
        },
      }))
      setVersionsLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // Sync dependent flags when platform/components change
  useEffect(() => {
    const plat = PLATFORMS[state.platform]
    setState((s) => {
      let changed = false
      const next = { ...s }
      if (!plat.supportsConsolePlugin && s.components.consolePlugin) {
        next.components = { ...s.components, consolePlugin: false }
        changed = true
      }
      if (s.components.consolePlugin && !s.components.metrics) {
        next.components = { ...next.components, metrics: true }
        changed = true
      }
      // DR Operator is always included with Replication
      if (s.components.replication && !s.components.disasterRecovery) {
        next.components = { ...next.components, disasterRecovery: true }
        next.replication = { ...next.replication, disasterRecovery: true }
        changed = true
      }
      if (!s.components.replication && s.components.disasterRecovery) {
        next.components = { ...next.components, disasterRecovery: false }
        next.replication = { ...next.replication, disasterRecovery: false }
        changed = true
      }
      return changed ? next : s
    })
  }, [
    state.platform,
    state.components.consolePlugin,
    state.components.disasterRecovery,
    state.components.metrics,
    state.components.replication,
  ])

  const visibleSteps = useMemo(() => {
    return STEPS_BASE.filter((step) => {
      if (step.id === 'replication') return state.components.replication
      if (step.id === 'metrics') return state.components.metrics
      if (step.id === 'console') {
        return state.components.consolePlugin && PLATFORMS[state.platform].supportsConsolePlugin
      }
      return true
    })
  }, [state.components, state.platform])

  useEffect(() => {
    if (stepIndex >= visibleSteps.length) setStepIndex(Math.max(0, visibleSteps.length - 1))
  }, [visibleSteps.length, stepIndex])

  const update = useCallback(<K extends keyof WizardState>(key: K, value: WizardState[K]) => {
    setState((s) => ({ ...s, [key]: value }))
  }, [])

  const patch = useCallback((partial: Partial<WizardState>) => {
    setState((s) => ({ ...s, ...partial }))
  }, [])

  const reset = useCallback(() => {
    const fresh = createDefaultState()
    if (versions) {
      fresh.versions = {
        driver: versions.latest.hspc,
        replication: versions.latest.hrpc,
        metrics: versions.latest.hspp,
      }
    }
    setState(fresh)
    setStepIndex(0)
  }, [versions])

  const exportConfig = useCallback(() => {
    const safe = {
      ...state,
      replication: {
        ...state.replication,
        primaryKubeconfig: undefined,
        secondaryKubeconfig: undefined,
      },
    }
    return JSON.stringify(safe, null, 2)
  }, [state])

  const importConfig = useCallback((json: string) => {
    const parsed = JSON.parse(json) as WizardState
    setState({ ...createDefaultState(), ...parsed, version: WIZARD_STATE_VERSION })
  }, [])

  const value: WizardContextValue = {
    state,
    setState,
    update,
    patch,
    reset,
    exportConfig,
    importConfig,
    versions,
    versionsLoading,
    stepIndex,
    setStepIndex,
    visibleSteps: visibleSteps.map((s) => ({ id: s.id, title: s.title, description: s.description })),
  }

  return <WizardContext.Provider value={value}>{children}</WizardContext.Provider>
}

export function useWizard() {
  const ctx = useContext(WizardContext)
  if (!ctx) throw new Error('useWizard must be used within WizardProvider')
  return ctx
}
