import { describe, expect, it } from 'vitest'
import { PSIT_THEMES, psitGetPrimary } from '../../src/theme/psit-presets'

// What is pinned here is the fallback contract and the day/night split: an unknown or
// upstream preset yields null so the factories fall back to upstream's getPrimary (a stale
// stored value can never blank the portal), and night always carries a lighter main with
// near-black button text, because the day main drowns on a dark ground.

describe('psitGetPrimary', () => {
  it('yields null for upstream, unset and unknown presets: upstream decides', () => {
    expect(psitGetPrimary('orange', 'light')).toBeNull()
    expect(psitGetPrimary(undefined, 'dark')).toBeNull()
    expect(psitGetPrimary('deleted-theme', 'light')).toBeNull()
  })

  it('serves the day palette in light and the night palette in dark', () => {
    const day = psitGetPrimary('psit-plein-sud', 'light')
    const night = psitGetPrimary('psit-plein-sud', 'dark')
    expect(day.main).toBe('#1E88C7')
    expect(night.main).toBe('#4FB3E8')
    expect(day.contrastText).toBe('#FFFFFF')
    expect(night.contrastText).not.toBe('#FFFFFF')
    expect(day.alpha12).toBeTruthy()
  })
})

describe('PSIT_THEMES', () => {
  it('has five themes, Ugly Orange first as the default, and no repeated colour', () => {
    expect(PSIT_THEMES).toHaveLength(5)
    expect(PSIT_THEMES[0]).toMatchObject({ value: 'orange', label: 'Ugly Orange' })
    const swatches = PSIT_THEMES.map((theme) => theme.swatch)
    expect(new Set(swatches).size).toBe(swatches.length)
  })

  it('every custom theme carries both a day and a night primary', () => {
    for (const theme of PSIT_THEMES.filter((entry) => entry.value !== 'orange')) {
      expect(theme.day?.main, theme.value).toBeTruthy()
      expect(theme.night?.main, theme.value).toBeTruthy()
      expect(theme.night.contrastText, theme.value).not.toBe('#FFFFFF')
    }
  })
})
