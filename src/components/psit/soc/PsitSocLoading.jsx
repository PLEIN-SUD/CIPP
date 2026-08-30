import { CircularProgress, Stack, Typography } from '@mui/material'

/**
 * What a panel shows while its data is still coming.
 *
 * Not a decoration. These panels printed "Aucune connexion récupérée", "Aucun consentement" and
 * the like from their first render, before any answer had arrived - so for a second or three they
 * stated, in plain French, the opposite of what they were about to show. An analyst reading a
 * panel mid-load was being told the account was clean.
 *
 * The label says what is being read rather than "Chargement", because a panel that names its
 * source also says what will be missing if the read fails.
 */
export const PsitSocLoading = ({ label = 'Lecture en cours' }) => (
  <Stack direction="row" spacing={1.5} alignItems="center" sx={{ py: 1 }}>
    <CircularProgress size={18} />
    <Typography variant="body2" color="text.secondary">
      {`${label}…`}
    </Typography>
  </Stack>
)
