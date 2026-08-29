import { useState } from 'react'
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import { Schedule, ContentCopy } from '@mui/icons-material'
import { CippCopyToClipBoard } from '../../CippComponents/CippCopyToClipboard'
import { psitSocElapsedHours, psitSocTimeEntry } from '../../../utils/psit-soc-time-entry'

/**
 * The Autotask time entry, written from the dossier's own journal.
 *
 * Closing an investigation used to mean retelling it in the ticket from memory, hours later,
 * which is how a real gesture ends up undescribed. Everything here is already recorded: the
 * journal holds each action with its author and timestamp, the dossier holds the client, the
 * type and the qualification. The analyst reads it, edits it if he wants, and copies it.
 *
 * Editable on purpose: this is a draft, not a generated truth. What it will not do is invent -
 * no duration is filled in, only the journal's own span is offered as a starting point, and it
 * is labelled as one, because the wall clock of a dossier is not the time worked on it.
 */
export const PsitSocTimeEntry = ({ socCase }) => {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [copied, setCopied] = useState(false)

  if (!socCase?.CaseId) return null

  const elapsed = psitSocElapsedHours(socCase?.ActionLog ?? [])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard refused (permission, insecure context): the text stays selectable in the
      // field above, which is the fallback that always works.
      setCopied(false)
    }
  }

  const openDialog = () => {
    // Rebuilt at each opening rather than held in state: a journal entry added meanwhile has to
    // be in the text, and a draft that silently lags behind the dossier is worse than no draft.
    setText(psitSocTimeEntry(socCase) ?? '')
    setOpen(true)
  }

  return (
    <>
      <Button size="small" variant="outlined" startIcon={<Schedule />} onClick={openDialog}>
        Saisie de temps
      </Button>

      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>Saisie de temps Autotask</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2}>
            <Typography variant="body2" color="text.secondary">
              Rédigé à partir du journal du dossier. Relisez, complétez si un geste manque, puis
              copiez dans le ticket
              {socCase?.ExternalRef ? ` ${socCase.ExternalRef}` : ''}.
            </Typography>
            <TextField
              multiline
              minRows={12}
              fullWidth
              value={text}
              onChange={(event) => setText(event.target.value)}
              label="Contenu de la saisie"
            />
            <Typography variant="body2" color="text.secondary">
              {elapsed
                ? `Le journal s'étend sur ${elapsed} h entre la première et la dernière action. C'est un point de départ, pas un temps passé : vous seul savez ce qui a réellement été travaillé.`
                : "Le journal ne permet pas d'estimer une durée : une seule action y figure, ou aucune."}
            </Typography>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Fermer</Button>
          {/* A labelled button rather than the shared copy icon: this is the primary action of
              the dialog, and an icon with only a tooltip does not read as one. The icon
              component stays beside it for the habit it has already formed elsewhere. */}
          <CippCopyToClipBoard text={text} type="button" />
          <Button variant="contained" startIcon={<ContentCopy />} onClick={copy}>
            {copied ? 'Copié' : 'Copier la saisie'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  )
}
