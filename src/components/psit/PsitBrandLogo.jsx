import { Box } from '@mui/material'

// The Plein Sud wordmark is dark charcoal on transparent, so it needs a light plate to
// read on the navy top nav. Height is driven by the caller to stay in step with the
// CIPP logo next to it.
export const PsitBrandLogo = ({ height = 20 }) => (
  <Box
    sx={{
      display: 'inline-flex',
      alignItems: 'center',
      bgcolor: 'common.white',
      borderRadius: 1,
      px: 0.75,
      py: 0.5,
    }}
  >
    <Box
      component="img"
      src="/psit-logo.webp"
      alt="Plein Sud IT"
      sx={{ display: 'block', height, width: 'auto' }}
    />
  </Box>
)
