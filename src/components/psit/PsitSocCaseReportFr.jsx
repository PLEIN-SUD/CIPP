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
  INTERIM_CONTEXT_SENTENCE,
  buildCaseReportModel,
} from '../../utils/psit-soc-case-report'
import { psitSocReportLock } from '../../utils/psit-soc-report-lock'
import { ApiPostCall } from '../../api/ApiCall'
import { PsitReportContributors, PsitReportPhotoLoaders } from './soc/PsitReportContributors'
import { usePsitReportContributors } from '../../hooks/use-psit-report-contributors'

/**
 * The two type-agnostic dossier documents, on the download report's model.
 *
 * - Rapport d'investigation : the final document, for any dossier type. It exists because the
 *   specialised reports (téléchargements, application, BEC) only cover their own panels: a
 *   type 2 dossier used to have no report at all. Same lock as the others: no verdict, no
 *   document; a true positive waits for its containment.
 * - Point de situation : the interim document, generated while the investigation runs. It says
 *   in its first lines that it does not conclude, which is why it is NOT behind the verdict
 *   lock - it is the honest answer to a client asking where things stand mid-incident.
 *
 * Both generations are journaled on the dossier.
 */

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

const FindingsTable = ({ rows, emptyText }) => (
  <DataTable
    columns={[
      { header: 'Étape', key: 'label', width: 2.4, bold: true },
      { header: 'État', key: 'state', width: 0.9 },
      { header: 'Constat', key: 'note', width: 2.4 },
      { header: 'Par', key: 'by', width: 1.1 },
    ]}
    rows={rows.map((row) => ({
      label: row.label,
      state: row.state,
      note: row.note,
      by: row.by ? `${row.by} (${formatUtc(row.utc)})` : '',
    }))}
    emptyText={emptyText}
  />
)

const JournalTable = ({ rows }) => (
  <DataTable
    columns={[
      { header: 'Quand (UTC)', key: 'when', width: 1.3 },
      { header: 'Action', key: 'action', width: 1.3, bold: true },
      { header: 'Détail', key: 'detail', width: 2.6 },
      { header: 'Par', key: 'by', width: 1.2 },
    ]}
    rows={rows.map((entry) => ({
      when: formatUtc(entry.utc),
      action: entry.action,
      detail: entry.detail,
      by: entry.by,
    }))}
    emptyText="Aucune action journalisée sur ce dossier."
  />
)

const CaseFactsSection = ({ model }) => (
  <Section title="Le signalement">
    <BulletList>
      <Bullet label="Catégorie :">{`${model.typeLabel}. ${model.typeDescription}`}</Bullet>
      <Bullet label="Reçu le :">{formatUtc(model.createdUtc)}</Bullet>
      {model.entities.map((entity) => (
        <Bullet key={`${entity.label}-${entity.value}`} label={`${entity.label} :`}>
          {entity.value}
        </Bullet>
      ))}
    </BulletList>
  </Section>
)

export const PsitSocCaseReportFrDocument = ({
  socCase,
  interim = false,
  brandingSettings,
  variables,
  contributors = [],
  contributorNames = {},
  contributorPhotos = {},
}) => {
  const model = buildCaseReportModel(socCase)
  const generated = new Date().toLocaleDateString('fr-FR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  return (
    <ReportDocument
      brandingSettings={brandingSettings}
      language="fr"
      tenantName={model.tenant}
      reportName={interim ? 'Point de situation' : "Rapport d'investigation"}
      generatedOn={generated}
      variables={variables}
      coverLabel={interim ? 'POINT DE SITUATION' : "RAPPORT D'INVESTIGATION"}
      coverTitle="Investigation"
      coverAccent={model.typeLabel}
      coverSubtitle={`Ticket ${model.ticket}`}
      coverTenant={model.tenant}
      coverFallbackImage="/reportImages/soc.jpg"
      coverFooterNote="Confidentiel - Usage interne uniquement"
      footerLabel={`${model.tenant} - ${interim ? 'Point de situation' : 'Investigation'} ${model.caseId}`}
      coverMeta={
        <CoverMeta
          lines={[model.title || model.typeLabel]}
          note={`Dossier ${model.caseId}. Généré le ${generated}.`}
        />
      }
    >
      {interim ? (
        <ContentPage title="Point de situation" subtitle={model.title}>
          <AlertBox title="Investigation en cours">{INTERIM_CONTEXT_SENTENCE}</AlertBox>

          <CaseFactsSection model={model} />

          <Section title="Faits établis à ce jour">
            <FindingsTable
              rows={model.findings}
              emptyText="Aucune étape du guide n'est encore réglée."
            />
          </Section>

          {model.remaining.length > 0 && (
            <Section title="Points restant à traiter">
              <FindingsTable rows={model.remaining} emptyText="Rien." />
              <Note>
                Une étape « sans réponse » a été travaillée sans pouvoir être tranchée ; son
                constat dit ce qui a été tenté.
              </Note>
            </Section>
          )}

          <Section title="Actions menées">
            <JournalTable rows={model.journal} />
          </Section>

          <PsitReportContributors
            contributors={contributors}
            names={contributorNames}
            photos={contributorPhotos}
          />
        </ContentPage>
      ) : (
        <ContentPage title="Décision" subtitle={model.title}>
          {model.verdict === 'true-positive' || model.verdict === 'undetermined' ? (
            <AlertBox title={model.verdict === 'true-positive' ? 'Conclusion' : 'Document non conclusif'}>
              {model.conclusion}
            </AlertBox>
          ) : (
            <ClearBox title="Conclusion">{model.conclusion}</ClearBox>
          )}

          <Section title="Qualification">
            <Paragraph>
              {`Le dossier est qualifié ${model.verdictWord} par ${model.decidedBy || 'N/D'} le ${formatUtc(
                model.decidedUtc
              )}${model.justification ? ` : ${model.justification}` : '.'}`}
            </Paragraph>
            {model.rootCause && (
              <Paragraph>{`Cause retenue : ${model.rootCause}.`}</Paragraph>
            )}
            {model.attackTechniques.length > 0 && (
              <Note>{`Techniques MITRE ATT&CK observées : ${model.attackTechniques.join(', ')}.`}</Note>
            )}
          </Section>

          <CaseFactsSection model={model} />

          <Section title="Constats de l'investigation">
            <FindingsTable
              rows={model.findings}
              emptyText="Aucun constat enregistré sur le guide de ce dossier."
            />
            <Note>
              Chaque constat est enregistré au dossier avec son auteur et son horodatage ; un
              constat préfixé « Donnée : » reprend la lecture affichée par le portail au moment
              de la vérification.
            </Note>
          </Section>

          <Section title="Actions menées">
            <JournalTable rows={model.journal} />
          </Section>

          <PsitReportContributors
            contributors={contributors}
            names={contributorNames}
            photos={contributorPhotos}
          />
        </ContentPage>
      )}
    </ReportDocument>
  )
}

