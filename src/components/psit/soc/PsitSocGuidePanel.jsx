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

/**
 * The investigation guide of the case's type, checkable step by step. A checked step is a
 * recorded fact - who ticked it and when persists on the case - not a UI convenience, so an
 * analyst taking over mid-investigation sees what was actually done.
 *
 * The FP/TP clue lists sit next to the steps because they are what the steps produce evidence
 * for. Green reads "expected activity", red reads "compromise"; the analyst weighs, the panel
 * never concludes.
 */
export const PsitSocGuidePanel = ({ socCase, queryKey }) => {
  const catalogueEntry = psitSocTypeById(socCase?.TypeId)
  const progressWrite = ApiPostCall({ relatedQueryKeys: queryKey ? [queryKey] : [] })

  if (!catalogueEntry) {
    return (
      <Card variant="outlined">
        <CardHeader title="Investigation guide" />
        <CardContent>
          <Typography variant="body2" color="text.secondary">
            Unknown alert type {String(socCase?.TypeId ?? '')}: no guide is defined for it.
          </Typography>
        </CardContent>
      </Card>
    )
  }

  const stepState = (stepId) => socCase?.GuideProgress?.[stepId]

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
      <CardHeader title="Investigation guide" subheader={catalogueEntry.label} />
      <CardContent>
        <List dense>
          {catalogueEntry.guide.map((step) => {
            const state = stepState(step.id)
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
                    secondary={state?.By ? `${state.State}, ${state.By} (${state.Utc})` : null}
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
              Reads as expected activity
            </Typography>
            {catalogueEntry.fpClues.map((clue, index) => (
              <Typography key={index} variant="body2" color="text.secondary">
                {clue}
              </Typography>
            ))}
          </Grid>
          <Grid item xs={12} md={6}>
            <Typography variant="subtitle2" color="error.main" gutterBottom>
              Reads as compromise
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
