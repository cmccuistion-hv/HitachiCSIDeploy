import { expect, test } from '@playwright/test'
import { ensureSitesForReplication } from '../src/catalog/sites'
import { filledReplicationState, filledState } from '../src/test/fixtures'
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

test('platform cards omit the supported-version list and keep the version select', async ({
  page,
}) => {
  await openFresh(page)
  await page.getByRole('button', { name: 'Get started' }).click()
  await expect(page.getByRole('heading', { name: 'Platform & connectivity' })).toBeVisible()
  await expect(page.locator('.section').filter({ hasText: 'Container platform' }).getByText(/Supported:/)).toHaveCount(0)
  await expect(field(page, 'Platform version').locator('select')).toBeVisible()
})

test('header Reset wizard asks for confirmation before clearing answers', async ({ page }) => {
  await openFresh(page)
  await page.getByRole('button', { name: 'Get started' }).click()
  await choice(page, 'Kubernetes').click()
  await expect(choice(page, 'Kubernetes')).toHaveClass(/selected/)

  await page.getByRole('button', { name: 'Reset wizard', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Reset wizard?' })
  await expect(dialog).toBeVisible()

  await dialog.getByRole('button', { name: 'Cancel' }).click()
  await expect(dialog).toBeHidden()
  await expect(choice(page, 'Kubernetes')).toHaveClass(/selected/)

  await page.getByRole('button', { name: 'Reset wizard', exact: true }).click()
  await dialog.getByRole('button', { name: 'Reset wizard', exact: true }).click()
  await expect(dialog).toBeHidden()
  await expect(choice(page, 'Red Hat OpenShift')).toHaveClass(/selected/)
  await expect(page.getByRole('heading', { name: 'Platform & connectivity' })).toBeVisible()
})

test('invalid import JSON shows an in-app dialog and keeps current answers', async ({ page }) => {
  await openFresh(page)
  await page.getByRole('button', { name: 'Get started' }).click()
  await choice(page, 'Kubernetes').click()

  page.on('dialog', (native) => {
    throw new Error(`unexpected native dialog: ${native.message()}`)
  })

  await page.locator('input[type="file"][accept*="json"]').setInputFiles({
    name: 'bad.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{not-json'),
  })

  const dialog = page.getByRole('dialog', { name: 'Could not import config' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByText(/hitachi-csi-wizard-config\.json/)).toBeVisible()
  await dialog.getByRole('button', { name: 'Close' }).click()
  await expect(dialog).toBeHidden()
  await expect(choice(page, 'Kubernetes')).toHaveClass(/selected/)
})

test('exports the OpenShift hosted Fibre Channel golden path', async ({ page }) => {
  await openFresh(page)
  await page.getByRole('button', { name: 'Get started' }).click()

  await choice(page, 'Red Hat OpenShift').click()
  await choice(page, 'Fibre Channel (FC)').click()
  await continueTo(page, 'CSI components')
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
  await expect(page.getByRole('tab', { name: /Primary site/ })).toHaveCount(0)
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

test('shows a yellow Port ID warning for multiple ports when wizard multipath is off, without blocking Continue', async ({
  page,
}) => {
  const state = filledState({
    multipath: { enabled: false, includeConf: false, includeMachineConfig: false, includeDaemonSet: false },
  })
  state.storageClasses[0].portID = 'CL1-A,CL2-A'
  await seedWizardState(page, state)

  await sidebar(page).getByRole('button', { name: /StorageClasses/ }).click()
  await expect(page.getByRole('heading', { name: 'StorageClasses & snapshots' })).toBeVisible()

  const portField = field(page, 'Port ID(s)')
  await expect(portField).toHaveClass(/warning/)
  await expect(portField).not.toHaveClass(/error/)
  await expect(portField.locator('.warning-text')).toContainText(/Multiple ports need multipathing/)
  await expect(portField.locator('.error-text')).toHaveCount(0)
  await expect(page.getByText(/Prefer a single Port ID unless/)).toHaveCount(0)
  await expect(continueButton(page)).toBeEnabled()

  await portField.locator('input').fill('CL1-A')
  await expect(portField.locator('.warning-text')).toHaveCount(0)
  await expect(continueButton(page)).toBeEnabled()
})

test('blocks Continue when a Port ID is malformed', async ({ page }) => {
  const state = filledState()
  state.storageClasses[0].portID = 'CL-2A'
  await seedWizardState(page, state)

  await sidebar(page).getByRole('button', { name: /StorageClasses/ }).click()
  await expect(page.getByRole('heading', { name: 'StorageClasses & snapshots' })).toBeVisible()

  const portField = field(page, 'Port ID(s)')
  await expect(portField).toHaveClass(/error/)
  await expect(portField).not.toHaveClass(/warning/)
  await expect(portField.locator('.error-text')).toContainText(/1–9 or A–G/)
  await expect(continueButton(page)).toBeDisabled()

  await portField.locator('input').fill('CL3-G,CL4-G,CL2-A')
  await expect(portField.locator('.error-text')).toHaveCount(0)
  await expect(continueButton(page)).toBeEnabled()
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
  await expect(page.getByText(/Set a Journal ID for array serial/)).toBeVisible()
})

test('Test volume site tabs can skip secondary packaging without blocking Continue', async ({
  page,
}) => {
  const state = filledReplicationState({
    replication: {
      enabled: true,
      disasterRecovery: true,
      remoteKubeconfigSource: 'install-time',
    },
  })
  await seedWizardState(page, state)
  await sidebar(page).getByRole('button', { name: /Test volume/ }).click()
  await expect(page.getByRole('heading', { name: 'Test volume', exact: true })).toBeVisible()
  await expect(page.getByRole('tab', { name: /Primary site/ })).toBeVisible()
  await expect(page.getByRole('tab', { name: /Secondary site/ })).toBeVisible()

  await page.getByRole('tab', { name: /Secondary site/ }).click()
  const include = page.getByRole('checkbox', { name: /Include test volume on this cluster/ })
  await expect(include).toBeChecked()
  await include.uncheck()
  await expect(page.getByText(/will not include the sample PVC\/Pod/)).toBeVisible()
  await expect(continueButton(page)).toBeEnabled()
})

test('blocks Replication Continue and Export until a remote kubeconfig path is chosen', async ({
  page,
}) => {
  const state = filledReplicationState()
  await seedWizardState(page, state)
  await expect
    .poll(() =>
      page.evaluate((storageKey) => {
        const stored = JSON.parse(localStorage.getItem(storageKey) || '{}')
        return stored.components?.replication
      }, STORAGE_KEY),
    )
    .toBe(true)

  await sidebar(page).getByRole('button', { name: /Replication/ }).click()
  await expect(page.getByRole('heading', { name: 'Replication', exact: true })).toBeVisible()
  await expect(continueButton(page)).toBeDisabled()
  await expect(
    page.getByText(
      /Choose how to create the remote kubeconfig Secrets: paste both in this wizard, or confirm you will create them at install time/,
    ),
  ).toBeVisible()

  await choice(page, 'At install time').click()
  await expect(continueButton(page)).toBeEnabled()
  await continueTo(page, 'Test volume')

  await sidebar(page).getByRole('button', { name: /Review & export/ }).click()
  await expect(page.getByRole('heading', { name: 'Review & export' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Download ZIP' })).toBeEnabled()
})

test('blocks Replication export when kubeconfigs were not re-pasted after loading a saved config', async ({
  page,
}) => {
  const state = filledReplicationState({
    replication: { remoteKubeconfigSource: 'wizard' },
  })
  await seedWizardState(page, state)

  await sidebar(page).getByRole('button', { name: /Review & export/ }).click()
  await expect(page.getByRole('heading', { name: 'Review & export' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Download ZIP' })).toBeDisabled()
  await expect(
    page.getByText(
      /Paste both the primary and secondary kubeconfigs, or confirm you will create the Secrets at install time/,
    ),
  ).toBeVisible()
})
