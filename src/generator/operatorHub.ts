import type { WizardState } from '../catalog/types'

/** Certified Operators package for Hitachi Storage Plug-in for Containers */
export const HSPC_OLM_PACKAGE = 'hspc-operator'
export const HSPC_OLM_CHANNEL = 'stable'
export const HSPC_OLM_SOURCE = 'certified-operators'
export const HSPC_OLM_SOURCE_NS = 'openshift-marketplace'

export function generateOperatorHubNamespace(namespace: string): string {
  return `apiVersion: v1
kind: Namespace
metadata:
  name: ${namespace}
  labels:
    openshift.io/cluster-monitoring: "true"
`
}

export function generateOperatorGroup(namespace: string): string {
  return `apiVersion: operators.coreos.com/v1
kind: OperatorGroup
metadata:
  name: hspc-operator-group
  namespace: ${namespace}
spec:
  targetNamespaces:
  - ${namespace}
`
}

export function generateOperatorSubscription(namespace: string): string {
  return `apiVersion: operators.coreos.com/v1alpha1
kind: Subscription
metadata:
  name: ${HSPC_OLM_PACKAGE}
  namespace: ${namespace}
spec:
  channel: ${HSPC_OLM_CHANNEL}
  name: ${HSPC_OLM_PACKAGE}
  source: ${HSPC_OLM_SOURCE}
  sourceNamespace: ${HSPC_OLM_SOURCE_NS}
  installPlanApproval: Manual
`
}

/** OLM manifests for OpenShift/ROSA OperatorHub day-0 install (Manual approval). */
export function generateOperatorHubFiles(state: WizardState): {
  path: string
  content: string
  description: string
}[] {
  const ns = state.operatorNamespace
  return [
    {
      path: '02-driver/operatorhub-namespace.yaml',
      content: generateOperatorHubNamespace(ns),
      description: 'Namespace for CSI Driver operator (OwnNamespace)',
    },
    {
      path: '02-driver/operatorhub-operatorgroup.yaml',
      content: generateOperatorGroup(ns),
      description: 'OperatorGroup targeting the operator namespace',
    },
    {
      path: '02-driver/operatorhub-subscription.yaml',
      content: generateOperatorSubscription(ns),
      description: 'Subscription (certified-operators, Manual update approval)',
    },
  ]
}
