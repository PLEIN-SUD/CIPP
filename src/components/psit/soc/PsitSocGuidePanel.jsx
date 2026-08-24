import {
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
export const PsitSocGuidePanel = ({ socCase, queryKey, evidence }) => {
  const catalogueEntry = psitSocTypeById(socCase?.TypeId)
  const progressWrite = ApiPostCall({ relatedQueryKeys: queryKey ? [queryKey] : [] })

  if (!catalogueEntry) {
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

  const stepState = (stepId) => socCase?.GuideProgress?.[stepId]

  const EVIDENCE_COLOUR = { good: 'success.main', bad: 'error.main', unknown: 'text.secondary' }

  const toggleStep = (step) => {
    const done = stepState(step.id)?.State === 'done'
    progressWrite.mutate({
      url: '/api/PSITExecSocCase',
      data: {
        tenantFilter: socCase.Tenant,
        CaseId: socCase.CaseId,
        GuideProgress: [{ StepId: step.id, State: done ? 'pending' : 'done' }],
      },
    })
  }

  return (
    <Card variant="outlined">
      <CardHeader title="Guide d’investigation" subheader={catalogueEntry.label} />
      <CardContent>
        <List dense>
          {catalogueEntry.guide.map((step) => {
            const state = stepState(step.id)
            const answer = psitSocStepEvidence(step.evidence, evidence)
            return (
              <ListItem key={step.id} disablePadding>
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
                            {`${state.State}, ${state.By} (${state.Utc})`}
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
        <CippApiResults apiObject={progressWrite} />

        <Grid container spacing={2} sx={{ mt: 1 }}>
          <Grid item xs={12} md={6}>
            <Typography variant="subtitle2" color="success.main" gutterBottom>
              Se lit comme une activité attendue
            </Typography>
            {catalogueEntry.fpClues.map((clue, index) => (
              <Typography key={index} variant="body2" color="text.secondary">
                {clue}
              </Typography>
            ))}
          </Grid>
          <Grid item xs={12} md={6}>
            <Typography variant="subtitle2" color="error.main" gutterBottom>
              Se lit comme une compromission
            </Typography>
            {catalogueEntry.tpClues.map((clue, index) => (
              <Typography key={index} variant="body2" color="text.secondary">
                {clue}
              </Typography>
            ))}
          </Grid>
        </Grid>
      </CardContent>
    </Card>
  )
}
