import { describe, expect, it, vi } from 'vitest'
import { withSiteMetrics } from '../catalog/metrics'
import { getSiteStorage, setHrpcPairOnSite, withSiteStorage } from '../catalog/sites'
import type { MultipathConfig, WizardState } from '../catalog/types'
import { exportConfigJson } from '../state/exportConfig'
import { filledReplicationState, filledState } from '../test/fixtures'
import { fetchFirstAvailable } from '../services/versions'
import { generateAll, snapshotClassOpts, type GeneratedFile } from './yaml'

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

const MONITORING_STACK_MOCK = [
  'apiVersion: v1',
  'kind: PersistentVolumeClaim',
  'metadata:',
  '  name: prometheus',
  'spec:',
  '  storageClassName: sc-sample',
  '---',
  'apiVersion: v1',
  'kind: ConfigMap',
  'metadata:',
  '  name: grafana',
].join('\n')

function mockMonitoringStackFetch() {
  vi.mocked(fetchFirstAvailable).mockImplementation(async (urls) => {
    const joined = urls.join('')
    if (joined.includes('grafana-prometheus')) return MONITORING_STACK_MOCK
    return ['apiVersion: v1', 'kind: ConfigMap', 'metadata:', '  name: mocked-upstream'].join('\n')
  })
}

const CONSOLE_PLUGIN_MOCK = [
  'apiVersion: v1',
  'kind: ConfigMap',
  'metadata:',
  '  name: mocked-upstream',
  'data:',
  '  config.json: |',
  '    "hsppPrometheus": { "namespace": "hspc-monitoring-system", "service": "prometheus", "port": "9090" }',
].join('\n')

