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
import { PsitSocWipBanner } from '../../../components/psit/soc/PsitSocWipBanner'
import { ApiGetCall, ApiPostCall } from '../../../api/ApiCall'
import { CippHead } from '../../../components/CippComponents/CippHead'
import { CippCopyToClipBoard } from '../../../components/CippComponents/CippCopyToClipboard'
import { CippApiResults } from '../../../components/CippComponents/CippApiResults'
import { PsitSocAnalystGroupCard } from '../../../components/psit/soc/PsitSocAnalystGroupCard'

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
  const url = secret ? `${origin}/api/PublicPSITSocWebhook?secret=${secret}` : ''
  const masked = secret ? `${origin}/api/PublicPSITSocWebhook?secret=${'•'.repeat(16)}` : ''

  return (
    <>
      <CippHead title="Ingestion des alertes" />
      <Container maxWidth={false} sx={{ py: 2 }}>
        <Stack spacing={2}>
          <PsitSocWipBanner />
          <Typography variant="h5">Ingestion des alertes</Typography>

          <PsitSocAnalystGroupCard />

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
                    les dossiers cesse de fonctionner tant qu’elle n’a pas la nouvelle adresse.
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
                  <strong>Subject</strong> : le sujet brut du mail d’alerte, préfixes de réponse
                  compris. Le type d’alerte, le client concerné et l’entité visée en sont
                  extraits ici. C’est le seul champ nécessaire.
                  <br />
                  <strong>ExternalRef</strong> : le numéro de ticket. C’est la clé de
                  déduplication : un second envoi portant le même numéro met à jour le dossier au lieu
                  d’en ouvrir un autre.
                  <br />
                  <strong>TicketRef</strong> : facultatif, pour une seconde référence quand ce
                  n’est pas le numéro de ticket qui déduplique.
                  <br />
                  <strong>TenantName</strong>, <strong>TypeId</strong>, <strong>Title</strong>,{' '}
                  <strong>Severity</strong>, <strong>Entities</strong> : facultatifs, et
                  prioritaires sur ce que dit le sujet quand l’émetteur en sait plus.
                </Typography>

                <Divider />

                <Typography variant="subtitle2">Réponses</Typography>
                <Typography variant="body2" color="text.secondary">
                  <strong>Ingested vrai</strong> : le dossier existe, son identifiant est dans la
                  réponse. L’adresse à mettre dans le ticket et dans la notification est{' '}
                  <code>/security/soc/case?caseId=…&amp;tenantFilter=…</code>.
                  <br />
                  <strong>Ingested faux, Reason unknown-tenant</strong> : aucun client Microsoft
                  géré ne porte ce nom, aucun dossier n’est ouvert. C’est la réponse attendue pour un
                  client hébergé ailleurs : ce portail n’a aucun écran capable d’instruire son
                  alerte, et ouvrir un dossier vide à chaque fois apprendrait à l’analyste à ignorer
                  des lignes. Le refus est journalisé avec le nom reçu, pour qu’une faute de frappe
                  sur un client géré se voie au lieu de disparaître.
                  <br />
                  <strong>Ingested faux, Reason out-of-scope</strong> : l’alerte porte sur un
                  produit que ce portail ne couvre pas. Même raisonnement, autre cause.
                </Typography>

                <Alert severity="info">
                  Un nom qui correspond à deux clients ne suit pas ce chemin : le dossier est bien
                  créé, sous le tenant <code>unmapped</code>, pour qu’un analyste le réaffecte. Une
                  alerte réelle ne doit pas se perdre parce que le nom était ambigu.
                </Alert>

                <Alert severity="info">
                  Un sujet dont le libellé n’est dans aucune table ouvre également un dossier, sur le
                  type « non déterminé ». L’émetteur ajoute des règles sans prévenir : un libellé
                  inconnu est une table à compléter, pas une alerte à jeter.
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
