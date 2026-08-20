/**
 * Shared beginner-facing help copy used across multiple steps.
 * Keep short; prefer Field hints for fill-format details.
 */

export const HELP = {
  secretVsStorageClass: {
    restUrlHelp:
      'These credentials become a Kubernetes Secret the CSI Driver uses to call the array REST API. Pool, ports, and efficiency are set on the StorageClasses step.',
    storageLede:
      'Enter one or more array connection details used to authenticate the CSI software to storage(s). Secrets are generated with base64-encoded credentials. Add a second array for stretched (GAD) StorageClasses and/or add additional primary storage systems arrays.',
    storageClassLede:
      'A StorageClass is a reusable profile apps use when requesting a PVC. Fields and restrictions change with type, protocol, and array family.',
  },

  replicationSitesLede:
    'Replication uses two clusters: a primary site and a secondary site. Use the site switcher to enter the storage systems and StorageClasses for each site — the wizard packages both into one download.',

  replicationPairArrayCallout:
    'Each site chooses exactly one array for Replication. Fill serial, REST URL, username, and password on both the Primary and Secondary site tabs before continuing.',

  replicationPairedStorageClassesCallout:
    'On a standard StorageClass, check “Use this StorageClass for Replication.” Name and filesystem type must match on both sites. Fill this site’s pool, ports, and other fields, then open the Secondary site tab and fill that site’s fields before continuing.',

  replicationResourcePartitioningHint:
    'Set Resource group ID on each site’s Replication array on the Storage step. Both sites must have an ID (one-sided is not supported); the IDs are per array and do not need to match. The Replication step then shows journal, host group, and CSI Driver user checks.',

  resourceGroupId:
    'This Secret’s Resource group ID selects which group on the array CSI Driver provisions into (LDEV IDs, host groups, pool). Required if the storage user can access more than one group. Multiple clusters can share one array by using different IDs.',

  alternativeCloneMode:
    'This is for creating VMs from a template, or cloning a volume. Those are fast copies on the array — not a full rewrite of the disk. On 20 Series and B85 a fast copy stays tied to the original: it cannot grow larger than the original, and you cannot delete the original while copies exist. This setting makes CSI keep a hidden original for every new volume from this Secret so those copies can grow and be replaced. Cost: about twice the pool space per volume, even if you never copy. Leave it off unless you clone volumes or create VMs from templates.',

  csiDriver:
    'The CSI Driver always deploys a controller (provisioning over the array REST API) and a node plugin on each worker (attach). Pods then use the data path — FC, iSCSI, or NVMe — to the volume.',

  replicationArchitecture:
    'Replication installs the Replication operator and the DR Operator on both clusters. Each site stores the other site’s kubeconfig. Journals and copy run between the two arrays. CSI Driver still provisions volumes; day-2 protection is DR policies after install.',

  reviewTopology:
    'This is the package you configured. Click an object to open the YAML files that make it.',

  protocolMultipath:
    'How worker nodes reach the array. FC and iSCSI use Device Mapper Multipath and Port IDs; NVMe uses Native NVMe Multipath and an NVMe subsystem ID (no Port ID). Bare metal supports all protocols; virtual machines support iSCSI and NVMe/TCP only. Stretched PVCs support FC and iSCSI only.',

  multipath:
    'Makes multiple paths to the same LUN look like one disk to the OS — required for reliable FC and iSCSI. On self-managed OpenShift/ROSA, apply the MachineConfig early or let install.sh apply it. On hosted/HCP, use the DaemonSet path (no MachineConfig). On Kubernetes/RKE2/EKS, install multipath.conf on workers after download.',

  openshiftTopology:
    'Self-managed clusters have Machine Config Operator on the API you target. Hosted / HCP (HyperShift, ROSA HCP, many lab guests) often lack MachineConfig — choose DaemonSet so multipath.conf is written on nodes without MCO.',

  portIdWithoutMultipath:
    'Wizard multipath packaging is off. Prefer a single Port ID unless worker nodes already have multipathing configured another way.',

  portIdMultipleWithoutMultipath:
    'Wizard multipath packaging is off and this StorageClass lists multiple Port IDs. Multiple ports need multipathing on the nodes — confirm your own config covers this, or enable multipath in Prerequisites.',

  gad: {
    role: 'Which side this array plays for stretched (GAD) volumes. Stretched StorageClasses need a primary and a secondary. Leave as None if this array is not part of a GAD pair.',
    type: 'Standard uses one array. Stretched / GAD pairs two arrays for active-style volumes (quorum, copy group, dual pools/ports; volume expansion is off). SDS Block uses a different StorageClass shape without serial/pool/port.',
  },

  storageClassType:
    'Standard uses one VSP / VSP One Block array. SDS Block uses a different StorageClass shape without serial/pool/port.',

  journal:
    'Journal volume ID on the array used for replication between primary and secondary. Get this from your storage admin or storage UI.',

  journalsVsRemote:
    'Journals and array credentials are the storage side of replication. Remote kubeconfig is the cluster side: each site stores the other site’s kubeconfig so operators can talk across clusters.',

  remoteKubeconfig:
    'Each site gets a Secret with the other site’s kubeconfig. Build it with install.sh (KUBECONFIG_P / KUBECONFIG_S) on the install host, or generate the Secret YAML here from uploaded kubeconfigs. Do not invent Secret names or keys.',

  storageClassesEnabled:
    'When off, the package skips StorageClass, VolumeSnapshotClass, and test PVC/Pod. Turn on to generate provisioning profiles.',

  storageClassSerial:
    'For standard StorageClasses the serial goes on the StorageClass (not the Secret). GAD/stretched serials go on the Secret as primarySerial/secondarySerial.',

  telemetry:
    'Hitachi Telemetry (enabled by default with the CSI Driver) sends anonymized cluster and storage usage to Hitachi over HTTPS to AWS. Data is vendor-only. Turn off to opt out; the package then disables it via ConfigMap hspc-csi-telemetry-config (awsEnabled: false).',
} as const

/** Short Simple-mode ledes (no default-name dumps). */
export const RECAP = {
  componentsLede:
    'Versions and install namespaces use Hitachi defaults — open Advanced on this step only if you need to change them.',
  multipathLede:
    'Package multipath so worker nodes see redundant paths as one disk. Advanced lets you rename objects and edit multipath.conf.',
} as const

export const WELCOME_SEEN_KEY = 'hitachi-csi-wizard-welcome-seen'
