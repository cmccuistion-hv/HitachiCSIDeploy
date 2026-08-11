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
  generateRemoteKubeconfigScript,
  generateRemoteKubeconfigSecret,
  REMOTE_KUBECONFIG_SECRET_NAME,
} from './remoteKubeconfig'

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

  return `apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: ${sc.name}
  annotations:
    kubernetes.io/description: Hitachi CSI
provisioner: hspc.csi.hitachi.com
reclaimPolicy: ${sc.reclaimPolicy}
volumeBindingMode: ${sc.volumeBindingMode}
allowVolumeExpansion: ${expand}
parameters:
${params.join('\n')}
`
}

export function generateSnapshotClass(cfg: SnapshotClassConfig): string {
  return `apiVersion: snapshot.storage.k8s.io/v1
kind: VolumeSnapshotClass
metadata:
  name: ${cfg.name}${cfg.immutable ? '\n  annotations:\n    snapshot.storage.kubernetes.io/is-default-class: "false"' : ''}
driver: hspc.csi.hitachi.com
deletionPolicy: ${cfg.deletionPolicy}
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
  // Multipath MachineConfig must complete (and nodes reboot) before CSI Driver install.
  if (prereqYaml.length) {
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
    lines.push(
      'echo "OpenShift: Install the CSI Driver from OperatorHub / Software Catalog."',
      'echo "  (Do this only after multipath MachineConfig pools are UPDATED=True.)"',
      'echo "  Search: Hitachi Storage Plug-in for Containers"',
      'echo "  Installation mode: A specific namespace on the cluster"',
      'echo "  Update approval: Manual"',
      'echo "Then create the HSPC instance (or apply 02-driver/hspc-cr.yaml)."',
      'read -r -p "Press Enter once the CSI Driver operator is Succeeded and HSPC READY=true... "',
      '',
    )
  }

  for (const f of applyFiles) {
    if (f.group === 'prereq') continue
    // Replication URLs + ordering handled in the dedicated block below
    if (f.group === 'replication') continue
    // Skip operator yaml on OperatorHub path except hspc-cr
    if (plat.operatorHub && f.path.includes('hspc-operator') && !f.path.includes('hspc-cr')) {
      lines.push(`# Skipped (OperatorHub path): ${f.path}`)
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
    '',
    `echo "Waiting for PVC Bound..."`,
    `"$CMD" wait --for=jsonpath='{.status.phase}'=Bound pvc/${state.quickstart.pvcName} --timeout=180s || true`,
    '',
    'echo "Done. Verify with:"',
    `echo "  $CMD get pvc ${state.quickstart.pvcName}"`,
    `echo "  $CMD get pod ${state.quickstart.podName}"`,
  )
  return lines.join('\n') + '\n'
}

export function generateAll(state: WizardState): GeneratedFile[] {
  const files: GeneratedFile[] = []
  const plat = PLATFORMS[state.platform]

  // Multipath prerequisites
  if (state.multipath.enabled) {
    // OpenShift/ROSA: MachineConfig embeds the conf — do not ship a standalone multipath.conf to copy.
    // Kubernetes/RKE2/EKS: ship the conf file only (no MachineConfig).
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
        content: `# Multipath (OpenShift)

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
${
  plat.id === 'rosa'
    ? '\nROSA note: if MachineConfig is not available, use the upstream `rosa-daemonset.yaml` sample instead.\n'
    : ''
}
`,
        description: 'Multipath apply notes for OpenShift (includes reboot warning)',
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
    const ns = state.storageClasses[0]?.secretNamespace || 'default'
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
  if (needsStretched && primary && secondary) {
    const sc = state.storageClasses.find((s) => s.kind.startsWith('stretched'))!
    files.push({
      path: '01-storage/secret-stretched.yaml',
      content: generateStretchedSecret(primary, secondary, sc.stretchedSecretName || 'hitachi-csi-secret-stretched', sc.secretNamespace),
      description: 'Stretched / GAD dual-array Secret',
      group: 'storage',
    })
  }

  for (const sc of state.storageClasses) {
    files.push({
      path: `01-storage/storageclass-${sc.name}.yaml`,
      content: generateStorageClass({ ...sc, connectionType: sc.connectionType || state.connectionType }),
      description: `StorageClass ${sc.name} (${sc.kind})`,
      group: 'storage',
    })
  }

  if (state.snapshotClass.enabled) {
    files.push({
      path: `01-storage/volumesnapshotclass-${state.snapshotClass.name}.yaml`,
      content: generateSnapshotClass(state.snapshotClass),
      description: 'VolumeSnapshotClass',
      group: 'storage',
    })
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
`,
      description: 'Kubernetes driver install notes',
      group: 'driver',
    })
  } else {
    files.push({
      path: '02-driver/README-openshift.md',
      content: `# CSI Driver install (OpenShift OperatorHub)

1. Open **OperatorHub / Software Catalog** in the OpenShift web console.
2. Search for **Hitachi Storage Plug-in for Containers**.
3. Install with:
   - Installation mode: **A specific namespace on the cluster** (e.g. \`${state.operatorNamespace}\`)
   - Update approval: **Manual**
4. Wait until Operator status is **Succeeded**.
5. Create the CSI Driver instance in the **same namespace** (\`${state.driverNamespace}\`), or apply \`hspc-cr.yaml\`.
6. Verify:

\`\`\`bash
oc get hspc -n ${state.driverNamespace}
# NAME   READY   AGE
# hspc   true    30s
\`\`\`

Target version: **${state.versions.driver}**
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
    files.push({
      path: '04-metrics/README.md',
      content: `# Performance Metrics install

Version: ${state.versions.metrics}

\`\`\`bash
${plat.useOc ? 'oc' : 'kubectl'} apply -f https://raw.githubusercontent.com/hitachi-vantara/csi-operator-hitachi/main/hspp/${state.versions.metrics}/yaml/namespace.yaml
${
  plat.useOc
    ? `${plat.useOc ? 'oc' : 'kubectl'} apply -f https://raw.githubusercontent.com/hitachi-vantara/csi-operator-hitachi/main/hspp/${state.versions.metrics}/yaml/scc-for-openshift.yaml`
    : '# SCC only needed on OpenShift'
}
${plat.useOc ? 'oc' : 'kubectl'} apply -f metrics-secret.yaml
${plat.useOc ? 'oc' : 'kubectl'} apply -f https://raw.githubusercontent.com/hitachi-vantara/csi-operator-hitachi/main/hspp/${state.versions.metrics}/yaml/exporter.yaml
${
  state.metrics.deployTestStack
    ? `${plat.useOc ? 'oc' : 'kubectl'} apply -f https://raw.githubusercontent.com/hitachi-vantara/csi-operator-hitachi/main/hspp/${state.versions.metrics}/yaml/grafana-prometheus-sample.yaml`
    : '# Skipping test Prometheus/Grafana stack'
}
\`\`\`
`,
      description: 'Performance Metrics install notes',
      group: 'metrics',
    })
    if (state.metrics.storages.length) {
      files.push({
        path: '04-metrics/metrics-secret.yaml',
        content: generateMetricsSecret(state.metrics),
        description: 'Performance Metrics exporter secret',
        group: 'metrics',
      })
    }
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
