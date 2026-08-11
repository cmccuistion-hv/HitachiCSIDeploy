import type {
  MetricsConfig,
  QuickstartConfig,
  ReplicationConfig,
  SnapshotClassConfig,
  StorageClassConfig,
  StorageSystemConfig,
  WizardState,
} from '../catalog/types'
import {
  CONNECTION_TYPES,
  SDS_BLOCK_CONNECTIONS,
  STRETCHED_CONNECTIONS,
  coerceConnectionType,
} from '../catalog/platforms'
import { PLATFORMS } from '../catalog/platforms'
import { generateMultipathMachineConfigs, getMultipathConf, expectedMultipathMachineConfigNames } from './multipath'
import {
  expectedMultipathDaemonSet,
  generateMultipathDaemonSetFiles,
} from './multipathDaemonSet'
import {
  HSPC_OLM_PACKAGE,
  generateOperatorHubFiles,
} from './operatorHub'
import {
  generateRemoteKubeconfigScript,
  generateRemoteKubeconfigSecret,
  REMOTE_KUBECONFIG_SECRET_NAME,
} from './remoteKubeconfig'
import { patchGrafanaDatasource, rewriteStorageClassName, rewriteYamlNamespace, splitMonitoringStack } from './monitoringStack'
import { fetchFirstAvailable, templatePaths } from '../services/versions'
import { effectiveSerialNumber } from '../catalog/validation'

export interface GeneratedFile {
  path: string
  content: string
  description: string
  group: 'prereq' | 'driver' | 'storage' | 'replication' | 'metrics' | 'console' | 'quickstart' | 'scripts'
}

function b64(s: string): string {
  return btoa(unescape(encodeURIComponent(s)))
}

