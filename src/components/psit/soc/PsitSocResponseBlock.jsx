import { useState } from 'react'
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import { Reply, ContentCopy } from '@mui/icons-material'
import {
  psitSocExtsocInquiry,
  psitSocExtsocResponse,
  psitSocResponseVariants,
} from '../../../utils/psit-soc-response'

/**
 * The reply to the external SOC, drafted from the dossier, edited by the analyst, copied into
 * the ticket. Same contract as the time entry: a draft, never a generated truth, rebuilt at each
 * opening so it never lags behind the dossier.
 *
 * Two kinds of message live here because they are the two things one says to the emitter: the
 * answer once the verdict exists (with the benign true positive's two variants: treat vs tune),
 * and the request for details when the dossier cannot advance without the emitter's data.
 */
export const PsitSocResponseBlock = ({ socCase }) => {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState('answer')
  const [variant, setVariant] = useState(null)
  const [text, setText] = useState('')
  const [copied, setCopied] = useState(false)

  if (!socCase?.CaseId) return null

  const verdict = socCase?.Qualification?.Verdict
  const variants = psitSocResponseVariants(socCase)

  const rebuild = (nextMode, nextVariant) => {
    if (nextMode === 'inquiry') {
      setText(psitSocExtsocInquiry(socCase) ?? '')
    } else {
      setText(psitSocExtsocResponse(socCase, nextVariant) ?? '')
    }
  }

  const openDialog = () => {
    const initialMode = verdict ? 'answer' : 'inquiry'
    const initialVariant = variants[0]?.key ?? null
    setMode(initialMode)
    setVariant(initialVariant)
    rebuild(initialMode, initialVariant)
    setOpen(true)
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard refused: the text stays selectable in the field, which always works.
      setCopied(false)
    }
  }

  return (
    <>
      <Button size="small" variant="outlined" startIcon={<Reply />} onClick={openDialog}>
        Réponse SOC externe
      </Button>

      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>Réponse au SOC externe</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              <TextField
                select
                size="small"
                label="Message"
                value={mode}
                onChange={(event) => {
                  setMode(event.target.value)
                  rebuild(event.target.value, variant)
                }}
                sx={{ minWidth: 220 }}
              >
                <MenuItem value="answer" disabled={!verdict}>
                  {verdict ? 'Réponse (verdict posé)' : 'Réponse (qualifier le dossier d’abord)'}
                </MenuItem>
                <MenuItem value="inquiry">Demande de précisions</MenuItem>
              </TextField>
              {mode === 'answer' && variants.length > 1 && (
                <TextField
                  select
                  size="small"
                  label="Variante"
                  value={variant ?? ''}
                  onChange={(event) => {
                    setVariant(event.target.value)
                    rebuild('answer', event.target.value)
                  }}
                  sx={{ minWidth: 320 }}
                >
                  {variants.map((choice) => (
                    <MenuItem key={choice.key} value={choice.key}>
                      {choice.label}
                    </MenuItem>
                  ))}
                </TextField>
              )}
            </Stack>

            <TextField
              multiline
              minRows={10}
              fullWidth
              value={text}
              onChange={(event) => setText(event.target.value)}
            />
            <Typography variant="caption" color="text.secondary">
              Brouillon à relire : rien ne part d’ici, le texte se copie dans le ticket. La mise en
              attente du dossier est un geste séparé.
            </Typography>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Fermer</Button>
          <Button variant="contained" startIcon={<ContentCopy />} onClick={copy}>
            {copied ? 'Copié' : 'Copier'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  )
}
