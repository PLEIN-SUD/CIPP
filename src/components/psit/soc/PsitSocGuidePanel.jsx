import { useState } from 'react'
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  Checkbox,
  Grid,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material'
import { ApiPostCall } from '../../../api/ApiCall'
import { CippApiResults } from '../../CippComponents/CippApiResults'
import { psitSocTypeById } from '../../../utils/psit-soc-types'
import { psitSocStepEvidence } from '../../../utils/psit-soc-evidence'

/**
 * The investigation guide of the case's type, checkable step by step - and each step is a
 * QUESTION, so settling it records an ANSWER, not just a tick. Three settled states, all
 * stamped with who and when, all carrying a finding (Note):
 *
 * - fait: the step was done, and the constat says what was found ('aucun forward en place').
 *   When CIPP already answers the step inline (evidence line), ticking captures that answer as
 *   the constat automatically - what the analyst saw at that instant, frozen even if the live
 *   read changes later. Otherwise the constat is typed, and it is REQUIRED: a tick without a
 *   result is exactly the incoherence this panel used to have.
 * - sans objet: the step does not apply here, and the constat says why.
 * - sans réponse: looked, cannot answer, and the constat says what was tried. A recorded
 *   impasse BLOCKS the next tab like an untouched step: the honest exits are finding the
 *   answer, qualifying early (FP, VP bénin, VP confirmé), escalating, or holding - and the
 *   Décision tab counts these impasses as a push toward 'indéterminé'.
 *
 * The FP/TP clue lists sit next to the steps because they are what the steps produce evidence
 * for. Green reads "expected activity", red reads "compromise"; the analyst weighs, the panel
 * never concludes.
 */
