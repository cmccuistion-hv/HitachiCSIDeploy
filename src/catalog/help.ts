/**
 * Shared beginner-facing help copy used across multiple steps.
 * Keep short; prefer Field hints for fill-format details.
 */

export const HELP = {
  secretVsStorageClass: {
    storageCallout:
      'These credentials become Kubernetes Secrets the CSI Driver uses to call the array REST API. How volumes are provisioned (pool, ports, efficiency) is set on the StorageClasses step.',
    storageClassCallout:
      'A StorageClass is a reusable profile apps use when requesting a PVC. It references the storage Secret for credentials and adds pool, port, and efficiency settings.',
    storageLede:
      'Enter array connection details used to authenticate the CSI Driver to storage. Secrets are generated with base64-encoded credentials. Add a second array for stretched (GAD) StorageClasses.',
    storageClassLede:
      'A StorageClass is a reusable profile apps use when requesting a PVC. Fields and restrictions change with type, protocol, and array family.',
  },

  protocolMultipath:
    'How worker nodes reach the array. FC and iSCSI use Device Mapper Multipath and Port IDs; NVMe uses Native NVMe Multipath and an NVMe subsystem ID (no Port ID). Bare metal supports all protocols; virtual machines support iSCSI and NVMe/TCP only. Stretched PVCs support FC and iSCSI only.',

  multipath:
    'Makes multiple paths to the same LUN look like one disk to the OS — required for reliable FC and iSCSI.',

  gad: {
    role: 'Which side this array plays for stretched (GAD) volumes. Stretched StorageClasses need a primary and a secondary.',
    type: 'Standard uses one array. Stretched / GAD pairs two arrays for active-style volumes (quorum, copy group, dual pools/ports; volume expansion is off). SDS Block uses a different StorageClass shape without serial/pool/port.',
  },

  journal:
    'Journal volume ID on the array used for replication between primary and secondary. Get this from your storage admin or storage UI.',

  journalsVsRemote:
    'Journals and array credentials are the storage side of replication. Remote kubeconfig is the cluster side: each site stores the other site’s kubeconfig so operators can talk across clusters.',

  remoteKubeconfig:
    'Each site gets a Secret with the other site’s kubeconfig. Build it with install.sh (KUBECONFIG_P / KUBECONFIG_S) on the install host, or generate the Secret YAML here from uploaded kubeconfigs. Do not invent Secret names or keys.',

  configuratorVsApply:
    'This page only builds files. Download the ZIP and run install.sh from a machine that can reach the cluster — the wizard does not apply anything from the browser.',
} as const

export const WELCOME_SEEN_KEY = 'hitachi-csi-wizard-welcome-seen'
