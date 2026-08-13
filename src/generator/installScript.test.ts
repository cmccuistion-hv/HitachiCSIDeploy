import { describe, expect, it } from 'vitest'
import { filledState } from '../test/fixtures'
import { generateInstallScript, type GeneratedFile } from './yaml'

function yamlFile(path: string): GeneratedFile {
  return {
    path,
    content: 'apiVersion: v1',
    description: path,
    group: 'driver',
  }
}

describe('generateInstallScript', () => {
  it('installs and approves the OpenShift OperatorHub subscription', () => {
    const script = generateInstallScript(filledState(), [
      yamlFile('02-driver/operatorhub-namespace.yaml'),
      yamlFile('02-driver/operatorhub-operatorgroup.yaml'),
      yamlFile('02-driver/operatorhub-subscription.yaml'),
      yamlFile('02-driver/hspc-cr.yaml'),
    ])

    expect(script).toContain('CMD="oc"')
    expect(script).toContain('apply "02-driver/operatorhub-subscription.yaml"')
    expect(script).toContain('approve_installplan')
    expect(script).toContain('wait_csv_succeeded')
  })

  it('skips day-0 InstallPlan approval when the operator CSV already succeeded', () => {
    const script = generateInstallScript(filledState(), [
      yamlFile('02-driver/operatorhub-namespace.yaml'),
      yamlFile('02-driver/operatorhub-operatorgroup.yaml'),
      yamlFile('02-driver/operatorhub-subscription.yaml'),
      yamlFile('02-driver/hspc-cr.yaml'),
    ])

    expect(script).toContain('existing_csv_succeeded()')
    expect(script).toContain('if existing_csv_succeeded "$ns" "$pkg"; then')
    expect(script).toContain('Operator CSV already Succeeded; no day-0 InstallPlan approval is needed.')
    expect(script).toContain('approve_installplan "$OPERATOR_NS" "$OPERATOR_SUB"')
  })

  it('uses kubectl without applying OperatorHub manifests on Kubernetes', () => {
    const script = generateInstallScript(
      filledState({
        platform: 'kubernetes',
        driverNamespace: 'kube-system',
        operatorNamespace: 'hspc-operator-system',
      }),
      [yamlFile('02-driver/hspc-cr.yaml')],
    )

    expect(script).toContain('CMD="kubectl"')
    expect(script).not.toContain('operatorhub-namespace.yaml')
    expect(script).not.toContain('operatorhub-operatorgroup.yaml')
    expect(script).not.toContain('operatorhub-subscription.yaml')
  })
})
