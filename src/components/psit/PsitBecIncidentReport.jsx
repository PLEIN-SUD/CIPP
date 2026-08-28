import { useState } from 'react'
import {
  Button,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Box,
  Typography,
  IconButton,
  CircularProgress,
  FormControlLabel,
  Switch,
} from '@mui/material'
import { ReportProblem, Download, Close } from '@mui/icons-material'
import { PDFViewer, PDFDownloadLink, View } from '@react-pdf/renderer'
import { useReportVariables } from '../CippPdf/useReportVariables'
import { useBrandingSettings } from '../CippPdf/useBrandingSettings'
import { ApiGetCall } from '../../api/ApiCall'
import { getCollectionStatus } from '../../utils/psit-bec-collection'
import {
  breachSentence,
  breachSuggestsPasswordReset,
  readBreachExposure,
} from '../../utils/psit-bec-breach'
import { psitAsArray } from '../../utils/psit-as-array'
import { countryName, inCountry } from '../../utils/psit-country-names'
import {
  agree,
  andMore,
  cardinal,
  counted,
  dateProse,
  dateTable,
  elideDe,
  enumerate,
  nbsp,
  phrase,
  sentence,
  truncationNote,
} from '../../utils/psit-report-prose'
import { PsitTimelineStrip, psitTimelineStripNote } from './PsitTimelineStrip'
import { PsitTlpBand, tlpLabel } from './PsitTlpBand'
import {
  AlertBox,
  Bold,
  Bullet,
  BulletList,
  ClearBox,
  ContentPage,
  CoverMeta,
  DataTable,
  InfoBox,
  Note,
  Paragraph,
  ReportDocument,
  Section,
  StatRow,
} from '../CippPdf'
import {
  SIGNAL_CLASS,
  VERDICT_STATUS,
  buildSignals,
  buildTimeline,
  buildVerdict,
  firstUnauthorisedAccessUtc,
  formatUtc,
  getAnalysisWindow,
  groupSignInsByIp,
  partitionDeterminations,
} from '../../utils/psit-bec-signals'
import {
  INCIDENT_STATUS_LABELS,
  MAIL_READ_LABELS,
  MAIL_READ_STATUS,
  buildContainment,
  buildExposure,
  buildThirdPartyExposure,
} from '../../utils/psit-bec-incident'

// The second document: not "the investigation in red", but an incident record. Its readers are the
// client's management, their DPO, their insurer and possibly a regulator, so its shape is largely
// imposed from outside - in particular the exposure section, which follows the five items GDPR
// article 33(3) requires a controller to describe.
//
// Two rules run through it. It states facts and measures, never a legal qualification: whether a
// notification is required is the controller's decision, not a processor's. And it never asserts
// what the data cannot support - "no mail was read" is the sentence that comes back to haunt an
// MSP, so the absence of MailItemsAccessed is written out as an absence.

/**
 * `{ticket}_{compte}.pdf` - the client-facing reference on the last surface that still carried the
 * internal one. Everything outside the allowed set becomes an underscore, so an address lands as
 * p_martin_contoso_test rather than as a name a file system may refuse.
 */
export const psitReportFileName = (ticket, account, { pseudonymise = false } = {}) => {
  const clean = (value, fallback, keep) =>
    String(value || fallback)
      .replace(keep, '_')
      .replace(/^_+|_+$/g, '')
  // The ticket keeps its dot, it is part of the reference; the address loses its dots and its @,
  // so p.martin@contoso.test lands as p_martin_contoso_test.
  const safeTicket = clean(ticket, 'ticket-non-renseigne', /[^A-Za-z0-9.-]+/g)
  const safeAccount = clean(account, 'compte-inconnu', /[^A-Za-z0-9-]+/g)
  return `${safeTicket}_${safeAccount}${pseudonymise ? '_pseudonymise' : ''}.pdf`
}

