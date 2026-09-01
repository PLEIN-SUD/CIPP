import { useState } from 'react'
import {
  Autocomplete,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  Typography,
  Tooltip,
} from '@mui/material'
import { PauseCircleOutline, PlayCircleOutline, MoveUp } from '@mui/icons-material'
import { ApiPostCall } from '../../../api/ApiCall'
import { CippApiResults } from '../../CippComponents/CippApiResults'
import { usePsitSocAnalysts } from '../../../hooks/use-psit-soc-analysts'

/**
 * The two header gestures that move a dossier sideways instead of forward.
 *
 * Mise en attente: the dossier cannot advance without the emitter's data. The status change and
 * its reason go to the journal; the request itself is drafted by the response block (demande de
 * précisions) and travels through the ticket, never through a parallel channel. Reprendre undoes
 * it, journaled too.
 *
 * Escalade: reassignment to a named analyst with a mandatory reason, plus a direct mail to the
 * recipient (server-side, bypassing the notification config: an escalation must arrive). No
 * dedicated status - the dossier stays 'En cours', assigned to the senior; the journal and the
 * assignment tell the story.
 */
export const PsitSocHoldControls = ({ socCase, queryKey }) => {
  const [holdOpen, setHoldOpen] = useState(false)
  const [holdReason, setHoldReason] = useState('')
  const [escalateOpen, setEscalateOpen] = useState(false)
  const [escalateTo, setEscalateTo] = useState(null)
  const [escalateReason, setEscalateReason] = useState('')

  const write = ApiPostCall({ relatedQueryKeys: queryKey ? [queryKey] : [] })
  const escalate = ApiPostCall({ relatedQueryKeys: queryKey ? [queryKey] : [] })
  const { options, request: analystsRequest } = usePsitSocAnalysts()

  if (!socCase?.CaseId || socCase?.Status === 'closed') return null

  const onHold = socCase.Status === 'on-hold'

  const putOnHold = () => {
    setHoldOpen(false)
    write.mutate({
      url: '/api/PSITExecSocCase',
      data: {
        tenantFilter: socCase.Tenant,
        CaseId: socCase.CaseId,
        Status: 'on-hold',
        LogAction: { Action: 'on-hold', Detail: `Mis en attente : ${holdReason.trim()}` },
      },
    })
  }

  const resume = () => {
    write.mutate({
      url: '/api/PSITExecSocCase',
      data: {
        tenantFilter: socCase.Tenant,
        CaseId: socCase.CaseId,
        Status: 'investigating',
        LogAction: { Action: 'resumed', Detail: 'Reprise après attente' },
      },
    })
  }

  const runEscalate = () => {
    setEscalateOpen(false)
    escalate.mutate({
      url: '/api/PSITExecSocEscalate',
      data: {
        tenantFilter: socCase.Tenant,
        CaseId: socCase.CaseId,
        EscalateTo: escalateTo?.value ?? escalateTo,
        Reason: escalateReason.trim(),
      },
    })
  }

  return (
    <>
      {onHold ? (
        <Tooltip describeChild title="Reprendre le dossier : sortir de l'attente et remettre le dossier en investigation">
          <span>
            <Button
              size="small"
              variant="outlined"
              startIcon={<PlayCircleOutline />}
              disabled={write.isPending}
              onClick={resume}
            >
              Reprendre le dossier
            </Button>
          </span>
        </Tooltip>
      ) : (
        <Tooltip describeChild title="Mettre en attente : le dossier attend un retour (SOC externe, client) — motif obligatoire, âge d'attente visible dans la file">
          <span>
            <Button
              size="small"
              variant="outlined"
              startIcon={<PauseCircleOutline />}
              disabled={write.isPending}
              onClick={() => setHoldOpen(true)}
            >
              Mettre en attente
            </Button>
          </span>
        </Tooltip>
      )}
      <Tooltip describeChild title="Escalader : réattribue le dossier à la personne choisie et lui envoie un mail avec le lien — motif obligatoire, journalisé">
        <span>
          <Button
            size="small"
            variant="outlined"
            startIcon={<MoveUp />}
            disabled={escalate.isPending}
            onClick={() => setEscalateOpen(true)}
          >
            Escalader
          </Button>
        </span>
      </Tooltip>

      <Dialog open={holdOpen} onClose={() => setHoldOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Mettre le dossier en attente</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <Typography variant="body2" color="text.secondary">
              Pour un dossier qui ne peut pas avancer sans un retour (SOC externe, client). Il sort
              des « à prendre » mais reste ouvert, et la file affiche depuis quand il attend. La
              demande elle-même se rédige avec « Réponse SOC externe » et part par le ticket.
            </Typography>
            <TextField
              size="small"
              fullWidth
              multiline
              rows={2}
              label="Ce qu'on attend, et de qui"
              value={holdReason}
              onChange={(event) => setHoldReason(event.target.value)}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setHoldOpen(false)}>Annuler</Button>
          <Button variant="contained" disabled={!holdReason.trim()} onClick={putOnHold}>
            Mettre en attente
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={escalateOpen} onClose={() => setEscalateOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Escalader le dossier</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <Typography variant="body2" color="text.secondary">
              Réattribue le dossier et prévient le destinataire par mail, avec le lien. Le motif
              part au journal : une escalade sans explication est une patate chaude.
            </Typography>
            <Autocomplete
              size="small"
              options={options}
              loading={analystsRequest.isFetching}
              value={escalateTo}
              onChange={(event, value) => setEscalateTo(value)}
              renderInput={(params) => <TextField {...params} label="Escalader à" />}
            />
            <TextField
              size="small"
              fullWidth
              multiline
              rows={2}
              label="Motif (obligatoire)"
              value={escalateReason}
              onChange={(event) => setEscalateReason(event.target.value)}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEscalateOpen(false)}>Annuler</Button>
          <Button
            variant="contained"
            disabled={!escalateTo || !escalateReason.trim()}
            onClick={runEscalate}
          >
            Escalader
          </Button>
        </DialogActions>
      </Dialog>

      <CippApiResults apiObject={write} errorsOnly />
      {/* The escalation answer matters: it says when the mail did not leave. */}
      <CippApiResults apiObject={escalate} />
    </>
  )
}
