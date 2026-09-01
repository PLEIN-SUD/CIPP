import { useState } from 'react'
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material'
import { MailOutline } from '@mui/icons-material'
import { psitSocMailPreview } from '../../../utils/psit-soc-queue'

/**
 * The emitter's original mail, where the investigation reads it.
 *
 * The dossier title is derived and the catalogue description is generic; the mail is what the
 * SOC actually wrote about THIS alert. Two surfaces, one source (SourceSubject/SourceMail,
 * stored at ingestion):
 *
 * - the inline section, on the Synthèse and Valider tabs, where it serves as the alert's
 *   description;
 * - the header button, always in reach whatever the tab: the mail answers on hover, and a
 *   click opens it in full.
 *
 * Dossiers from before the fields existed render nothing: an absence, not an empty mail.
 */

/** The inline block: subject as a line, body verbatim with its line breaks. */
export const PsitSocSourceMailSection = ({ socCase }) => {
  const subject = String(socCase?.SourceSubject ?? '').trim()
  const body = String(socCase?.SourceMail ?? '').trim()
  if (!subject && !body) return null
  return (
    <Stack spacing={0.5} sx={{ mt: 2 }}>
      <Typography variant="subtitle2">Mail d’origine du SOC</Typography>
      {subject && (
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          {subject}
        </Typography>
      )}
      {body && (
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{ whiteSpace: 'pre-line', maxHeight: 240, overflowY: 'auto' }}
        >
          {body}
        </Typography>
      )}
    </Stack>
  )
}

/** The header button: preview on hover, the full mail on click. */
export const PsitSocSourceMailButton = ({ socCase }) => {
  const [open, setOpen] = useState(false)
  const subject = String(socCase?.SourceSubject ?? '').trim()
  const body = String(socCase?.SourceMail ?? '').trim()
  if (!subject && !body) return null

  const preview = psitSocMailPreview(socCase)

  return (
    <>
      <Tooltip
        describeChild
        title={preview}
        slotProps={{ tooltip: { sx: { whiteSpace: 'pre-line', maxWidth: 480 } } }}
      >
        <Button
          size="small"
          variant="outlined"
          startIcon={<MailOutline />}
          onClick={() => setOpen(true)}
        >
          Mail d’origine
        </Button>
      </Tooltip>

      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>Mail d’origine du SOC</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={1}>
            {subject && (
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                {subject}
              </Typography>
            )}
            {body ? (
              <Typography variant="body2" sx={{ whiteSpace: 'pre-line' }}>
                {body}
              </Typography>
            ) : (
              <Typography variant="body2" color="text.secondary">
                Seul le sujet a été transmis par l’ingestion (le corps arrive avec le champ
                MailBody du webhook).
              </Typography>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Fermer</Button>
        </DialogActions>
      </Dialog>
    </>
  )
}
