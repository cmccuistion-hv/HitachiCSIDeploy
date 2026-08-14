import { describe, expect, it, vi } from 'vitest'
import type { MultipathConfig, WizardState } from '../catalog/types'
import { exportConfigJson } from '../state/exportConfig'
import { filledReplicationState, filledState } from '../test/fixtures'
import { generateAll, type GeneratedFile } from './yaml'

vi.mock('../services/versions', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/versions')>()
  return {
    ...actual,
    fetchFirstAvailable: vi.fn(async () =>
      ['apiVersion: v1', 'kind: ConfigMap', 'metadata:', '  name: mocked-upstream'].join('\n'),
    ),
  }
})

const hostedMultipath: MultipathConfig = {
  enabled: true,
  includeMachineConfig: false,
  includeDaemonSet: true,
  includeConf: false,
  alreadyApplied: true,
  machineConfigName: 'hitachi-csi-multipath',
  machineConfigRole: 'worker',
  customConf: '',
}

function paths(files: { path: string }[]): string[] {
  return files.map((file) => file.path)
}

function fileAt(files: GeneratedFile[], path: string): GeneratedFile {
  const file = files.find((candidate) => candidate.path === path)
  expect(file, `missing generated file ${path}`).toBeDefined()
  return file!
}

const confMultipath: MultipathConfig = {
  enabled: true,
  includeConf: true,
  includeMachineConfig: false,
  includeDaemonSet: false,
  alreadyApplied: false,
  machineConfigName: 'hitachi-csi-multipath',
  machineConfigRole: 'worker',
  customConf: '',
}

const nativeNvmeMultipath: MultipathConfig = {
  enabled: false,
  includeConf: false,
  includeMachineConfig: false,
  includeDaemonSet: false,
  alreadyApplied: false,
  machineConfigName: 'hitachi-csi-multipath',
  machineConfigRole: 'worker',
  customConf: '',
}

function k8sLike(platform: 'kubernetes' | 'rke2' | 'eks'): WizardState {
  return filledState({
    platform,
    connectionType: 'iscsi',
    driverNamespace: 'kube-system',
    operatorNamespace: 'hspc-operator-system',
    multipath: confMultipath,
  })
}

