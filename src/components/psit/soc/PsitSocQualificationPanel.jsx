import { useState } from 'react'
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardHeader,
  Chip,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
  Tooltip,
} from '@mui/material'
import { ApiPostCall } from '../../../api/ApiCall'
import { CippApiResults } from '../../CippComponents/CippApiResults'

// The four-outcome taxonomy. Each help line is the definition the analyst chooses by, because
// the wrong verdict here teaches the external SOC the wrong lesson: an FP on a founded detection
// trains it to stop flagging the pattern.
const VERDICT_CHOICES = [
  {
    value: 'true-positive',
    label: 'Vrai positif',
    help: 'Activité malveillante ou compromission avérée. Suite : confinement, rapport.',
  },
  {
    value: 'benign-true-positive',
    label: 'Vrai positif bénin',
    help: 'Le signalement était fondé, le comportement est réel, mais sans compromission (usage assumé, shadow IT traité). La détection reste bonne.',
  },
  {
    value: 'false-positive',
    label: 'Faux positif',
    help: 'La détection s’est trompée : l’activité signalée était normale ou mal corrélée. À dire au SOC externe pour régler la détection.',
  },
  {
    value: 'undetermined',
    label: 'Indéterminé',
    help: 'Les éléments ne permettent pas de trancher. État d’attente : escalader ou chercher la donnée manquante ; la clôture exigera une justification.',
  },
]

/**
 * What the case verdict writes back into Defender, per source. The PSIT case is the reference
 * write; the Defender write-back is best effort and non-blocking, so a Graph hiccup never loses
 * the analyst's decision. 'undetermined' writes nothing back: Defender has no honest equivalent
 * of "the question stands".
 *
 * Determinations are the coarse Graph values on purpose: 'notMalicious' for a false positive,
 * 'other' for a true positive. Finer determinations (phishing, malware...) belong to a later
 * iteration if real usage asks for them.
 */
const defenderWriteBack = (socCase, verdict) => {
  if (!socCase?.ExternalRef) return null
  if (verdict === 'undetermined') return null
  const target =
    socCase.Source === 'xdr'
      ? '/api/ExecSetSecurityIncident'
      : socCase.Source === 'mdo'
        ? '/api/ExecSetMdoAlert'
        : null
  if (!target) return null

  const mapping =
    verdict === 'false-positive'
      ? { Status: 'resolved', Classification: 'falsePositive', Determination: 'notMalicious' }
      : verdict === 'benign-true-positive'
        ? // Defender's own word for it: the detection was right and the activity is expected or
          // accounted for. Forcing FP here would tune the detection out.
          { Status: 'resolved', Classification: 'informationalExpectedActivity', Determination: 'confirmedActivity' }
        : { Classification: 'truePositive', Determination: 'other' }

  return {
    url: target,
    data: {
      tenantFilter: socCase.Tenant,
      GUID: socCase.ExternalRef,
      ...mapping,
    },
  }
}

/**
 * The analyst's verdict on the case: one saisie, two writes. Saving qualifies the PSIT case
 * (analyst, timestamp, justification, history kept server-side), then - when the case was adopted
 * from Defender or MDO - pushes status, classification and determination back into Defender so
 * Lighthouse and the portal show the same truth.
 */
