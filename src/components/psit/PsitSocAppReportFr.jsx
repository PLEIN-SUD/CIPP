import { useState } from 'react'
import {
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Tooltip,
  Typography,
} from '@mui/material'
import { PictureAsPdf, Download, Close } from '@mui/icons-material'
import { PDFViewer, PDFDownloadLink } from '@react-pdf/renderer'
import { useReportVariables } from '../CippPdf/useReportVariables'
import { useBrandingSettings } from '../CippPdf/useBrandingSettings'
import {
  AlertBox,
  Bullet,
  BulletList,
  ClearBox,
  ContentPage,
  CoverMeta,
  DataTable,
  Note,
  Paragraph,
  ReportDocument,
  Section,
} from '../CippPdf'
import { APP_CONCLUSION, buildAppReportModel } from '../../utils/psit-soc-app-report'
import { psitSocReportLock } from '../../utils/psit-soc-report-lock'
import { ApiPostCall } from '../../api/ApiCall'
import {
  PsitReportContributors,
  PsitReportPhotoLoaders,
} from './soc/PsitReportContributors'
import { usePsitReportContributors } from '../../hooks/use-psit-report-contributors'

/**
 * Investigation report for a third-party application, French edition, built on the BEC report's
 * model: the decision first, then the facts it rests on, then the raw material.
 *
 * The reader is the client. The document therefore opens on which of the four honest outcomes
 * this dossier landed on - malicious and cut, legitimate but revoked at the client's own request,
 * legitimate and kept, or not yet qualified - and only then explains what the application was,
 * who let it in, and what it could do. A dossier without a verdict produces no report at all:
 * a document that concludes nothing is a document nobody should send to a client.
 */

// Three verdicts, named as the analyst named them. A binary reading turned 'indéterminé' into
// 'faux positif' on a document meant for the client.
const VERDICT_WORDS = {
  'true-positive': 'vrai positif',
  'benign-true-positive': 'vrai positif bénin',
  'false-positive': 'faux positif',
  undetermined: 'indéterminé',
}

const formatUtc = (value) => {
  if (!value) return 'N/D'
  try {
    const rendered = new Date(value).toLocaleString('fr-FR', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'UTC',
    })
    return `${rendered} UTC`
  } catch {
    return String(value)
  }
}

