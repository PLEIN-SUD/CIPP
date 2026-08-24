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
} from '@mui/material'
import { ApiPostCall } from '../../../api/ApiCall'
import { CippApiResults } from '../../CippComponents/CippApiResults'

const VERDICT_CHOICES = [
  { value: 'false-positive', label: 'False positive' },
  { value: 'true-positive', label: 'True positive' },
  { value: 'undetermined', label: 'Undetermined' },
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
        subheader="One decision, written on the case and pushed back to Defender when the case came from there"
      />
      <CardContent>
        <Stack spacing={2}>
          {qualification?.Verdict && (
            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
              <Chip
                color={qualification.Verdict === 'true-positive' ? 'error' : 'default'}
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
              <Typography variant="subtitle2">Previous verdicts</Typography>
              {qualification.PreviousVerdicts.map((previous, index) => (
                <Typography key={index} variant="body2" color="text.secondary">
                  {previous.Verdict}, {previous.Analyst} ({previous.DecidedUtc})
                  {previous.Justification ? `: ${previous.Justification}` : ''}
                </Typography>
              ))}
            </Stack>
          )}

          <ToggleButtonGroup
            exclusive
            size="small"
            value={verdict}
            onChange={(event, value) => {
              if (value) setVerdict(value)
            }}
          >
            {VERDICT_CHOICES.map((choice) => (
              <ToggleButton key={choice.value} value={choice.value}>
                {choice.label}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>

          <TextField
            size="small"
            fullWidth
            multiline
            rows={2}
            label="Justification (who confirmed, on what evidence)"
            value={justification}
            onChange={(event) => setJustification(event.target.value)}
          />

          <Stack direction="row" spacing={2} alignItems="center">
            <Button
              variant="contained"
              disabled={!verdict || caseWrite.isPending}
              onClick={handleSave}
            >
              {caseWrite.isPending ? 'Saving...' : 'Save qualification'}
            </Button>
            {writeBackPlanned && (
              <Typography variant="body2" color="text.secondary">
                Will also update the Defender {socCase?.Source === 'mdo' ? 'alert' : 'incident'}.
              </Typography>
            )}
          </Stack>

          <CippApiResults apiObject={caseWrite} />
          <CippApiResults apiObject={defenderWrite} />
          {defenderWrite.isError && (
            <Alert severity="warning">
              The case qualification is saved. Only the Defender write-back failed: set the
              classification from the Defender portal, or save again to retry.
            </Alert>
          )}
        </Stack>
      </CardContent>
    </Card>
  )
}
