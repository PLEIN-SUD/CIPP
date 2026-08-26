import { Alert } from '@mui/material'

/**
 * One sentence on every SOC screen while the section is being built: what the analyst sees may
 * change under him, and a rough edge is to be reported, not worked around in silence. One
 * component so switching the section to "stable" is one deletion, not a hunt through six pages.
 */
export const PsitSocWipBanner = () => (
  <Alert severity="warning" variant="outlined">
    Section en construction : les écrans évoluent encore. Signaler tout comportement étrange
    plutôt que de le contourner.
  </Alert>
)
