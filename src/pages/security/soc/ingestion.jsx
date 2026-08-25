import { useState } from 'react'
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardHeader,
  Chip,
  Container,
  Divider,
  Stack,
  Typography,
} from '@mui/material'
import { Layout as DashboardLayout } from '../../../layouts/index.js'
import { ApiGetCall, ApiPostCall } from '../../../api/ApiCall'
import { CippHead } from '../../../components/CippComponents/CippHead'
import { CippCopyToClipBoard } from '../../../components/CippComponents/CippCopyToClipboard'
import { CippApiResults } from '../../../components/CippComponents/CippApiResults'

/**
 * Configuration of the ingestion webhook: the point where an external notification becomes a case
 * without anyone retyping it.
 *
 * The page exists because the endpoint could only be configured by calling the API by hand, which
 * meant the only case creator in production was an eight-field form filled in during an incident.
 *
 * It also states what the endpoint answers for a client it does not know, because that is the
 * decision the calling automation has to make and it should not have to read our source to find
 * it out.
 */
const Page = () => {
  const [revealed, setRevealed] = useState(false)
  const queryKey = 'PSITSocWebhookSecret'

  const secretRequest = ApiGetCall({
    url: '/api/PSITExecSocWebhookSecret',
    queryKey,
  })
  const rotate = ApiPostCall({ relatedQueryKeys: [queryKey] })

  const configured = secretRequest.data?.Configured === true
  const secret = secretRequest.data?.Secret ?? rotate.data?.Secret
  const rotatedUtc = secretRequest.data?.RotatedUtc ?? rotate.data?.RotatedUtc

  const origin = typeof window === 'undefined' ? '' : window.location.origin
  const url = secret ? `${origin}/api/PSITSocWebhook?secret=${secret}` : ''
  const masked = secret ? `${origin}/api/PSITSocWebhook?secret=${'•'.repeat(16)}` : ''

  return (
    <>
      <CippHead title="Ingestion des alertes" />
      <Container maxWidth={false} sx={{ py: 2 }}>
        <Stack spacing={2}>
          <Typography variant="h5">Ingestion des alertes</Typography>

          <Card variant="outlined">
            <CardHeader
              title="Secret partagé"
              subheader={
                configured
                  ? `En place, généré le ${rotatedUtc ?? 'à une date inconnue'}`
                  : 'Aucun secret généré'
              }
              action={
                <Chip
                  size="small"
                  color={configured ? 'success' : 'error'}
                  label={configured ? 'Actif' : 'Inactif'}
                />
              }
            />
            <CardContent>
              <Stack spacing={2}>
                {!configured && (
                  <Alert severity="warning">
                    Tant qu’aucun secret n’existe, l’endpoint refuse tous les appels. C’est
                    volontaire : un endpoint non authentifié qui crée des enregistrements doit
                    échouer fermé.
                  </Alert>
                )}

                <Button
                  size="small"
                  variant="outlined"
                  color={configured ? 'warning' : 'primary'}
                  disabled={rotate.isPending}
                  onClick={() =>
                    rotate.mutate({ url: '/api/PSITExecSocWebhookSecret', data: { rotate: true } })
                  }
                >
                  {configured ? 'Régénérer le secret' : 'Générer le secret'}
                </Button>

                {configured && (
                  <Typography variant="body2" color="text.secondary">
                    Régénérer invalide l’ancien secret immédiatement. L’automatisation qui poste
                    les cas cesse de fonctionner tant qu’elle n’a pas la nouvelle adresse.
                  </Typography>
                )}

                <CippApiResults apiObject={rotate} />
              </Stack>
            </CardContent>
          </Card>

          {secret && (
            <Card variant="outlined">
              <CardHeader title="Adresse à appeler" subheader="Méthode POST, corps en JSON" />
              <CardContent>
                <Stack spacing={2}>
                  <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                    <Typography variant="body2" sx={{ wordBreak: 'break-all' }}>
                      {revealed ? url : masked}
                    </Typography>
                    <Button size="small" onClick={() => setRevealed((value) => !value)}>
                      {revealed ? 'Masquer' : 'Afficher'}
                    </Button>
                    <CippCopyToClipBoard text={url} type="button" />
                  </Stack>
                  <Typography variant="body2" color="text.secondary">
                    Le secret peut aussi voyager dans l’en-tête <code>x-psit-soc-secret</code>,
                    ce qui évite de le laisser dans une adresse consignée par les journaux.
                  </Typography>
                </Stack>
              </CardContent>
            </Card>
          )}

          <Card variant="outlined">
            <CardHeader
              title="Contenu attendu"
              subheader="Ce que l’automatisation envoie, et ce qu’elle reçoit en retour"
            />
            <CardContent>
              <Stack spacing={2}>
                <Typography variant="body2" color="text.secondary">
                  <strong>TenantName</strong> ou <strong>TenantFilter</strong> : le nom du client
                  tel que le connaît l’émetteur. Le domaine, le nom affiché ou l’identifiant de
                  client sont acceptés.
                  <br />
                  <strong>TypeId</strong> : le type d’alerte du catalogue, qui détermine le guide
                  d’investigation présenté à l’analyste.
                  <br />
                  <strong>Title</strong> : ce que l’analyste lira dans sa file.
                  <br />
                  <strong>Severity</strong>, <strong>ExternalRef</strong>,{' '}
                  <strong>TicketRef</strong>, <strong>Entities</strong> : facultatifs. La
                  référence de ticket est ce qui permettra de relier le cas au ticket.
                </Typography>

                <Divider />

                <Typography variant="subtitle2">Réponses</Typography>
                <Typography variant="body2" color="text.secondary">
                  <strong>Ingested vrai</strong> : le cas existe, son identifiant est dans la
                  réponse. L’adresse à mettre dans le ticket et dans la notification est{' '}
                  <code>/security/soc/case?caseId=…&amp;tenantFilter=…</code>.
                  <br />
                  <strong>Ingested faux, Reason unknown-tenant</strong> : aucun client Microsoft
                  géré ne porte ce nom, aucun cas n’est ouvert. C’est la réponse attendue pour un
                  client hébergé ailleurs : ce portail n’a aucun écran capable d’instruire son
                  alerte, et ouvrir un cas vide à chaque fois apprendrait à l’analyste à ignorer
                  des lignes. Le refus est journalisé avec le nom reçu, pour qu’une faute de frappe
                  sur un client géré se voie au lieu de disparaître.
                </Typography>

                <Alert severity="info">
                  Un nom qui correspond à deux clients ne suit pas ce chemin : le cas est bien
                  créé, sous le tenant <code>unmapped</code>, pour qu’un analyste le réaffecte. Une
                  alerte réelle ne doit pas se perdre parce que le nom était ambigu.
                </Alert>
              </Stack>
            </CardContent>
          </Card>
        </Stack>
      </Container>
    </>
  )
}

Page.getLayout = (page) => <DashboardLayout>{page}</DashboardLayout>

export default Page
