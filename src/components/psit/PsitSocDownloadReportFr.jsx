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
import {
  DOWNLOAD_CONCLUSION,
  DOWNLOAD_CONTEXT_SENTENCE,
  buildDownloadReportModel,
} from '../../utils/psit-soc-download-report'
import { psitDownloadOperationLabel } from '../../utils/psit-soc-download'
import { psitSocReportLock } from '../../utils/psit-soc-report-lock'
import { ApiPostCall } from '../../api/ApiCall'
import { PsitReportContributors, PsitReportPhotoLoaders } from './soc/PsitReportContributors'
import { usePsitReportContributors } from '../../hooks/use-psit-report-contributors'

/**
 * Investigation report for a mass-download dossier, French edition, on the BEC report's model:
 * the decision first, then the facts it rests on.
 *
 * The reader is the client, and most often a non-technical one. Every number therefore arrives
 * with its window, every technical verb arrives translated ('consulté' is not 'téléchargé'), and
 * the document says where its numbers come from: the live audit search, or the copy the dossier
 * kept when that search expired. A dossier without a verdict produces no report at all.
 */

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

const MAX_REPORT_FILES = 40

export const PsitSocDownloadReportFrDocument = ({
  socCase,
  read,
  brandingSettings,
  variables,
  contributors = [],
  contributorNames = {},
  contributorPhotos = {},
}) => {
  const model = buildDownloadReportModel({ socCase, read })
  const tenantName = socCase?.Tenant ?? ''
  const ticket = socCase?.TicketRef || socCase?.ExternalRef || socCase?.CaseId || 'sans référence'
  const generated = new Date().toLocaleDateString('fr-FR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  const conclusionBox =
    model.kind === DOWNLOAD_CONCLUSION.EXFILTRATION ? (
      <AlertBox title="Conclusion">{model.conclusion}</AlertBox>
    ) : model.kind === DOWNLOAD_CONCLUSION.UNDETERMINED ||
      model.kind === DOWNLOAD_CONCLUSION.UNQUALIFIED ? (
      <AlertBox title="Document non conclusif">{model.conclusion}</AlertBox>
    ) : (
      <ClearBox title="Conclusion">{model.conclusion}</ClearBox>
    )

  const reportFiles = model.files.slice(0, MAX_REPORT_FILES)

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
      coverAccent="Téléchargements"
      coverSubtitle={`Ticket ${ticket}`}
      coverTenant={model.upn || tenantName}
      coverFallbackImage="/reportImages/soc.jpg"
      coverFooterNote="Confidentiel - Usage interne uniquement"
      footerLabel={`${tenantName} - Investigation téléchargements ${model.upn}`}
      coverMeta={
        <CoverMeta
          lines={[model.upn || 'compte non renseigné']}
          note={`Dossier ${socCase?.CaseId ?? 'N/D'}. Généré le ${generated}.`}
        />
      }
    >
      {/* 1. DÉCISION - ce que le lecteur doit retenir avant tout le reste. */}
      <ContentPage title="Décision" subtitle={model.upn}>
        {conclusionBox}

        {model.verdict && (
          <Section title="Qualification">
            <Paragraph>
              {`Le dossier est qualifié ${VERDICT_WORDS[model.verdict] ?? model.verdict}${
                model.justification ? ` : ${model.justification}` : '.'
              }`}
            </Paragraph>
          </Section>
        )}

        <Section title="Le contexte de l'alerte">
          <Paragraph>{DOWNLOAD_CONTEXT_SENTENCE}</Paragraph>
        </Section>

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

      {/* 2. LES FAITS - ce que le journal d'audit du tenant a enregistré. */}
      <ContentPage title="Les faits relevés" subtitle={model.upn}>
        <Section title="La recherche">
          {model.window ? (
            <>
              <Paragraph>
                {`Le journal d'audit de l'entreprise a été interrogé sur les téléchargements du compte ${
                  model.upn || 'concerné'
                }, sur la période du ${formatUtc(model.window.startUtc)} au ${formatUtc(
                  model.window.endUtc
                )}.`}
              </Paragraph>
              <Note>
                {`Recherche ${model.window.searchId || 'N/D'}, lancée le ${formatUtc(
                  model.window.launchedUtc
                )} par ${model.window.launchedBy || 'N/D'}.${
                  model.window.previousCount > 0
                    ? ` La fenêtre a été élargie en cours d'investigation : ${
                        model.window.previousCount > 1
                          ? `les ${model.window.previousCount} recherches précédentes restent classées`
                          : 'la recherche précédente reste classée'
                      } au dossier.`
                    : ''
                }`}
              </Note>
            </>
          ) : (
            <Note>
              Aucune recherche dans le journal d&apos;audit n&apos;est classée sur ce dossier : les
              chiffres ci-dessous ne peuvent pas être établis.
            </Note>
          )}
          {model.fromSnapshot && (
            <Note>
              Les chiffres ci-dessous sont ceux relevés pendant l&apos;investigation et conservés
              au dossier. Le journal d&apos;audit ne conserve les recherches que temporairement :
              relancer la lecture aujourd&apos;hui ne retrouverait plus la source.
            </Note>
          )}
        </Section>

        {model.summary && (
          <Section title="Le résultat de la recherche">
            <BulletList>
              <Bullet label="Volume :">
                {`${model.counts.files}, depuis ${model.counts.sites}${
                  model.counts.span ? `, ${model.counts.span}` : ''
                }.`}
              </Bullet>
              {model.operationsLine && (
                <Bullet label="Nature des actions :">{`${model.operationsLine}.`}</Bullet>
              )}
              <Bullet label="Origine :">
                {`${model.counts.addresses}${
                  model.summary.addresses.length > 0
                    ? ` (${model.summary.addresses.slice(0, 3).join(', ')})`
                    : ''
                }.`}
              </Bullet>
              {model.summary.extensions.length > 0 && (
                <Bullet label="Types de fichiers :">
                  {model.summary.extensions
                    .map((entry) => `${entry.extension} (${entry.count})`)
                    .join(', ')}
                </Bullet>
              )}
            </BulletList>
            {model.clientSentence && <Paragraph>{model.clientSentence}</Paragraph>}
            {model.accessedCaveat && <Note>{model.accessedCaveat}</Note>}
            {model.summary.fileCount === 0 && (
              <Note>
                La recherche n&apos;a trouvé aucun téléchargement sur la période couverte. Le
                journal d&apos;audit conserve au plus quatre-vingt-dix jours : une absence sur
                cette fenêtre ne décrit que cette fenêtre.
              </Note>
            )}
          </Section>
        )}

        {model.summary && model.summary.sites.length > 0 && (
          <Section title="Espaces concernés">
            <BulletList>
              {model.summary.sites.map((site) => (
                <Bullet key={site}>{String(site)}</Bullet>
              ))}
            </BulletList>
          </Section>
        )}

        {reportFiles.length > 0 && (
          <Section title="Détail des fichiers">
            <DataTable
              columns={[
                { header: 'Fichier', key: 'name', width: 2.2, bold: true },
                { header: 'Action', key: 'operation', width: 1.2 },
                { header: 'Quand (UTC)', key: 'when', width: 1.4 },
                { header: 'Adresse', key: 'ip', width: 1.2 },
              ]}
              rows={reportFiles.map((file) => ({
                name: String(file?.Name ?? ''),
                operation: psitDownloadOperationLabel(file?.Operation),
                when: formatUtc(file?.WhenUtc),
                ip: String(file?.Ip ?? ''),
              }))}
              emptyText="Aucune ligne."
            />
            {model.files.length > MAX_REPORT_FILES && (
              <Note>
                {`Les ${MAX_REPORT_FILES} premières lignes sur ${model.files.length} sont reproduites ici. La liste complète reste consultable dans le dossier d'investigation.`}
              </Note>
            )}
          </Section>
        )}

        <Section title="Recommandations">
          <BulletList>
            {model.kind === DOWNLOAD_CONCLUSION.EXFILTRATION && (
              <Bullet>
                Considérer les fichiers listés comme sortis du contrôle de l&apos;entreprise, et
                évaluer avec vos référents ce que leur contenu impose (information des personnes
                concernées, obligations contractuelles ou réglementaires).
              </Bullet>
            )}
            {model.kind === DOWNLOAD_CONCLUSION.BENIGN && (
              <Bullet>
                Traiter la cause du comportement (outil non conforme retiré, canal de sauvegarde
                fourni) et garder la détection active chez le prestataire de surveillance, car le
                signalement était fondé.
              </Bullet>
            )}
            {model.kind === DOWNLOAD_CONCLUSION.LEGITIMATE && (
              <Bullet>
                Cadrer l&apos;usage confirmé : si un besoin d&apos;emport ou de sauvegarde existe,
                lui donner un canal prévu pour cela plutôt que des téléchargements en volume qui
                redéclencheront la même alerte.
              </Bullet>
            )}
            {model.kind === DOWNLOAD_CONCLUSION.UNDETERMINED && (
              <Bullet>
                Maintenir la surveillance du compte et convenir d&apos;un point avec le titulaire :
                un usage qui ne peut pas être expliqué se traite comme un risque, pas comme un
                incident classé.
              </Bullet>
            )}
            <Bullet>
              Restreindre le partage et le téléchargement en volume sur les espaces les plus
              sensibles (droits par site, étiquettes de confidentialité), pour que le volume
              anormal soit bloqué plutôt que seulement signalé.
            </Bullet>
            <Bullet>
              Conserver ce dossier et son journal : ils établissent qui a fait quoi, et quand, si
              la question se repose.
            </Bullet>
          </BulletList>
        </Section>
      </ContentPage>
    </ReportDocument>
  )
}

