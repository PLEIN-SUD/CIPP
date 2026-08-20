import { Button, Chip, Stack, Typography } from '@mui/material'
import CippButtonCard from '../CippCards/CippButtonCard'
import { PsitBecCollectionStatus } from './PsitBecCollectionStatus'
import { PsitBecTriagePanel } from './PsitBecTriagePanel'
import { PsitBecIncidentPanel } from './PsitBecIncidentPanel'
import { PsitBecReportFrButton } from './PsitBecReportFr'
import { PsitBecIncidentReportButton } from './PsitBecIncidentReport'
import { psitAsArray } from '../../utils/psit-as-array'
import {
  VERDICT_STATUS,
  buildSignals,
  buildVerdict,
  partitionDeterminations,
} from '../../utils/psit-bec-signals'

// Everything the analyst decides, gathered at the top of the page.
//
// It used to sit inside the "Report" accordion, below the eleven checks - the last card of a long
// scroll, which is exactly backwards: the checks are the material, the decision is the work. Same
// reasoning as the report restructure, applied to the page. The eleven upstream check cards are
// untouched below.

const STATUS_COLOUR = {
  [VERDICT_STATUS.COMPROMISED]: 'error',
  [VERDICT_STATUS.TO_QUALIFY]: 'warning',
  [VERDICT_STATUS.UNDETERMINED]: 'warning',
  [VERDICT_STATUS.CLEAN]: 'success',
}

export const PsitBecDecisionPanel = ({
  userData,
  becData,
  tenantFilter,
  triage = [],
  onRestart,
}) => {
  if (!userData || !becData || becData.Waiting) return null

  const signals = buildSignals(becData, userData)
  const { current: liveTriage } = partitionDeterminations(triage, becData)
  const verdict = buildVerdict(signals, liveTriage)
  const openQuestions = verdict.openQuestions.length

  return (
    <Stack spacing={3}>
      <PsitBecCollectionStatus becData={becData} onRestart={onRestart} />

      <CippButtonCard
        variant="outlined"
        title={
          <Stack
            direction="row"
            spacing={2}
            alignItems="center"
            justifyContent="space-between"
            sx={{ width: '100%' }}
          >
            <Stack direction="row" spacing={2} alignItems="center">
              <span>Décision et dossier</span>
              <Chip
                size="small"
                color={STATUS_COLOUR[verdict.status] || 'default'}
                label={verdict.label}
              />
            </Stack>
            {onRestart && (
              <Button size="small" onClick={() => onRestart()}>
                Relancer la collecte
              </Button>
            )}
          </Stack>
        }
      >
        <Stack spacing={2}>
          <Typography variant="body2" color="text.secondary">
            {openQuestions > 0
              ? `${openQuestions} question(s) sans réponse : tant qu'elles le sont, les rapports n'affichent aucun niveau de risque. Les vérifications détaillées sont listées sous cette carte.`
              : 'Les signaux relevés sont qualifiés. Les vérifications détaillées sont listées sous cette carte.'}
          </Typography>
          <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
            <PsitBecReportFrButton
              userData={userData}
              becData={becData}
              tenantName={tenantFilter}
              triage={triage}
            />
            <PsitBecIncidentReportButton
              userData={userData}
              becData={becData}
              tenantName={tenantFilter}
              triage={psitAsArray(triage)}
            />
          </Stack>
        </Stack>
      </CippButtonCard>

      <PsitBecTriagePanel userData={userData} becData={becData} tenantFilter={tenantFilter} />

      {/* Le ticket Autotask est toujours saisissable ; les champs propres à l'incident
          n'apparaissent qu'une fois une compromission retenue. */}
      <PsitBecIncidentPanel
        userData={userData}
        becData={becData}
        tenantFilter={tenantFilter}
        triage={triage}
      />
    </Stack>
  )
}
