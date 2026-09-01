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
  Tooltip,
  Typography,
} from '@mui/material'
import { NoteAdd, ContentCopy } from '@mui/icons-material'
import { CippCopyToClipBoard } from '../../CippComponents/CippCopyToClipboard'
import { psitAutotaskMilestones, psitAutotaskNote } from '../../../utils/psit-soc-autotask-note'

/**
 * The internal Autotask note, generated at the dossier's milestones - the time entry's sibling.
 *
 * Same doctrine: CIPP writes the text, the analyst pastes it into the ticket. No Autotask
 * credentials in CIPP, no write API - the copy gesture is the integration, and it has already
 * proven itself on the time entry. The milestone list is computed from the dossier (taking,
 * qualification, containment, hold, escalation, closure), each note quoting the journal entry
 * it reports rather than the screen's current state.
 */
export const PsitSocAutotaskNote = ({ socCase }) => {
  const [open, setOpen] = useState(false)
  const [milestoneKey, setMilestoneKey] = useState('')
  const [text, setText] = useState('')
  const [copied, setCopied] = useState(false)

  const milestones = psitAutotaskMilestones(socCase)
  if (!socCase?.CaseId || milestones.length === 0) return null

  const buildFor = (key) => {
    const milestone = milestones.find((entry) => entry.key === key) ?? milestones[0]
    return psitAutotaskNote(
      socCase,
      milestone,
      typeof window !== 'undefined' ? window.location.origin : ''
    )
  }

  const openDialog = () => {
    // Rebuilt at each opening: the most recent milestone is the default, and a note drafted on
    // a stale journal is worse than no note.
    const initial = milestones[0].key
    setMilestoneKey(initial)
    setText(buildFor(initial))
    setOpen(true)
  }

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

  return (
    <>
      <Tooltip
        describeChild
        title="Note Autotask : rédige la note interne du jalon choisi (prise en charge, qualification, confinement, attente, escalade, clôture), à coller dans le ticket — rien n'est écrit dans Autotask d'ici"
      >
        <Button size="small" variant="outlined" startIcon={<NoteAdd />} onClick={openDialog}>
          Note Autotask
        </Button>
      </Tooltip>

      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>Note interne Autotask</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2}>
            <Typography variant="body2" color="text.secondary">
              Rédigée depuis le dossier. Relisez, ajustez si besoin, puis copiez dans le ticket
              {socCase?.ExternalRef ? ` ${socCase.ExternalRef}` : ''} comme note interne.
            </Typography>
            <TextField
              select
              size="small"
              label="Jalon"
              value={milestoneKey}
              onChange={(event) => {
                setMilestoneKey(event.target.value)
                setText(buildFor(event.target.value))
              }}
              sx={{ maxWidth: 320 }}
            >
              {milestones.map((milestone) => (
                <MenuItem key={milestone.key} value={milestone.key}>
                  {milestone.label}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              multiline
              minRows={8}
              fullWidth
              value={text}
              onChange={(event) => setText(event.target.value)}
              label="Contenu de la note"
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Fermer</Button>
          <CippCopyToClipBoard text={text} type="button" />
          <Button variant="contained" startIcon={<ContentCopy />} onClick={copy}>
            {copied ? 'Copié' : 'Copier la note'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  )
}