export const PsitSocGuidePanel = ({ socCase, queryKey, evidence, phase, title, showClues = true }) => {
  const catalogueEntry = psitSocTypeById(socCase?.TypeId)
  const progressWrite = ApiPostCall({ relatedQueryKeys: queryKey ? [queryKey] : [] })
  // One inline finding form at a time: { stepId, state, note }.
  const [draft, setDraft] = useState(null)

  if (!catalogueEntry) {
    // Scoped to a phase, an unknown type renders nothing: the frame's tabs already ungate
    // themselves for it, and one 'type inconnu' card per tab would say it seven times.
    if (phase) return null
    return (
      <Card variant="outlined">
        <CardHeader title="Guide d’investigation" />
        <CardContent>
          <Typography variant="body2" color="text.secondary">
            Type d’alerte inconnu {String(socCase?.TypeId ?? '')} : aucun guide n’est défini pour lui.
          </Typography>
        </CardContent>
      </Card>
    )
  }

  // Scoped to one investigation phase when the tabbed frame asks for it; the whole guide
  // otherwise (older callers, and tests).
  const steps = phase
    ? catalogueEntry.guide.filter((step) => step.phase === phase)
    : catalogueEntry.guide
  if (phase && steps.length === 0) return null

  const stepState = (stepId) => socCase?.GuideProgress?.[stepId]

  const EVIDENCE_COLOUR = { good: 'success.main', bad: 'error.main', unknown: 'text.secondary' }
  const STATE_WORDS = { done: 'faite', skipped: 'sans objet', unknown: 'sans réponse', pending: 'à faire' }
  const DRAFT_LABELS = {
    done: 'Constat (obligatoire) : ce que cette étape a établi',
    skipped: 'Constat (obligatoire) : pourquoi cette étape ne s’applique pas ici',
    unknown: 'Constat (obligatoire) : ce qui a été tenté, et pourquoi la question reste ouverte',
  }

  const writeStep = (step, state, note) => {
    setDraft(null)
    progressWrite.mutate({
      url: '/api/PSITExecSocCase',
      data: {
        tenantFilter: socCase.Tenant,
        CaseId: socCase.CaseId,
        GuideProgress: [{ StepId: step.id, State: state, ...(note ? { Note: note } : {}) }],
      },
    })
  }

  /**
   * Settling a step asks for its finding first - except when the data already answered: then
   * the tick captures the inline answer as the constat, no typing. Going back to 'à faire'
   * never asks anything (and the server keeps the recorded finding).
   */
  const requestState = (step, state, answer) => {
    if (state === 'pending') {
      writeStep(step, 'pending')
      return
    }
    if (state === 'done' && answer && answer.tone !== 'unknown') {
      writeStep(step, 'done', `Donnée : ${answer.text}`)
      return
    }
    setDraft({ stepId: step.id, state, note: stepState(step.id)?.Note ?? '' })
  }

  return (
    <Card variant="outlined">
      <CardHeader title={title ?? 'Guide d’investigation'} subheader={catalogueEntry.label} />
      <CardContent>
        <List dense>
          {steps.map((step) => {
            const state = stepState(step.id)
            const answer = psitSocStepEvidence(step.evidence, evidence)
            const skipped = state?.State === 'skipped'
            const unanswered = state?.State === 'unknown'
            const drafting = draft?.stepId === step.id
            return (
              <ListItem
                key={step.id}
                disablePadding
                sx={{ flexWrap: 'wrap' }}
                secondaryAction={
                  skipped || unanswered ? (
                    <Tooltip describeChild title="Réactiver : remettre cette étape à faire (le constat déjà consigné reste au dossier)">
                      <Button
                        size="small"
                        variant="outlined"
                        color="inherit"
                        sx={{ color: 'text.secondary', borderColor: 'divider', textTransform: 'none' }}
                        onClick={() => requestState(step, 'pending')}
                      >
                        Réactiver
                      </Button>
                    </Tooltip>
                  ) : (
                    <Stack direction="row" spacing={0.5}>
                      {/* 'Sans objet' is work, not evasion: stating that a step does not apply
                          is a recorded judgement (who, when, why), and it unlocks like done. */}
                      <Tooltip
                        describeChild
                        title="Sans objet : déclarer que cette étape ne s’applique pas à ce dossier. Constat obligatoire, jugement journalisé à votre nom, et l’étape compte comme faite pour déverrouiller l’onglet suivant."
                      >
                        <Button
                          size="small"
                          variant="outlined"
                          color="inherit"
                          sx={{ color: 'text.secondary', borderColor: 'divider', textTransform: 'none' }}
                          onClick={() => requestState(step, 'skipped')}
                        >
                          Sans objet
                        </Button>
                      </Tooltip>
                      {/* The recorded impasse: looked, cannot answer. It does NOT unlock - the
                          exits are the shortcut verdicts, the escalation, or the hold. */}
                      <Tooltip
                        describeChild
                        title="Sans réponse : la question a été travaillée mais ne peut pas être tranchée. Constat obligatoire (ce qui a été tenté). L’étape reste bloquante : qualifier tôt, escalader ou mettre en attente sont les sorties."
                      >
                        <Button
                          size="small"
                          variant="outlined"
                          color="warning"
                          sx={{ textTransform: 'none' }}
                          onClick={() => requestState(step, 'unknown')}
                        >
                          Sans réponse
                        </Button>
                      </Tooltip>
                    </Stack>
                  )
                }
              >
                <ListItemButton
                  onClick={() =>
                    requestState(step, state?.State === 'done' ? 'pending' : 'done', answer)
                  }
                  dense
                >
                  <ListItemIcon>
                    <Checkbox
                      edge="start"
                      checked={state?.State === 'done'}
                      tabIndex={-1}
                      disableRipple
                      inputProps={{ 'aria-label': step.label }}
                    />
                  </ListItemIcon>
                  <ListItemText
                    primary={step.label}
                    sx={skipped ? { textDecoration: 'line-through', opacity: 0.6 } : undefined}
                    secondary={
                      <>
                        {answer && (
                          <Typography
                            component="span"
                            variant="body2"
                            display="block"
                            sx={{ color: EVIDENCE_COLOUR[answer.tone] }}
                          >
                            {answer.text}
                          </Typography>
                        )}
                        {/* Only a settled step carries a name and a timestamp: a step nobody has
                            touched, or one that was un-ticked, has nothing to attest. */}
                        {state?.By && state.State !== 'pending' && (
                          <Typography
                            component="span"
                            variant="caption"
                            display="block"
                            sx={unanswered ? { color: 'warning.main' } : undefined}
                          >
                            {`${STATE_WORDS[state.State] ?? state.State}, ${state.By} (${state.Utc})`}
                          </Typography>
                        )}
                        {state?.Note && (
                          <Typography
                            component="span"
                            variant="caption"
                            display="block"
                            sx={{ fontStyle: 'italic' }}
                          >
                            {state.Note}
                          </Typography>
                        )}
                      </>
                    }
                  />
                </ListItemButton>
                {drafting && (
                  <Stack spacing={1} sx={{ width: '100%', pl: 7, pr: 2, pb: 1 }}>
                    <TextField
                      size="small"
                      fullWidth
                      multiline
                      minRows={1}
                      autoFocus
                      label={DRAFT_LABELS[draft.state]}
                      value={draft.note}
                      onChange={(event) => setDraft({ ...draft, note: event.target.value })}
                    />
                    <Stack direction="row" spacing={1}>
                      <Button
                        size="small"
                        variant="contained"
                        disabled={!draft.note.trim() || progressWrite.isPending}
                        onClick={() => writeStep(step, draft.state, draft.note.trim())}
                      >
                        Enregistrer
                      </Button>
                      <Button size="small" onClick={() => setDraft(null)}>
                        Annuler
                      </Button>
                    </Stack>
                  </Stack>
                )}
              </ListItem>
            )
          })}
        </List>
        <CippApiResults apiObject={progressWrite} errorsOnly />

        {showClues && (
        <Grid container spacing={2} sx={{ mt: 1 }}>
          <Grid item xs={12} md={6}>
            <Typography variant="subtitle2" color="success.main" gutterBottom>
              Se lit comme une activité attendue (penche vers un faux positif)
            </Typography>
            {catalogueEntry.fpClues.map((clue, index) => (
              <Typography key={index} variant="body2" color="text.secondary">
                {clue}
              </Typography>
            ))}
          </Grid>
          <Grid item xs={12} md={6}>
            <Typography variant="subtitle2" color="error.main" gutterBottom>
              Se lit comme une compromission (penche vers un vrai positif)
            </Typography>
            {catalogueEntry.tpClues.map((clue, index) => (
              <Typography key={index} variant="body2" color="text.secondary">
                {clue}
              </Typography>
            ))}
          </Grid>
        </Grid>
        )}
      </CardContent>
    </Card>
  )
}
