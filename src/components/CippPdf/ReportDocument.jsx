import { Document } from '@react-pdf/renderer'
import { ReportProvider } from './reportContext'
import { applyFooterText, createReportTheme } from './reportTheme'
import { createReportStyles, DEFAULT_PAGE_SETUP } from './reportPdfStyles'
import { CoverPage } from './reportPdfPrimitives'
import { resolveCoverImage } from './resolveCoverImage'

/**
 * The whole scaffold of a report: theme, styles, cover page, and the context every primitive reads.
 *
 * This exists so that writing a new report is writing its *content*. Before it, each report opened
 * with the same forty lines — build the theme, build the styles, resolve the cover image, assemble
 * the date string, hand-roll a cover page, and thread `styles`/`theme` into everything — which is
 * why six reports had six slightly different covers and six ways of deciding a footer.
 *
 * A report now looks like:
 *
 *   <ReportDocument
 *     brandingSettings={brandingSettings}
 *     tenantName={tenantName}
 *     reportName="Sharing Report"
 *     coverLabel="Data Sharing Review"
 *     coverTitle="Sharing"
 *     coverAccent="Report"
 *     coverSubtitle={`What has been shared out of ${tenantName}.`}
 *     coverFallbackImage="/reportImages/glasses.jpg"
 *     footerLabel={`${tenantName} — SharePoint & OneDrive Sharing`}
 *   >
 *     <ContentPage title="Executive Summary" subtitle="What has been shared">
 *       <Section title="Findings">…</Section>
 *     </ContentPage>
 *   </ReportDocument>
 *
 * Everything below it — pages, headers, footers, watermark, page numbers, colours — is decided
 * centrally and needs no argument.
 */
export const ReportDocument = ({
  brandingSettings,
  tenantName,
  reportName,
  generatedOn,

  // Cover. Pass `cover={false}` for a report that opens straight into content.
  cover = true,
  coverLabel,
  coverTitle,
  coverAccent,
  coverTitleFontSize,
  coverSubtitle,
  coverTenant,
  coverMeta,
  coverFallbackImage,
  coverFooterNote,

  // The report's own footer wording, used when branding configures none.
  footerLabel,

  // Resolved CIPP variables, from `useReportVariables`.
  variables: cippVariables,

  size = DEFAULT_PAGE_SETUP.size,
  orientation = DEFAULT_PAGE_SETUP.orientation,

  // PSIT-CUSTOM-BEGIN: report language and PDF metadata
  // `language` drives the page label and the continuation label of every page of this report.
  // English stays the default, so the upstream reports are untouched.
  language = 'en',
  // Written into the PDF Info dictionary. Visible to anyone opening the file properties, which is
  // the point for the internal reference of a copy in circulation - and the reason the analyst's
  // name never goes here.
  documentTitle,
  documentSubject,
  documentKeywords,
  documentAuthor,
  // PSIT-CUSTOM-END

  children,
}) => {
  const theme = createReportTheme(brandingSettings)
  const styles = createReportStyles(theme)
  const logo = brandingSettings?.logo || null
  const coverImage = resolveCoverImage(brandingSettings, coverFallbackImage)

  const date =
    generatedOn ??
    new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })

  // What every `%variable%` resolves to in this report. The report's own three override CIPP's,
  // so `%tenantname%` still resolves before the variables fetch lands.
  const variables = {
    ...cippVariables,
    tenantname: tenantName || 'Organization',
    reportname: reportName || '',
    reportdate: date,
  }

  // PSIT-CUSTOM-BEGIN: `language` reaches ContentPage through the context
  const context = { theme, styles, variables, logo, footerLabel, size, orientation, date, language }
  // PSIT-CUSTOM-END

  // Branding's cover note wins; a report's own wording is the fallback. Leave the prop undefined
  // when neither is set so CoverPage's default confidentiality line still appears. Variables are
  // filled here so a configured `%tenantname%` note resolves the same way the page footer does.
  const coverNoteTemplate = theme.coverFooterText || coverFooterNote
  const coverNote = coverNoteTemplate
    ? applyFooterText(coverNoteTemplate, variables)
    : undefined

  return (
    <ReportProvider value={context}>
      {/* PSIT-CUSTOM-BEGIN: PDF metadata, all optional so an upstream report is unchanged */}
      <Document
        title={documentTitle}
        subject={documentSubject}
        keywords={documentKeywords}
        author={documentAuthor}
        creator={documentAuthor}
      >
        {/* PSIT-CUSTOM-END */}
        {cover ? (
          <CoverPage
            styles={styles}
            theme={theme}
            size={size}
            orientation={orientation}
            coverImage={coverImage}
            logo={logo}
            date={date}
            label={coverLabel}
            title={coverTitle}
            accentTitle={coverAccent}
            titleFontSize={coverTitleFontSize}
            subtitle={coverSubtitle}
            // Naming the client on the cover is what makes it a client report. Every report wanted
            // it and each one printed it slightly differently; `coverTenant={false}` opts out.
            tenantName={coverTenant === false ? null : coverTenant || tenantName}
            footerNote={coverNote}
          >
            {coverMeta}
          </CoverPage>
        ) : null}
        {children}
      </Document>
    </ReportProvider>
  )
}

export default ReportDocument
