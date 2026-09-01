import { useState } from 'react'
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
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
 * - the card, mounted full width under the Synthèse pair and under the Valider alert card;
 * - the round header button, always in reach whatever the tab: the mail answers on hover, and
 *   a click opens it in full.
 *
 * Dossiers from before the fields existed render nothing: an absence, not an empty mail.
 */

/** The dedicated card: subject as a line, body verbatim with its line breaks. */
export const PsitSocSourceMailCard = ({ socCase }) => {
  const subject = String(socCase?.SourceSubject ?? '').trim()
  const body = String(socCase?.SourceMail ?? '').trim()
  if (!subject && !body) return null
  return (
    <Card variant="outlined">
      <CardHeader title="Mail d’origine du SOC" subheader={subject || undefined} />
      {body && (
        <CardContent>
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ whiteSpace: 'pre-line', maxHeight: 280, overflowY: 'auto' }}
          >
            {body}
          </Typography>
        </CardContent>
      )}
    </Card>
  )
}

/** The round header button: icon only, preview on hover, the full mail on click. */
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
        <IconButton
          size="small"
          color="primary"
          aria-label="Mail d’origine"
          onClick={() => setOpen(true)}
          sx={{ border: 1, borderColor: 'divider' }}
        >
          <MailOutline fontSize="small" />
        </IconButton>
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