const CaseReportDialog = ({ socCase, interim, buttonLabel, tooltip, journalDetail }) => {
  const [dialogOpen, setDialogOpen] = useState(false)
  const journal = ApiPostCall({})
  const journalGeneration = () => {
    journal.mutate({
      url: '/api/PSITExecSocCase',
      data: {
        tenantFilter: socCase.Tenant,
        CaseId: socCase.CaseId,
        LogAction: { Action: 'report-generated', Detail: journalDetail },
      },
    })
  }
  const brandingSettings = useBrandingSettings()
  const variables = useReportVariables()
  const { contributors, names, photos, onPhoto } = usePsitReportContributors({
    actionLog: socCase?.ActionLog,
    socCase,
  })

  const documentNode = (
    <PsitSocCaseReportFrDocument
      socCase={socCase}
      interim={interim}
      brandingSettings={brandingSettings}
      variables={variables}
      contributors={contributors}
      contributorNames={names}
      contributorPhotos={photos}
    />
  )
  const fileStem = interim ? 'Point_de_situation' : 'Rapport_investigation'

  return (
    <>
      <PsitReportPhotoLoaders contributors={contributors} onLoaded={onPhoto} />
      <Tooltip describeChild title={tooltip}>
        <Button
          size="small"
          variant="outlined"
          startIcon={<PictureAsPdf />}
          onClick={() => setDialogOpen(true)}
        >
          {buttonLabel}
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
              {interim ? 'Aperçu du point de situation' : "Aperçu du rapport d'investigation"}
            </Typography>
            <Tooltip describeChild title="Fermer l’aperçu">
              <IconButton
                aria-label="Fermer l’aperçu"
                onClick={() => setDialogOpen(false)}
                size="small"
              >
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
            fileName={`${fileStem}_${String(socCase?.CaseId ?? 'dossier')}_${
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

/** The final document, any dossier type, behind the shared verdict lock. */
export const PsitSocCaseReportButton = ({ socCase }) => {
  if (!socCase?.CaseId) return null

  const lock = psitSocReportLock(socCase)
  if (lock.locked) {
    return (
      <Tooltip describeChild title={`Rapport d'investigation indisponible : ${lock.reason}`}>
        <span>
          <Button size="small" variant="outlined" startIcon={<PictureAsPdf />} disabled>
            Rapport d&apos;investigation
          </Button>
        </span>
      </Tooltip>
    )
  }
  return (
    <CaseReportDialog
      socCase={socCase}
      interim={false}
      buttonLabel="Rapport d'investigation"
      tooltip="Rapport d'investigation : le document final du dossier (verdict, constats du guide, actions menées), pour tout type de signalement"
      journalDetail="Rapport d'investigation généré (verdict, constats du guide, journal)"
    />
  )
}

/** The interim document: explicitly non-conclusive, so not behind the verdict lock. */
export const PsitSocInterimReportButton = ({ socCase }) => {
  if (!socCase?.CaseId || socCase?.Status === 'closed') return null
  return (
    <CaseReportDialog
      socCase={socCase}
      interim
      buttonLabel="Point de situation"
      tooltip="Point de situation : document intermédiaire daté (faits établis, actions menées, points restants), généré pendant l'investigation ; il ne conclut pas"
      journalDetail="Point de situation généré (investigation en cours)"
    />
  )
}
