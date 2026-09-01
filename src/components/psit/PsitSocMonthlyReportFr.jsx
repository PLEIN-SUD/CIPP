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
  MONTHLY_CONTEXT_SENTENCE,
  buildMonthlyReportModel,
} from '../../utils/psit-soc-monthly-report'

/**
 * Monthly activity report for one client, French edition: what was received, what it turned out
 * to be, how fast it was handled.
 *
 * Unlike the investigation reports, this document is not tied to a dossier: it summarises a
 * month, so the report lock doctrine does not apply (there is no verdict to wait for), and there
 * is no dossier journal to write into. The month with nothing to report still renders: a page
 * saying the month was quiet is the deliverable, silence is not.
 */

export const PsitSocMonthlyReportFrDocument = ({
  tenant,
  month,
  metrics,
  brandingSettings,
  variables,
}) => {
  const model = buildMonthlyReportModel({ tenant, month, metrics })
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
      reportName="Rapport mensuel"
      generatedOn={generated}
      variables={variables}
      coverLabel="RAPPORT MENSUEL"
      coverTitle="Surveillance"
      coverAccent={model.monthLabel}
      coverSubtitle={model.tenant}
      coverTenant={model.tenant}
      coverFallbackImage="/reportImages/soc.jpg"
      coverFooterNote="Confidentiel - Usage interne uniquement"
      footerLabel={`${model.tenant} - Rapport mensuel ${model.monthLabel}`}
      coverMeta={
        <CoverMeta lines={[model.monthLabel]} note={`Généré le ${generated}.`} />
      }
    >
      <ContentPage title="Le mois en synthèse" subtitle={model.monthLabel}>
        <ClearBox title="Synthèse">{model.headline}</ClearBox>

        <Section title="Périmètre du document">
          <Paragraph>{MONTHLY_CONTEXT_SENTENCE}</Paragraph>
        </Section>

        {!model.quiet && (
          <Section title="Qualification des signalements">
            <BulletList>
              {model.verdicts.map((sentence) => (
                <Bullet key={sentence}>{`${sentence}.`}</Bullet>
              ))}
            </BulletList>
            {model.incidentSentence && <Paragraph>{model.incidentSentence}</Paragraph>}
            {model.openSentence && <Note>{model.openSentence}</Note>}
          </Section>
        )}

        {model.types.length > 0 && (
          <Section title="Par motif de signalement">
            <DataTable
              columns={[
                { header: 'Motif', key: 'label', width: 2.4, bold: true },
                { header: 'Reçus', key: 'count', width: 0.8 },
                { header: 'Incidents réels', key: 'tp', width: 1.1 },
                { header: 'Sans objet', key: 'fp', width: 0.9 },
                { header: 'Taux sans objet', key: 'rate', width: 1.1 },
              ]}
              rows={model.types.map((entry) => ({
                label: entry.label,
                count: String(entry.count),
                tp: String(entry.truePositives),
                fp: String(entry.falsePositives),
                rate: entry.fpRate,
              }))}
              emptyText="Aucun signalement sur la période."
            />
            <Note>
              Le taux sans objet est calculé sur les seuls dossiers déjà qualifiés : un dossier
              encore en cours de qualification ne compte ni dans un sens ni dans l&apos;autre.
            </Note>
          </Section>
        )}

        {!model.quiet && (
          <Section title="Délais de traitement">
            <DataTable
              columns={[
                { header: 'Étape', key: 'label', width: 1.6, bold: true },
                { header: 'Délai médian', key: 'value', width: 1.2 },
                { header: 'Dossiers mesurés', key: 'measured', width: 1.2 },
              ]}
              rows={model.delayRows.map((row) => ({
                label: row.label,
                value: row.value,
                measured: String(row.measured),
              }))}
              emptyText="Aucun délai mesurable sur la période."
            />
            <Note>{model.delaysNote}</Note>
          </Section>
        )}
      </ContentPage>
    </ReportDocument>
  )
}

export const PsitSocMonthlyReportButton = ({ tenant, month, metrics, disabled }) => {
  const [dialogOpen, setDialogOpen] = useState(false)
  const brandingSettings = useBrandingSettings()
  const variables = useReportVariables()

  // Nothing to phrase yet: the answer has not arrived, which is not the same as a quiet month.
  const notReady = disabled || !tenant || !month || !metrics

  if (notReady) {
    return (
      <Tooltip title="Rapport mensuel : choisir un client et attendre la lecture des indicateurs">
        <span>
          <Button size="small" variant="outlined" startIcon={<PictureAsPdf />} disabled>
            Rapport mensuel
          </Button>
        </span>
      </Tooltip>
    )
  }

  const documentNode = (
    <PsitSocMonthlyReportFrDocument
      tenant={tenant}
      month={month}
      metrics={metrics}
      brandingSettings={brandingSettings}
      variables={variables}
    />
  )

  return (
    <>
      <Tooltip title="Rapport mensuel : générer le rapport d'activité du mois en français">
        <Button
          size="small"
          variant="outlined"
          startIcon={<PictureAsPdf />}
          onClick={() => setDialogOpen(true)}
        >
          Rapport mensuel
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
              Aperçu du rapport mensuel
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
            fileName={`Rapport_Mensuel_${String(tenant).replace(/[^\w.-]+/g, '_')}_${month}.pdf`}
            style={{ textDecoration: 'none' }}
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
