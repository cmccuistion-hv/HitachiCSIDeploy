import { PLATFORMS } from '../catalog/platforms'
import type { WizardState } from '../catalog/types'

export interface NextStep {
  id: string
  title: string
  body: string
  command?: string
}

function formatList(items: string[]): string {
  if (items.length === 1) return items[0]
  if (items.length === 2) return `${items[0]} and ${items[1]}`
  return `${items.slice(0, -1).join(', ')}, and ${items.at(-1)}`
}

export function buildNextSteps(state: WizardState): NextStep[] {
  const plat = PLATFORMS[state.platform]
  const clusterCommand = plat.useOc ? 'oc' : 'kubectl'
  const archiveName = `hitachi-csi-deployment-${state.versions.driver}`
  const steps: NextStep[] = [
    {
      id: 'download',
      title: 'Download the deployment ZIP',
      body: 'Download the generated ZIP and keep it secure because it contains the configuration for this deployment.',
    },
    {
      id: 'unzip',
      title: 'Unzip the package',
      body: `Unzip the package on a machine that can reach the cluster, with the correct ${clusterCommand} context ready.`,
      command: `unzip ${archiveName}.zip -d ${archiveName}\ncd ${archiveName}`,
    },
  ]

  if (!plat.useOc && state.multipath.enabled && state.multipath.includeConf) {
    steps.push({
      id: 'multipath-workers',
      title: 'Configure multipath on worker nodes',
      body: 'Copy the packaged multipath configuration to every worker node, then enable and verify multipathd on each node before installing the stack.',
      command:
        'sudo cp 00-prereq/multipath.conf /etc/multipath.conf\nsudo systemctl enable --now multipathd\nsudo multipath -ll',
    })
  }

  if (plat.useOc && state.multipath.enabled) {
    let body: string
    if (state.openshiftTopology === 'classic') {
      body = state.multipath.alreadyApplied
        ? 'Multipath was marked as already applied, so install.sh skips the MachineConfig apply and waits for the MachineConfigPools to become healthy. MachineConfig changes may have caused rolling node reboots.'
        : 'install.sh applies the packaged MachineConfig and waits for the MachineConfigPools to become healthy; the change may cause rolling node reboots.'
    } else {
      body = state.multipath.alreadyApplied
        ? 'Multipath was marked as already applied, so install.sh skips the DaemonSet apply. Hosted/HCP delivery does not cause a MachineConfigPool reboot cycle.'
        : 'install.sh applies the packaged multipath DaemonSet and waits for its rollout; hosted/HCP delivery does not cause a MachineConfigPool reboot cycle.'
    }
    steps.push({
      id: 'openshift-multipath',
      title: 'Allow for OpenShift multipath setup',
      body,
    })
  }

  if (state.airGapped) {
    steps.push({
      id: 'air-gapped',
      title: 'Prepare the offline content',
      body: `Before running install.sh, use \`hvcsi-offline-bundle.sh\` from the CSI operator repository and push images to your private registry${
        plat.useOc ? ', and mirror the certified-operators catalog for OperatorHub' : ''
      }.`,
    })
  }

  const hasPrimaryKubeconfig = Boolean(state.replication.primaryKubeconfig?.trim())
  const hasSecondaryKubeconfig = Boolean(state.replication.secondaryKubeconfig?.trim())
  const packagedRemoteKubeconfig = hasPrimaryKubeconfig && hasSecondaryKubeconfig
  if (state.components.replication && packagedRemoteKubeconfig) {
    steps.push({
      id: 'replication-kubeconfigs',
      title: 'Remote kubeconfig Secrets are already in the ZIP',
      body: 'You generated the Secret YAML in the wizard (In this wizard). install.sh applies each site’s packaged remote-kubeconfig Secret from that site’s folder. Do not set KUBECONFIG_P or KUBECONFIG_S — those are only for the helper-script path.',
    })
  } else if (state.components.replication) {
    steps.push({
      id: 'replication-kubeconfigs',
      title: 'Remote kubeconfig at install time',
      body: 'If you did not generate Secret YAML in the wizard, set both kubeconfig paths on the install host so install.sh can create each remote-kubeconfig Secret with the other site’s kubeconfig. Skip this if those YAML files are already in 03-replication/ from the wizard.',
      command:
        'export KUBECONFIG_P=/path/to/primary-kubeconfig\nexport KUBECONFIG_S=/path/to/secondary-kubeconfig',
    })
  }

  const installedItems = ['the CSI Driver', 'storage resources']
  if (state.components.replication) installedItems.push('Replication and the DR Operator')
  if (state.components.metrics) installedItems.push('Performance Metrics')
  if (state.components.consolePlugin) installedItems.push('the OpenShift Console Plugin')
  if (state.storageClassesEnabled) installedItems.push('the test volume')

  if (state.components.replication) {
    steps.push(
      {
        id: 'install-primary',
        title: 'Run the installer (primary site)',
        body: `Set your ${clusterCommand} context to the primary cluster. The script installs ${formatList(
          installedItems,
        )} in the required order.`,
        command: 'cd primary\nchmod +x install.sh && ./install.sh',
      },
      {
        id: 'install-secondary',
        title: 'Run the installer (secondary site)',
        body: `Switch your ${clusterCommand} context to the secondary cluster, then run the installer from the secondary folder.`,
        command:
          'cd secondary || cd ../secondary\nchmod +x install.sh && ./install.sh',
      },
    )
  } else {
    steps.push({
      id: 'install',
      title: 'Run the installer',
      body: `The script installs ${formatList(installedItems)} in the required order.`,
      command: 'chmod +x install.sh && ./install.sh',
    })
  }

  if (!state.telemetryEnabled) {
    steps.push({
      id: 'telemetry',
      title: 'Telemetry opt-out',
      body: 'After the CSI Driver is READY, install.sh disables Hitachi Telemetry automatically; no manual scaling or manifest apply is required.',
    })
  }

  if (state.storageClassesEnabled) {
    steps.push({
      id: 'verify-test-volume',
      title: 'Confirm the test volume',
      body: `Confirm PVC ${state.quickstart.pvcName} is Bound and Pod ${state.quickstart.podName} is Running.`,
      command: `${clusterCommand} get pvc ${state.quickstart.pvcName}\n${clusterCommand} get pod ${state.quickstart.podName}`,
    })
  }

  if (state.components.consolePlugin) {
    const exampleSc =
      (state.quickstart.storageClassName || '').trim() ||
      (state.storageClasses[0]?.name || '').trim() ||
      (state.sites?.primary.storageClasses[0]?.name || '').trim()
    const scHint = exampleSc
      ? ` Open a Hitachi-backed StorageClass such as ${exampleSc}.`
      : ' Open a StorageClass provisioned by the Hitachi CSI Driver.'
    steps.push({
      id: 'open-console-dashboard',
      title: 'Open the HitachiCSI tab on a StorageClass',
      body: `In the OpenShift web console, go to Storage → StorageClasses.${scHint} The HitachiCSI tab on that StorageClass is the dashboard. install.sh already applied the plugin and enabled it — you do not turn it on by hand.`,
    })
  }

  return steps
}

export function nextStepsToMarkdown(
  steps: NextStep[],
  meta?: {
    platformDisplayName?: string
    platformVersion?: string
    driverVersion?: string
  },
): string {
  const metadata = [
    meta?.platformDisplayName ? `- Platform: ${meta.platformDisplayName}` : undefined,
    meta?.platformVersion ? `- Platform version: ${meta.platformVersion}` : undefined,
    meta?.driverVersion ? `- CSI Driver version: ${meta.driverVersion}` : undefined,
  ].filter((line): line is string => Boolean(line))

  const sections = steps.map((step, index) => {
    const command = step.command ? `\n\n\`\`\`bash\n${step.command}\n\`\`\`` : ''
    return `## ${index + 1}. ${step.title}\n\n${step.body}${command}`
  })

  return ['# Deployment next steps', metadata.join('\n'), ...sections].filter(Boolean).join('\n\n') + '\n'
}