export const PsitBecIncidentReportDocument = ({
  userData,
  becData,
  brandingSettings,
  tenantName,
  variables,
  triage = [],
  incident = {},
  remediation = {},
  pseudonymise = false,
}) => {
  const currentDate = new Date().toLocaleDateString('fr-FR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  const window = getAnalysisWindow(becData)
  // See partitionDeterminations: an answer given before this window opened is history, not a
  // verdict on the events in hand.
  const { current: liveTriage } = partitionDeterminations(triage, becData)
  const signals = buildSignals(becData, userData)
  const verdict = buildVerdict(signals, liveTriage)
  const timeline = buildTimeline(becData)
  const exposure = buildExposure(becData, signals, liveTriage, userData)
  const thirdParties = buildThirdPartyExposure(becData, userData)
  // Never timeline[0]: an authentication method registered in 2021 once became "first unauthorised
  // access observed" in a report meant for a DPO.
  const firstAccessUtc = firstUnauthorisedAccessUtc(becData, signals, liveTriage)
  const containment = buildContainment(remediation)
  const established = signals.filter((signal) => signal.class === SIGNAL_CLASS.ESTABLISHED)
  const confirmed = signals.filter((signal) => {
    const determination = psitAsArray(liveTriage).find((entry) => entry.SignalId === signal.id)
    return determination?.Verdict === 'unexpected'
  })
  const mailReadStatus = incident?.MailReadStatus || exposure.mailReadSuggested
  // The client-facing reference is the Autotask ticket, on every surface. The internal
  // PSIT-BEC-* identifier stays a sort and join key on our side, and travels only in the PDF
  // metadata: a client quotes a ticket number, not our filing scheme.
  const ticket = incident?.AutotaskTicket || 'ticket non renseigné'
  const relatedTickets = psitAsArray(incident?.RelatedTickets)
  const ticketLine =
    relatedTickets.length > 0
      ? `Ticket ${ticket} (liés : ${enumerate(relatedTickets)})`
      : `Ticket ${ticket}`
  const marking = tlpLabel(incident?.Tlp)
  const qualificationLabel = phrase('verdict', verdict.status, 'box') || 'à préciser'
  const effectSentence =
    incident?.EffectDescription === 'other'
      ? incident?.EffectDescriptionOther || null
      : phrase('effect', incident?.EffectDescription)
  const doneActions = containment.filter((action) => action.done)
  const attestedCount = doneActions.length

  // The summary, written sentence by sentence from the record. Each one states its own basis, and
  // none of them is deduced from a counter: what the access was followed by is a field the analyst
  // fills, because the collection cannot tell a hijacked thread from a mass send.
  const foreignAddresses = psitAsArray(becData?.SuspectUserSignIns)
    .filter((signIn) => signIn?.Status === 'Success' && signIn?.ForeignLocation === true)
    .map((signIn) => String(signIn?.IPAddress || '').trim())
    .filter(Boolean)
  const distinctForeignAddresses = [...new Set(foreignAddresses)].length
  const foreignCountries = [
    ...new Set(
      psitAsArray(becData?.SuspectUserSignIns)
        .filter((signIn) => signIn?.Status === 'Success' && signIn?.ForeignLocation === true)
        .map((signIn) => String(signIn?.Country || '').trim())
        .filter(Boolean)
    ),
  ]

  const accessSentence = exposure.accessEstablished
    ? `Le compte ${userData?.userPrincipalName} a fait l'objet d'accès non autorisés, établis par les éléments repris en section « Constats et base probante »${
        firstAccessUtc ? `, à partir du ${dateProse(firstAccessUtc, { article: false })}` : ''
      }${
        distinctForeignAddresses > 0
          ? `, depuis ${cardinal(distinctForeignAddresses, 'adresse')} IP${
              // inCountry carries the preposition: "en Italie" but "au Canada", and a report
              // that writes "en Canada" reads as machine output.
              foreignCountries.length > 0
                ? ` ${agree(distinctForeignAddresses, 'adresse', 'situé')} ${enumerate(
                    foreignCountries.map((code) => inCountry(code))
                  )}`
                : ''
            }`
          : ''
      }.`
    : `L'accès non autorisé au compte ${userData?.userPrincipalName} n'est pas établi par les éléments de cette collecte.`
  const effectClause = effectSentence
    ? `Ces accès ont été suivis ${elideDe(effectSentence)}.`
    : ''
  const containmentSentence =
    attestedCount > 0
      ? `${sentence(attestedCount, 'action', 'attesté')} par le journal CIPP à la date d'édition.`
      : "À la date d'édition, aucune action de confinement n'est enregistrée au journal CIPP."
  const exfiltrationSentence =
    exposure.exfiltration.length > 0
      ? `${sentence(exposure.exfiltration.length, 'voieExfiltration', 'relevé')} : ${enumerate(
          exposure.exfiltration.map((item) => item.label.toLowerCase())
        )}.`
      : "Aucune voie d'exfiltration n'a été relevée parmi celles que cette collecte couvre."
  const thirdPartySentence =
    thirdParties.recipients.length > 0
      ? `${sentence(
          thirdParties.recipients.length,
          'tiers',
          'relevé'
        )} parmi les destinataires des envois signalés, à vérifier en priorité.`
      : "Aucun tiers destinataire d'un envoi signalé n'a été relevé."
  // Rows for the chronology tables. Built here so the page holds layout only.
  // The breach snapshot, read once. Nothing is looked up here: the check ran at collection and
  // this reads what it wrote, so two generations of the same dossier say the same thing.
  const breachExposure = readBreachExposure(becData)
  const breachText = breachSentence(breachExposure, userData?.userPrincipalName)

  // Which source addresses the strip paints as unexpected. Same derivation the rest of the report
  // uses - a retained sign-in signal, established by the data or qualified by the analyst - so the
  // colour on the strip and the verdict in "Constats et base probante" cannot disagree.
  const unexpectedSignInIps = [...established, ...confirmed]
    .filter((signal) => String(signal.id || '').startsWith('signin-ip:'))
    .map((signal) => signal.id.replace('signin-ip:', ''))

  const signInWindows = groupSignInsByIp(psitAsArray(becData?.SuspectUserSignIns))
    .filter((group) => group.successes > 0)
    .map((group) => ({
      period: `${dateTable(group.firstSeenUtc)} au ${dateTable(group.lastSeenUtc)}`,
      ip: group.ip,
      country: countryName(group.country),
      city: enumerate(group.cities, { empty: 'non déterminée' }),
      signIns: String(group.successes),
      apps: [
        enumerate(group.apps.slice(0, 3), { empty: 'non déterminées' }),
        andMore(3, group.apps.length, 'application'),
      ]
        .filter(Boolean)
        .join(', '),
    }))

  // No slice here on purpose: the table is capped by its own `limit`, which is what makes the
  // primitive count what it left out and print a note. Slicing to the same number first made the
  // drop invisible - twenty rows shown, six dropped, nothing said.
  const otherEvents = timeline
    .filter((event) => !String(event.label || '').startsWith('Session depuis'))
    .map((event) => ({
      stamp: event.timestampUtc,
      label: event.label,
      detail: event.detail || 'non détaillé',
    }))

  const interventions = [
    ...doneActions.map((action) => ({
      stamp: action.firstUtc || 'date non enregistrée',
      action: action.label,
      source: 'Journal CIPP',
      operator: action.operator || 'non renseigné',
      hasFailure: Boolean(action.hasFailure),
    })),
    ...psitAsArray(incident?.ExternalActions).map((action) => ({
      stamp: action?.DoneUtc ? dateTable(action.DoneUtc) : 'date déclarée',
      action: action?.Action || 'action hors CIPP',
      source: 'Déclarée, hors CIPP',
      operator: action?.By || 'non renseigné',
      hasFailure: false,
    })),
  ]

  const containmentRows = containment.map((action) => ({
    action: action.label,
    state: action.done
      ? action.hasFailure
        ? 'Attestée, erreur journalisée'
        : 'Attestée'
      : 'Non attestée',
    stamp: action.done ? action.firstUtc || 'date non enregistrée' : 'sans objet',
    operator: action.done ? action.operator || 'non renseigné' : 'sans objet',
  }))

  // Subjects deduplicated with a counter and capped: the same subject repeated eleven times told
  // the reader nothing the count does not, and pushed the useful ones out of the cell.
  const subjectCell = (subjects, total) => {
    const counts = new Map()
    for (const subject of psitAsArray(subjects)) {
      const label = String(subject || '').trim()
      if (!label) continue
      counts.set(label, (counts.get(label) || 0) + 1)
    }
    const entries = [...counts.entries()].sort((a, b) => b[1] - a[1])
    const shown = entries.map(([label, count]) => (count > 1 ? `${label} ×${count}` : label))
    if (shown.length === 0) return 'objet non renseigné'
    // The count comes from the collection, not from what reached this cell: the list was already
    // capped upstream, so counting here would always find nothing missing.
    return [shown.join(', '), andMore(shown.length, total ?? shown.length, 'objet')]
      .filter(Boolean)
      .join(', ')
  }

  const thirdPartyRows = thirdParties.recipients.slice(0, 60).map((entry, index) => ({
    recipient: pseudonymise
      ? `T-${String(index + 1).padStart(2, '0')} (${entry.domain || 'domaine non déterminé'})`
      : entry.address,
    messages: String(entry.messages),
    period:
      entry.firstUtc && entry.lastUtc
        ? `${dateTable(entry.firstUtc)} au ${dateTable(entry.lastUtc)}`
        : 'non déterminée',
    // A subject line can name a third party, so it goes with the address.
    subjects: pseudonymise ? 'non reproduits' : subjectCell(entry.subjects, entry.subjectsTotal),
  }))

  const notifiedRows = psitAsArray(incident?.ThirdPartiesNotified).map((entry) => ({
    name: entry?.Name || entry?.name || 'tiers non nommé',
    stamp: dateTable(entry?.NotifiedUtc || entry?.notifiedUtc, { fallback: 'non renseigné' }),
    // A channel outside the enumeration cannot reach here any more, but an older record may hold
    // one: it is printed as unfilled rather than as fact.
    channel: phrase('channel', entry?.Channel || entry?.channel) || 'non renseigné',
  }))

  const retainedSummary = `${sentence(
    established.length + confirmed.length,
    'signal',
    'retenu'
  )} à ce stade. Le détail figure en section « Constats et base probante ».`

  return (
    <ReportDocument
      brandingSettings={brandingSettings}
      language="fr"
      tenantName={tenantName}
      reportName="Rapport d'incident"
      generatedOn={currentDate}
      variables={variables}
      coverLabel="Rapport d'incident de sécurité"
      /* The qualification never appears in the title: a cover reading "Compromission constatée"
         states the conclusion before the reader has the basis for it, and the same cover has to
         serve a case closed as a false positive. It goes in one sober line below. */
      coverTitle="Compromission de messagerie"
      coverAccent="professionnelle"
      coverSubtitle={ticketLine}
      coverTenant={userData?.displayName || 'Compte inconnu'}
      coverFooterNote={`${marking} : diffusion restreinte aux personnes ayant à en connaître`}
      footerLabel={`${marking} | ${ticket} | ${tenantName}`}
      documentTitle={`Rapport d'incident ${ticket}`}
      documentSubject="Rapport d'incident de sécurité PSIT-BEC"
      /* The internal reference travels in the metadata, not in the body: it is what identifies a
         copy in circulation, and it is readable by anyone opening the file properties. */
      documentKeywords={[incident?.Reference, incident?.AutotaskTicket].filter(Boolean).join(' ')}
      documentAuthor="PLEIN SUD IT"
      coverMeta={
        <CoverMeta
          lines={[
            `Compte concerné : ${userData?.displayName || 'nom inconnu'} (${
              userData?.userPrincipalName || 'adresse inconnue'
            })`,
            `Organisation : ${tenantName}`,
            `Détection : ${dateProse(incident?.DetectedUtc)}`,
            `Entité émettrice : PLEIN SUD IT`,
          ]}
          note={`Qualification à la date d'édition : ${qualificationLabel}. Marquage ${marking}.`}
        />
      }
    >
      {/* 1 & 2. IDENTIFICATION ET RÉSUMÉ */}
      <ContentPage
        title="Résumé de l'incident"
        subtitle="Synthèse des constats et des actions attendues"
      >
        <PsitTlpBand tlp={incident?.Tlp} note={`${ticket} | ${tenantName}`} />
        <Section title="Identification">
          <InfoBox title="Incident">
            Ticket : {ticket}
            {relatedTickets.length > 0 ? `\nTickets liés : ${enumerate(relatedTickets)}` : ''}
            {'\n'}
            Dossier ouvert : {dateProse(incident?.CreatedUtc)}
            {'\n'}
            Rapport d'investigation associé : collecte du{' '}
            {dateProse(becData?.ExtractedAt, { article: false })}
            {'\n'}
            Compte concerné : {userData?.userPrincipalName}
            {'\n'}
            Organisation : {tenantName}
            {'\n'}
            Détection : {dateProse(incident?.DetectedUtc)}
            {'\n'}
            Confinement :{' '}
            {incident?.ContainedUtc
              ? dateProse(incident.ContainedUtc, { article: false })
              : 'aucune action enregistrée à ce stade'}
            {'\n'}
            Statut : {phrase('incidentStatus', incident?.Status, 'box') || 'à préciser'}
            {'\n'}
            Qualification à la date d'édition : {qualificationLabel}
            {'\n'}
            {/* The analyst is named once, on the handover page. Here the issuing party is enough,
                and it is the party the client contracted with. */}
            Rapport établi par : PLEIN SUD IT, {dateProse(incident?.UpdatedUtc)}
            {'\n'}
            Marquage de diffusion : {marking}
          </InfoBox>
        </Section>

        <Section title="Résumé">
          <StatRow
            stats={[
              { value: established.length + confirmed.length, label: 'Faits retenus' },
              { value: exposure.exfiltration.length, label: "Voies d'exfiltration établies" },
              { value: attestedCount, label: 'Actions de confinement attestées' },
              { value: thirdParties.recipients.length, label: 'Tiers à vérifier' },
            ]}
          />

          {verdict.status === VERDICT_STATUS.COMPROMISED ? (
            <AlertBox colour="#742A2A" title="Qualification : compromission retenue">
              {retainedSummary}
            </AlertBox>
          ) : (
            <AlertBox title="Ce rapport a été produit sans compromission retenue">
              {`Le dossier d'investigation ne conclut pas à une compromission : ${qualificationLabel}. Ce document ne devrait pas être diffusé en l'état.`}
            </AlertBox>
          )}

          {psitAsArray(incident?.PreviousCases).length > 0 && (
            <AlertBox
              colour="#742A2A"
              title={`Compromission répétée : ${cardinal(
                psitAsArray(incident.PreviousCases).length,
                'dossier'
              )} antérieur sur cette boîte`}
            >
              {psitAsArray(incident.PreviousCases)
                .map(
                  (previous) =>
                    `Ticket ${previous.AutotaskTicket || 'non renseigné'} : détection ${dateProse(
                      previous.DetectedUtc,
                      { article: false }
                    )}, clos ${dateProse(previous.ClosedUtc, { article: false })}`
                )
                .join('\n')}
            </AlertBox>
          )}

          {/* Composed from the record, sentence by sentence, rather than left to a free field: the
              first version of this page carried "Connexions malveillantes depuis l'Italie, envoi de
              spam massif" - an analyst's shorthand, printed to a client. The analyst's own note now
              follows this paragraph instead of replacing it. */}
          <Paragraph>
            {accessSentence} {effectSentence ? `${effectClause} ` : ''}
            {containmentSentence} {phrase('mailRead', mailReadStatus)} {exfiltrationSentence}{' '}
            {thirdPartySentence}
          </Paragraph>

          {incident?.ExecutiveNote && <Paragraph>{incident.ExecutiveNote}</Paragraph>}
        </Section>
      </ContentPage>

      {/* 3. CHRONOLOGIE */}
      <ContentPage
        title="Chronologie de l'incident"
        subtitle="Horodatages en UTC, toutes sources confondues"
      >
        <Section title="Activité par fenêtre">
          {/* A table, not a stack of cards: thirty-five boxes of one line each ran to three pages
              and made a concurrence between two countries impossible to see. */}
          {signInWindows.length > 0 ? (
            <>
              {/* The strip above the table it completes. One unbreakable box for the drawing AND
                  its note: a strip whose note landed on the next page states a source it no longer
                  carries. Not a Section - a section that cannot break is a section that vanishes. */}
              {psitTimelineStripNote(becData, { unexpectedIps: unexpectedSignInIps }) ? (
                <View wrap={false}>
                  <PsitTimelineStrip becData={becData} unexpectedIps={unexpectedSignInIps} />
                  <Note>
                    {psitTimelineStripNote(becData, { unexpectedIps: unexpectedSignInIps })}
                  </Note>
                </View>
              ) : null}
              <DataTable
                columns={[
                  { header: 'Période (UTC)', key: 'period', width: 3 },
                  { header: 'IP', key: 'ip', width: 2, bold: true },
                  { header: 'Pays', key: 'country', width: 1 },
                  { header: 'Localité', key: 'city', width: 2 },
                  // The header is wider than its own cell at width 1: "CONNEXIONS" ran into
                  // "APPLICATIONS" beside it. Widened rather than abbreviated - a column head that
                  // needs a glossary is worse than a column that takes its share.
                  { header: 'Connexions', key: 'signIns', width: 2, align: 'right' },
                  { header: 'Applications', key: 'apps', width: 3 },
                ]}
                rows={signInWindows}
                limit={25}
                emptyText="Aucune connexion retournée par la collecte."
              />
              <Note>Localités issues de la géolocalisation IP ; précision limitée.</Note>
            </>
          ) : (
            <Note>Aucune connexion datée n'a pu être reconstituée sur la fenêtre analysée.</Note>
          )}
        </Section>

        <Section title="Autres événements datés">
          {otherEvents.length > 0 ? (
            <DataTable
              columns={[
                { header: 'Horodatage (UTC)', key: 'stamp', width: 2 },
                { header: 'Événement', key: 'label', width: 3, bold: true },
                { header: 'Détail', key: 'detail', width: 4 },
              ]}
              rows={otherEvents}
              limit={20}
              emptyText="Aucun autre événement daté."
            />
          ) : (
            <Note>Aucun autre événement daté sur la fenêtre analysée.</Note>
          )}
        </Section>

        <Section title="Interventions">
          {interventions.length > 0 ? (
            <DataTable
              columns={[
                { header: 'Horodatage (UTC)', key: 'stamp', width: 2 },
                { header: 'Action', key: 'action', width: 3, bold: true },
                { header: 'Source', key: 'source', width: 2 },
                { header: 'Opérateur', key: 'operator', width: 2 },
              ]}
              rows={interventions}
              limit={20}
              emptyText="Aucune intervention enregistrée."
            />
          ) : (
            <Note>
              Aucune action de remédiation n'est enregistrée dans le journal CIPP pour ce compte.
            </Note>
          )}
          {interventions.some((row) => row.hasFailure) && (
            <Note>
              Une action marquée « erreur journalisée » a échoué au moins une fois : son effet doit
              être vérifié dans le tenant.
            </Note>
          )}
        </Section>
      </ContentPage>

      {/* 4. FAITS ÉTABLIS */}
      <ContentPage title="Faits établis" subtitle="Constats et base probante">
        <PsitTlpBand tlp={incident?.Tlp} note={`${ticket} | ${tenantName}`} />
        <Section title="Éléments retenus">
          {[...established, ...confirmed].length > 0 ? (
            [...established, ...confirmed].map((signal) => {
              const determination = psitAsArray(liveTriage).find(
                (entry) => entry.SignalId === signal.id
              )
              return (
                /* One field per line, and the analyst's comment on its own labelled line: the
                   previous form glued the note to the qualification behind a colon, which read as
                   part of the finding rather than as a comment on it. */
                <InfoBox key={signal.id} title={signal.title}>
                  {`Constat : ${signal.detail}`}
                  {'\n'}
                  {`Source : ${enumerate(signal.evidence || [], { empty: 'collecte BEC' })}`}
                  {determination
                    ? `\nQualification : ${
                        phrase('determination', determination.Verdict) || determination.Verdict
                      }, portée par l'analyste PLEIN SUD IT ${dateProse(determination.DecidedUtc)}`
                    : "\nQualification : établie par la donnée, sans intervention de l'analyste"}
                  {determination?.Justification
                    ? `\nCommentaire de l'analyste : ${determination.Justification}`
                    : ''}
                </InfoBox>
              )
            })
          ) : (
            <Note>Aucun fait n'a été retenu : voir l'avertissement en première page.</Note>
          )}
        </Section>

        <Section title="Portée des constatations">
          <Paragraph>
            Les constatations portent sur la fenêtre analysée par la collecte et sur les seules
            sources qu'elle interroge. Les éléments suivants ne sont pas couverts et ne peuvent donc
            être ni confirmés ni écartés :
          </Paragraph>
          <BulletList>
            {exposure.notCovered.map((item, index) => (
              <Bullet key={`nc-${index}`}>{item}</Bullet>
            ))}
          </BulletList>
        </Section>
      </ContentPage>

      {/* 5. EXPOSITION DES DONNÉES */}
      <ContentPage
        title="Exposition des données"
        subtitle="Éléments de description au sens de l'article 33.3 du RGPD"
      >
        <Section>
          <Paragraph>
            {/* One sentence. The list of what the controller must describe was removed: the
                sections below provide those elements, and announcing them before the first fact
                made the section read as a manual. The demarcation stays - it is what protects
                Plein Sud IT as a processor, and it shortens rather than disappears. */}
            <Bold>
              La qualification juridique de la violation et la décision de notifier relèvent du
              responsable de traitement
            </Bold>{' '}
            {`, c'est-à-dire ${
              tenantName || "l'organisation concernée"
            } pour les données en cause, assisté le cas échéant de son délégué à la protection des données ; le présent document ne s'y substitue pas.`}
          </Paragraph>
          <Note>
            Les éléments ci-dessous portent sur les données que le compte compromis manipulait. Si
            certaines relèvent d'un autre responsable de traitement, il appartient au responsable
            des données concernées d'en apprécier les suites.
          </Note>
        </Section>

        <Section title="Nature de la violation">
          <InfoBox title="Nature">
            {`Accès non autorisé à une boîte de messagerie professionnelle${
              exposure.exfiltration.length > 0
                ? `, avec ${cardinal(
                    exposure.exfiltration.length,
                    'voieExfiltration'
                  )} ${agree(exposure.exfiltration.length, 'voieExfiltration', 'établi')}`
                : ''
            }.`}
            {'\n'}
            Compte concerné : {userData?.userPrincipalName}
            {'\n'}
            {/* The window starts at the first access the evidence actually supports, not at the
                first collected row: an MFA method registered years earlier once became "premier
                accès non autorisé observé" in a client document. */}
            {`Période d'exposition : du ${
              firstAccessUtc
                ? `${dateProse(firstAccessUtc, { article: false })} (premier accès retenu)`
                : `${dateProse(incident?.DetectedUtc, { article: false })} (détection)`
            } au ${
              incident?.ContainedUtc
                ? dateProse(incident.ContainedUtc, { article: false })
                : "jour d'édition, le confinement n'étant pas enregistré"
            }.`}
            {'\n'}
            {`Premier accès non autorisé observé : ${
              firstAccessUtc
                ? dateProse(firstAccessUtc, { article: false })
                : "non déterminé, aucun signal de connexion n'ayant été retenu"
            }.`}
            {'\n'}
            {/* The DPO reads this section, and this is the sentence that keeps the date from being
                quoted as the start of the intrusion. */}
            {`Borne de début limitée par la collecte : elle porte sur la fenêtre du ${dateProse(
              window.startUtc,
              { article: false }
            )} au ${dateProse(window.endUtc, {
              article: false,
            })}, dans la limite de rétention des journaux Microsoft. Un accès antérieur ne serait pas visible.`}
          </InfoBox>
        </Section>

        <Section title="Personnes concernées">
          <InfoBox title="Catégories de personnes">
            {psitAsArray(incident?.DataSubjectCategories).join(', ') ||
              'Non renseigné : à compléter par l’analyste avant diffusion'}
          </InfoBox>
          {/* The two figures, articulated: an estimate the controller owns, and a floor the trace
              shows. Printed one after the other without that distinction, the second was read as a
              correction of the first. */}
          <InfoBox title="Nombre approximatif">
            {incident?.AffectedPersonsEstimate
              ? `Estimation : ${incident.AffectedPersonsEstimate}${
                  incident?.AffectedPersonsBasis
                    ? `, sur la base de ${incident.AffectedPersonsBasis}`
                    : ''
                }.`
              : "Estimation non renseignée, à compléter par l'analyste avant diffusion."}
            {'\n'}
            {/* Ce que le décompte mesure, et ce qu'il ne mesure pas : sans cette distinction, un
                lecteur presse lit le plancher comme un nombre de personnes concernées. */}
            {nbsp(
              `Repère mesuré : ${cardinal(
                exposure.correspondentFloor.distinct,
                'correspondant'
              )} ${agree(
                exposure.correspondentFloor.distinct,
                'correspondant',
                'distinct',
                'observé'
              )} sur la fenêtre analysée${
                exposure.correspondentFloor.truncated
                  ? `, sur un suivi partiel (${cardinal(
                      exposure.correspondentFloor.collectedRecipients,
                      'ligneSuivi'
                    )} ${agree(
                      exposure.correspondentFloor.collectedRecipients,
                      'ligneSuivi',
                      'collecté'
                    )} pour ${cardinal(
                      exposure.correspondentFloor.declaredRecipients,
                      'destinataire'
                    )} ${agree(
                      exposure.correspondentFloor.declaredRecipients,
                      'destinataire',
                      'annoncé'
                    )})`
                  : ''
              }. Ce décompte porte sur les correspondants observés, non sur les personnes dont les données figurent dans la boîte ; il constitue un plancher et ne préjuge pas du contenu de la boîte.`
            )}
          </InfoBox>
        </Section>

        <Section title="Données concernées">
          {/* "présentes dans la boîte" read as a finding about the mailbox contents, and worried
              readers. It is a declaration by the client, and this tool never reads a message. The
              information stays - article 33.3 requires it - the framing changes. */}
          <InfoBox title="Catégories de données déclarées par le client">
            {psitAsArray(incident?.DataCategories).join(', ') ||
              'Non renseigné : à compléter par l’analyste avant diffusion'}
          </InfoBox>
          <Note>
            Ces catégories sont déclarées par le client. Le contenu des messages n'est pas analysé
            par cet outil.
          </Note>
          <InfoBox
            tone={mailReadStatus === MAIL_READ_STATUS.PROVEN ? 'warn' : undefined}
            title="Lecture des messages"
          >
            {/* One sentence with its reason, instead of "Ne peut être ni établie ni exclue : le
                niveau d'audit du tenant ne l'enregistre pas" followed by a second colon and a
                second explanation. */}
            {phrase('mailRead', mailReadStatus)}
          </InfoBox>
          {exposure.exfiltration.length > 0 ? (
            exposure.exfiltration.map((item, index) => (
              <InfoBox key={`exf-${index}`} title={item.label}>
                {`Constat : ${item.detail}`}
                {'\n'}
                {`Source : ${item.basis}`}
              </InfoBox>
            ))
          ) : (
            <ClearBox title="Aucune voie d'exfiltration relevée">
              Parmi les voies que cette collecte couvre : aucune règle de transfert externe, aucun
              lien de partage anonyme, aucun envoi depuis une adresse hors zone.
            </ClearBox>
          )}
        </Section>

        <Section title="Conséquences probables">
          <Paragraph>
            {incident?.LikelyConsequences ||
              "Non renseigné : à compléter par l'analyste. À défaut, le client ne dispose pas d'un des éléments exigés par l'article 33.3."}
          </Paragraph>
        </Section>
      </ContentPage>

      {/* 6 & 7. CONFINEMENT ET PERSISTANCES */}
      <ContentPage
        title="Confinement et suites"
        subtitle="État du confinement et vérifications à mener"
      >
        <Section title="Actions de confinement">
          <Paragraph>
            Les actions ci-dessous sont relevées dans le journal de CIPP : leur horodatage et leur
            opérateur sont attestés par l'outil. Une action menée hors de CIPP figure comme déclarée
            et non attestée.
          </Paragraph>
          {/* Nothing attested: one sentence. A list of nine "non attestée" fills a page and says
              exactly what the sentence says. */}
          {attestedCount === 0 ? (
            <Paragraph>
              {`Aucune des ${containment.length} actions types de confinement ne figure au journal CIPP à la date d'édition. Une action menée hors de CIPP est réputée déclarée et non attestée.`}
            </Paragraph>
          ) : (
            <DataTable
              columns={[
                { header: 'Action', key: 'action', width: 3, bold: true },
                { header: 'État', key: 'state', width: 2 },
                { header: 'Horodatage (UTC)', key: 'stamp', width: 2 },
                { header: 'Opérateur', key: 'operator', width: 2 },
              ]}
              rows={containmentRows}
              limit={12}
              emptyText="Aucune action attestée."
            />
          )}
        </Section>

        <Section title="Persistances non écartées">
          <Paragraph>
            Une compromission de messagerie laisse des accès qui survivent à la réinitialisation du
            mot de passe. Les vérifications suivantes restent à mener :
          </Paragraph>
          <BulletList>
            {exposure.persistenceChecks.map((item, index) => (
              <Bullet key={`pers-${index}`}>{item}</Bullet>
            ))}
          </BulletList>
        </Section>

        <Section title="Tiers prévenus">
          {notifiedRows.length > 0 ? (
            <DataTable
              columns={[
                { header: 'Tiers', key: 'name', width: 3, bold: true },
                { header: 'Prévenu le (UTC)', key: 'stamp', width: 2 },
                { header: 'Canal', key: 'channel', width: 2 },
              ]}
              rows={notifiedRows}
              limit={20}
              emptyText="Aucun tiers prévenu."
            />
          ) : (
            <Note>Aucun tiers n'est enregistré comme prévenu à ce stade.</Note>
          )}
        </Section>
      </ContentPage>

      {/* 8. RECOMMANDATIONS */}
      <ContentPage title="Suites recommandées" subtitle="Pour le responsable de traitement">
        <Section title="Sans délai">
          <BulletList>
            <Bullet marker="1." label="Mener les vérifications de persistance :">
              {' '}
              la liste figure en section « Persistances non écartées ». Chacune doit être tracée,
              faite ou écartée.
            </Bullet>
            <Bullet marker="2." label="Prévenir les tiers concernés :">
              {' '}
              la liste des destinataires des envois signalés figure en annexe. Un tiers qui a reçu
              une demande de virement depuis cette boîte doit être appelé, pas seulement écrit.
            </Bullet>
            <Bullet marker="3." label="En cas de virement exécuté :">
              {' '}
              contacter immédiatement la banque émettrice (un rappel de fonds n'est possible que
              dans un délai très court), puis déposer plainte.
            </Bullet>
            <Bullet marker="4." label="Statuer sur la notification :">
              {' '}
              le responsable de traitement apprécie, avec les éléments de la section « Exposition
              des données », s'il y a lieu de notifier l'autorité de contrôle et, le cas échéant,
              les personnes concernées.
            </Bullet>
            <Bullet marker="5." label="Conserver les éléments :">
              {' '}
              ce rapport, le rapport d'investigation et l'export de données brutes constituent la
              documentation de l'incident.
            </Bullet>
          </BulletList>
        </Section>

        {/* Context, before the hardening list it bears on. Always rendered once the feature is
            live: the fourth state replaces the silence, because a missing paragraph reads as "we
            found nothing" and that is not what an unavailable service means. Aggregate only - the
            breaches themselves are named in the investigation report, not here. */}
        <Section title="Exposition publique de l'identifiant">
          <InfoBox title="Compromissions de données publiques" wrap={false}>
            {breachText}
          </InfoBox>
        </Section>

        <Section title="Réduction du risque de récidive">
          <BulletList>
            {/* Only when an exposure was actually found: recommending a reset on the strength of a
                check that never ran would dress a failure up as a finding. */}
            {breachSuggestsPasswordReset(breachExposure) ? (
              <Bullet label="Réinitialisation des mots de passe réutilisés :">
                {' '}
                l'adresse figure dans des compromissions publiques, donc tout mot de passe partagé
                entre ce compte et un service tiers doit être changé, pas seulement celui du compte.
              </Bullet>
            ) : null}
            <Bullet label="Authentification résistante à l'hameçonnage :">
              {' '}
              clés de sécurité ou Windows Hello Entreprise pour les comptes exposés, à défaut MFA
              par application avec correspondance de numéro.
            </Bullet>
            <Bullet label="Blocage de l'authentification héritée :">
              {' '}
              IMAP, POP et SMTP AUTH ne peuvent pas être protégés par MFA.
            </Bullet>
            <Bullet label="Accès conditionnel :">
              {' '}
              restriction par conformité de l'appareil et par localisation, avec revue des
              exclusions existantes.
            </Bullet>
            <Bullet label="Revue périodique des consentements applicatifs :">
              {' '}
              c'est la voie de persistance la plus fréquemment oubliée.
            </Bullet>
            <Bullet label="Procédure de validation des changements de coordonnées bancaires :">
              {' '}
              double validation et rappel téléphonique sur un numéro connu.
            </Bullet>
          </BulletList>
        </Section>
      </ContentPage>

      {/* 9. ANNEXE : TIERS DESTINATAIRES */}
      <ContentPage
        title="Annexe : destinataires des envois signalés"
        subtitle="Liste à vérifier, extraite du suivi des messages"
      >
        <Section>
          <Paragraph>
            Ces adresses ont reçu, pendant la fenêtre analysée, des messages envoyés depuis la boîte
            compromise dans des conditions signalées : campagne à objet répété, rafale d'envoi, ou
            envoi depuis une adresse IP hors du pays d'utilisation déclaré.{' '}
            <Bold>Cette liste ne constitue pas une liste de victimes</Bold> : la collecte ne lit pas
            le contenu des messages. Elle indique qui doit être vérifié en priorité.
          </Paragraph>
          {pseudonymise && (
            <Note>
              Les adresses sont pseudonymisées dans cette version : seul le domaine est conservé,
              car il suffit à identifier l'organisation à contacter. La correspondance entre les
              identifiants T-01, T-02… et les adresses réelles figure dans l'export JSON du dossier,
              à diffusion restreinte.
            </Note>
          )}
          {thirdParties.truncated && (
            <Note>
              {`Échantillon : la collecte a retourné ${cardinal(
                thirdParties.collectedRecipients,
                'ligneSuivi'
              )} sur ${thirdParties.totalRecipients} annoncées. La liste ci-dessous est donc partielle.`}
            </Note>
          )}
          <Note>
            {`Exclus de cette liste : ${cardinal(
              thirdParties.excluded.systemGenerated,
              'message'
            )} ${agree(
              thirdParties.excluded.systemGenerated,
              'message',
              'généré'
            )} par le service (réponses automatiques, avis de non-remise) et ${cardinal(
              thirdParties.excluded.internal,
              'destinataire'
            )} ${agree(
              thirdParties.excluded.internal,
              'destinataire',
              'interne'
            )} à l'organisation. Une réponse automatique partie vers une lettre d'information n'est pas un tiers à prévenir.`}
            {thirdParties.derivedLocally
              ? ' Cette classification a été calculée à la génération du rapport, la collecte étant antérieure à sa mise en place côté API.'
              : ''}
          </Note>
        </Section>

        <Section
          title={`Destinataires : ${counted(thirdParties.recipients.length, 'destinataire')}`}
        >
          {thirdParties.recipients.length > 0 ? (
            <>
              {/* A table, not one box per recipient: thirty recipients ran to five pages of
                  near-identical boxes. Rows stay unbreakable and the header repeats, so a long
                  annex still reads. */}
              <DataTable
                columns={[
                  { header: 'Destinataire', key: 'recipient', width: 3, bold: true },
                  { header: 'Messages', key: 'messages', width: 1, align: 'right' },
                  { header: 'Période (UTC)', key: 'period', width: 3 },
                  { header: 'Objets', key: 'subjects', width: 4 },
                ]}
                rows={thirdPartyRows}
                limit={60}
                emptyText="Aucun destinataire signalé."
              />
              {truncationNote(60, thirdParties.recipients.length) && (
                <Note>
                  {truncationNote(60, thirdParties.recipients.length)}
                </Note>
              )}
            </>
          ) : thirdParties.truncated ? (
            /* An empty list drawn from a partial sample is not good news, and a green box would be
               read as one. */
            <AlertBox title="Liste non exploitable en l'état">
              Aucun tiers ne ressort de l'échantillon, mais la collecte n'a retourné que{' '}
              {thirdParties.collectedRecipients} lignes de suivi sur {thirdParties.totalRecipients}.
              Cette absence ne vaut pas absence d'envoi : le suivi complet des messages doit être
              extrait avant de conclure sur les tiers.
            </AlertBox>
          ) : (
            <ClearBox title="Aucun destinataire signalé">
              Aucun envoi externe correspondant à un schéma signalé n'a été relevé sur la fenêtre
              analysée.
            </ClearBox>
          )}
        </Section>

        <Section title="Conservation et diffusion">
          <Paragraph>
            Cette annexe contient des données à caractère personnel de tiers. Sa diffusion doit être
            limitée aux personnes ayant à en connaître pour la gestion de l'incident, et sa
            conservation alignée sur celle du dossier d'incident.
          </Paragraph>
        </Section>
      </ContentPage>

      {/* 10. REMISE ET VALIDATION */}
      <ContentPage
        title="Remise et validation"
        subtitle="Traçabilité de la remise et validation du responsable de traitement"
      >
        <Section>
          <Paragraph>
            {/* The parenthesis listing the decisions was removed: it enumerated four things the
                reader either knows or will be told by their counsel. The demarcation is the
                sentence, and it is the whole point of the page. */}
            Ce document est produit par Plein Sud IT en qualité de sous-traitant. Les constats et
            les mesures qu'il rapporte relèvent de notre intervention ; les décisions qui en
            découlent relèvent du responsable de traitement.
          </Paragraph>
        </Section>

        <Section title="Remise">
          <InfoBox title="Transmission">
            Remis à : {incident?.DeliveredTo || 'non renseigné'}
            {'\n'}
            Le : {incident?.DeliveredUtc ? formatUtc(incident.DeliveredUtc) : 'non renseigné'}
            {'\n'}
            Canal : {incident?.DeliveryChannel || 'non renseigné'}
            {'\n'}
            Établi par : {incident?.UpdatedBy || incident?.CreatedBy || 'N/D'}
          </InfoBox>
          {incident?.AcknowledgedBy ? (
            <InfoBox title="Accusé de réception">
              Par : {incident.AcknowledgedBy}
              {'\n'}
              Le :{' '}
              {incident?.AcknowledgedUtc
                ? formatUtc(incident.AcknowledgedUtc)
                : 'date non renseignée'}
            </InfoBox>
          ) : null}
        </Section>

        {/* The handwritten validation box is gone. Nobody printed the document, signed it and
            sent it back, and a form that is never filled in sits badly in a report that is
            otherwise careful. What the box existed for survives: the client's decision is the only
            evidence of what they did with the report, and it is now a recorded field rather than a
            blank line. */}
        <Section title="Suite décidée">
          {incident?.FollowUpDecision ? (
            <InfoBox title="Décision du responsable de traitement">
              {`${incident.FollowUpDecision}${
                incident?.FollowUpDecisionUtc
                  ? `\n\nConsignée ${dateProse(incident.FollowUpDecisionUtc)}.`
                  : ''
              }`}
            </InfoBox>
          ) : (
            <Paragraph>
              {`La suite décidée n'est pas encore consignée dans le dossier. Elle est à enregistrer sur le ticket ${ticket}, dont elle constitue la trace.`}
            </Paragraph>
          )}
        </Section>
      </ContentPage>
    </ReportDocument>
  )
}

export const PsitBecIncidentReportButton = ({ userData, becData, tenantName, triage = [] }) => {
  const [dialogOpen, setDialogOpen] = useState(false)
  // Off by default: the annex exists to say who must be called first, and a pseudonym cannot be
  // called. It is turned on for a copy that will circulate beyond the people handling the case.
  const [pseudonymise, setPseudonymise] = useState(false)
  const brandingSettings = useBrandingSettings()
  const variables = useReportVariables()

  const hasData = userData && becData && !becData.Waiting
  const incidentRequest = ApiGetCall({
    url: `/api/PSITListBecIncident?tenantFilter=${tenantName}&userId=${userData?.id}&userPrincipalName=${userData?.userPrincipalName}`,
    queryKey: `PSITBecIncident-${tenantName}-${userData?.id}`,
    waiting: Boolean(hasData && tenantName && userData?.id),
  })

  if (!hasData) return null

  // A cached failure reaches the page looking like a collection that found nothing, so the guard
  // belongs here rather than in the document: no document at all from an unusable collection.
  const collection = getCollectionStatus(becData)
  if (collection.blocksReport) {
    return (
      <Tooltip title="Rapport d'incident indisponible : la collecte doit être relancée avant de produire un document">
        <span>
          <Button variant="contained" color="error" startIcon={<ReportProblem />} disabled>
            Rapport d'incident
          </Button>
        </span>
      </Tooltip>
    )
  }

  const signals = buildSignals(becData, userData)
  const verdict = buildVerdict(signals, triage)
  // No incident report without a compromise: the document's entire framing asserts one.
  if (verdict.status !== VERDICT_STATUS.COMPROMISED) return null

  const incident = incidentRequest.data?.Incident || {}
  const remediation = incidentRequest.data?.Remediation || {}
  // The five items GDPR article 33(3) requires a controller to describe. A report that leaves any
  // of them blank is worse than no report: it looks complete. So the preview stays available - the
  // analyst has to see what is missing, in place - and the download is what waits.
  const missing = []
  if (!incident?.Reference) missing.push("aucune fiche d'incident ouverte")
  // The client-facing reference: cover, identification block, file name. Without it the document
  // carries no reference the client can quote.
  if (!incident?.AutotaskTicket) missing.push('numéro de ticket Autotask')
  if (!incident?.DetectedUtc) missing.push('date de détection')
  if (!psitAsArray(incident?.DataSubjectCategories).length) {
    missing.push('catégories de personnes concernées')
  }
  if (!psitAsArray(incident?.DataCategories).length) missing.push('catégories de données')
  if (!incident?.AffectedPersonsEstimate) missing.push('nombre approximatif de personnes')
  if (!incident?.LikelyConsequences) missing.push('conséquences probables')

  const documentNode = (
    <PsitBecIncidentReportDocument
      userData={userData}
      becData={becData}
      brandingSettings={brandingSettings}
      tenantName={tenantName}
      variables={variables}
      triage={triage}
      incident={incident}
      remediation={remediation}
      pseudonymise={pseudonymise}
    />
  )

  return (
    <>
      <Tooltip title="Rapport d'incident : document destiné au client et à son délégué à la protection des données">
        <Button
          variant="contained"
          color="error"
          startIcon={<ReportProblem />}
          onClick={() => setDialogOpen(true)}
        >
          Rapport d'incident
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
            <Box>
              <Typography variant="h6" component="div">
                Aperçu du rapport d'incident
              </Typography>
              {missing.length > 0 && (
                <Typography variant="body2" color="error.main">
                  Téléchargement bloqué, à compléter dans la fiche BEC : {missing.join(', ')}
                  . Ces éléments sont ceux que l'article 33.3 du RGPD demande de décrire ; un
                  rapport qui les laisse vides a l'air complet, ce qui est pire que pas de rapport.
                  L'aperçu reste consultable.
                </Typography>
              )}
            </Box>
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
        <DialogActions sx={{ justifyContent: 'space-between' }}>
          <FormControlLabel
            control={
              <Switch
                checked={pseudonymise}
                onChange={(event) => setPseudonymise(event.target.checked)}
              />
            }
            label="Pseudonymiser les tiers en annexe"
          />
          <Box display="flex" gap={2} alignItems="center">
            <Button onClick={() => setDialogOpen(false)}>Fermer</Button>
            {missing.length > 0 ? (
              <Tooltip
                title={`Télécharger le PDF : indisponible tant que la fiche est incomplète (${missing.join(', ')})`}
              >
                <span>
                  <Button variant="contained" color="error" startIcon={<Download />} disabled>
                    Télécharger le PDF
                  </Button>
                </span>
              </Tooltip>
            ) : (
              <PDFDownloadLink
                document={documentNode}
                fileName={psitReportFileName(
                  incident?.AutotaskTicket,
                  userData?.userPrincipalName,
                  {
                    pseudonymise,
                  }
                )}
                style={{ textDecoration: 'none' }}
              >
                {({ loading }) => (
                  <Button
                    variant="contained"
                    color="error"
                    startIcon={loading ? <CircularProgress size={20} /> : <Download />}
                    disabled={loading}
                  >
                    {loading ? 'Génération...' : 'Télécharger le PDF'}
                  </Button>
                )}
              </PDFDownloadLink>
            )}
          </Box>
        </DialogActions>
      </Dialog>
    </>
  )
}
