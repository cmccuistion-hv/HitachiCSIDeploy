import { describe, expect, it } from 'vitest'
import { wizardVersion } from './wizardVersion'

describe('wizardVersion', () => {
  it('returns package version plus git short SHA or unknown', () => {
    const value = wizardVersion()
    expect(value === '1.1.1+unknown' || /^\d+\.\d+\.\d+\+[0-9a-f]+$/.test(value)).toBe(true)
    expect(value.startsWith('1.1.1+')).toBe(true)
  })
})
