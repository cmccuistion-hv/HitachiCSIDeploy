import { createDefaultState, type WizardState } from '../catalog/types'

type NestedObjectKey =
  | 'components'
  | 'multipath'
  | 'replication'
  | 'snapshotClass'
  | 'metrics'
  | 'consolePlugin'
  | 'quickstart'
  | 'versions'

type FilledStateOverrides = Partial<Omit<WizardState, NestedObjectKey>> & {
  [Key in NestedObjectKey]?: Partial<WizardState[Key]>
}

export function filledState(overrides: FilledStateOverrides = {}): WizardState {
  const base = createDefaultState()
  const state: WizardState = {
    ...base,
    storageSystems: [
      {
        ...base.storageSystems[0],
        family: 'vsp-5000-g-e-f',
        serial: '400001',
        url: 'https://192.0.2.10',
        user: 'maintenance',
        password: 'fixture-password',
      },
    ],
    storageClasses: [
      {
        ...base.storageClasses[0],
        name: 'hitachi-csi',
        connectionType: 'fc',
        poolID: '0',
        portID: 'CL1-A',
        serialNumber: '400001',
      },
    ],
  }

  return {
    ...state,
    ...overrides,
    components: { ...state.components, ...overrides.components },
    multipath: { ...state.multipath, ...overrides.multipath },
    replication: { ...state.replication, ...overrides.replication },
    snapshotClass: { ...state.snapshotClass, ...overrides.snapshotClass },
    metrics: { ...state.metrics, ...overrides.metrics },
    consolePlugin: { ...state.consolePlugin, ...overrides.consolePlugin },
    quickstart: { ...state.quickstart, ...overrides.quickstart },
    versions: { ...state.versions, ...overrides.versions },
  }
}
