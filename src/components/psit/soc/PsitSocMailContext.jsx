import { useState } from 'react'
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardHeader,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import { ApiGetCall, ApiPostCall } from '../../../api/ApiCall'
import { CippApiResults } from '../../CippComponents/CippApiResults'

/**
 * The mail-side context of a case, for an incomplete ZAP (type 18): the message identifiers and
 * the containment gesture that finishes what the automatic purge did not.
 *
 * Two honesty rules are written into the panel rather than left to the analyst's memory:
 * - the purge is a soft delete, and the panel says so on the button, because "purge" reads as
 *   irreversible and this one is not;
 * - Safe Links click data is not collected by CIPP, so the absence of a recorded click means
 *   nothing. The panel states it instead of letting an empty screen suggest "nobody clicked".
 *
 * The purge also needs Defender for Office 365 Plan 2. Rather than offer a button that answers
 * "Invalid subscription", the panel asks what the tenant is licensed for and says where to do it
 * instead. A licence that could not be read leaves the button in place: "we could not check" is
 * not "you cannot", and hiding an action on a failed lookup hides one the tenant may well have.
 */
export const PsitSocMailContext = ({ socCase, queryKey }) => {
  const tenant = socCase?.Tenant
  const networkMessageId = socCase?.Entities?.networkMessageId
  const [recipients, setRecipients] = useState('')

  const capabilities = ApiGetCall({
    url: `/api/PSITListSocCapabilities?tenantFilter=${tenant}`,
    queryKey: `PSITSocCapabilities-${tenant}`,
    waiting: Boolean(tenant),
  })
  const purgeCapability = (capabilities.data?.Actions ?? []).find(
    (entry) => entry.Action === 'mail-remediate'
  )
  // Unlicensed is the only state that removes the button. 'unknown' and a lookup still in flight
  // both keep it: the API refuses cleanly if the licence is genuinely missing.
  const purgeUnlicensed = purgeCapability?.State === 'unlicensed'

  const action = ApiPostCall({ relatedQueryKeys: queryKey ? [queryKey] : [] })

  const runPurge = () => {
    const list = recipients
      .split(/[,;\s]+/)
      .map((entry) => entry.trim())
      .filter(Boolean)
    action.mutate(
      {
        url: '/api/PSITExecMailRemediate',
        data: {
          tenantFilter: tenant,
          NetworkMessageId: networkMessageId,
          Recipients: list,
          ReceivedUtc: socCase?.Entities?.receivedUtc,
        },
      },
      {
        onSuccess: () => {
          action.mutate({
            url: '/api/PSITExecSocCase',
            data: {
              tenantFilter: tenant,
              CaseId: socCase.CaseId,
              LogAction: {
                Action: 'mail-soft-delete',
                Detail: `Suppression réversible demandée pour ${networkMessageId}${
                  list.length > 0 ? ` (${list.length} destinataire(s))` : ' (tous les destinataires)'
                }`,
              },
            },
          })
        },
      }
    )
  }

  if (!networkMessageId) {
    return (
      <Card variant="outlined">
        <CardHeader title="Contexte message" />
        <CardContent>
          <Typography variant="body2" color="text.secondary">
            Ce cas ne porte pas d’identifiant de message : renseigner networkMessageId sur le cas
            pour pouvoir agir sur le courrier livré.
          </Typography>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card variant="outlined">
      <CardHeader title="Contexte message" subheader={networkMessageId} />
      <CardContent>
        <Stack spacing={2}>
          <Alert severity="info">
            Les clics sur les liens (Safe Links) ne sont pas collectés par cet outil : l’absence de
            clic enregistré ne vaut pas absence de clic. Vérifier dans Threat Explorer avant de
            conclure.
          </Alert>

          <TextField
            size="small"
            fullWidth
            label="Destinataires à purger (vide = tous)"
            value={recipients}
            onChange={(event) => setRecipients(event.target.value)}
            helperText="Adresses séparées par des virgules"
          />

          {purgeUnlicensed ? (
            <Alert severity="warning">
              Suppression indisponible sur ce tenant : elle demande{' '}
              {purgeCapability?.SkuName ?? 'Defender for Office 365 Plan 2'}. Supprimer le message
              depuis Threat Explorer ou la quarantaine, puis consigner l’action sur le cas.
            </Alert>
          ) : (
            <>
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                <Button
                  size="small"
                  variant="outlined"
                  color="error"
                  disabled={action.isPending}
                  onClick={runPurge}
                >
                  Supprimer le message (réversible)
                </Button>
              </Stack>

              <Typography variant="body2" color="text.secondary">
                Le message est déplacé vers les éléments supprimés des boîtes concernées, pas
                détruit : une purge décidée à tort reste rattrapable.
                {purgeCapability?.State === 'unknown'
                  ? ' Les licences du tenant n’ont pas pu être vérifiées : si la suppression échoue, passer par Threat Explorer.'
                  : ''}
              </Typography>
            </>
          )}

          <CippApiResults apiObject={action} />
        </Stack>
      </CardContent>
    </Card>
  )
}
