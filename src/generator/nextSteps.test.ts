import { describe, expect, it } from 'vitest'
import { filledReplicationState, filledState } from '../test/fixtures'
import { buildNextSteps } from './nextSteps'

function stepIds(state: ReturnType<typeof filledState>): string[] {
  return buildNextSteps(state).map((step) => step.id)
}

describe('buildNextSteps', () => {
  it('adds the offline bundle step for an air-gapped OpenShift cluster', () => {
    const steps = buildNextSteps(filledState({ airGapped: true }))
    const airGapped = steps.find((step) => step.id === 'air-gapped')

    expect(airGapped).toBeDefined()
    expect(airGapped?.title).toContain('offline')
    expect(airGapped?.body).toContain('hvcsi-offline-bundle.sh')
    expect(airGapped?.body).toContain('certified-operators')
  })

  it('tells Kubernetes operators to copy multipath.conf onto workers', () => {
    const steps = buildNextSteps(
      filledState({
        platform: 'kubernetes',
        driverNamespace: 'kube-system',
        multipath: {
          enabled: true,
          includeConf: true,
          includeMachineConfig: false,
          includeDaemonSet: false,
          alreadyApplied: false,
          machineConfigName: 'hitachi-csi-multipath',
          machineConfigRole: 'worker',
          customConf: '',
        },
      }),
    )
    const multipath = steps.find((step) => step.id === 'multipath-workers')

    expect(multipath?.command).toContain('00-prereq/multipath.conf')
    expect(stepIds(filledState())).not.toContain('multipath-workers')
  })

  it('uses dual-site install commands when Replication is on', () => {
    const ids = stepIds(filledReplicationState())

    expect(ids).toEqual(expect.arrayContaining(['install-primary', 'install-secondary']))
    expect(ids).not.toContain('install')
  })

  it('omits the test-volume verify step when StorageClasses are off', () => {
    expect(stepIds(filledState({ storageClassesEnabled: false }))).not.toContain('verify-test-volume')
    expect(stepIds(filledState())).toContain('verify-test-volume')
  })

  it('uses a stable unzip directory name without the CSI Driver tag', () => {
    const unzip = buildNextSteps(filledState()).find((step) => step.id === 'unzip')
    expect(unzip?.command).toBe('unzip hitachi-csi-deployment.zip -d hitachi-csi-deployment\ncd hitachi-csi-deployment')
  })
})
