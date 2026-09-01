import { alpha } from '@mui/material/styles'

/**
 * Plein Sud portal colour themes, picked in Preferences and applied through the palette
 * factories. Each theme carries a day and a night primary: a mid tone that holds white
 * button text on a light ground drowns on a dark one, so night steps one shade up and
 * flips the button text to near-black. 'orange' is upstream's own preset (the original
 * portal colour): the factories fall back to it, so it needs no entry here beyond the
 * picker label.
 */

const withAlphas = (color) => ({
  ...color,
  alpha4: alpha(color.main, 0.04),
  alpha8: alpha(color.main, 0.08),
  alpha12: alpha(color.main, 0.12),
  alpha30: alpha(color.main, 0.3),
  alpha50: alpha(color.main, 0.5),
})

export const PSIT_THEMES = [
  {
    value: 'orange',
    label: 'Ugly Orange',
    swatch: '#F77F00',
  },
  {
    value: 'psit-plein-sud',
    label: 'Plein Sud',
    swatch: '#1E88C7',
    day: withAlphas({ light: '#4FB3E8', main: '#1E88C7', dark: '#14679C', contrastText: '#FFFFFF' }),
    night: withAlphas({ light: '#7CC8EF', main: '#4FB3E8', dark: '#1E88C7', contrastText: '#0B1220' }),
  },
  {
    value: 'psit-lagoon',
    label: 'Lagoon',
    swatch: '#0E7C86',
    day: withAlphas({ light: '#2CA6B0', main: '#0E7C86', dark: '#0A5A61', contrastText: '#FFFFFF' }),
    night: withAlphas({ light: '#6ED2DA', main: '#34B8C2', dark: '#0E7C86', contrastText: '#06282B' }),
  },
  {
    value: 'psit-amethyst',
    label: 'Amethyst',
    swatch: '#6D4FA3',
    day: withAlphas({ light: '#9678C9', main: '#6D4FA3', dark: '#503B79', contrastText: '#FFFFFF' }),
    night: withAlphas({ light: '#C4AFE9', main: '#A78BDB', dark: '#6D4FA3', contrastText: '#1A1030' }),
  },
  {
    value: 'psit-graphite',
    label: 'Graphite',
    swatch: '#475467',
    day: withAlphas({ light: '#667085', main: '#475467', dark: '#344054', contrastText: '#FFFFFF' }),
    night: withAlphas({ light: '#B6BFCC', main: '#98A2B3', dark: '#667085', contrastText: '#101828' }),
  },
]

/**
 * The primary palette for a Plein Sud theme in the given mode, or null when the preset is
 * not ours ('orange', unset, unknown): the caller falls back to upstream's getPrimary, so
 * a stale stored value can never blank the portal.
 */
export const psitGetPrimary = (preset, mode) => {
  const theme = PSIT_THEMES.find((entry) => entry.value === preset)
  if (!theme || !theme.day) return null
  return mode === 'dark' ? theme.night : theme.day
}
