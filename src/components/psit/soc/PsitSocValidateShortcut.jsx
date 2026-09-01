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
import { psitSocRemediationPlan } from '../../../utils/psit-soc-remediation'

/**
 * The assumed shortcut of the tabbed frame: a verdict that is already established can be posed
 * from the Valider tab, justification required, without walking five tabs for an alert settled
 * in two minutes. Three cases qualify as established:
 *
 * - an evident false positive (the detection is wrong, and it shows);
 * - an evident benign true positive (real behaviour, no compromise: shadow IT, assumed usage);
 * - a CONFIRMED true positive: the fact is established outside the walk - the account holder
 *   was reached and is not in the country the alert names, the client confirms nobody did
 *   this. The justification must say who confirmed and how. Posing it here immediately offers
 *   the remediation the entity calls for, because a confirmed compromise does not wait five
 *   tabs; the walk then continues unlocked (verdict posed = gating off) to assess the impact.
 *
 * An unconfirmed suspicion is none of these: it walks the tabs.
 */
export const PsitSocValidateShortcut = ({ socCase, queryKey }) => {
  const [verdict, setVerdict] = useState(null)
  const [justification, setJustification] = useState('')
  // Survives the refetch that follows the TP write: the dossier then carries a verdict, and
  // without this flag the component would unmount before offering the remediation.
  const [tpPosed, setTpPosed] = useState(false)
  const write = ApiPostCall({ relatedQueryKeys: queryKey ? [queryKey] : [] })
  const action = ApiPostCall({ relatedQueryKeys: queryKey ? [queryKey] : [] })
  const journal = ApiPostCall({ relatedQueryKeys: queryKey ? [queryKey] : [] })

  const plan = psitSocRemediationPlan(socCase)

  if (socCase?.Qualification?.Verdict && !tpPosed) return null

  const save = () => {
    if (!verdict || !justification.trim()) return
    write.mutate(
      {
        url: '/api/PSITExecSocCase',
        data: {
          tenantFilter: socCase.Tenant,
          CaseId: socCase.CaseId,
          Verdict: verdict,
          Justification: justification.trim(),
        },
      },
      {
        onSuccess: () => {
          if (verdict === 'true-positive') setTpPosed(true)
        },
      }
    )
  }

  const remediate = () => {
    action.mutate(plan.payload, {
      onSuccess: () => {
        journal.mutate({
          url: '/api/PSITExecSocCase',
          data: {
            tenantFilter: socCase.Tenant,
            CaseId: socCase.CaseId,
            Status: 'contained',
            LogAction: {
              Action: plan.journalAction,
              Detail: plan.journalDetail('Remédiation immédiate sur vrai positif confirmé dès la validation'),
            },
          },
        })
      },
    })
  }

  // The verdict is posed; what remains of the shortcut is the remediation it promised.
  if (tpPosed) {
    return (
      <Card variant="outlined">
        <CardHeader
          title="Vrai positif posé — remédier maintenant ?"
          subheader="Le verdict est enregistré et tous les onglets sont ouverts pour évaluer l'impact. La compromission confirmée, elle, n'attend pas."
        />
        <CardContent>
          <Stack spacing={2}>
            {plan.available ? (
              <>
                <Typography variant="body2" color="text.secondary">
                  {plan.description}
                </Typography>
                <Stack direction="row" spacing={1} alignItems="center">
                  <Tooltip
                    describeChild
                    title={`${plan.actionLabel} : la remédiation est journalisée au dossier, qui passe « Confiné »`}
                  >
                    <span>
                      <Button
                        size="small"
                        variant="contained"
                        color="error"
                        disabled={action.isPending}
                        onClick={remediate}
                      >
                        {plan.actionLabel}
                      </Button>
                    </span>
                  </Tooltip>
                  <Tooltip
                    describeChild
                    title="Plus tard : la remédiation reste disponible dans l'onglet Décision & Réponse et dans l'en-tête"
                  >
                    <Button size="small" onClick={() => setTpPosed(false)}>
                      Plus tard
                    </Button>
                  </Tooltip>
                </Stack>
              </>
            ) : (
              <Typography variant="body2" color="text.secondary">
                Ce dossier ne nomme ni compte ni machine : renseigner l’entité dans l’onglet
                Périmètre, puis remédier depuis l’onglet Décision &amp; Réponse.
              </Typography>
            )}
            <CippApiResults apiObject={action} />
            <CippApiResults apiObject={journal} errorsOnly />
          </Stack>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card variant="outlined">
      <CardHeader
        title="Raccourci de qualification"
        subheader="Pour l’établi seulement : un FP ou un VP bénin manifeste, ou un vrai positif déjà confirmé (titulaire joint, fait avéré). Un soupçon non confirmé déroule les onglets."
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
            <ToggleButton value="true-positive" color="error">
              VP confirmé
            </ToggleButton>
          </ToggleButtonGroup>
          <Typography variant="caption" color="text.secondary">
            Faux positif : la détection s’est trompée, et cela se voit sans investigation.
            VP (vrai positif) bénin : signalement fondé, comportement réel, sans compromission
            (usage assumé, shadow IT). VP confirmé : la compromission est établie par un fait
            extérieur (titulaire joint, client formel) — le verdict se pose et la remédiation
            s’enchaîne immédiatement.
          </Typography>
          <TextField
            size="small"
            fullWidth
            multiline
            rows={2}
            label={
              verdict === 'true-positive'
                ? 'Justification (obligatoire : qui a confirmé, et comment)'
                : 'Justification (obligatoire : ce qui rend le verdict évident)'
            }
            value={justification}
            onChange={(event) => setJustification(event.target.value)}
          />
          {verdict && !justification.trim() && (
            <Alert severity="info">
              Le raccourci exige la justification : c’est elle qui remplace les onglets sautés.
            </Alert>
          )}
          <div>
            <Tooltip
              describeChild
              title={
                verdict === 'true-positive'
                  ? 'Qualifier maintenant : pose le verdict vrai positif puis propose la remédiation immédiate — tous les onglets s’ouvrent pour évaluer l’impact'
                  : 'Qualifier maintenant : pose le verdict choisi sans passer par les autres onglets — la justification tient lieu d’investigation'
              }
            >
              <span>
                <Button
                  size="small"
                  variant="contained"
                  color={verdict === 'true-positive' ? 'error' : 'primary'}
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
