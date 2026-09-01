import { useState } from 'react'
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardHeader,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from '@mui/material'
import { ApiPostCall } from '../../../api/ApiCall'
import { CippApiResults } from '../../CippComponents/CippApiResults'

/**
 * The assumed shortcut of the tabbed frame: an evident false positive or benign true positive
 * can be qualified from the Valider tab, justification required, without walking five tabs for
 * an alert settled in two minutes. A true positive has no shortcut on purpose - a compromise is
 * exactly the dossier that must not skip scope, evidence and timeline.
 */
export const PsitSocValidateShortcut = ({ socCase, queryKey }) => {
  const [verdict, setVerdict] = useState(null)
  const [justification, setJustification] = useState('')
  const write = ApiPostCall({ relatedQueryKeys: queryKey ? [queryKey] : [] })

  if (socCase?.Qualification?.Verdict) return null

  const save = () => {
    if (!verdict || !justification.trim()) return
    write.mutate({
      url: '/api/PSITExecSocCase',
      data: {
        tenantFilter: socCase.Tenant,
        CaseId: socCase.CaseId,
        Verdict: verdict,
        Justification: justification.trim(),
      },
    })
  }

  return (
    <Card variant="outlined">
      <CardHeader
        title="Raccourci de qualification"
        subheader="Pour l’évidence seulement : un FP ou un VP bénin manifeste se qualifie ici sans dérouler les onglets. Un vrai positif, jamais."
      />
      <CardContent>
        <Stack spacing={2}>
          <ToggleButtonGroup
            exclusive
            size="small"
            value={verdict}
            onChange={(event, value) => {
              if (value) setVerdict(value)
            }}
          >
            {/* No Tooltip around these: ToggleButtonGroup injects selection props into its
                direct children, and a Tooltip in between swallows them — the definitions live
                in the caption below instead. */}
            <ToggleButton value="false-positive">Faux positif évident</ToggleButton>
            <ToggleButton value="benign-true-positive">VP bénin évident</ToggleButton>
          </ToggleButtonGroup>
          <Typography variant="caption" color="text.secondary">
            Faux positif : la détection s’est trompée, et cela se voit sans investigation.
            VP (vrai positif) bénin : signalement fondé, comportement réel, sans compromission
            (usage assumé, shadow IT).
          </Typography>
          <TextField
            size="small"
            fullWidth
            multiline
            rows={2}
            label="Justification (obligatoire : ce qui rend le verdict évident)"
            value={justification}
            onChange={(event) => setJustification(event.target.value)}
          />
          {verdict && !justification.trim() && (
            <Alert severity="info">
              Le raccourci exige la justification : c’est elle qui remplace les onglets sautés.
            </Alert>
          )}
          <div>
            <Tooltip describeChild title="Qualifier maintenant : pose le verdict choisi sans passer par les autres onglets — la justification tient lieu d'investigation">
              <span>
                <Button
                  size="small"
                  variant="contained"
                  disabled={!verdict || !justification.trim() || write.isPending}
                  onClick={save}
                >
                  Qualifier maintenant
                </Button>
              </span>
            </Tooltip>
          </div>
          <CippApiResults apiObject={write} errorsOnly />
        </Stack>
      </CardContent>
    </Card>
  )
}
