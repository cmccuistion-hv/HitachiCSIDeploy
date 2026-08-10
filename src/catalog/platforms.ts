/** Platform, protocol, and storage-type catalog with documented constraints. */

export type PlatformId = 'openshift' | 'kubernetes' | 'rke2' | 'eks' | 'rosa'
export type ConnectionType = 'fc' | 'iscsi' | 'nvme-fc' | 'nvme-tcp'
export type StorageFamily = 'vsp' | 'vsp-one-sds-block'
export type StorageClassKind = 'standard' | 'stretched' | 'stretched-adr' | 'vsp-one-sds-block'
export type StorageEfficiency = 'Disabled' | 'Compression' | 'CompressionDeduplication'
export type StorageEfficiencyMode = 'Inline' | 'PostProcess'
export type ReplicationType = 'UR' | 'TC'
export type FenceLevel = 'DATA' | 'STATUS' | 'NEVER'

export interface PlatformDef {
  id: PlatformId
  displayName: string
  versions: string[]
  /** Uses `oc` instead of `kubectl` in generated guides */
  useOc: boolean
  supportsConsolePlugin: boolean
  /** Install CSI Driver via OperatorHub / Software Catalog */
  operatorHub: boolean
  multipathHint: 'machineconfig' | 'conf' | 'daemonset'
}

export const PLATFORMS: Record<PlatformId, PlatformDef> = {
  openshift: {
    id: 'openshift',
    displayName: 'Red Hat OpenShift',
    versions: ['4.18', '4.19', '4.20', '4.21', '4.22'],
    useOc: true,
    supportsConsolePlugin: true,
    operatorHub: true,
    multipathHint: 'machineconfig',
  },
  rosa: {
    id: 'rosa',
    displayName: 'Red Hat OpenShift Service on AWS (ROSA)',
    versions: ['4.18', '4.19', '4.20', '4.21', '4.22'],
    useOc: true,
    supportsConsolePlugin: true,
    operatorHub: true,
    multipathHint: 'daemonset',
  },
  kubernetes: {
    id: 'kubernetes',
    displayName: 'Kubernetes',
    versions: ['1.31', '1.32', '1.33', '1.34'],
    useOc: false,
    supportsConsolePlugin: false,
    operatorHub: false,
    multipathHint: 'conf',
  },
  rke2: {
    id: 'rke2',
    displayName: 'Rancher Kubernetes Engine 2 (RKE2)',
    versions: ['1.31', '1.32', '1.33', '1.34'],
    useOc: false,
    supportsConsolePlugin: false,
    operatorHub: false,
    multipathHint: 'conf',
  },
  eks: {
    id: 'eks',
    displayName: 'Amazon Elastic Kubernetes Service (EKS)',
    versions: ['1.31', '1.32', '1.33', '1.34'],
    useOc: false,
    supportsConsolePlugin: false,
    operatorHub: false,
    multipathHint: 'conf',
  },
}

export const CONNECTION_TYPES: {
  id: ConnectionType
  label: string
  bareMetal: boolean
  virtualMachine: boolean
  needsPortId: boolean
  needsNvmSubsystem: boolean
  multipath: 'dm-multipath' | 'native-nvme'
}[] = [
  {
    id: 'fc',
    label: 'Fibre Channel (FC)',
    bareMetal: true,
    virtualMachine: false,
    needsPortId: true,
    needsNvmSubsystem: false,
    multipath: 'dm-multipath',
  },
  {
    id: 'iscsi',
    label: 'iSCSI',
    bareMetal: true,
    virtualMachine: true,
    needsPortId: true,
    needsNvmSubsystem: false,
    multipath: 'dm-multipath',
  },
  {
    id: 'nvme-fc',
    label: 'NVMe over FC',
    bareMetal: true,
    virtualMachine: false,
    needsPortId: false,
    needsNvmSubsystem: true,
    multipath: 'native-nvme',
  },
  {
    id: 'nvme-tcp',
    label: 'NVMe/TCP',
    bareMetal: true,
    virtualMachine: true,
    needsPortId: false,
    needsNvmSubsystem: true,
    multipath: 'native-nvme',
  },
]

/** Connection types allowed for VSP One SDS Block */
export const SDS_BLOCK_CONNECTIONS: ConnectionType[] = ['fc', 'iscsi', 'nvme-tcp']

export const STORAGE_EFFICIENCY: {
  id: StorageEfficiency
  label: string
  /** Not allowed on VSP One B20 series */
  blockedOnB20?: boolean
}[] = [
  { id: 'Disabled', label: 'Disabled (default on most models)', blockedOnB20: true },
  { id: 'Compression', label: 'Compression' },
  { id: 'CompressionDeduplication', label: 'Compression + Deduplication (default on VSP One B20)' },
]

export const FS_TYPES = ['ext4', 'xfs'] as const

export const FIREWALL_DOMAINS = [
  { domain: 'github.com', purpose: 'Deployment manifests, Helm charts, release assets' },
  { domain: '*.githubusercontent.com', purpose: 'Raw YAML manifests from GitHub' },
  { domain: 'registry.hitachivantara.com', purpose: 'Hitachi CSI container images' },
  { domain: 'registry.k8s.io', purpose: 'Kubernetes CSI sidecar images' },
  { domain: '*.pkg.dev', purpose: 'Google Artifact Registry redirect for registry.k8s.io' },
  { domain: '*.amazonaws.com', purpose: 'AWS S3/ECR redirect for registry.k8s.io' },
  { domain: 'auth.docker.io', purpose: 'Docker Hub authentication' },
  { domain: 'registry-1.docker.io', purpose: 'Docker Hub registry' },
  { domain: '*.docker.com', purpose: 'Additional Docker Hub services' },
]

export const REQUIRED_LICENSES = [
  'Dynamic Provisioning (DP)',
  'Hitachi Thin Image (HTI)',
  'Hitachi Thin Image Advanced (HTIA) — VSP One Block only',
]

export const MULTIPATH_CONF = `defaults {
    polling_interval     10
    recheck_wwid         yes
    find_multipaths      yes
    user_friendly_names  yes
    flush_on_last_del    yes
}
blacklist {
}
devices {
    device {
        vendor                 "HITACHI"
        product                "OPEN-.*"
        path_grouping_policy   "multibus"
        path_selector          "round-robin 0"
        path_checker           "tur"
        features               "0"
        hardware_handler       "0"
        failback               "immediate"
        rr_weight              "priorities"
        no_path_retry          fail
        fast_io_fail_tmo       5
        dev_loss_tmo           30
        eh_deadline            10
    }
}
`