export const PsitSocDownloadReportButton = ({ socCase, read }) => {
  const [dialogOpen, setDialogOpen] = useState(false)
  // A generated report is an act of the dossier: the download is journaled with its source, so
  // 'which numbers did the client get' stays answerable.
  const journal = ApiPostCall({})
  const journalGeneration = () => {
    journal.mutate({
      url: '/api/PSITExecSocCase',
      data: {
        tenantFilter: socCase.Tenant,
        CaseId: socCase.CaseId,
        LogAction: {
          Action: 'report-generated',
          Detail: `Rapport téléchargements généré (source : ${
            read?.started && !read.running ? `recherche ${read.searchId}` : 'résumé conservé au dossier'
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

  if (!socCase?.CaseId) return null

  const lock = psitSocReportLock(socCase)
  if (lock.locked) {
    return (
      <Tooltip title={`Rapport téléchargements indisponible : ${lock.reason}`}>
        <span>
          <Button size="small" variant="outlined" startIcon={<PictureAsPdf />} disabled>
            Rapport téléchargements
          </Button>
        </span>
      </Tooltip>
    )
  }

  const documentNode = (
    <PsitSocDownloadReportFrDocument
      socCase={socCase}
      read={read}
      brandingSettings={brandingSettings}
      variables={variables}
      contributors={contributors}
      contributorNames={names}
      contributorPhotos={photos}
    />
  )
  const upn = socCase?.Entities?.upn || 'compte'

  return (
    <>
      <PsitReportPhotoLoaders contributors={contributors} onLoaded={onPhoto} />
      {/* The tooltip title starts with the visible label: an accessible name that does not
          contain the visible text breaks WCAG 2.5.3. */}
      <Tooltip title="Rapport téléchargements : générer le rapport d'investigation en français">
        <Button
          size="small"
          variant="outlined"
          startIcon={<PictureAsPdf />}
          onClick={() => setDialogOpen(true)}
        >
          Rapport téléchargements
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
              Aperçu du rapport téléchargements
            </Typography>
            <Tooltip describeChild title="Fermer l’aperçu">
              <IconButton aria-label="Fermer l’aperçu" onClick={() => setDialogOpen(false)} size="small">
                <Close />
              </IconButton>
            </Tooltip>
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
            fileName={`Investigation_Telechargements_${String(upn).replace(/[^\w.-]+/g, '_')}_${
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
