import type { WizardState } from '../catalog/types'

export function exportConfigJson(state: WizardState): string {
  const safe = {
    ...state,
    replication: {
      ...state.replication,
      primaryKubeconfig: undefined,
      secondaryKubeconfig: undefined,
    },
  }

  return JSON.stringify(safe, null, 2)
}
