import { Box, MenuItem, Stack, TextField } from '@mui/material'
import { useSettings } from '../../hooks/use-settings'
import { PSIT_THEMES } from '../../theme/psit-presets'

/**
 * Portal colour theme picker, mounted on the Preferences page. Applies on change through
 * the browser-side settings (the same channel as the light/dark toggle): the repaint IS
 * the feedback, and the save button of the page has nothing to do with it.
 */
export const PsitThemePicker = () => {
  const settings = useSettings()
  const current = PSIT_THEMES.some((theme) => theme.value === settings.colorPreset)
    ? settings.colorPreset
    : 'orange'

  return (
    <TextField
      select
      size="small"
      fullWidth
      value={current}
      onChange={(event) => settings.handleUpdate({ colorPreset: event.target.value })}
      slotProps={{ htmlInput: { 'aria-label': 'Portal colour theme' } }}
    >
      {PSIT_THEMES.map((theme) => (
        <MenuItem key={theme.value} value={theme.value}>
          <Stack direction="row" spacing={1} alignItems="center">
            <Box
              sx={{
                width: 12,
                height: 12,
                borderRadius: '50%',
                backgroundColor: theme.swatch,
                border: '1px solid',
                borderColor: 'divider',
              }}
            />
            <span>{theme.label}</span>
          </Stack>
        </MenuItem>
      ))}
    </TextField>
  )
}

export default PsitThemePicker
