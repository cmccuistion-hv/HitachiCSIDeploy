import { expect, test, type Page } from '@playwright/test'
import { filledState } from '../src/test/fixtures'
import {
  choice,
  continueTo,
  downloadZip,
  openFresh,
  seedWizardState,
} from './helpers'

async function dismissWelcome(page: Page) {
  await page.getByRole('button', { name: 'Get started' }).click()
}

async function openStepPicker(page: Page) {
  await page.locator('.footer-step-picker').click()
  await expect(page.locator('.step-picker-dialog')).toBeVisible()
}

async function jumpToStep(page: Page, name: string | RegExp) {
  await openStepPicker(page)
  await page.locator('.step-picker-dialog').getByRole('button', { name }).click()
  await expect(page.locator('.step-picker-dialog')).not.toBeVisible()
}

test('header does not overflow on phone', async ({ page }) => {
  await openFresh(page)
  await dismissWelcome(page)

  const header = page.locator('.app-header')
  const sizes = await header.evaluate((el) => ({
    scrollWidth: el.scrollWidth,
    clientWidth: el.clientWidth,
  }))
  expect(sizes.scrollWidth).toBeLessThanOrEqual(sizes.clientWidth)

  await expect(page.getByRole('button', { name: 'More', exact: true })).toBeVisible()
  await expect(page.locator('.header-action-desktop').filter({ hasText: 'About' })).toBeHidden()
})

test('More menu opens About', async ({ page }) => {
  await openFresh(page)
  await dismissWelcome(page)

  await page.getByRole('button', { name: 'More', exact: true }).click()
  await page.getByRole('menuitem', { name: 'About' }).click()

  await expect(
    page.getByRole('heading', { name: 'Configure Hitachi CSI for your cluster' }),
  ).toBeVisible()
})

test('step picker jumps to Storage systems', async ({ page }) => {
  await openFresh(page)
  await dismissWelcome(page)

  await jumpToStep(page, /Storage systems/)

  await expect(page.getByRole('heading', { name: 'Storage systems', exact: true })).toBeVisible()
})

test('Continue advances and ZIP download works on a short path', async ({ browser }) => {
  const continuePage = await browser.newPage()
  await openFresh(continuePage)
  await dismissWelcome(continuePage)

  await choice(continuePage, 'Kubernetes').click()
  await continueTo(continuePage, 'Hitachi CSI components')
  await continuePage.close()

  const zipPage = await browser.newPage()
  await seedWizardState(zipPage, filledState())
  await jumpToStep(zipPage, /Review & export/)

  const zip = await downloadZip(zipPage)
  expect(Object.keys(zip.files)).toContain('install.sh')
  await zipPage.close()
})
