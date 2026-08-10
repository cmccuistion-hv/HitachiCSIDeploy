export const STEPS_BASE = [
  { id: 'platform', title: 'Platform', description: 'Cluster platform and protocol' },
  { id: 'components', title: 'Components', description: 'Select Hitachi CSI components' },
  { id: 'prerequisites', title: 'Prerequisites', description: 'Environment checklist' },
  { id: 'storage', title: 'Storage systems', description: 'Arrays and credentials' },
  { id: 'storageclasses', title: 'StorageClasses', description: 'Volume provisioning profiles' },
  { id: 'replication', title: 'Replication', description: 'Cross-site replication' },
  { id: 'metrics', title: 'Performance Metrics', description: 'Prometheus observability' },
  { id: 'console', title: 'Console Plugin', description: 'OpenShift UI plugin' },
  { id: 'quickstart', title: 'First PV', description: '10-minute path to first volume' },
  { id: 'export', title: 'Review & export', description: 'Download manifests and guide' },
] as const