function mockConsolePluginFetch() {
  vi.mocked(fetchFirstAvailable).mockImplementation(async (urls) => {
    const joined = urls.join('')
    if (joined.includes('consoleplugin')) return CONSOLE_PLUGIN_MOCK
    if (joined.includes('grafana-prometheus')) return MONITORING_STACK_MOCK
    return ['apiVersion: v1', 'kind: ConfigMap', 'metadata:', '  name: mocked-upstream'].join('\n')
  })
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

  it('fills the Performance Metrics exporter secret from storage systems when metrics.storages is empty', async () => {
    const files = await generateAll(
      filledState({
        components: { metrics: true },
        metrics: { enabled: true, storages: [] },
      }),
    )
    const secret = fileAt(files, '04-metrics/metrics-secret.yaml').content

    expect(secret).toContain('serial: 400001')
    expect(secret).toContain('https://192.0.2.10')
    expect(secret).toContain('user: maintenance')
  })

  it('includes every storage array in the Performance Metrics exporter secret', async () => {
    const base = filledState()
    const files = await generateAll(
      filledState({
        components: { metrics: true },
        metrics: { enabled: true, storages: [] },
        storageSystems: [
          base.storageSystems[0],
          {
            ...base.storageSystems[0],
            id: 'storage-2',
            name: 'array-2',
            serial: '400099',
            url: 'https://192.0.2.99',
          },
        ],
      }),
    )
    const secret = fileAt(files, '04-metrics/metrics-secret.yaml').content

    expect(secret).toContain('serial: 400001')
    expect(secret).toContain('serial: 400099')
  })

  it('packages different Performance Metrics settings per Replication site', async () => {
    mockMonitoringStackFetch()
    let state = filledReplicationState({ components: { metrics: true, consolePlugin: true } })
    state = withSiteMetrics(state, 'primary', {
      namespace: 'mon-primary',
      secretName: 'exp-primary',
      deployGrafana: true,
      deployPrometheus: true,
    })
    state = withSiteMetrics(state, 'secondary', {
      namespace: 'mon-secondary',
      secretName: 'exp-secondary',
      deployGrafana: false,
      deployPrometheus: true,
      maxWorkerCount: '3',
    })
    const files = await generateAll(state)
    const primaryNs = fileAt(files, 'primary/04-metrics/namespace.yaml').content
    const secondaryNs = fileAt(files, 'secondary/04-metrics/namespace.yaml').content
    expect(primaryNs).toContain('name: mon-primary')
    expect(secondaryNs).toContain('name: mon-secondary')
    expect(fileAt(files, 'primary/04-metrics/metrics-secret.yaml').content).toContain(
      'name: exp-primary',
    )
    expect(fileAt(files, 'secondary/04-metrics/metrics-secret.yaml').content).toContain(
      'name: exp-secondary',
    )
    expect(paths(files).some((p) => p === 'primary/04-metrics/grafana-stack.yaml')).toBe(true)
    expect(paths(files).some((p) => p === 'secondary/04-metrics/grafana-stack.yaml')).toBe(false)
  })

  it('wires each site’s Console Plugin to that site’s Prometheus namespace', async () => {
    mockConsolePluginFetch()
    let state = filledReplicationState({
      components: { metrics: true, consolePlugin: true },
    })
    state = withSiteMetrics(state, 'primary', { namespace: 'mon-primary', deployPrometheus: true })
    state = withSiteMetrics(state, 'secondary', { namespace: 'mon-secondary', deployPrometheus: true })
    const files = await generateAll(state)
    expect(fileAt(files, 'primary/05-console/consoleplugin-ocp-ui.yaml').content).toContain('mon-primary')
    expect(fileAt(files, 'secondary/05-console/consoleplugin-ocp-ui.yaml').content).toContain(
      'mon-secondary',
    )
  })

  it('omits secondary 04-metrics when that site skips Performance Metrics and still wires Console Plugin to existing Prometheus', async () => {
    mockConsolePluginFetch()
    let state = filledReplicationState({
      components: { metrics: true, consolePlugin: true },
    })
    state = withSiteMetrics(state, 'primary', {
      namespace: 'mon-primary',
      deployPrometheus: true,
    })
    state = withSiteMetrics(state, 'secondary', {
      install: false,
      namespace: 'mon-secondary',
      deployPrometheus: true,
      existingPrometheusNamespace: 'ext-ns',
      existingPrometheusService: 'ext-svc',
      existingPrometheusPort: '9091',
    })
    const files = await generateAll(state)
    const generated = paths(files)
    expect(generated.some((p) => p.startsWith('primary/04-metrics/'))).toBe(true)
    expect(generated.some((p) => p.startsWith('secondary/04-metrics/'))).toBe(false)
    expect(generated.some((p) => p.startsWith('secondary/05-console/'))).toBe(true)
    expect(fileAt(files, 'primary/install.sh').content).toMatch(/04-metrics/)
    expect(fileAt(files, 'secondary/install.sh').content).not.toMatch(/04-metrics/)
    const plugin = fileAt(files, 'secondary/05-console/consoleplugin-ocp-ui.yaml').content
    expect(plugin).toContain('ext-ns')
    expect(plugin).toContain('ext-svc')
    expect(plugin).toContain('9091')
    expect(plugin).not.toContain('mon-secondary')
  })

  it('omits primary 04-metrics when primary skips Performance Metrics', async () => {
    mockConsolePluginFetch()
    let state = filledReplicationState({
      components: { metrics: true, consolePlugin: true },
    })
    state = withSiteMetrics(state, 'primary', {
      install: false,
      existingPrometheusNamespace: 'pri-ext',
      existingPrometheusService: 'pri-svc',
      existingPrometheusPort: '9090',
    })
    state = withSiteMetrics(state, 'secondary', {
      namespace: 'mon-secondary',
      deployPrometheus: true,
    })
    const files = await generateAll(state)
    const generated = paths(files)
    expect(generated.some((p) => p.startsWith('primary/04-metrics/'))).toBe(false)
    expect(generated.some((p) => p.startsWith('secondary/04-metrics/'))).toBe(true)
    expect(fileAt(files, 'primary/05-console/consoleplugin-ocp-ui.yaml').content).toContain('pri-ext')
  })

  it('omits 04-metrics on both sites when both skip Performance Metrics', async () => {
    mockConsolePluginFetch()
    let state = filledReplicationState({
      components: { metrics: true, consolePlugin: true },
    })
    state = withSiteMetrics(state, 'primary', {
      install: false,
      existingPrometheusNamespace: 'p-ext',
      existingPrometheusService: 'p-svc',
      existingPrometheusPort: '9090',
    })
    state = withSiteMetrics(state, 'secondary', {
      install: false,
      existingPrometheusNamespace: 's-ext',
      existingPrometheusService: 's-svc',
      existingPrometheusPort: '9091',
    })
    const files = await generateAll(state)
    const generated = paths(files)
    expect(generated.some((p) => p.includes('04-metrics/'))).toBe(false)
    expect(fileAt(files, 'primary/05-console/consoleplugin-ocp-ui.yaml').content).toContain('p-ext')
    expect(fileAt(files, 'secondary/05-console/consoleplugin-ocp-ui.yaml').content).toContain('s-ext')
  })

  it('still packages 04-metrics for a single-site export', async () => {
    const files = await generateAll(filledState({ components: { metrics: true } }))
    expect(paths(files).some((p) => p.startsWith('04-metrics/'))).toBe(true)
  })

  it('uses each site’s metrics PVC StorageClass pin for Prometheus PVCs', async () => {
    mockMonitoringStackFetch()
    let state = filledReplicationState({
      components: { metrics: true },
      quickstart: { storageClassName: 'hitachi-csi' },
    })
    const secondarySite = getSiteStorage(state, 'secondary')
    const defaultClass = secondarySite.storageClasses[0]!
    state = withSiteStorage(state, 'secondary', {
      ...secondarySite,
      storageClasses: [
        defaultClass,
        {
          ...defaultClass,
          id: 'sc-secondary-extra',
          name: 'hitachi-csi-secondary',
        },
      ],
    })
    state = withSiteMetrics(state, 'secondary', { pvcStorageClassName: 'hitachi-csi-secondary' })
    const files = await generateAll(state)
    const prom = fileAt(files, 'secondary/04-metrics/prometheus-stack.yaml').content
    expect(prom).toContain('storageClassName: hitachi-csi-secondary')
    expect(prom).not.toMatch(/storageClassName:\s*hitachi-csi\s*$/)
  })

  it('packages each Replication site with that cluster’s arrays in the exporter secret', async () => {
    const files = await generateAll(
      filledReplicationState({
        components: { metrics: true },
        metrics: { enabled: true, storages: [] },
      }),
    )
    const primary = fileAt(files, 'primary/04-metrics/metrics-secret.yaml').content
    const secondary = fileAt(files, 'secondary/04-metrics/metrics-secret.yaml').content

    expect(primary).toContain('serial: 400001')
    expect(primary).not.toContain('serial: 400002')
    expect(secondary).toContain('serial: 400002')
    expect(secondary).not.toContain('serial: 400001')
  })

  it('does not copy primary exporter credentials into the secondary cluster package', async () => {
    const files = await generateAll(
      filledReplicationState({
        components: { metrics: true },
        metrics: {
          enabled: true,
          storages: [
            {
              serial: '400001',
              url: 'https://192.0.2.10',
              user: 'maintenance',
              password: 'fixture-password',
            },
          ],
        },
      }),
    )
    const secondary = fileAt(files, 'secondary/04-metrics/metrics-secret.yaml').content

    expect(secondary).toContain('serial: 400002')
    expect(secondary).not.toContain('serial: 400001')
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
    expect(generatedPaths).not.toContain('VERSION')
    expect(generatedPaths).not.toContain('primary/VERSION')
    expect(generatedPaths).not.toContain('secondary/VERSION')
  })

  it('refreshes Replication storage-secrets from each site’s array when stored secrets are stale', async () => {
    const files = await generateAll(
      filledReplicationState({
        replication: {
          storageSecrets: [
            {
              serial: '400001',
              url: 'https://192.0.2.10',
              user: 'primary-user',
              password: 'primary-password',
              journal: '10',
            },
            {
              serial: '400001',
              url: 'https://192.0.2.10',
              user: 'primary-user',
              password: 'primary-password',
              journal: '20',
            },
          ],
        },
      }),
    )
    const secret = fileAt(files, 'primary/03-replication/storage-secrets.yaml').content

    expect(secret).toContain('serial: 400001')
    expect(secret).toContain('serial: 400002')
    expect(secret).toContain('https://192.0.2.11')
    expect(secret).toContain('journal: 20')
    expect(secret).not.toContain('primary-user')
    expect(secret).not.toContain('primary-password')
  })

  it('uses each site’s StorageClasses and StorageClass secretName in the dual-site package', async () => {
    const base = filledReplicationState({
      quickstart: { storageClassName: 'hitachi-csi-b85' },
    })
    const secretNs = 'hspc-operator-system'
    const primarySys = base.sites!.primary.storageSystems[0]
    const secondarySys = {
      ...base.sites!.secondary.storageSystems[0],
      name: 'secondary' as const,
    }
    const state = {
      ...base,
      sites: {
        primary: {
          storageSystems: [{ ...primarySys, name: 'primary', hrpcPair: true }],
          storageClasses: [
            {
              id: 'sc-b85',
              kind: 'standard' as const,
              name: 'hitachi-csi-b85',
              connectionType: 'iscsi' as const,
              secretName: 'hitachi-csi-secret',
              secretNamespace: secretNs,
              serialNumber: primarySys.serial,
              poolID: '0',
              portID: 'CL3-G',
              fstype: 'ext4',
              reclaimPolicy: 'Delete' as const,
              volumeBindingMode: 'Immediate' as const,
              allowVolumeExpansion: true,
              isDefault: true,
            },
            {
              id: 'sc-dr',
              kind: 'standard' as const,
              name: 'hitachi-csi-dr',
              connectionType: 'iscsi' as const,
              secretName: 'hitachi-csi-secret',
              secretNamespace: secretNs,
              serialNumber: primarySys.serial,
              poolID: '0',
              portID: 'CL3-G',
              fstype: 'ext4',
              reclaimPolicy: 'Delete' as const,
              volumeBindingMode: 'Immediate' as const,
              allowVolumeExpansion: true,
              hrpcPairId: 'hrpc-sc-1',
            },
          ],
        },
        secondary: {
          storageSystems: [secondarySys],
          storageClasses: [
            {
              id: 'sc-dr-sec',
              kind: 'standard' as const,
              name: 'hitachi-csi-dr',
              connectionType: 'iscsi' as const,
              secretName: 'hitachi-csi-secret',
              secretNamespace: secretNs,
              serialNumber: secondarySys.serial,
              poolID: '0',
              portID: 'CL1-D',
              fstype: 'ext4',
              reclaimPolicy: 'Delete' as const,
              volumeBindingMode: 'Immediate' as const,
              allowVolumeExpansion: true,
              hrpcPairId: 'hrpc-sc-1',
            },
            {
              id: 'sc-b28',
              kind: 'standard' as const,
              name: 'sc-b28',
              connectionType: 'iscsi' as const,
              secretName: 'hitachi-csi-secret',
              secretNamespace: secretNs,
              serialNumber: secondarySys.serial,
              poolID: '0',
              portID: 'CL1-D',
              fstype: 'ext4',
              reclaimPolicy: 'Delete' as const,
              volumeBindingMode: 'Immediate' as const,
              allowVolumeExpansion: true,
              isDefault: true,
            },
          ],
        },
      },
    }

    const files = await generateAll(state)
    const secondarySecret = fileAt(files, 'secondary/01-storage/secret-secondary.yaml').content
    const secondaryPvc = fileAt(files, 'secondary/06-quickstart/pvc.yaml').content
    const primaryPvc = fileAt(files, 'primary/06-quickstart/pvc.yaml').content
    const secondaryInstall = fileAt(files, 'secondary/install.sh').content
    const primaryInstall = fileAt(files, 'primary/install.sh').content
    const secondarySc = fileAt(files, 'secondary/01-storage/storageclass-hitachi-csi-dr.yaml').content

    expect(secondarySecret).toMatch(/^ {2}name: hitachi-csi-secret$/m)
    expect(secondarySecret).not.toMatch(/hitachi-csi-secret-secondary/)
    expect(secondarySc).toContain('csi.storage.k8s.io/provisioner-secret-name: "hitachi-csi-secret"')
    expect(primaryPvc).toContain('storageClassName: hitachi-csi-b85')
    expect(secondaryPvc).toContain('storageClassName: sc-b28')
    expect(secondaryPvc).not.toContain('hitachi-csi-b85')
    expect(primaryInstall).toContain('storageClassName="hitachi-csi-dr"')
    expect(secondaryInstall).toContain('storageClassName="hitachi-csi-dr"')
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

  it('emits one Secret per array and points each StorageClass at its picked array', async () => {
    const base = filledState()
    const files = await generateAll(
      filledState({
        storageSystems: [
          { ...base.storageSystems[0], id: 'storage-1', csiSecretName: 'secret-a', serial: '400001' },
          {
            ...base.storageSystems[0],
            id: 'storage-2',
            name: 'array-2',
            serial: '400002',
            url: 'https://192.0.2.11',
            csiSecretName: 'secret-b',
          },
        ],
        storageClasses: [
          {
            ...base.storageClasses[0],
            id: 'sc-1',
            name: 'sc-a',
            storageSystemId: 'storage-1',
            poolID: '0',
            portID: 'CL1-A',
          },
          {
            ...base.storageClasses[0],
            id: 'sc-2',
            name: 'sc-b',
            storageSystemId: 'storage-2',
            poolID: '1',
            portID: 'CL2-A',
            isDefault: false,
          },
        ],
      }),
    )
    const secretA = files.find((f) => f.path.includes('secret-') && f.content.includes('name: secret-a'))
    const secretB = files.find((f) => f.path.includes('secret-') && f.content.includes('name: secret-b'))
    expect(secretA).toBeTruthy()
    expect(secretB).toBeTruthy()
    expect(fileAt(files, '01-storage/storageclass-sc-a.yaml').content).toContain('serialNumber: "400001"')
    expect(fileAt(files, '01-storage/storageclass-sc-a.yaml').content).toContain(
      'csi.storage.k8s.io/provisioner-secret-name: "secret-a"',
    )
    expect(fileAt(files, '01-storage/storageclass-sc-b.yaml').content).toContain('serialNumber: "400002"')
    expect(fileAt(files, '01-storage/storageclass-sc-b.yaml').content).toContain(
      'csi.storage.k8s.io/provisioner-secret-name: "secret-b"',
    )
  })

  it('emits one Secret when two classes share an array', async () => {
    const base = filledState()
    const files = await generateAll(
      filledState({
        storageSystems: [{ ...base.storageSystems[0], csiSecretName: 'hitachi-csi-secret' }],
        storageClasses: [
          { ...base.storageClasses[0], id: 'sc-1', name: 'sc-a', storageSystemId: 'storage-1' },
          { ...base.storageClasses[0], id: 'sc-2', name: 'sc-b', storageSystemId: 'storage-1', isDefault: false },
        ],
      }),
    )
    const secrets = files.filter((f) => f.path.startsWith('01-storage/secret-') && !f.path.includes('stretched'))
    expect(secrets).toHaveLength(1)
  })

  it('packages a Replication site-local StorageClass on the non-HRPC array with that array’s Secret', async () => {
    const base = filledReplicationState()
    const hrpc = base.sites!.primary.storageSystems[0]!
    const extra = {
      ...hrpc,
      id: 'storage-extra',
      name: 'extra',
      serial: '400099',
      url: 'https://192.0.2.99',
      hrpcPair: false,
      csiSecretName: 'secret-extra',
    }
    const siteLocalClass = {
      ...base.sites!.primary.storageClasses[0]!,
      id: 'sc-extra',
      name: 'sc-extra',
      hrpcPairId: '',
      storageSystemId: extra.id,
      serialNumber: '',
      poolID: '0',
      portID: 'CL1-A',
      isDefault: false,
    }
    const files = await generateAll({
      ...base,
      sites: {
        primary: {
          ...base.sites!.primary,
          storageSystems: [
            { ...hrpc, name: 'primary', hrpcPair: true, csiSecretName: 'secret-hrpc' },
            extra,
          ],
          storageClasses: [...base.sites!.primary.storageClasses, siteLocalClass],
        },
        secondary: base.sites!.secondary,
      },
    })
    expect(fileAt(files, 'primary/01-storage/secret-extra.yaml').content).toContain('name: secret-extra')
    expect(fileAt(files, 'primary/01-storage/storageclass-sc-extra.yaml').content).toContain(
      'csi.storage.k8s.io/provisioner-secret-name: "secret-extra"',
    )
  })

  it('keeps Replication paired StorageClasses bound to the selected array when switching pairs', async () => {
    const base = filledReplicationState()
    const a = { ...base.sites!.primary.storageSystems[0], id: 'a', name: 'array-a', hrpcPair: true, csiSecretName: 'secret-a' }
    const b = { ...base.sites!.primary.storageSystems[0], id: 'b', name: 'array-b', hrpcPair: false, csiSecretName: 'secret-b', serial: '400002' }
    const pairedSc = {
      ...base.sites!.primary.storageClasses[0],
      id: 'sc-hrpc',
      name: 'hitachi-csi-dr',
      hrpcPairId: 'hrpc-sc-1',
      storageSystemId: a.id,
      serialNumber: '',
      poolID: '0',
      portID: 'CL1-A',
      isDefault: false,
    }

    const switched = setHrpcPairOnSite(
      { ...base.sites!.primary, storageSystems: [a, b], storageClasses: [pairedSc] },
      b.id,
    )
    const files = await generateAll({
      ...base,
      sites: { ...base.sites!, primary: switched },
    })

    const scYaml = fileAt(files, 'primary/01-storage/storageclass-hitachi-csi-dr.yaml').content
    expect(scYaml).toContain('csi.storage.k8s.io/provisioner-secret-name: "secret-b"')
  })

  it('packages a GAD stretched Secret from class picker arrays only (unused third array omitted)', async () => {
    const base = filledState()
    const files = await generateAll(
      filledState({
        driverNamespace: 'driver-ns',
        storageSystems: [
          {
            ...base.storageSystems[0],
            id: 'storage-1',
            name: 'array-1',
            serial: '400001',
            url: 'https://192.0.2.10',
            stretchedRole: 'primary',
          },
          {
            ...base.storageSystems[0],
            id: 'storage-2',
            name: 'array-2',
            serial: '400002',
            url: 'https://192.0.2.11',
            stretchedRole: 'secondary',
            csiSecretNamespace: 'array-ns',
          },
          {
            ...base.storageSystems[0],
            id: 'storage-3',
            name: 'array-3',
            serial: '400003',
            url: 'https://192.0.2.12',
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
            secretNamespace: '  hspc-operator-system  ',
            primaryStorageSystemId: 'storage-2',
            secondaryStorageSystemId: 'storage-3',
          },
        ],
      }),
    )
    const stretchedSecret = fileAt(files, '01-storage/secret-stretched.yaml').content

    expect(stretchedSecret).toContain('primarySerial: "400002"')
    expect(stretchedSecret).toContain('secondarySerial: "400003"')
    expect(stretchedSecret).not.toContain('400001')
    expect(stretchedSecret).toContain('namespace: hspc-operator-system')
    expect(stretchedSecret).not.toContain('namespace: array-ns')
  })

  it('falls back to driverNamespace when stretched StorageClass secretNamespace is empty', async () => {
    const base = filledState()
    const files = await generateAll(
      filledState({
        driverNamespace: 'driver-ns',
        storageSystems: [
          { ...base.storageSystems[0], id: 'storage-1', name: 'array-1', serial: '400001', url: 'https://192.0.2.10' },
          { ...base.storageSystems[0], id: 'storage-2', name: 'array-2', serial: '400002', url: 'https://192.0.2.11' },
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
            secretNamespace: '   ',
            primaryStorageSystemId: 'storage-1',
            secondaryStorageSystemId: 'storage-2',
          },
        ],
      }),
    )
    const stretchedSecret = fileAt(files, '01-storage/secret-stretched.yaml').content
    expect(stretchedSecret).toContain('namespace: driver-ns')
  })

  it('uses StorageClass/driver namespace for stretched snapshotClassOpts', () => {
    const base = filledState()
    const state = filledState({
      ...base,
      driverNamespace: 'driver-ns',
      storageSystems: [
        { ...base.storageSystems[0], id: 'storage-1', name: 'array-1', serial: '400001', csiSecretNamespace: 'array-ns' },
        { ...base.storageSystems[0], id: 'storage-2', name: 'array-2', serial: '400002', csiSecretNamespace: 'array-ns' },
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
          secretNamespace: '  hspc-operator-system  ',
          primaryStorageSystemId: 'storage-1',
          secondaryStorageSystemId: 'storage-2',
        },
      ],
    })
    expect(snapshotClassOpts(state).secretNamespace).toBe('hspc-operator-system')
  })
})
