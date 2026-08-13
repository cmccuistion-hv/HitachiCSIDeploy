import { expect, test, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import JSZip from 'jszip'
import { ensureSitesForReplication } from '../src/catalog/sites'
import { filledState } from '../src/test/fixtures'

const STORAGE_KEY = 'hitachi-csi-wizard-state'
const WELCOME_SEEN_KEY = 'hitachi-csi-wizard-welcome-seen'

async function openFresh(page: Page) {
  await page.addInitScript(() => localStorage.clear())
  await page.goto('/')
}

function choice(page: Page, title: string) {
  return page.locator('button.choice-card').filter({
    has: page.getByRole('heading', { name: title, exact: true }),
  })
}

function field(page: Page, label: string) {
  return page.locator('.field').filter({ hasText: label }).first()
}

function continueButton(page: Page) {
  return page.locator('footer').locator('button.btn-primary')
}

function sidebar(page: Page) {
  return page.locator('ol.step-list')
}

async function continueTo(page: Page, heading: string) {
  await continueButton(page).click()
  await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible()
}

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

  await field(page, 'Storage family').locator('select').selectOption({
    label: 'VSP 5000 / G / E / F',
  })
  await field(page, 'Serial number').locator('input').fill('400001')
  await field(page, 'REST URL').locator('input').fill('https://192.0.2.10')
  await field(page, 'Username').locator('input').fill('maintenance')
  await field(page, 'Password').locator('input').fill('fixture-password')
  await continueTo(page, 'StorageClasses & snapshots')

  await field(page, 'Pool ID').locator('input').fill('0')
  await field(page, 'Port ID(s)').locator('input').fill('CL1-A')
  await continueTo(page, 'Test volume')
  await continueTo(page, 'Review & export')

  const downloadButton = page.getByRole('button', { name: 'Download ZIP' })
  await expect(downloadButton).toBeEnabled({ timeout: 30_000 })
  const downloadPromise = page.waitForEvent('download')
  await downloadButton.click()
  const download = await downloadPromise
  const zip = await JSZip.loadAsync(await readFile(await download.path()))
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
  await field(page, 'Storage family').locator('select').selectOption({
    label: 'VSP 5000 / G / E / F',
  })
  await field(page, 'Serial number').locator('input').fill('400001')
  await field(page, 'REST URL').locator('input').fill('https://192.0.2.10')
  await field(page, 'Username').locator('input').fill('maintenance')
  await field(page, 'Password').locator('input').fill('fixture-password')
  await continueTo(page, 'StorageClasses & snapshots')

  await expect(field(page, 'Pool ID').locator('input')).toHaveValue('')
  await expect(field(page, 'Port ID(s)').locator('input')).toHaveValue('')
  await expect(continueButton(page)).toBeDisabled()
  await expect(page.locator('.footer-fix')).toBeVisible()
})

test('blocks Replication export when journal IDs are missing', async ({ page }) => {
  const state = replicationStateWithoutJournals()
  expect(state.components.replication).toBe(true)
  await page.goto('/')
  await page.waitForLoadState('networkidle')
  const reloaded = page.waitForEvent('framenavigated', (frame) => frame === page.mainFrame())
  await page.evaluate(
    ({ storageKey, welcomeSeenKey, seededState }) => {
      localStorage.clear()
      localStorage.setItem(storageKey, JSON.stringify(seededState))
      localStorage.setItem(welcomeSeenKey, '1')
      window.location.reload()
    },
    {
      storageKey: STORAGE_KEY,
      welcomeSeenKey: WELCOME_SEEN_KEY,
      seededState: state,
    },
  )
  await reloaded
  await page.waitForLoadState('domcontentloaded')
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