function yamlQuote(s: string): string {
  if (/[:#{}[\],&*?|>!%@`]/.test(s) || s.includes('\n') || s === '') return JSON.stringify(s)
  return s
}

export function generateTelemetryDisableConfigMap(namespace: string): string {
  return `apiVersion: v1
kind: ConfigMap
metadata:
  name: hspc-csi-telemetry-config
  namespace: ${namespace}
data:
  awsEnabled: "false"
`
}

export function generateStandardSecret(sys: StorageSystemConfig, name: string, namespace: string): string {
  const data: string[] = [
    `  url: ${b64(sys.url)}`,
    `  user: ${b64(sys.user)}`,
    `  password: ${b64(sys.password)}`,
  ]
  if (sys.hostModeOptions) data.push(`  hostModeOptions: ${b64(sys.hostModeOptions)}`)
  if (sys.resourceGroupID) data.push(`  resourceGroupID: ${b64(sys.resourceGroupID)}`)

  const stringData: string[] = []
  if (sys.alternativeCloneMode) stringData.push(`  alternativeCloneMode: "true"`)

  let out = `apiVersion: v1
kind: Secret
metadata:
  name: ${name}
  namespace: ${namespace}
type: Opaque
data:
${data.join('\n')}
`
  if (stringData.length) {
    out += `stringData:
${stringData.join('\n')}
`
  }
  return out
}

export function generateStretchedSecret(
  primary: StorageSystemConfig,
  secondary: StorageSystemConfig,
  name: string,
  namespace: string,
  virtualSerial?: string,
): string {
  const lines = [
    `  primarySerial: ${JSON.stringify(primary.serial)}`,
    `  primaryURL: ${primary.url}`,
    `  primaryUser: ${primary.user}`,
    `  primaryPassword: ${primary.password}`,
    `  secondarySerial: ${JSON.stringify(secondary.serial)}`,
    `  secondaryURL: ${secondary.url}`,
    `  secondaryUser: ${secondary.user}`,
    `  secondaryPassword: ${secondary.password}`,
  ]
  if (virtualSerial) lines.push(`  virtualStorageSerialNumber: ${JSON.stringify(virtualSerial)}`)
  return `apiVersion: v1
kind: Secret
metadata:
  name: ${name}
  namespace: ${namespace}
type: Opaque
stringData:
${lines.join('\n')}
`
}

function secretRefs(secretName: string, secretNs: string, expand: boolean): string {
  const slots = [
    'node-publish',
    'provisioner',
    'controller-publish',
    'node-stage',
    ...(expand ? (['controller-expand'] as const) : []),
  ]
  return slots
    .flatMap((s) => [
      `  csi.storage.k8s.io/${s}-secret-name: "${secretName}"`,
      `  csi.storage.k8s.io/${s}-secret-namespace: "${secretNs}"`,
    ])
    .join('\n')
}

export function generateStorageClass(sc: StorageClassConfig): string {
  const conn = CONNECTION_TYPES.find((c) => c.id === sc.connectionType)
  const expand = sc.kind === 'stretched' || sc.kind === 'stretched-adr' ? false : sc.allowVolumeExpansion
  const params: string[] = []

  if (sc.kind === 'vsp-one-sds-block') {
    params.push(`  storageType: vsp-one-sds-block`)
    params.push(
      `  connectionType: ${coerceConnectionType(sc.connectionType, SDS_BLOCK_CONNECTIONS)}`,
    )
    if (sc.storageEfficiency) params.push(`  storageEfficiency: ${sc.storageEfficiency}`)
    if (sc.fstype) params.push(`  csi.storage.k8s.io/fstype: ${sc.fstype}`)
  } else if (sc.kind === 'stretched' || sc.kind === 'stretched-adr') {
    params.push(
      `  connectionType: ${coerceConnectionType(sc.connectionType, STRETCHED_CONNECTIONS)}`,
    )
    params.push(`  replicationType: stretched`)
    if (sc.quorumID) params.push(`  quorumID: ${JSON.stringify(sc.quorumID)}`)
    if (sc.copyGroupName) params.push(`  copyGroupName: ${JSON.stringify(sc.copyGroupName)}`)
    if (sc.consistencyGroupId) params.push(`  consistencyGroupId: ${JSON.stringify(sc.consistencyGroupId)}`)
    if (sc.primaryPoolID) params.push(`  primaryPoolID: ${JSON.stringify(sc.primaryPoolID)}`)
    if (sc.primaryPortID) params.push(`  primaryPortID: ${sc.primaryPortID}`)
    if (sc.secondaryPoolID) params.push(`  secondaryPoolID: ${JSON.stringify(sc.secondaryPoolID)}`)
    if (sc.secondaryPortID) params.push(`  secondaryPortID: ${sc.secondaryPortID}`)
  } else {
    if (sc.serialNumber) params.push(`  serialNumber: ${JSON.stringify(sc.serialNumber)}`)
    if (sc.poolID) params.push(`  poolID: ${JSON.stringify(sc.poolID)}`)
    if (conn?.needsPortId && sc.portID) params.push(`  portID: ${sc.portID}`)
    params.push(`  connectionType: ${sc.connectionType}`)
    if (conn?.needsNvmSubsystem && sc.nvmSubsystemID) {
      params.push(`  nvmSubsystemID: ${JSON.stringify(sc.nvmSubsystemID)}`)
    }
    if (sc.storageEfficiency && sc.storageEfficiency !== 'Disabled') {
      params.push(`  storageEfficiency: ${JSON.stringify(sc.storageEfficiency)}`)
      if (sc.storageEfficiencyMode) {
        params.push(`  storageEfficiencyMode: ${JSON.stringify(sc.storageEfficiencyMode)}`)
      }
    } else if (sc.storageEfficiency === 'Disabled') {
      // omit or set Disabled — sample often omits; include for clarity when user chose it
    }
    if (sc.fstype) params.push(`  csi.storage.k8s.io/fstype: ${sc.fstype}`)
  }

  const secretName = sc.kind.startsWith('stretched') ? sc.stretchedSecretName || sc.secretName : sc.secretName
  params.push(secretRefs(secretName, sc.secretNamespace, expand))

  const annotations = ['    kubernetes.io/description: Hitachi CSI']
  if (sc.isDefault) {
    annotations.push('    storageclass.kubernetes.io/is-default-class: "true"')
  }

  return `apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: ${sc.name}
  annotations:
${annotations.join('\n')}
provisioner: hspc.csi.hitachi.com
reclaimPolicy: ${sc.reclaimPolicy}
volumeBindingMode: ${sc.volumeBindingMode}
allowVolumeExpansion: ${expand}
parameters:
${params.join('\n')}
`
}

function snapshotSourceSc(state: WizardState): StorageClassConfig | undefined {
  const list = state.storageClasses
  return (
    list.find((s) => s.isDefault && s.kind === 'standard' && s.poolID) ||
    list.find((s) => s.kind === 'standard' && s.poolID) ||
    list.find((s) => (s.kind === 'stretched' || s.kind === 'stretched-adr') && s.primaryPoolID) ||
    list[0]
  )
}

export function snapshotClassOpts(state: WizardState): {
  poolID: string
  secretName: string
  secretNamespace: string
} {
  const sourceSc = snapshotSourceSc(state)
  const poolID =
    sourceSc?.kind === 'standard' ? sourceSc.poolID || '' : sourceSc?.primaryPoolID || ''
  const secretName = sourceSc
    ? sourceSc.kind.startsWith('stretched')
      ? sourceSc.stretchedSecretName || sourceSc.secretName
      : sourceSc.secretName
    : state.storageClasses[0]?.secretName || 'hitachi-csi-secret'
  const secretNamespace =
    sourceSc?.secretNamespace ||
    state.storageClasses[0]?.secretNamespace ||
    state.driverNamespace
  return { poolID, secretName, secretNamespace }
}

export function generateSnapshotClass(
  cfg: SnapshotClassConfig,
  opts: {
    poolID: string
    secretName: string
    secretNamespace: string
  },
): string {
  const metaAnnotations: string[] = []
  if (cfg.isDefault) {
    metaAnnotations.push('    snapshot.storage.kubernetes.io/is-default-class: "true"')
  }
  const metaBlock =
    metaAnnotations.length > 0
      ? `metadata:
  name: ${cfg.name}
  annotations:
${metaAnnotations.join('\n')}`
      : `metadata:
  name: ${cfg.name}`

  const snapParams: string[] = []
  if (opts.poolID) snapParams.push(`  poolID: ${JSON.stringify(opts.poolID)}`)
  snapParams.push(`  csi.storage.k8s.io/snapshotter-secret-name: ${JSON.stringify(opts.secretName)}`)
  snapParams.push(
    `  csi.storage.k8s.io/snapshotter-secret-namespace: ${JSON.stringify(opts.secretNamespace)}`,
  )
  if (cfg.immutable && cfg.retentionPeriod) {
    snapParams.push(`  retentionPeriod: ${JSON.stringify(cfg.retentionPeriod)}`)
  }

  return `apiVersion: snapshot.storage.k8s.io/v1
kind: VolumeSnapshotClass
${metaBlock}
driver: hspc.csi.hitachi.com
deletionPolicy: ${cfg.deletionPolicy}
parameters:
${snapParams.join('\n')}
`
}

export function generateHspcCr(namespace: string): string {
  return `apiVersion: csi.hitachi.com/v1
kind: HSPC
metadata:
  name: hspc
  namespace: ${namespace}
spec: {}
`
}

export function generateReplicationSecrets(cfg: ReplicationConfig): string {
  const storages = cfg.storageSecrets
    .map(
      (s) => `    - serial: ${s.serial}
      url: ${s.url}
      user: ${s.user}
      password: ${s.password}
      journal: ${s.journal}`,
    )
    .join('\n')
  return `apiVersion: v1
kind: Secret
metadata:
  name: hspc-replication-operator-storage-secrets
  namespace: ${cfg.namespace}
type: Opaque
stringData:
  storage-secrets.yaml: |-
    storages:
${storages}
`
}

export function generateMetricsSecret(cfg: MetricsConfig): string {
  const storages = cfg.storages
    .map(
      (s) => `    - serial: ${s.serial}
      url: ${s.url}
      user: ${s.user}
      password: ${s.password}`,
    )
    .join('\n')
  return `apiVersion: v1
kind: Secret
metadata:
  name: ${cfg.secretName}
  namespace: ${cfg.namespace}
type: Opaque
stringData:
  storage-exporter.yaml: |-
    storages:
${storages}
`
}

export function generateMetricsExporterPatch(cfg: MetricsConfig, version: string): string {
  return `# Performance Metrics exporter environment (apply after base exporter.yaml)
# Image tag aligned to ${version}
apiVersion: apps/v1
kind: Deployment
metadata:
  name: storage-exporter
  namespace: ${cfg.namespace}
spec:
  template:
    spec:
      containers:
        - name: storage-exporter
          image: registry.hitachivantara.com/hitachicsi-oci-oss/storage-plugin-for-prometheus:${version}
          env:
            - name: SPC_PUSHGATEWAY_URL
              value: http://pushgateway:9091
            - name: SPC_ENABLE_DEBUG_LOG
              value: ${JSON.stringify(String(cfg.enableDebugLog))}
            - name: MAX_BATCH_SIZE
              value: ${JSON.stringify(cfg.maxBatchSize)}
            - name: MAX_WORKER_COUNT
              value: ${JSON.stringify(cfg.maxWorkerCount)}
`
}

export function generatePvc(qs: QuickstartConfig): string {
  return `apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: ${qs.pvcName}
spec:
  accessModes:
    - ${qs.accessMode}
  volumeMode: ${qs.volumeMode}
  resources:
    requests:
      storage: ${qs.pvcSize}
  storageClassName: ${qs.storageClassName}
`
}

export function generateTestPod(qs: QuickstartConfig): string {
  if (qs.volumeMode === 'Block') {
    return `apiVersion: v1
kind: Pod
metadata:
  name: ${qs.podName}
spec:
  containers:
    - name: app
      image: registry.k8s.io/pause:3.9
      volumeDevices:
        - name: data
          devicePath: /dev/xvda
  volumes:
    - name: data
      persistentVolumeClaim:
        claimName: ${qs.pvcName}
`
  }
  return `apiVersion: v1
kind: Pod
metadata:
  name: ${qs.podName}
spec:
  containers:
    - name: app
      image: busybox:1.36
      command: ["sh", "-c", "echo Hitachi CSI test volume OK > /data/hello.txt && sleep 3600"]
      volumeMounts:
        - name: data
          mountPath: /data
  volumes:
    - name: data
      persistentVolumeClaim:
        claimName: ${qs.pvcName}
`
}

export function generateInstallScript(state: WizardState, files: GeneratedFile[]): string {
  const plat = PLATFORMS[state.platform]
  const cmd = plat.useOc ? 'oc' : 'kubectl'
  const applyFiles = files.filter((f) => f.group !== 'scripts' && f.path.endsWith('.yaml'))
  const lines = [
    '#!/usr/bin/env bash',
    'set -euo pipefail',
    `# Hitachi CSI Deployment Wizard — generated install script`,
    `# Platform: ${plat.displayName} ${state.platformVersion}`,
    `CMD="${cmd}"`,
    '',
    'apply() {',
    '  local f="$1"',
    '  echo "==> Applying $f"',
    '  "$CMD" apply -f "$f"',
    '}',
    '',
  ]

  const prereqYaml = applyFiles.filter(
    (f) => f.group === 'prereq' && f.path.endsWith('.yaml') && plat.useOc,
  )
  // Multipath delivery must complete before CSI Driver install.
  if (prereqYaml.length && state.multipath.includeDaemonSet) {
    const ds = expectedMultipathDaemonSet({ name: state.multipath.machineConfigName })
    const dsFile =
      prereqYaml.find((f) => f.path.includes('daemonset'))?.path || prereqYaml[0].path
    lines.push(
      `# Multipath DaemonSet (hosted/HCP): wizard alreadyApplied=${state.multipath.alreadyApplied ? '1' : '0'}`,
      `MULTIPATH_ALREADY_APPLIED=${state.multipath.alreadyApplied ? '1' : '0'}`,
      `MULTIPATH_DS_NAME=${JSON.stringify(ds.name)}`,
      `MULTIPATH_DS_NS=${JSON.stringify(ds.namespace)}`,
      '',
      'SKIP_MULTIPATH_APPLY=0',
      'if [[ "$MULTIPATH_ALREADY_APPLIED" == "1" ]]; then',
      '  echo "==> Multipath: wizard marked DaemonSet as already applied — skipping apply."',
      '  SKIP_MULTIPATH_APPLY=1',
      `elif "$CMD" get daemonset "$MULTIPATH_DS_NAME" -n "$MULTIPATH_DS_NS" >/dev/null 2>&1; then`,
      '  echo "==> Multipath: found existing DaemonSet $MULTIPATH_DS_NAME — skipping apply."',
      '  SKIP_MULTIPATH_APPLY=1',
      'fi',
      '',
      'if [[ "$SKIP_MULTIPATH_APPLY" == "1" ]]; then',
      '  echo "YAML remains under 00-prereq/ for reference."',
      '  echo "If you changed multipath.conf after applying, re-apply the YAML manually before continuing."',
      '  "$CMD" get daemonset "$MULTIPATH_DS_NAME" -n "$MULTIPATH_DS_NS" || true',
      '  read -r -p "Press Enter once multipath is verified on nodes... "',
      '  echo',
      'else',
      '  echo "==> Applying multipath DaemonSet (hosted/HCP)"',
      '  echo "Writes /etc/multipath.conf and enables multipathd on nodes (no MachineConfigPool reboot cycle)."',
      '  read -r -p "Press Enter to apply the DaemonSet... " ',
      '',
      `  apply "${dsFile}"`,
      '',
      '  echo "Waiting for DaemonSet rollout..."',
      '  "$CMD" rollout status "daemonset/$MULTIPATH_DS_NAME" -n "$MULTIPATH_DS_NS" --timeout=300s || true',
      '',
      '  read -r -p "Confirm multipath is verified on nodes, then press Enter... "',
      '  echo',
      'fi',
      '',
    )
  } else if (prereqYaml.length && state.multipath.includeMachineConfig) {
    const mcNames = expectedMultipathMachineConfigNames({
      name: state.multipath.machineConfigName,
      role: state.multipath.machineConfigRole,
    })
    const namesBash = mcNames.map((n) => JSON.stringify(n)).join(' ')
    lines.push(
      `# Multipath: wizard alreadyApplied=${state.multipath.alreadyApplied ? '1' : '0'}`,
      `MULTIPATH_ALREADY_APPLIED=${state.multipath.alreadyApplied ? '1' : '0'}`,
      `MULTIPATH_MC_NAMES=(${namesBash})`,
      '',
      'multipath_mcs_exist() {',
      '  local n',
      '  for n in "${MULTIPATH_MC_NAMES[@]}"; do',
      '    if ! "$CMD" get machineconfig "$n" >/dev/null 2>&1; then',
      '      return 1',
      '    fi',
      '  done',
      '  return 0',
      '}',
      '',
      'SKIP_MULTIPATH_APPLY=0',
      'if [[ "$MULTIPATH_ALREADY_APPLIED" == "1" ]]; then',
      '  echo "==> Multipath: wizard marked MachineConfig as already applied — skipping apply."',
      '  SKIP_MULTIPATH_APPLY=1',
      'elif multipath_mcs_exist; then',
      '  echo "==> Multipath: found existing MachineConfig(s) (${MULTIPATH_MC_NAMES[*]}) — skipping apply."',
      '  SKIP_MULTIPATH_APPLY=1',
      'fi',
      '',
      'if [[ "$SKIP_MULTIPATH_APPLY" == "1" ]]; then',
      '  echo "YAML remains under 00-prereq/ for reference."',
      '  echo "If you changed multipath.conf after applying, re-apply the YAML manually before continuing."',
      '  echo "Confirm MachineConfigPools are healthy (UPDATED=True / UPDATING=False):"',
      '  "$CMD" get mcp || true',
      '  read -r -p "Press Enter once multipath is verified on nodes... "',
      '  echo',
      'else',
      '  echo "==> Applying multipath MachineConfig(s)"',
      '  echo "WARNING: MachineConfig updates reboot nodes in the targeted pool (rolling)."',
      '  echo "Do not install the CSI Driver until MCP shows UPDATED=True / UPDATING=False."',
      '  read -r -p "Press Enter to apply MachineConfig(s) and begin node reboots... " ',
      '',
    )
    for (const f of prereqYaml) {
      lines.push(`  apply "${f.path}"`)
    }
    lines.push(
      '',
      '  echo "Watch MachineConfigPools (Ctrl+C when UPDATED=True and UPDATING=False):"',
      '  "$CMD" get mcp -w || true',
      '',
      '  read -r -p "Confirm all targeted nodes rebooted and multipath is verified, then press Enter... "',
      '  echo',
      'fi',
      '',
    )
  }

  if (plat.operatorHub) {
    const ns = state.operatorNamespace
    const pkg = HSPC_OLM_PACKAGE
    lines.push(
      `echo "==> CSI Driver operator (OperatorHub / OLM)"`,
      `OPERATOR_NS=${JSON.stringify(ns)}`,
      `OPERATOR_SUB=${JSON.stringify(pkg)}`,
      'apply "02-driver/operatorhub-namespace.yaml"',
      'apply "02-driver/operatorhub-operatorgroup.yaml"',
      'apply "02-driver/operatorhub-subscription.yaml"',
      '',
      'echo "==> Approving day-0 InstallPlan (Subscription stays Manual for later upgrades)"',
      'approve_installplan() {',
      '  local ns="$1"',
      '  local end=$((SECONDS + 300))',
      '  local ip=""',
      '  while (( SECONDS < end )); do',
      `    ip="$("$CMD" get installplan -n "$ns" -o go-template='{{range .items}}{{if not .spec.approved}}{{.metadata.name}}{{"\\n"}}{{end}}{{end}}' 2>/dev/null | head -n1 || true)"`,
      '    if [[ -n "$ip" ]]; then',
      '      echo "    Approving InstallPlan $ip"',
      `      "$CMD" patch installplan "$ip" -n "$ns" --type merge -p '{"spec":{"approved":true}}'`,
      '      return 0',
      '    fi',
      '    sleep 5',
      '  done',
      '  echo "Timed out waiting for an InstallPlan in $ns (is certified-operators available?)" >&2',
      '  return 1',
      '}',
      'approve_installplan "$OPERATOR_NS"',
      '',
      'echo "==> Waiting for ClusterServiceVersion Succeeded..."',
      'wait_csv_succeeded() {',
      '  local ns="$1"',
      '  local pkg="$2"',
      '  local end=$((SECONDS + 600))',
      '  local csv="" phase=""',
      '  while (( SECONDS < end )); do',
      '    csv="$("$CMD" get csv -n "$ns" --no-headers 2>/dev/null | awk -v p="$pkg" \x27$1 ~ "^"p {print $1; exit}\x27 || true)"',
      '    if [[ -n "$csv" ]]; then',
      '      phase="$("$CMD" get csv "$csv" -n "$ns" -o jsonpath="{.status.phase}" 2>/dev/null || true)"',
      '      echo "    CSV $csv phase=$phase"',
      '      if [[ "$phase" == "Succeeded" ]]; then',
      '        return 0',
      '      fi',
      '    else',
      '      echo "    Waiting for CSV matching $pkg..."',
      '    fi',
      '    sleep 10',
      '  done',
      '  echo "Timed out waiting for CSV Succeeded in $ns" >&2',
      '  "$CMD" get csv -n "$ns" || true',
      '  return 1',
      '}',
      'wait_csv_succeeded "$OPERATOR_NS" "$OPERATOR_SUB"',
      '',
      'echo "==> Applying CSI Driver HSPC instance"',
      'apply "02-driver/hspc-cr.yaml"',
      `echo "Waiting for CSI Driver HSPC READY..."`,
      `"$CMD" wait --for=jsonpath='{.status.ready}'=true hspc/hspc -n ${state.driverNamespace} --timeout=300s || true`,
      '',
    )
  }

  for (const f of applyFiles) {
    if (f.group === 'prereq') continue
    // Replication URLs + ordering handled in the dedicated block below
    if (f.group === 'replication') continue
    // OperatorHub path: OLM + HSPC CR applied above
    if (plat.operatorHub && f.path.startsWith('02-driver/')) {
      continue
    }
    // Telemetry disable ConfigMap must be applied only after HSPC READY (dedicated block below)
    if (f.path === '02-driver/hspc-csi-telemetry-config.yaml') {
      continue
    }
    lines.push(`apply "${f.path}"`)
  }

  if (state.components.replication) {
    const hrpcBase = `https://raw.githubusercontent.com/hitachi-vantara/csi-operator-hitachi/main/hrpc/${state.versions.replication}`
    lines.push(
      '',
      'echo "==> Replication operator + Disaster Recovery (automatic)"',
      `apply_url() { echo "==> Applying $1"; "$CMD" apply -f "$1"; }`,
      `apply_url "${hrpcBase}/yaml/hspc-replication-operator-namespace.yaml"`,
      `apply_url "${hrpcBase}/yaml/hspc-replication-operator.yaml"`,
    )
    if (files.some((f) => f.path === '03-replication/storage-secrets.yaml')) {
      lines.push('apply "03-replication/storage-secrets.yaml"')
    }
    lines.push(
      `apply_url "${hrpcBase}/dr-operator/yaml/cert-manager.yaml"`,
      `apply_url "${hrpcBase}/dr-operator/yaml/dr-operator-install.yaml"`,
      '',
      'echo "==> Remote kubeconfig Secrets"',
      'echo "Required input: KUBECONFIG_P and KUBECONFIG_S (paths to both cluster kubeconfigs)."',
      'echo "install.sh then runs the helper script to build + apply both Secrets."',
      'if [[ -n "${KUBECONFIG_P:-}" && -n "${KUBECONFIG_S:-}" ]]; then',
      '  chmod +x ./03-replication/create-remote-kubeconfig-secrets.sh',
      '  APPLY=1 ./03-replication/create-remote-kubeconfig-secrets.sh',
      'else',
      '  echo "Set KUBECONFIG_P and KUBECONFIG_S, then re-run install.sh to finish remote Secrets."',
      '  echo "  export KUBECONFIG_P=/path/to/primary-kubeconfig"',
      '  echo "  export KUBECONFIG_S=/path/to/secondary-kubeconfig"',
      '  read -r -p "Or press Enter after you have applied those Secrets another way... "',
      'fi',
    )
  }

  lines.push(
    '',
    `echo "Waiting for CSI Driver HSPC READY..."`,
    `"$CMD" wait --for=jsonpath='{.status.ready}'=true hspc/hspc -n ${state.driverNamespace} --timeout=300s || true`,
  )

  if (!state.telemetryEnabled) {
    lines.push(
      '',
      'echo "==> Disabling Hitachi Telemetry (ConfigMap awsEnabled=false)"',
      `if [[ "$("$CMD" get hspc hspc -n ${state.driverNamespace} -o jsonpath='{.status.ready}' 2>/dev/null || true)" == "true" ]]; then`,
      `  "$CMD" scale deployment hspc-operator-controller-manager --replicas=0 -n ${state.operatorNamespace}`,
      '  apply "02-driver/hspc-csi-telemetry-config.yaml"',
      `  "$CMD" scale deployment hspc-operator-controller-manager --replicas=1 -n ${state.operatorNamespace}`,
      'else',
      '  echo "WARN: HSPC not READY — skipped Telemetry disable. After READY, scale the operator down, apply 02-driver/hspc-csi-telemetry-config.yaml, then scale back up." >&2',
      '  echo "ERROR: Hitachi Telemetry was opted out but HSPC is not READY; refusing to finish with Telemetry still enabled." >&2',
      '  exit 1',
      'fi',
    )
  }

  const hasQuickstart =
    state.storageClassesEnabled || files.some((f) => f.group === 'quickstart')
  if (hasQuickstart) {
    lines.push(
      '',
      `echo "Waiting for PVC Bound..."`,
      `"$CMD" wait --for=jsonpath='{.status.phase}'=Bound pvc/${state.quickstart.pvcName} --timeout=180s || true`,
      '',
      'echo "Done. Verify with:"',
      `echo "  $CMD get pvc ${state.quickstart.pvcName}"`,
      `echo "  $CMD get pod ${state.quickstart.podName}"`,
    )
  } else {
    lines.push('', 'echo "Done. Verify CSI Driver:"', `"$CMD" get hspc -n ${state.driverNamespace}`)
  }
  return lines.join('\n') + '\n'
}

export async function generateAll(state: WizardState): Promise<GeneratedFile[]> {
  const files: GeneratedFile[] = []
  const plat = PLATFORMS[state.platform]

  // Multipath prerequisites
  if (state.multipath.enabled) {
    // Classic OpenShift/ROSA: MachineConfig. Hosted/HCP: DaemonSet. Others: loose conf.
    if (plat.useOc && state.multipath.includeMachineConfig) {
      for (const mc of generateMultipathMachineConfigs({
        name: state.multipath.machineConfigName,
        role: state.multipath.machineConfigRole,
        conf: state.multipath.customConf || undefined,
      })) {
        files.push({ ...mc, group: 'prereq' })
      }
      files.push({
        path: '00-prereq/README-multipath.md',
        content: `# Multipath (OpenShift — self-managed)

> **Important:** Applying these MachineConfigs **reboots every node** in the targeted MachineConfigPool
> (rolling). Schedule a maintenance window. Do **not** install the CSI Driver or create PVCs until pools
> are fully updated.

The Hitachi multipath sample is embedded in the MachineConfig as base64 Ignition content for
\`/etc/multipath.conf\`. Do not copy a loose \`multipath.conf\` onto nodes.

**Paths:**

1. **Early apply (optional):** On the Prerequisites step, copy the MachineConfig preview and
   \`oc apply\` it so nodes reboot while you finish the wizard. Check **I already applied this
   MachineConfig** so \`install.sh\` skips apply.
2. **Via install.sh (default):** Leave that checkbox unchecked. \`install.sh\` applies the YAML,
   then waits for MCP / reboots. It also skips apply if the MachineConfig already exists on the cluster.

\`\`\`bash
# Early apply example:
oc apply -f 00-prereq/
oc get mcp -w

# Or let install.sh handle apply + wait
./install.sh
\`\`\`

After apply (either path), wait until pools show UPDATED=True / UPDATING=False, then continue with
CSI Driver install.
`,
        description: 'Multipath apply notes for OpenShift (includes reboot warning)',
        group: 'prereq',
      })
    } else if (plat.useOc && state.multipath.includeDaemonSet) {
      for (const ds of generateMultipathDaemonSetFiles({
        name: state.multipath.machineConfigName,
        conf: state.multipath.customConf || undefined,
        enableIscsi: state.connectionType === 'iscsi',
      })) {
        files.push({ ...ds, group: 'prereq' })
      }
      files.push({
        path: '00-prereq/README-multipath.md',
        content: `# Multipath (OpenShift — hosted / HCP)

Use this path when the guest API has **no MachineConfig** (HyperShift, ROSA HCP, many lab clusters).
The DaemonSet writes Hitachi \`/etc/multipath.conf\` and enables \`multipathd\` on each node.

**Paths:**

1. **Early apply (optional):** On the Prerequisites step, \`oc apply\` the DaemonSet preview. Check
   **I already applied this DaemonSet** so \`install.sh\` skips apply.
2. **Via install.sh (default):** Leave that checkbox unchecked. \`install.sh\` applies the YAML and
   waits for DaemonSet rollout. It also skips if the DaemonSet already exists.

\`\`\`bash
oc apply -f 00-prereq/
oc rollout status ds/${state.multipath.machineConfigName || 'hitachi-csi-multipath'} -n kube-system

# Or:
./install.sh
\`\`\`

Confirm multipath is healthy on workers before installing the CSI Driver.
`,
        description: 'Multipath apply notes for hosted/HCP OpenShift (DaemonSet)',
        group: 'prereq',
      })
    } else if (!plat.useOc && state.multipath.includeConf) {
      files.push({
        path: '00-prereq/multipath.conf',
        content: getMultipathConf(state.multipath.customConf || undefined),
        description: 'Hitachi CSI Device Mapper Multipath sample (/etc/multipath.conf)',
        group: 'prereq',
      })
      files.push({
        path: '00-prereq/README-multipath.md',
        content: `# Multipath (Kubernetes)

1. Copy \`multipath.conf\` to each worker:

\`\`\`bash
sudo cp multipath.conf /etc/multipath.conf
sudo systemctl enable --now multipathd
multipath -ll
\`\`\`

2. Ensure \`user_friendly_names yes\` remains set.
`,
        description: 'Multipath apply notes for Kubernetes',
        group: 'prereq',
      })
    }
  }

  // Secrets from storage systems
  for (const sys of state.storageSystems) {
    if (!sys.serial && !sys.url) continue
    const name = state.storageClasses[0]?.secretName || 'hitachi-csi-secret'
    const ns = state.storageClasses[0]?.secretNamespace || state.driverNamespace
    files.push({
      path: `01-storage/secret-${sys.name || sys.id}.yaml`,
      content: generateStandardSecret(sys, sys.name === 'primary' ? name : `hitachi-csi-secret-${sys.name}`, ns),
      description: `Storage Secret for ${sys.name || sys.serial}`,
      group: 'storage',
    })
  }

  const primary = state.storageSystems.find((s) => s.stretchedRole === 'primary') || state.storageSystems[0]
  const secondary = state.storageSystems.find((s) => s.stretchedRole === 'secondary') || state.storageSystems[1]
  const needsStretched = state.storageClasses.some((s) => s.kind === 'stretched' || s.kind === 'stretched-adr')
  if (state.storageClassesEnabled && needsStretched && primary && secondary) {
    const sc = state.storageClasses.find((s) => s.kind.startsWith('stretched'))!
    files.push({
      path: '01-storage/secret-stretched.yaml',
      content: generateStretchedSecret(primary, secondary, sc.stretchedSecretName || 'hitachi-csi-secret-stretched', sc.secretNamespace),
      description: 'Stretched / GAD dual-array Secret',
      group: 'storage',
    })
  }

  if (state.storageClassesEnabled) {
    for (const sc of state.storageClasses) {
      const serial =
        sc.kind === 'standard'
          ? effectiveSerialNumber(sc, state.storageSystems) || sc.serialNumber
          : sc.serialNumber
      files.push({
        path: `01-storage/storageclass-${sc.name}.yaml`,
        content: generateStorageClass({
          ...sc,
          connectionType: sc.connectionType || state.connectionType,
          serialNumber: serial,
        }),
        description: `StorageClass ${sc.name} (${sc.kind})`,
        group: 'storage',
      })
    }

    if (state.snapshotClass.enabled) {
      files.push({
        path: `01-storage/volumesnapshotclass-${state.snapshotClass.name}.yaml`,
        content: generateSnapshotClass(state.snapshotClass, snapshotClassOpts(state)),
        description: 'VolumeSnapshotClass',
        group: 'storage',
      })
    }
  }

  // Driver
  if (!plat.operatorHub) {
    files.push({
      path: '02-driver/README.md',
      content: `# CSI Driver install (Kubernetes)

Apply operator manifests from the upstream repo at version ${state.versions.driver}:

\`\`\`bash
kubectl apply -f https://raw.githubusercontent.com/hitachi-vantara/csi-operator-hitachi/main/hspc/${state.versions.driver}/operator/hspc-operator-namespace.yaml
kubectl apply -f https://raw.githubusercontent.com/hitachi-vantara/csi-operator-hitachi/main/hspc/${state.versions.driver}/operator/hspc-operator.yaml
kubectl apply -f hspc-cr.yaml
kubectl get hspc -n ${state.driverNamespace}
\`\`\`
${
  state.telemetryEnabled
    ? ''
    : `
Telemetry is disabled in this package. \`install.sh\` applies \`hspc-csi-telemetry-config\` (awsEnabled=false)
after the CSI Driver HSPC instance is READY.`
}
`,
      description: 'Kubernetes driver install notes',
      group: 'driver',
    })
  } else {
    for (const f of generateOperatorHubFiles(state)) {
      files.push({ ...f, group: 'driver' })
    }
    files.push({
      path: '02-driver/README-openshift.md',
      content: `# CSI Driver install (OpenShift OperatorHub)

\`install.sh\` installs the operator via OLM (no console click required):

1. Applies Namespace, OperatorGroup, and Subscription for **Hitachi Storage Plug-in for Containers**
   (\`hspc-operator\` from \`certified-operators\`, channel \`stable\`).
2. Approves the **day-0** InstallPlan. The Subscription keeps \`installPlanApproval: Manual\` so later
   upgrades still require approval (per product docs).
3. Waits for ClusterServiceVersion **Succeeded**.
4. Applies \`hspc-cr.yaml\` in \`${state.driverNamespace}\` and waits until READY.

Air-gapped: mirror the \`certified-operators\` catalog first.

Manual verify:

\`\`\`bash
oc get csv -n ${state.operatorNamespace}
oc get hspc -n ${state.driverNamespace}
# NAME   READY   AGE
# hspc   true    30s
\`\`\`

Target driver version (wizard): **${state.versions.driver}**
${
  state.telemetryEnabled
    ? ''
    : `

Telemetry is disabled in this package. After HSPC is READY, \`install.sh\` scales the operator, applies
\`hspc-csi-telemetry-config\` (awsEnabled=false), then scales back up.`
}
`,
      description: 'OpenShift OperatorHub install guide',
      group: 'driver',
    })
  }

  files.push({
    path: '02-driver/hspc-cr.yaml',
    content: generateHspcCr(state.driverNamespace),
    description: 'Hitachi CSI Driver custom resource',
    group: 'driver',
  })

  if (!state.telemetryEnabled) {
    files.push({
      path: '02-driver/hspc-csi-telemetry-config.yaml',
      content: generateTelemetryDisableConfigMap(state.driverNamespace),
      description: 'Disable Hitachi Telemetry (awsEnabled false)',
      group: 'driver',
    })
  }

  // Replication
  if (state.components.replication) {
    files.push({
      path: '03-replication/README.md',
      content: `# Replication + Disaster Recovery

Version: ${state.versions.replication}

## What install.sh does for you

1. Applies the Replication operator (namespace + operator manifests)
2. Applies \`storage-secrets.yaml\` when present
3. Applies cert-manager + Disaster Recovery operator
4. Runs \`create-remote-kubeconfig-secrets.sh\` when \`KUBECONFIG_P\` and \`KUBECONFIG_S\` are set

## What you provide

Before \`./install.sh\`, set paths to both cluster kubeconfigs:

\`\`\`bash
export KUBECONFIG_P=/path/to/primary-kubeconfig
export KUBECONFIG_S=/path/to/secondary-kubeconfig
\`\`\`

Details: \`remote-kubeconfig-notes.md\`.
`,
      description: 'Replication and DR Operator install notes',
      group: 'replication',
    })
    if (state.replication.storageSecrets.length) {
      files.push({
        path: '03-replication/storage-secrets.yaml',
        content: generateReplicationSecrets({ ...state.replication, enabled: true, disasterRecovery: true }),
        description: 'Replication storage secrets',
        group: 'replication',
      })
    }
    files.push({
      path: '03-replication/remote-kubeconfig-notes.md',
      content: `# Remote kubeconfig Secrets

Target Secret: \`${state.replication.remoteKubeconfigSecretName || REMOTE_KUBECONFIG_SECRET_NAME}\`
Data key: \`remote-kubeconfig\`
Namespace: \`${state.replication.namespace}\`

## What you provide

Paths to both cluster kubeconfigs (environment variables):

\`\`\`bash
export KUBECONFIG_P=/path/to/primary-kubeconfig
export KUBECONFIG_S=/path/to/secondary-kubeconfig
\`\`\`

## What happens automatically

\`install.sh\` (or \`APPLY=1 ./create-remote-kubeconfig-secrets.sh\`) will:

1. Build both Secrets with the correct name, namespace, and base64 data key
2. Put the **other** site's kubeconfig into each Secret
3. Apply the primary Secret with \`KUBECONFIG_P\`
4. Apply the secondary Secret with \`KUBECONFIG_S\`

You do not create these Secrets by hand.
`,
      description: 'Remote kubeconfig instructions',
      group: 'replication',
    })
    files.push({
      path: '03-replication/create-remote-kubeconfig-secrets.sh',
      content: generateRemoteKubeconfigScript({
        namespace: state.replication.namespace,
        cmd: plat.useOc ? 'oc' : 'kubectl',
        secretName: state.replication.remoteKubeconfigSecretName || REMOTE_KUBECONFIG_SECRET_NAME,
      }),
      description: 'Automates both remote-kubeconfig Secrets from KUBECONFIG_P / KUBECONFIG_S',
      group: 'replication',
    })
    if (state.replication.secondaryKubeconfig?.trim()) {
      files.push({
        path: '03-replication/remote-kubeconfig-for-primary-site.yaml',
        content: generateRemoteKubeconfigSecret({
          namespace: state.replication.namespace,
          kubeconfig: state.replication.secondaryKubeconfig,
          secretName: state.replication.remoteKubeconfigSecretName || REMOTE_KUBECONFIG_SECRET_NAME,
        }),
        description: 'Apply on primary cluster (contains secondary kubeconfig)',
        group: 'replication',
      })
    }
    if (state.replication.primaryKubeconfig?.trim()) {
      files.push({
        path: '03-replication/remote-kubeconfig-for-secondary-site.yaml',
        content: generateRemoteKubeconfigSecret({
          namespace: state.replication.namespace,
          kubeconfig: state.replication.primaryKubeconfig,
          secretName: state.replication.remoteKubeconfigSecretName || REMOTE_KUBECONFIG_SECRET_NAME,
        }),
        description: 'Apply on secondary cluster (contains primary kubeconfig)',
        group: 'replication',
      })
    }
  }

  // Metrics
  if (state.components.metrics) {
    const cmd = plat.useOc ? 'oc' : 'kubectl'
    const metricsNs = state.metrics.namespace || 'hspc-monitoring-system'
    const stackSc = state.storageClasses[0]?.name || 'hitachi-csi'
    const hsppPaths = templatePaths('hspp', state.versions.metrics)
    const stackLines: string[] = []
    let fetchFailed = false

    // Namespace must exist before prometheus/grafana/exporter (splitMonitoringStack drops it).
    files.push({
      path: '04-metrics/namespace.yaml',
      content: `apiVersion: v1
kind: Namespace
metadata:
  name: ${metricsNs}
`,
      description: 'Performance Metrics namespace',
      group: 'metrics',
    })
    stackLines.push(`${cmd} apply -f namespace.yaml`)

    if (plat.useOc) {
      const sccRaw = await fetchFirstAvailable(hsppPaths.scc ?? [])
      if (sccRaw) {
        files.push({
          path: '04-metrics/scc-for-openshift.yaml',
          content: rewriteYamlNamespace(sccRaw, metricsNs),
          description: 'OpenShift SCC for Performance Metrics',
          group: 'metrics',
        })
        stackLines.push(`${cmd} apply -f scc-for-openshift.yaml`)
      } else {
        fetchFailed = true
      }
    }

    if (state.metrics.storages.length) {
      files.push({
        path: '04-metrics/metrics-secret.yaml',
        content: generateMetricsSecret(state.metrics),
        description: 'Performance Metrics exporter secret',
        group: 'metrics',
      })
      stackLines.push(`${cmd} apply -f metrics-secret.yaml`)
    }

    const exporterRaw = await fetchFirstAvailable(hsppPaths.exporter ?? [])
    if (exporterRaw) {
      files.push({
        path: '04-metrics/exporter.yaml',
        content: rewriteYamlNamespace(exporterRaw, metricsNs),
        description: 'Performance Metrics exporter',
        group: 'metrics',
      })
      stackLines.push(`${cmd} apply -f exporter.yaml`)
    } else {
      fetchFailed = true
    }

    if (state.metrics.deployPrometheus || state.metrics.deployGrafana) {
      const urls = hsppPaths.grafanaProm ?? []
      const combined = await fetchFirstAvailable(urls)
      if (!combined) {
        fetchFailed = true
      } else {
        const { prometheusYaml, grafanaYaml } = splitMonitoringStack(combined)

        if (state.metrics.deployPrometheus && prometheusYaml.trim()) {
          files.push({
            path: '04-metrics/prometheus-stack.yaml',
            content: rewriteStorageClassName(rewriteYamlNamespace(prometheusYaml, metricsNs), stackSc),
            description: 'Prometheus stack (from upstream HSPP monitoring YAML)',
            group: 'metrics',
          })
          stackLines.push(`${cmd} apply -f prometheus-stack.yaml`)
        }

        if (state.metrics.deployGrafana && grafanaYaml.trim()) {
          let content = state.metrics.deployPrometheus
            ? grafanaYaml
            : patchGrafanaDatasource(grafanaYaml, {
                namespace: state.consolePlugin.prometheusNamespace,
                service: state.consolePlugin.prometheusService,
                port: state.consolePlugin.prometheusPort,
              })
          content = rewriteStorageClassName(rewriteYamlNamespace(content, metricsNs), stackSc)
          files.push({
            path: '04-metrics/grafana-stack.yaml',
            content,
            description: 'Grafana stack + Hitachi dashboard (from upstream HSPP monitoring YAML)',
            group: 'metrics',
          })
          stackLines.push(`${cmd} apply -f grafana-stack.yaml`)
        }
      }
    }

    const stackNotes =
      state.metrics.deployPrometheus || state.metrics.deployGrafana
        ? `Notes:
- Stack manifests are filtered from upstream \`grafana-prometheus-sample.yaml\`.
- \`storageClassName\` is set to \`${stackSc}\` (first StorageClass in the wizard). Change if needed.
${
  state.metrics.deployGrafana && !state.metrics.deployPrometheus
    ? `- Grafana datasource points at \`http://${state.consolePlugin.prometheusService}.${state.consolePlugin.prometheusNamespace}.svc:${state.consolePlugin.prometheusPort}\`.`
    : ''
}
${fetchFailed ? '- WARNING: could not fetch some upstream metrics YAML; re-export when network access to GitHub is available.\n' : ''}
`
        : ''

    files.push({
      path: '04-metrics/README.md',
      content: `# Performance Metrics install

Version: ${state.versions.metrics}

\`install.sh\` applies these in order (namespace first):

\`\`\`bash
${stackLines.join('\n')}
\`\`\`

${stackNotes}
`,
      description: 'Performance Metrics install notes',
      group: 'metrics',
    })
  }

  // Console plugin
  if (state.components.consolePlugin && plat.supportsConsolePlugin) {
    files.push({
      path: '05-console/README.md',
      content: `# OpenShift Console Plugin

Apply the upstream console plugin manifest (version ${state.versions.driver}) and ensure Prometheus settings match Performance Metrics:

- namespace: \`${state.consolePlugin.prometheusNamespace}\`
- service: \`${state.consolePlugin.prometheusService}\`
- port: \`${state.consolePlugin.prometheusPort}\`

\`\`\`bash
oc apply -f https://raw.githubusercontent.com/hitachi-vantara/csi-operator-hitachi/main/hspc/${state.versions.driver}/sample/consoleplugin-ocp-ui.yaml
oc get consoleplugin console-plugin-vsp360-dcm
\`\`\`
`,
      description: 'Console plugin install notes',
      group: 'console',
    })
  }

  // Quickstart
  if (state.storageClassesEnabled) {
    files.push({
      path: '06-quickstart/pvc.yaml',
      content: generatePvc(state.quickstart),
      description: 'Test PVC for first PV',
      group: 'quickstart',
    })
    files.push({
      path: '06-quickstart/pod.yaml',
      content: generateTestPod(state.quickstart),
      description: 'Test Pod mounting the PVC',
      group: 'quickstart',
    })
  }

  const installSh = generateInstallScript(state, files)
  files.push({
    path: 'install.sh',
    content: installSh,
    description: 'Ordered install script',
    group: 'scripts',
  })

  // silence unused
  void yamlQuote
  void generateMetricsExporterPatch

  return files
}