export const PsitSocAppReportFrDocument = ({
  socCase,
  principal,
  consents,
  auditEvents,
  scopes,
  brandingSettings,
  variables,
  contributors = [],
  contributorNames = {},
  contributorPhotos = {},
}) => {
  const model = buildAppReportModel({ socCase, principal, consents, auditEvents, scopes })
  const appName = principal?.displayName || socCase?.Entities?.appDisplayName || 'Application'
  const tenantName = socCase?.Tenant ?? ''
  const ticket = socCase?.TicketRef || socCase?.ExternalRef || socCase?.CaseId || 'sans référence'
  const generated = new Date().toLocaleDateString('fr-FR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  // The conclusion box carries the tone of the outcome: red for a compromise, amber for a
  // dossier that concludes nothing, the all-clear box when the application turned out legitimate.
  const conclusionBox =
    model.kind === APP_CONCLUSION.MALICIOUS ? (
      <AlertBox title="Conclusion">{model.conclusion}</AlertBox>
    ) : model.kind === APP_CONCLUSION.UNDETERMINED ||
      model.kind === APP_CONCLUSION.UNQUALIFIED ? (
      <AlertBox title="Document non conclusif">{model.conclusion}</AlertBox>
    ) : (
      <ClearBox title="Conclusion">{model.conclusion}</ClearBox>
    )

  return (
    <ReportDocument
      brandingSettings={brandingSettings}
      language="fr"
      tenantName={tenantName}
      reportName="Rapport d'investigation"
      generatedOn={generated}
      variables={variables}
      coverLabel="RAPPORT D'INVESTIGATION"
      coverTitle="Investigation"
      coverAccent="Application"
      coverSubtitle={`Ticket ${ticket}`}
      coverTenant={appName}
      coverFallbackImage="/reportImages/soc.jpg"
      coverFooterNote="Confidentiel - Usage interne uniquement"
      footerLabel={`${tenantName} - Investigation application ${appName}`}
      coverMeta={
        <CoverMeta
          lines={[principal?.appId || socCase?.Entities?.appId || 'identifiant non renseigné']}
          note={`Dossier ${socCase?.CaseId ?? 'N/D'}. Généré le ${generated}.`}
        />
      }
    >
      {/* 1. DÉCISION - ce que le lecteur doit retenir avant tout le reste. */}
      <ContentPage title="Décision" subtitle={appName}>
        {conclusionBox}

        {model.verdict && (
          <Section title="Qualification">
            <Paragraph>
              {`Le dossier est qualifié ${VERDICT_WORDS[model.verdict] ?? model.verdict}${
                model.justification ? ` : ${model.justification}` : '.'
              }`}
            </Paragraph>
            {model.kind === APP_CONCLUSION.LEGIT_REVOKED && (
              <Paragraph>
                La qualification porte sur l&apos;origine de l&apos;accès, pas sur la suite
                donnée : l&apos;alerte ne signalait pas une intrusion, et la révocation qui a
                suivi est une décision du client, prise en connaissance de cause. Les deux faits
                figurent au dossier.
              </Paragraph>
            )}
          </Section>
        )}

        <Section title="Actions menées">
          <DataTable
            columns={[
              { header: 'Quand (UTC)', key: 'when', width: 1.3 },
              { header: 'Action', key: 'action', width: 1.3, bold: true },
              { header: 'Détail', key: 'detail', width: 2.6 },
              { header: 'Par', key: 'by', width: 1.2 },
            ]}
            rows={model.journal.map((entry) => ({
              when: formatUtc(entry?.OccurredUtc || entry?.Utc),
              action: String(entry?.Action ?? ''),
              detail: String(entry?.Detail ?? ''),
              // Analyst, not By: the journal names its author that way, and reading a field
              // nobody writes prints an empty column that looks like an unattributed action.
              by: String(entry?.Analyst ?? ''),
            }))}
            emptyText="Aucune action journalisée sur ce dossier."
          />
        </Section>

        <PsitReportContributors
          contributors={contributors}
          names={contributorNames}
          photos={contributorPhotos}
        />
      </ContentPage>

      {/* 2. LES FAITS - l'application, qui l'a laissée entrer, ce qu'elle pouvait faire. */}
      <ContentPage title="L'application" subtitle="Identité, consentements et permissions">
        <Section title="Identité">
          <BulletList>
            <Bullet label="Nom :">{appName}</Bullet>
            <Bullet label="Identifiant (appId) :">
              {principal?.appId ?? socCase?.Entities?.appId ?? 'N/D'}
            </Bullet>
            <Bullet label="Éditeur :">
              {`${principal?.publisherName || 'non renseigné'}${
                principal?.verifiedPublisher?.displayName
                  ? ` (éditeur vérifié : ${principal.verifiedPublisher.displayName})`
                  : " (éditeur non vérifié par Microsoft : l'identité de l'éditeur n'est pas garantie)"
              }`}
            </Bullet>
            <Bullet label="Première apparition dans le tenant :">
              {formatUtc(principal?.createdDateTime)}
            </Bullet>
            <Bullet label="État au moment du rapport :">
              {model.revoked
                ? 'désactivée, consentement révoqué'
                : principal
                  ? 'active'
                  : 'introuvable dans le tenant : elle a pu être supprimée depuis'}
            </Bullet>
          </BulletList>
        </Section>

        <Section title="Qui a accordé l'accès">
          <DataTable
            columns={[
              { header: 'Portée', key: 'kind', width: 1.6 },
              { header: 'Accordé à', key: 'who', width: 2.4 },
            ]}
            rows={[...model.adminConsents, ...model.userConsents].map((consent) => ({
              kind:
                consent.kind === 'admin'
                  ? "Toute l'organisation"
                  : 'Un utilisateur (consentement individuel)',
              who: String(consent.who ?? ''),
            }))}
            emptyText="Aucun consentement actif au moment de la lecture."
          />
          {model.fromSnapshot && (
            <Note>
              Les consentements et les permissions décrits ci-dessus sont ceux relevés pendant
              l'investigation, conservés au dossier au moment de la révocation. Le tenant ne les
              porte plus : les lire aujourd'hui ne montrerait que l'effet de la remédiation.
            </Note>
          )}
          {model.revoked && (
            <Note>
              Après une révocation, l&apos;absence de consentement actif est l&apos;état attendu.
              Les permissions listées plus bas sont celles relevées pendant l&apos;investigation,
              avant la coupure.
            </Note>
          )}
        </Section>

        <Section title="Trace du consentement">
          {model.auditEvents.length > 0 ? (
            <DataTable
              columns={[
                { header: 'Quand (UTC)', key: 'when', width: 1.4 },
                { header: 'Qui a consenti', key: 'who', width: 2 },
                { header: 'Depuis', key: 'ip', width: 1.4 },
              ]}
              rows={model.auditEvents.map((event) => ({
                when: formatUtc(event.whenUtc),
                who: String(event.who ?? ''),
                ip: event.ip ? String(event.ip) : 'N/D',
              }))}
              emptyText="Aucun événement."
            />
          ) : (
            <Note>
              Aucun événement de consentement dans le journal d&apos;audit du tenant. Ce journal
              ne conserve qu&apos;environ trente jours : une absence ici ne prouve pas
              qu&apos;aucun consentement n&apos;a eu lieu, seulement qu&apos;aucun n&apos;a eu
              lieu dans la fenêtre conservée.
            </Note>
          )}
        </Section>

        <Section title="Ce que l'application pouvait faire">
          {model.grantedScopes.length === 0 ? (
            <Note>Aucune permission relevée.</Note>
          ) : (
            <Paragraph>{model.grantedScopes.join(', ')}</Paragraph>
          )}
          {model.riskyScopes.length > 0 && (
            <>
              <AlertBox title="Permissions sensibles">
                {`${model.riskyScopes.length} permission${
                  model.riskyScopes.length > 1 ? 's' : ''
                } de cette application ${
                  model.riskyScopes.length > 1 ? 'donnaient' : 'donnait'
                } un accès qui survit à une réinitialisation de mot de passe.`}
              </AlertBox>
              <BulletList>
                {model.riskyScopes.map((entry) => (
                  <Bullet key={entry.scope} label={`${entry.scope} :`}>
                    {entry.why}
                  </Bullet>
                ))}
              </BulletList>
            </>
          )}
        </Section>

        <Section title="Recommandations">
          <BulletList>
            <Bullet>
              Restreindre le consentement utilisateur aux applications d&apos;éditeurs vérifiés,
              et faire passer le reste par un circuit d&apos;approbation administrateur.
            </Bullet>
            <Bullet>
              Revoir périodiquement les applications consenties du tenant et révoquer celles qui
              ne servent plus : un consentement oublié est un accès qui survit aux
              réinitialisations de mot de passe et aux départs.
            </Bullet>
            {model.kind === APP_CONCLUSION.LEGIT_KEPT && (
              <Bullet>
                Pour cette application maintenue : documenter son propriétaire et sa raison
                d&apos;être, et l&apos;inscrire à la prochaine revue.
              </Bullet>
            )}
            {model.kind === APP_CONCLUSION.LEGIT_REVOKED && (
              <Bullet>
                Le besoin métier couvert par cette application demeure : cadrer la solution de
                remplacement avant que l&apos;usage ne revienne par un autre consentement
                individuel.
              </Bullet>
            )}
            {(model.kind === APP_CONCLUSION.BENIGN_REVOKED ||
              model.kind === APP_CONCLUSION.BENIGN_KEPT) && (
              <Bullet>
                Garder cette détection active chez le prestataire de surveillance, car le
                signalement était fondé (la même détection attrapera la prochaine application
                entrée hors circuit), et donner un circuit officiel au besoin qui a fait entrer
                celle-ci.
              </Bullet>
            )}
            {model.kind === APP_CONCLUSION.MALICIOUS && (
              <Bullet>
                Vérifier ce que l&apos;application a effectivement consulté pendant la période
                d&apos;accès, et traiter les comptes couverts par les consentements ci-dessus
                comme exposés.
              </Bullet>
            )}
          </BulletList>
        </Section>
      </ContentPage>
    </ReportDocument>
  )
}

export const PsitSocAppReportButton = ({ socCase, principal, consents, auditEvents, scopes }) => {
  const [dialogOpen, setDialogOpen] = useState(false)
  // A generated report is an act of the dossier: the download is journaled with its source.
  const journal = ApiPostCall({})
  const journalGeneration = () => {
    journal.mutate({
      url: '/api/PSITExecSocCase',
      data: {
        tenantFilter: socCase.Tenant,
        CaseId: socCase.CaseId,
        LogAction: {
          Action: 'report-generated',
          Detail: `Rapport application généré (${
            socCase?.Evidence?.app ? 'consentements capturés à la révocation' : 'lecture live du tenant'
          })`,
        },
      },
    })
  }
  const brandingSettings = useBrandingSettings()
  const variables = useReportVariables()
  // Gathered here, not in the document: react-pdf builds outside the React tree, where nothing
  // can fetch, so the faces have to be in hand before the pages are drawn.
  const { contributors, names, photos, onPhoto } = usePsitReportContributors({
    actionLog: socCase?.ActionLog,
    socCase,
  })

  // No dossier, no report: the document cites the dossier's qualification and its journal, which
  // a free consultation does not have.
  if (!socCase?.CaseId) return null

  const lock = psitSocReportLock(socCase)
  if (lock.locked) {
    return (
      <Tooltip title={`Rapport application indisponible : ${lock.reason}`}>
        <span>
          <Button size="small" variant="outlined" startIcon={<PictureAsPdf />} disabled>
            Rapport application
          </Button>
        </span>
      </Tooltip>
    )
  }

  const documentNode = (
    <PsitSocAppReportFrDocument
      socCase={socCase}
      principal={principal}
      consents={consents}
      auditEvents={auditEvents}
      scopes={scopes}
      brandingSettings={brandingSettings}
      variables={variables}
      contributors={contributors}
      contributorNames={names}
      contributorPhotos={photos}
    />
  )
  const appName = principal?.displayName || socCase?.Entities?.appDisplayName || 'application'

  return (
    <>
      {/* Renders nothing: it loads each contributor's photo into state before the document is
          built, through the same call and cache key the queue's avatars use. */}
      <PsitReportPhotoLoaders contributors={contributors} onLoaded={onPhoto} />
      {/* The tooltip title becomes the button's accessible name, so it starts with the visible
          label: an accessible name that does not contain the visible text breaks WCAG 2.5.3. */}
      <Tooltip title="Rapport application : générer le rapport d'investigation en français">
        <Button
          size="small"
          variant="outlined"
          startIcon={<PictureAsPdf />}
          onClick={() => setDialogOpen(true)}
        >
          Rapport application
        </Button>
      </Tooltip>

      <Dialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        maxWidth="lg"
        fullWidth
        PaperProps={{ sx: { height: '90vh' } }}
      >
        <DialogTitle>
          <Box display="flex" justifyContent="space-between" alignItems="center">
            <Typography variant="h6" component="div">
              Aperçu du rapport d&apos;investigation
            </Typography>
            <IconButton onClick={() => setDialogOpen(false)} size="small">
              <Close />
            </IconButton>
          </Box>
        </DialogTitle>
        <DialogContent dividers sx={{ p: 0 }}>
          <PDFViewer width="100%" height="100%">
            {documentNode}
          </PDFViewer>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Fermer</Button>
          <PDFDownloadLink
            document={documentNode}
            fileName={`Investigation_Application_${String(appName).replace(/[^\w.-]+/g, '_')}_${
              new Date().toISOString().split('T')[0]
            }.pdf`}
            style={{ textDecoration: 'none' }}
            onClick={journalGeneration}
          >
            {({ loading }) => (
              <Button
                variant="contained"
                startIcon={loading ? <CircularProgress size={20} /> : <Download />}
                disabled={loading}
              >
                {loading ? 'Génération...' : 'Télécharger le PDF'}
              </Button>
            )}
          </PDFDownloadLink>
        </DialogActions>
      </Dialog>
    </>
  )
}
