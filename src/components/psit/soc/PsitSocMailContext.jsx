import { useState } from 'react'
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardHeader,
  Chip,
  Skeleton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material'
import { ApiGetCall, ApiPostCall } from '../../../api/ApiCall'
import { CippApiResults } from '../../CippComponents/CippApiResults'

/**
 * The mail-side context of a case, for an incomplete ZAP (type 18): what Defender knows about
 * the message, and the containment gesture that finishes what the automatic purge did not.
 *
 * The evidence comes first, and it is not decoration. This panel used to show an identifier and a
 * delete button, which asked an analyst to remove a message he could not see. He now reads who
 * sent it, what it was called, what Defender made of it, and where each copy sits, before the
 * button is worth pressing.
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

  // The same read the purge performs server-side. The panel and the action therefore agree on
  // what exists: a screen saying four people received it and a purge finding nothing is the kind
  // of contradiction that costs an analyst's trust in every other screen.
  const evidence = ApiGetCall({
    url: `/api/PSITListMailEvidence?tenantFilter=${tenant}&NetworkMessageId=${networkMessageId}&ReceivedUtc=${socCase?.Entities?.receivedUtc ?? ''}`,
    queryKey: `PSITMailEvidence-${tenant}-${networkMessageId}`,
    waiting: Boolean(tenant && networkMessageId),
  })
  const message = evidence.data?.Message
  const deliveries = Array.isArray(evidence.data?.Recipients) ? evidence.data.Recipients : []
  const evidenceMeta = evidence.data?.Metadata
  const evidenceFailed = typeof evidence.data?.Results === 'string' || evidence.isError

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

  // No case, no journal to receive a gesture: the panel then shows and never acts.
  const caseless = !socCase?.CaseId

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
          {evidence.isFetching && !message && <Skeleton variant="rounded" height={140} />}

          {evidenceFailed && (
            <Alert severity="error">
              La lecture du message a échoué. Rien n’est affiché plutôt qu’un message vide, qui se
              lirait comme « aucun destinataire touché ».
            </Alert>
          )}

          {!evidenceFailed && evidence.isFetched && evidenceMeta?.Found === false && (
            <Alert severity="warning">
              Aucun message analysé trouvé entre {evidenceMeta?.WindowStart} et{' '}
              {evidenceMeta?.WindowEnd}.
              {evidenceMeta?.WindowFromReport
                ? ' La fenêtre encadre l’heure de réception déclarée sur le cas.'
                : ' Le cas ne porte pas d’heure de réception, la recherche couvre les quinze derniers jours.'}{' '}
              Deux causes possibles : le message est hors de cette fenêtre, ou le client n’a pas la
              licence Defender for Office 365 Plan 2 que cette lecture demande.
            </Alert>
          )}

          {message && (
            <Stack spacing={1}>
              <Typography variant="subtitle2">{message.Subject || 'Message sans objet'}</Typography>
              <Typography variant="body2" color="text.secondary">
                De {message.SenderDisplayName || 'expéditeur inconnu'} &lt;{message.SenderFrom}&gt;
                {message.SenderIp ? ` depuis ${message.SenderIp}` : ''}
              </Typography>
              {message.SenderMailFrom && message.SenderMailFrom !== message.SenderFrom && (
                <Typography variant="body2" color="warning.main">
                  Enveloppe expéditeur différente de l’adresse affichée : {message.SenderMailFrom}
                </Typography>
              )}
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                {(message.ThreatTypes ?? []).map((threat) => (
                  <Chip key={threat} size="small" color="error" label={threat} />
                ))}
                {(message.DetectionMethods ?? []).map((method) => (
                  <Chip key={method} size="small" variant="outlined" label={method} />
                ))}
                {['Spf', 'Dkim', 'Dmarc'].map((check) =>
                  message[check] ? (
                    <Chip
                      key={check}
                      size="small"
                      variant="outlined"
                      color={/pass/i.test(message[check]) ? 'success' : 'error'}
                      label={`${check.toUpperCase()} ${message[check]}`}
                    />
                  ) : null
                )}
              </Stack>
              {(message.Urls ?? []).length > 0 && (
                <Typography variant="body2" color="text.secondary">
                  {message.Urls.length} lien(s) dans le message, dont {message.Urls[0]}
                </Typography>
              )}
            </Stack>
          )}

          {deliveries.length > 0 && (
            <div>
              <Typography variant="subtitle2" gutterBottom>
                Destinataires ({evidenceMeta?.StillDelivered ?? 0} copie(s) encore en boîte sur{' '}
                {evidenceMeta?.RecipientCount ?? deliveries.length})
              </Typography>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Destinataire</TableCell>
                    <TableCell>Remise initiale</TableCell>
                    <TableCell>Où est la copie</TableCell>
                    <TableCell>Lecture</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {deliveries.map((row) => (
                    <TableRow key={row.Recipient}>
                      <TableCell>{row.Recipient}</TableCell>
                      <TableCell>
                        {row.OriginalAction || 'N/D'}
                        {row.OriginalLocation ? ` (${row.OriginalLocation})` : ''}
                      </TableCell>
                      <TableCell>{row.LatestLocation || 'N/D'}</TableCell>
                      <TableCell>
                        <Chip
                          size="small"
                          color={row.StillDelivered ? 'error' : 'success'}
                          label={row.StillDelivered ? 'encore lisible' : 'hors boîte'}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          <Alert severity="info">
            Les clics sur les liens (Safe Links) ne sont pas collectés par cet outil : l’absence de
            clic enregistré ne vaut pas absence de clic. Vérifier dans Threat Explorer avant de
            conclure.
          </Alert>

          {caseless && (
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            Consultation hors cas : les actions s’exécutent depuis un cas, pour que chaque
            geste laisse sa trace au journal.
          </Typography>
          )}

          <TextField
            size="small"
            fullWidth
            disabled={caseless}
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
                  disabled={caseless || action.isPending}
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
