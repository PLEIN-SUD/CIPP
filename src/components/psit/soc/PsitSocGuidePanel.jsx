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
  Tooltip,
  Typography,
} from '@mui/material'
import { ApiPostCall } from '../../../api/ApiCall'
import { CippApiResults } from '../../CippComponents/CippApiResults'
import { psitSocTypeById } from '../../../utils/psit-soc-types'
import { psitSocStepEvidence } from '../../../utils/psit-soc-evidence'

/**
 * The investigation guide of the case's type, checkable step by step. A checked step is a
 * recorded fact - who ticked it and when persists on the case - not a UI convenience, so an
 * analyst taking over mid-investigation sees what was actually done.
 *
 * The FP/TP clue lists sit next to the steps because they are what the steps produce evidence
 * for. Green reads "expected activity", red reads "compromise"; the analyst weighs, the panel
 * never concludes.
 *
 * Steps that CIPP can answer carry their answer inline: a guide asking "read the permissions
 * granted" while the permissions sit two cards below turns a check into an errand. What is shown
 * reports and never concludes, and says when it does not know - data that has not arrived is not
 * data that came back empty.
 */
export const PsitSocGuidePanel = ({ socCase, queryKey, evidence, phase, title, showClues = true }) => {
  const catalogueEntry = psitSocTypeById(socCase?.TypeId)
  const progressWrite = ApiPostCall({ relatedQueryKeys: queryKey ? [queryKey] : [] })

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
  const STATE_WORDS = { done: 'faite', skipped: 'sans objet', pending: 'à faire' }

  const writeStep = (step, state) => {
    progressWrite.mutate({
      url: '/api/PSITExecSocCase',
      data: {
        tenantFilter: socCase.Tenant,
        CaseId: socCase.CaseId,
        GuideProgress: [{ StepId: step.id, State: state }],
      },
    })
  }

  const toggleStep = (step) => {
    const done = stepState(step.id)?.State === 'done'
    writeStep(step, done ? 'pending' : 'done')
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
            return (
              <ListItem
                key={step.id}
                disablePadding
                secondaryAction={
                  // 'Sans objet' is work, not evasion: stating that a step does not apply to
                  // this dossier is a recorded judgement (who, when), and it unlocks like done.
                  <Tooltip
                    describeChild
                    title={
                      skipped
                        ? 'Réactiver : remettre cette étape à faire'
                        : 'Sans objet : déclarer que cette étape ne s’applique pas à ce dossier. Jugement journalisé à votre nom, et l’étape compte comme faite pour déverrouiller l’onglet suivant.'
                    }
                  >
                    <Button
                      size="small"
                      variant="outlined"
                      color="inherit"
                      sx={{ color: 'text.secondary', borderColor: 'divider', textTransform: 'none' }}
                      onClick={() => writeStep(step, skipped ? 'pending' : 'skipped')}
                    >
                      {skipped ? 'Réactiver' : 'Sans objet'}
                    </Button>
                  </Tooltip>
                }
              >
                <ListItemButton onClick={() => toggleStep(step)} dense>
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
                          <Typography component="span" variant="caption" display="block">
                            {`${STATE_WORDS[state.State] ?? state.State}, ${state.By} (${state.Utc})`}
                          </Typography>
                        )}
                      </>
                    }
                  />
                </ListItemButton>
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
