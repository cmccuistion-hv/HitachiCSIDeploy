import { expect, test } from '@playwright/test'
import { ensureSitesForReplication } from '../src/catalog/sites'
import { filledState } from '../src/test/fixtures'
import {
  STORAGE_KEY,
  choice,
  continueButton,
  continueTo,
  downloadZip,
  field,
  fillArray,
  fillStandardStorageClass,
  openFresh,
  seedWizardState,
  sidebar,
} from './helpers'

function replicationStateWithoutJournals() {
  const state = ensureSitesForReplication(
    filledState({
      components: { replication: true, disasterRecovery: true },
      replication: {
        enabled: true,
        disasterRecovery: true,
        storageSecrets: [],
      },
    }),
  )
  const primary = state.sites!.primary
  const secondary = state.sites!.secondary

  return {
    ...state,
    sites: {
      primary,
      secondary: {
        storageSystems: secondary.storageSystems.map((system) => ({
          ...system,
          family: 'vsp-5000-g-e-f' as const,
          serial: '400002',
          url: 'https://192.0.2.11',
          user: 'maintenance',
          password: 'fixture-password',
        })),
        storageClasses: secondary.storageClasses.map((storageClass) => ({
          ...storageClass,
          serialNumber: '400002',
          poolID: '1',
          portID: 'CL2-A',
        })),
      },
    },
  }
}

test('exports the OpenShift hosted Fibre Channel golden path', async ({ page }) => {
  await openFresh(page)
  await page.getByRole('button', { name: 'Get started' }).click()

  await choice(page, 'Red Hat OpenShift').click()
  await choice(page, 'Fibre Channel (FC)').click()
  await continueTo(page, 'Hitachi CSI components')
  await expect(page.getByRole('checkbox', { name: /Replication \+ DR Operator/ })).toBeChecked({
    checked: false,
  })

  await continueTo(page, 'Multipath')
  await choice(page, 'Hosted or HCP (DaemonSet)').click()
  await continueTo(page, 'Checklist')
  await continueTo(page, 'Storage systems')

  await fillArray(page)
  await continueTo(page, 'StorageClasses & snapshots')

  await fillStandardStorageClass(page)
  await continueTo(page, 'Test volume')
  await continueTo(page, 'Review & export')

  const zip = await downloadZip(page)
  const paths = Object.keys(zip.files)

  expect(paths).toEqual(expect.arrayContaining([
    'install.sh',
    'INSTALL.md',
    'wizard-config.json',
    '02-driver/hspc-cr.yaml',
  ]))
  expect(paths.some((path) => path.toLowerCase().includes('00-prereq') && path.toLowerCase().includes('daemonset'))).toBe(true)
  expect(paths.some((path) => path.toLowerCase().includes('machineconfig'))).toBe(false)

  const installScript = await zip.file('install.sh')!.async('string')
  expect(installScript).toContain('DaemonSet')
  expect(installScript).not.toContain('wait_mcp_healthy')

  const config = JSON.parse(await zip.file('wizard-config.json')!.async('string'))
  expect(config.replication.primaryKubeconfig).toBeUndefined()
  expect(config.replication.secondaryKubeconfig).toBeUndefined()
})

test('blocks incomplete StorageClasses and hides the OpenShift console step on Kubernetes', async ({ page }) => {
  await openFresh(page)
  await page.getByRole('button', { name: 'Get started' }).click()
  await choice(page, 'Kubernetes').click()

  await expect(sidebar(page)).not.toContainText('Console Plugin')
  await sidebar(page).getByRole('button', { name: /Storage systems/ }).click()
  await fillArray(page)
  await continueTo(page, 'StorageClasses & snapshots')

  await expect(field(page, 'Pool ID').locator('input')).toHaveValue('')
  await expect(field(page, 'Port ID(s)').locator('input')).toHaveValue('')
  await expect(continueButton(page)).toBeDisabled()
  await expect(page.locator('.footer-fix')).toBeVisible()
})

test('blocks Replication export when journal IDs are missing', async ({ page }) => {
  const state = replicationStateWithoutJournals()
  expect(state.components.replication).toBe(true)
  await seedWizardState(page, state)
  await expect
    .poll(() =>
      page.evaluate((storageKey) => {
        const stored = JSON.parse(localStorage.getItem(storageKey) || '{}')
        return stored.components?.replication
      }, STORAGE_KEY),
    )
    .toBe(true)

  await sidebar(page).getByRole('button', { name: /Review & export/ }).click()
  await expect(page.getByRole('heading', { name: 'Review & export' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Download ZIP' })).toBeDisabled()
  await expect(page.getByText(/Set journals on the Replication step/)).toBeVisible()
})