describe('generateAll package matrix', () => {
  it('packages classic OpenShift FC with MachineConfig and OperatorHub manifests', async () => {
    const files = await generateAll(filledState())
    const generatedPaths = paths(files)

    expect(generatedPaths).toContain('00-prereq/hitachi-csi-multipath.yaml')
    expect(fileAt(files, '00-prereq/hitachi-csi-multipath.yaml').content).toContain('kind: MachineConfig')
    expect(generatedPaths.some((path) => path.startsWith('00-prereq/') && path.includes('daemonset'))).toBe(false)
    expect(generatedPaths).not.toContain('00-prereq/multipath.conf')
    expect(generatedPaths).toEqual(
      expect.arrayContaining([
        '02-driver/operatorhub-namespace.yaml',
        '02-driver/operatorhub-operatorgroup.yaml',
        '02-driver/operatorhub-subscription.yaml',
        'install.sh',
      ]),
    )
    expect(fileAt(files, '02-driver/operatorhub-subscription.yaml').content).toEqual(
      expect.stringContaining('name: hspc-operator'),
    )
    expect(fileAt(files, '02-driver/operatorhub-subscription.yaml').content).toEqual(
      expect.stringContaining('source: certified-operators'),
    )
    expect(fileAt(files, '02-driver/operatorhub-subscription.yaml').content).toEqual(
      expect.stringContaining('installPlanApproval: Manual'),
    )
    expect(fileAt(files, '02-driver/hspc-cr.yaml').content).toContain('namespace: hspc-operator-system')
    expect(fileAt(files, 'install.sh').content).toContain('CMD="oc"')
  })

  it('packages hosted OpenShift FC with a DaemonSet and no MachineConfig wait', async () => {
    const files = await generateAll(
      filledState({
        openshiftTopology: 'hosted',
        multipath: hostedMultipath,
      }),
    )
    const generatedPaths = paths(files)
    const installScript = fileAt(files, 'install.sh').content

    expect(generatedPaths.some((path) => path.startsWith('00-prereq/') && path.includes('daemonset'))).toBe(true)
    expect(generatedPaths.some((path) => path.startsWith('00-prereq/') && path.includes('machineconfig'))).toBe(false)
    expect(installScript).toContain('Multipath DaemonSet (hosted/HCP)')
    expect(installScript).not.toContain('wait_mcp_healthy')
    expect(installScript).not.toContain('"$CMD" get mcp')
  })

  it('packages ROSA with hosted DaemonSet multipath by default fixture override', async () => {
    const files = await generateAll(
      filledState({
        platform: 'rosa',
        openshiftTopology: 'hosted',
        multipath: hostedMultipath,
      }),
    )
    const generatedPaths = paths(files)

    expect(generatedPaths.some((path) => path.startsWith('00-prereq/') && path.includes('daemonset'))).toBe(true)
    expect(generatedPaths.some((path) => path.startsWith('00-prereq/') && path.includes('machineconfig'))).toBe(false)
    expect(fileAt(files, 'install.sh').content).not.toContain('wait_mcp_healthy')
  })

  it.each(['kubernetes', 'rke2', 'eks'] as const)(
    'packages %s iSCSI with loose multipath config and kubectl',
    async (platform) => {
      const files = await generateAll(k8sLike(platform))
      const generatedPaths = paths(files)

      expect(generatedPaths).toEqual(
        expect.arrayContaining(['00-prereq/multipath.conf', '02-driver/README.md', 'install.sh']),
      )
      expect(generatedPaths.some((path) => path.includes('operatorhub-'))).toBe(false)
      expect(generatedPaths.some((path) => path.startsWith('05-console/'))).toBe(false)
      expect(fileAt(files, 'install.sh').content).toContain('CMD="kubectl"')
      expect(fileAt(files, '02-driver/hspc-cr.yaml').content).toContain('namespace: kube-system')
    },
  )

  it('packages OpenShift iSCSI with MachineConfig (dm-multipath still required)', async () => {
    const base = filledState()
    const files = await generateAll(
      filledState({
        connectionType: 'iscsi',
        storageClasses: [{ ...base.storageClasses[0], connectionType: 'iscsi' }],
      }),
    )

    expect(fileAt(files, '00-prereq/hitachi-csi-multipath.yaml').content).toContain('kind: MachineConfig')
    expect(fileAt(files, '01-storage/storageclass-hitachi-csi.yaml').content).toContain(
      'connectionType: iscsi',
    )
  })

  it('packages ROSA self-managed (classic) with MachineConfig when the user picks it', async () => {
    const files = await generateAll(
      filledState({
        platform: 'rosa',
        openshiftTopology: 'classic',
        multipath: {
          enabled: true,
          includeMachineConfig: true,
          includeDaemonSet: false,
          includeConf: false,
          alreadyApplied: false,
          machineConfigName: 'hitachi-csi-multipath',
          machineConfigRole: 'worker',
          customConf: '',
        },
      }),
    )
    const generatedPaths = paths(files)

    expect(generatedPaths).toContain('00-prereq/hitachi-csi-multipath.yaml')
    expect(fileAt(files, '00-prereq/hitachi-csi-multipath.yaml').content).toContain('kind: MachineConfig')
    expect(generatedPaths.some((path) => path.startsWith('00-prereq/') && path.includes('daemonset'))).toBe(
      false,
    )
  })

  it('omits dm-multipath artifacts for NVMe/TCP and emits nvmSubsystemID', async () => {
    const base = filledState()
    const files = await generateAll(
      filledState({
        connectionType: 'nvme-tcp',
        multipath: nativeNvmeMultipath,
        storageClasses: [
          {
            ...base.storageClasses[0],
            connectionType: 'nvme-tcp',
            nvmSubsystemID: '1',
            portID: '',
          },
        ],
      }),
    )
    const generatedPaths = paths(files)
    const storageClass = fileAt(files, '01-storage/storageclass-hitachi-csi.yaml').content

    expect(generatedPaths.some((path) => path.startsWith('00-prereq/'))).toBe(false)
    expect(storageClass).toContain('connectionType: nvme-tcp')
    expect(storageClass).toContain('nvmSubsystemID: "1"')
    expect(storageClass).not.toContain('portID:')
  })

  it('packages a VSP One SDS Block StorageClass without serial/pool/port', async () => {
    const base = filledState()
    const files = await generateAll(
      filledState({
        storageSystems: [{ ...base.storageSystems[0], family: 'vsp-one-sds-block' }],
        storageClasses: [
          {
            ...base.storageClasses[0],
            kind: 'vsp-one-sds-block',
            name: 'hitachi-csi-sds',
            serialNumber: '',
            poolID: '',
            portID: '',
          },
        ],
      }),
    )
    const storageClass = fileAt(files, '01-storage/storageclass-hitachi-csi-sds.yaml').content

    expect(storageClass).toContain('storageType: vsp-one-sds-block')
    expect(storageClass).not.toContain('serialNumber:')
    expect(storageClass).not.toContain('poolID:')
  })

  it('packages Performance Metrics with a secret, exporter, and OpenShift SCC', async () => {
    const base = filledState()
    const files = await generateAll(
      filledState({
        components: { metrics: true },
        metrics: {
          enabled: true,
          storages: [
            {
              serial: base.storageSystems[0].serial,
              url: base.storageSystems[0].url,
              user: base.storageSystems[0].user,
              password: base.storageSystems[0].password,
            },
          ],
        },
      }),
    )
    const generatedPaths = paths(files)

    expect(generatedPaths).toEqual(
      expect.arrayContaining([
        '04-metrics/namespace.yaml',
        '04-metrics/scc-for-openshift.yaml',
        '04-metrics/metrics-secret.yaml',
        '04-metrics/exporter.yaml',
        '04-metrics/README.md',
      ]),
    )
    expect(fileAt(files, '04-metrics/metrics-secret.yaml').content).toContain('serial: 400001')
    expect(fileAt(files, 'install.sh').content).toMatch(/04-metrics/)
  })

  it('packages Performance Metrics and the OpenShift Console Plugin together', async () => {
    const base = filledState()
    const files = await generateAll(
      filledState({
        components: { metrics: true, consolePlugin: true },
        metrics: {
          enabled: true,
          storages: [
            {
              serial: base.storageSystems[0].serial,
              url: base.storageSystems[0].url,
              user: base.storageSystems[0].user,
              password: base.storageSystems[0].password,
            },
          ],
        },
      }),
    )
    const generatedPaths = paths(files)

    expect(generatedPaths.some((path) => path.startsWith('04-metrics/'))).toBe(true)
    expect(generatedPaths.some((path) => path.startsWith('05-console/'))).toBe(true)
  })

  it('packages the telemetry opt-out manifest and guarded operator restart', async () => {
    const files = await generateAll(filledState({ telemetryEnabled: false }))
    const configMap = fileAt(files, '02-driver/hspc-csi-telemetry-config.yaml').content
    const installScript = fileAt(files, 'install.sh').content

    expect(configMap).toContain('awsEnabled: "false"')
    expect(installScript).toContain('hspc-operator-controller-manager')
    expect(installScript).toContain('exit 1')
  })

  it('omits StorageClass, snapshot, and quickstart artifacts when StorageClasses are off', async () => {
    const files = await generateAll(filledState({ storageClassesEnabled: false }))
    const generatedPaths = paths(files)

    expect(generatedPaths.some((path) => path.startsWith('01-storage/storageclass-'))).toBe(false)
    expect(generatedPaths.some((path) => path.includes('volumesnapshotclass-'))).toBe(false)
    expect(generatedPaths.some((path) => path.startsWith('06-quickstart/'))).toBe(false)
    expect(generatedPaths).toEqual(expect.arrayContaining(['install.sh', '02-driver/hspc-cr.yaml']))
  })

  it('packages Replication as two site folders without exporting kubeconfig values', async () => {
    const state = filledReplicationState({
      replication: {
        primaryKubeconfig: 'dummy-primary-kubeconfig',
        secondaryKubeconfig: 'dummy-secondary-kubeconfig',
      },
    })
    const files = await generateAll(state)
    const generatedPaths = paths(files)

    expect(generatedPaths).toEqual(
      expect.arrayContaining([
        'README.md',
        'primary/install.sh',
        'secondary/install.sh',
        'primary/03-replication/storage-secrets.yaml',
        'secondary/03-replication/storage-secrets.yaml',
        'primary/03-replication/remote-kubeconfig-for-primary-site.yaml',
        'secondary/03-replication/remote-kubeconfig-for-secondary-site.yaml',
      ]),
    )
    for (const path of [
      'primary/03-replication/remote-kubeconfig-for-primary-site.yaml',
      'secondary/03-replication/remote-kubeconfig-for-secondary-site.yaml',
    ]) {
      expect(fileAt(files, path).content).toContain('name: hspc-replication-operator-remote-kubeconfig')
      expect(fileAt(files, path).content).toContain('remote-kubeconfig:')
    }
    expect(
      generatedPaths.some((path) =>
        ['sample-replication', 'replicationsample', 'testing'].some((needle) =>
          path.toLowerCase().includes(needle),
        ),
      ),
    ).toBe(false)
    expect(exportConfigJson(state)).not.toContain('dummy-primary-kubeconfig')
    expect(exportConfigJson(state)).not.toContain('dummy-secondary-kubeconfig')
  })

  it('packages the console plugin only on a supported OpenShift platform', async () => {
    const openshiftFiles = await generateAll(
      filledState({ components: { consolePlugin: true } }),
    )
    const kubernetesFiles = await generateAll(
      filledState({
        platform: 'kubernetes',
        driverNamespace: 'kube-system',
        components: { consolePlugin: true },
      }),
    )

    expect(paths(openshiftFiles).some((path) => path.startsWith('05-console/'))).toBe(true)
    expect(paths(kubernetesFiles).some((path) => path.startsWith('05-console/'))).toBe(false)
  })

  it('packages a GAD stretched Secret with both array serials', async () => {
    const base = filledState()
    const files = await generateAll(
      filledState({
        storageSystems: [
          {
            ...base.storageSystems[0],
            stretchedRole: 'primary',
          },
          {
            ...base.storageSystems[0],
            id: 'storage-2',
            name: 'secondary',
            serial: '400002',
            url: 'https://192.0.2.11',
            stretchedRole: 'secondary',
          },
        ],
        storageClasses: [
          {
            ...base.storageClasses[0],
            kind: 'stretched',
            serialNumber: '',
            quorumID: '1',
            copyGroupName: 'spc-test-cg',
            copyPairName: 'spc-test-pair',
            consistencyGroupId: '10',
            primaryPoolID: '0',
            primaryPortID: 'CL1-A',
            secondaryPoolID: '1',
            secondaryPortID: 'CL2-A',
            stretchedSecretName: 'hitachi-csi-secret-stretched',
          },
        ],
      }),
    )
    const stretchedSecret = fileAt(files, '01-storage/secret-stretched.yaml').content

    expect(stretchedSecret).toContain('primarySerial: "400001"')
    expect(stretchedSecret).toContain('secondarySerial: "400002"')
  })
})