export const PsitSocQualificationPanel = ({ socCase, queryKey }) => {
  const [verdict, setVerdict] = useState(null)
  const [justification, setJustification] = useState('')

  const caseWrite = ApiPostCall({ relatedQueryKeys: queryKey ? [queryKey] : [] })
  const defenderWrite = ApiPostCall({})

  const qualification = socCase?.Qualification
  const writeBackPlanned = Boolean(defenderWriteBack(socCase, verdict ?? 'false-positive'))

  const handleSave = () => {
    if (!verdict) return
    const writeBack = defenderWriteBack(socCase, verdict)
    caseWrite.mutate(
      {
        url: '/api/PSITExecSocCase',
        data: {
          tenantFilter: socCase.Tenant,
          CaseId: socCase.CaseId,
          Verdict: verdict,
          Justification: justification,
        },
      },
      {
        onSuccess: () => {
          if (writeBack) defenderWrite.mutate(writeBack)
        },
      }
    )
  }

  return (
    <Card variant="outlined">
      <CardHeader
        title="Qualification"
        subheader="Une décision, écrite sur le dossier et répercutée dans Defender quand le dossier en vient"
      />
      <CardContent>
        <Stack spacing={2}>
          {qualification?.Verdict && (
            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
              <Chip
                color={
                  qualification.Verdict === 'true-positive'
                    ? 'error'
                    : qualification.Verdict === 'benign-true-positive'
                      ? 'primary'
                      : 'default'
                }
                label={`${
                  VERDICT_CHOICES.find((choice) => choice.value === qualification.Verdict)?.label ??
                  qualification.Verdict
                }, ${qualification.Analyst} (${qualification.DecidedUtc})`}
              />
              {qualification.Justification && (
                <Typography variant="body2" color="text.secondary">
                  {qualification.Justification}
                </Typography>
              )}
            </Stack>
          )}
          {(qualification?.PreviousVerdicts ?? []).length > 0 && (
            <Stack spacing={0.5}>
              <Typography variant="subtitle2">Verdicts précédents</Typography>
              {qualification.PreviousVerdicts.map((previous, index) => (
                <Typography key={index} variant="body2" color="text.secondary">
                  {VERDICT_CHOICES.find((choice) => choice.value === previous.Verdict)?.label ??
                    previous.Verdict}
                  , {previous.Analyst} ({previous.DecidedUtc})
                  {previous.Justification ? `: ${previous.Justification}` : ''}
                </Typography>
              ))}
            </Stack>
          )}

          <ToggleButtonGroup
            exclusive
            orientation="vertical"
            size="small"
            value={verdict}
            onChange={(event, value) => {
              if (value) setVerdict(value)
            }}
          >
            {VERDICT_CHOICES.map((choice) => (
              <ToggleButton
                key={choice.value}
                value={choice.value}
                sx={{ justifyContent: 'flex-start', textAlign: 'left' }}
              >
                <Stack spacing={0} alignItems="flex-start">
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {choice.label}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {choice.help}
                  </Typography>
                </Stack>
              </ToggleButton>
            ))}
          </ToggleButtonGroup>

          <TextField
            size="small"
            fullWidth
            multiline
            rows={2}
            label="Justification (qui a confirmé, sur quels éléments)"
            value={justification}
            onChange={(event) => setJustification(event.target.value)}
          />

          <Stack direction="row" spacing={2} alignItems="center">
            <Tooltip describeChild title="Enregistrer la qualification : pose le verdict au dossier (horodaté à votre nom) ; un dossier adopté depuis Defender pousse aussi la qualification vers Defender">
              <span>
                <Button
                  variant="contained"
                  disabled={!verdict || caseWrite.isPending}
                  onClick={handleSave}
                >
                  {caseWrite.isPending ? 'Enregistrement...' : 'Enregistrer la qualification'}
                </Button>
              </span>
            </Tooltip>
            {writeBackPlanned && (
              <Typography variant="body2" color="text.secondary">
                Mettra aussi à jour {socCase?.Source === 'mdo' ? 'l’alerte' : 'l’incident'} Defender.
              </Typography>
            )}
          </Stack>

          <CippApiResults apiObject={caseWrite} errorsOnly />
          <CippApiResults apiObject={defenderWrite} />
          {defenderWrite.isError && (
            <Alert severity="warning">
              La qualification du dossier est enregistrée. Seule l’écriture vers Defender a échoué :
              classifier depuis le portail Defender, ou réenregistrer pour réessayer.
            </Alert>
          )}
        </Stack>
      </CardContent>
    </Card>
  )
}
