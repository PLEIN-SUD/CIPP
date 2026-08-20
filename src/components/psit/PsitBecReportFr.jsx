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
} from '@mui/material'
import { PictureAsPdf, Download, Close } from '@mui/icons-material'
import { PDFViewer, PDFDownloadLink } from '@react-pdf/renderer'
import { useReportVariables } from '../CippPdf/useReportVariables'
import { useBrandingSettings } from '../CippPdf/useBrandingSettings'
import { ApiGetCall } from '../../api/ApiCall'
import { PsitBecAssessmentSection } from './PsitBecAssessmentSection'
import {
  SIGNAL_CLASS,
  VERDICT_STATUS,
  buildSignals,
  buildTimeline,
  buildVerdict,
  classifySentMessages,
  formatUtc,
  getAnalysisWindow,
  groupSignInsByIp,
  partitionDeterminations,
} from '../../utils/psit-bec-signals'
import { INCIDENT_STATUS_LABELS, buildExposure } from '../../utils/psit-bec-incident'
import { getCollectionStatus } from '../../utils/psit-bec-collection'
import { psitAsArray } from '../../utils/psit-as-array'
import { buildIocs } from '../../utils/psit-bec-iocs'
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

// Investigation report, French edition. Restructured after reading two real generated PDFs: the
// first version was upstream's eleven-check document with a verdict stapled to page 2, and the two
// halves contradicted each other - page 2 said the analyst had qualified a rule as unexpected while
// page 8 still told the reader to treat both rules as suspect by default. Nineteen pages carried
// one page of decision, including three pages of near-identical chronology lines, five pages of
// individual sent messages (mostly internal or automatic) and a full page dumping 278 third-party
// email addresses that had not changed during the window.
//
// So the order is now decision, then evidence, then raw material:
//   1. Décision           - the verdict, the retained facts, the signed determinations
//   2. Chronologie        - sign-ins aggregated into sessions, bounded by the analysis window
//   3. Faits et signaux   - one block per signal, with what was set aside and why
//   4. Couverture         - what was looked at, what cannot be concluded, data provenance
//   5. Annexes            - the eleven checks as sources, and a short primer
//
// The eleven checks are annexes because they are sources, not the structure of the reasoning.

const plural = (count, singular, pluralForm) => `${count} ${count > 1 ? pluralForm : singular}`

const VERDICT_WORDS = {
  expected: 'attendu',
  unexpected: 'inattendu',
  undetermined: 'indéterminé',
}

export const PsitBecReportFrDocument = ({
  userData,
  becData,
  brandingSettings,
  tenantName,
  variables,
  triage = [],
  incident = {},
}) => {
  const currentDate = new Date().toLocaleDateString('fr-FR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  // One time base for the whole document, in UTC. Upstream renders sign-ins in the browser's local
  // time and sent mail in raw UTC, which makes a France/Italy concurrency in the same morning
  // impossible to see.
  const formatDate = (dateString) => {
    if (!dateString) return 'N/D'
    try {
      const rendered = new Date(dateString).toLocaleString('fr-FR', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'UTC',
      })
      return `${rendered} UTC`
    } catch {
      return dateString
    }
  }

  const window = getAnalysisWindow(becData)
  // Determinations decided before this window opened no longer speak for it: on a second
  // compromise of the same mailbox they would file a fresh signal as noise on the strength of a
  // months-old answer. They are shown as history instead.
  const { current: liveTriage, stale: staleTriage } = partitionDeterminations(triage, becData)
  const signals = buildSignals(becData, userData)
  const verdict = buildVerdict(signals, liveTriage)
  const timeline = buildTimeline(becData)
  const outOfWindow = timeline.context || []
  const signInGroups = groupSignInsByIp(becData?.SuspectUserSignIns || [])
  const mail = classifySentMessages(becData, userData)
  const exposure = buildExposure(becData, signals, liveTriage, userData)
  const iocs = buildIocs(becData, userData)

  const determinations = new Map(
    psitAsArray(liveTriage).map((entry) => [String(entry?.SignalId), entry])
  )
  const established = signals.filter((signal) => signal.class === SIGNAL_CLASS.ESTABLISHED)
  const qualified = signals.filter((signal) => signal.class === SIGNAL_CLASS.TO_QUALIFY)
  const retained = [
    ...established,
    ...qualified.filter((signal) => determinations.get(signal.id)?.Verdict === 'unexpected'),
  ]
  const setAside = [
    ...qualified.filter((signal) => determinations.get(signal.id)?.Verdict === 'expected'),
    ...signals.filter((signal) => signal.class === SIGNAL_CLASS.NOISE),
  ]
  const openQuestions = verdict.openQuestions
  const foreignSuccessSessions = signInGroups.filter(
    (group) => group.foreign && group.successes > 0
  )

  const analysis = becData?.SentMessageAnalysis || {}
  const recentMfa = (becData?.MFADevices || []).filter((method) => {
    if (!method?.createdDateTime) return false
    const created = new Date(method.createdDateTime)
    if (Number.isNaN(created.getTime())) return false
    return `${created.toISOString().slice(0, 19)}Z` >= window.startUtc
  })
  const suspectPasswordChange = (becData?.ChangedPasswords || []).filter(
    (user) => user?.userPrincipalName === userData?.userPrincipalName
  )
  const otherPasswordChanges =
    (becData?.ChangedPasswords || []).length - suspectPasswordChange.length
  const safelistChanges = becData?.SafelistChanges || []
  const senderListEntries =
    (becData?.TrustedSenders || []).length + (becData?.BlockedSenders || []).length

  // Annexe A used to be eleven sections, most of them a green box saying nothing was found: two
  // pages of negations in front of the reader. The eleven checks are still all reported - proof of
  // coverage is the point of the annex - but as one table, with a detail block only for the checks
  // that returned something.
  const ruleCount = (becData?.NewRules || []).length
  const ruleChangeCount = (becData?.InboxRuleChanges || []).length
  const newUserCount = (becData?.NewUsers || []).length
  const maliciousAppCount = (becData?.MaliciousSPs || []).length
  const addedAppCount = (becData?.AddedApps || []).length
  const permissionChangeCount = (becData?.MailboxPermissionChanges || []).length
  const mfaCount = (becData?.MFADevices || []).length
  const intuneCount = (becData?.IntuneDevices || []).length
  const sharingCount = (becData?.SharingChanges || []).length
  const signInSuccesses = signInGroups.reduce((total, group) => total + group.successes, 0)
  const signInFailures = signInGroups.reduce((total, group) => total + group.failures, 0)

  const detail = {
    rules: ruleCount > 0 || ruleChangeCount > 0,
    newUsers: newUserCount > 0,
    apps: maliciousAppCount > 0 || addedAppCount > 0,
    permissions: permissionChangeCount > 0,
    outbound: mail.counts.collected > 0,
    // Zero registered methods is a finding, not an absence: it gets its own block either way.
    mfa: true,
    passwords: suspectPasswordChange.length > 0,
    safelist: safelistChanges.length > 0,
    intune: intuneCount > 0 || Boolean(becData?.IntuneDevicesError),
    signIns: signInGroups.length > 0,
    sharing: sharingCount > 0,
  }

  const coverage = [
    {
      control: '1. Règles de boîte de réception',
      result:
        ruleCount === 0 && ruleChangeCount === 0
          ? 'Aucune règle, aucune modification dans la fenêtre'
          : `${plural(ruleCount, 'règle présente', 'règles présentes')}, ${ruleChangeCount} modification(s) dans la fenêtre`,
      attention: ruleCount > 0 || ruleChangeCount > 0,
    },
    {
      control: '2. Comptes créés dans le tenant',
      result: newUserCount === 0 ? 'Aucun' : plural(newUserCount, 'compte créé', 'comptes créés'),
      attention: newUserCount > 0,
    },
    {
      control: '3. Applications',
      result:
        maliciousAppCount === 0 && addedAppCount === 0
          ? 'Aucune ajoutée, aucune du catalogue malveillant'
          : `${addedAppCount} ajoutée(s), ${maliciousAppCount} du catalogue malveillant`,
      attention: maliciousAppCount > 0 || addedAppCount > 0,
    },
    {
      control: '4. Permissions de boîte',
      result:
        permissionChangeCount === 0
          ? 'Aucune modification'
          : `${permissionChangeCount} modification(s)`,
      attention: permissionChangeCount > 0,
    },
    {
      control: '5. Courrier sortant',
      result: `${mail.counts.collected} ligne(s) de suivi, dont ${mail.counts.humanExternal} vers l'extérieur`,
      attention: mail.foreignHumanExternal.length > 0,
    },
    {
      control: "6. Méthodes d'authentification",
      result:
        mfaCount === 0
          ? 'Aucune méthode enregistrée'
          : `${plural(mfaCount, 'méthode', 'méthodes')}${recentMfa.length > 0 ? `, dont ${recentMfa.length} dans la fenêtre` : ''}`,
      attention: mfaCount === 0 || recentMfa.length > 0,
    },
    {
      control: '7. Mot de passe du compte',
      result:
        suspectPasswordChange.length > 0
          ? `Changé le ${formatUtc(suspectPasswordChange[0]?.lastPasswordChangeDateTime)}`
          : `Aucun changement dans la fenêtre (${otherPasswordChanges} sur d'autres comptes)`,
      attention: suspectPasswordChange.length > 0,
    },
    {
      control: '8. Expéditeurs approuvés et bloqués',
      result: `${senderListEntries} entrée(s), ${safelistChanges.length} modification(s) dans la fenêtre`,
      attention: safelistChanges.length > 0,
    },
    {
      control: '9. Appareils Intune',
      result: becData?.IntuneDevicesError
        ? 'Non récupérables'
        : intuneCount === 0
          ? 'Aucun appareil géré'
          : plural(intuneCount, 'appareil géré', 'appareils gérés'),
      attention: Boolean(becData?.IntuneDevicesError),
    },
    {
      control: '10. Connexions par adresse source',
      result:
        signInGroups.length === 0
          ? 'Aucune connexion retournée par la collecte'
          : `${signInSuccesses} réussie(s) depuis ${signInGroups.filter((group) => group.successes > 0).length} adresse(s), ${signInFailures} échec(s)`,
      attention: foreignSuccessSessions.length > 0,
    },
    {
      control: '11. Liens de partage',
      result: sharingCount === 0 ? 'Aucun créé ni modifié' : `${sharingCount} modification(s)`,
      attention: sharingCount > 0,
    },
  ]
  const hasAnyDetail = Object.values(detail).some(Boolean)

  const qualificationOf = (signalId) => {
    const determination = determinations.get(signalId)
    if (!determination) return 'non qualifié'
    return `${VERDICT_WORDS[determination.Verdict] || determination.Verdict} — ${
      determination.Analyst || 'N/D'
    }, ${formatUtc(determination.DecidedUtc)}`
  }

  return (
    <ReportDocument
      brandingSettings={brandingSettings}
      tenantName={tenantName}
      reportName="Rapport d'investigation"
      generatedOn={currentDate}
      variables={variables}
      coverLabel="RAPPORT D'INVESTIGATION"
      coverTitle="Investigation"
      coverAccent="Messagerie"
      coverSubtitle={`Recherche d'indices de compromission sur une boîte de messagerie — ${
        tenantName || 'votre organisation'
      }`}
      coverTenant={userData?.displayName || 'Utilisateur inconnu'}
      coverFallbackImage="/reportImages/soc.jpg"
      coverFooterNote="Confidentiel - Usage interne uniquement"
      footerLabel={`${tenantName} - Investigation ${userData?.displayName}${
        incident?.AutotaskTicket ? ` - ticket ${incident.AutotaskTicket}` : ''
      }`}
      coverMeta={
        <CoverMeta
          lines={[userData?.userPrincipalName || 'utilisateur@domaine.fr']}
          note={`Collecte du ${formatDate(becData?.ExtractedAt)}${
            incident?.AutotaskTicket ? ` — Ticket ${incident.AutotaskTicket}` : ''
          }${incident?.Reference ? ` — Incident ${incident.Reference}` : ''}`}
        />
      }
    >
      {/* 1. DÉCISION */}
      <ContentPage title="Décision" subtitle="Ce que l'investigation retient, et sur quelle base">
        <Section title="Dossier">
          <InfoBox title="Références">
            Ticket Autotask : {incident?.AutotaskTicket || 'non renseigné'}
            {'\n'}
            Rapport d'incident associé :{' '}
            {incident?.Reference
              ? `${incident.Reference} (${
                  INCIDENT_STATUS_LABELS[incident?.Status] || 'statut à préciser'
                })`
              : 'aucun à ce stade'}
            {'\n'}
            Compte analysé : {userData?.userPrincipalName}
            {'\n'}
            Organisation : {tenantName}
            {'\n'}
            Fenêtre analysée : du {formatUtc(window.startUtc)} au {formatUtc(window.endUtc)} (
            {window.days} jours)
            {'\n'}
            Pays d'utilisation déclaré :{' '}
            {becData?.LocationAnalysis?.UsageLocation || 'non renseigné'}
          </InfoBox>
        </Section>

        <Section title="Vue d'ensemble">
          {/* Les chiffres mis en avant sont ceux qui portent une décision. Un compteur de règles ou
              de « connexions étrangères » mélangeant succès et échecs n'en porte aucune. */}
          <StatRow
            stats={[
              { value: retained.length, label: 'Faits retenus' },
              { value: openQuestions.length, label: 'Questions ouvertes' },
              {
                value: foreignSuccessSessions.reduce((total, group) => total + group.successes, 0),
                label: 'Connexions réussies hors zone',
              },
              { value: mail.counts.humanExternal, label: 'Messages externes envoyés' },
            ]}
          />
        </Section>

        {/* Compact: the decision page carries the verdict and the open questions, not a second
            copy of the evidence. The first real PDF printed the established facts here and again
            on page 8, and the two halves disagreed. */}
        <PsitBecAssessmentSection
          verdict={verdict}
          signals={signals}
          triage={liveTriage}
          language="fr"
          compact
        />

        {(incident?.PreviousCases || []).length > 0 && (
          <Section title="Antécédents sur cette boîte">
            <AlertBox title={`${incident.PreviousCases.length} dossier(s) antérieur(s)`}>
              {psitAsArray(incident.PreviousCases)
                .map(
                  (previous) =>
                    `• ${previous.Reference}${
                      previous.AutotaskTicket ? ` — ticket ${previous.AutotaskTicket}` : ''
                    }\n  Détection : ${
                      previous.DetectedUtc ? formatUtc(previous.DetectedUtc) : 'non renseignée'
                    } — clos le ${
                      previous.ClosedUtc ? formatUtc(previous.ClosedUtc) : 'N/D'
                    } par ${previous.ClosedBy || 'N/D'}`
                )
                .join('\n')}
            </AlertBox>
            <Paragraph>
              Une compromission répétée de la même boîte est un constat en soi : elle interroge la
              remédiation précédente, l'existence d'une persistance non couverte par cette collecte
              (voir « Couverture et limites »), et le facteur humain.
            </Paragraph>
          </Section>
        )}

        {staleTriage.length > 0 && (
          <Section title="Qualifications antérieures à la fenêtre">
            <Note>
              {staleTriage.length} qualification(s) enregistrée(s) avant le{' '}
              {formatUtc(window.startUtc)} ne sont pas appliquées à cette collecte : une réponse
              donnée sur un événement passé ne vaut pas pour un événement nouveau, même à la même
              adresse. Les signaux concernés sont de nouveau présentés comme des questions.
              {'\n'}
              {staleTriage
                .map(
                  (determination) =>
                    `• ${determination.SignalId} : ${
                      VERDICT_WORDS[determination.Verdict] || determination.Verdict
                    } — ${determination.Analyst || 'N/D'}, ${formatUtc(determination.DecidedUtc)}`
                )
                .join('\n')}
            </Note>
          </Section>
        )}

        <Section title="Suites à donner">
          {verdict.status === VERDICT_STATUS.COMPROMISED ? (
            <BulletList>
              <Bullet marker="1." label="Confiner :">
                {' '}
                réinitialiser le mot de passe, révoquer les sessions et les jetons, contrôler les
                méthodes d'authentification enregistrées.
              </Bullet>
              <Bullet marker="2." label="Vérifier les persistances :">
                {' '}
                consentements applicatifs, transfert de boîte, protocoles hérités, règles masquées —
                la liste figure en section « Couverture et limites ».
              </Bullet>
              <Bullet marker="3." label="Ouvrir le rapport d'incident :">
                {' '}
                il porte l'exposition des données au sens de l'article 33.3 du RGPD, les tiers à
                prévenir et la traçabilité du confinement.
              </Bullet>
            </BulletList>
          ) : verdict.status === VERDICT_STATUS.TO_QUALIFY ? (
            <BulletList>
              <Bullet marker="1." label="Répondre aux questions ouvertes :">
                {' '}
                sans elles, aucun niveau de risque ne peut être affirmé. Elles sont listées
                ci-dessus.
              </Bullet>
              <Bullet marker="2." label="Ne pas conclure :">
                {' '}
                ce document ne dit ni « compromis » ni « sain ». Il dit ce qui a été vu et ce qui
                reste à trancher.
              </Bullet>
            </BulletList>
          ) : (
            <BulletList>
              <Bullet marker="1." label="Clore et surveiller :">
                {' '}
                les signaux relevés ont été qualifiés comme attendus. Maintenir la surveillance du
                compte pendant 30 jours reste prudent.
              </Bullet>
              <Bullet marker="2." label="Conserver ce rapport :">
                {' '}
                il documente ce qui a été vérifié et par qui, ce qui a de la valeur si un doute
                réapparaît.
              </Bullet>
            </BulletList>
          )}
        </Section>
      </ContentPage>

      {/* 2. CHRONOLOGIE */}
      <ContentPage
        title="Chronologie"
        subtitle={`Fenêtre du ${formatUtc(window.startUtc)} au ${formatUtc(window.endUtc)}, en UTC`}
      >
        <Section>
          <Paragraph>
            Les sources n'utilisent pas la même base de temps : Entra ID date les connexions, le
            suivi des messages date le courrier, le journal d'audit date les modifications. Tout est
            ramené en UTC pour qu'une concomitance soit visible. Les connexions réussies
            consécutives depuis une même adresse sont regroupées en session : sept requêtes en cinq
            minutes sont une session, pas sept événements.
          </Paragraph>
        </Section>

        <Section title="Événements">
          {timeline.length > 0 ? (
            <>
              {timeline.slice(0, 30).map((event, index) => (
                <InfoBox key={`tl-${index}`} title={`${event.timestampUtc} — ${event.label}`}>
                  {event.detail || ' '}
                </InfoBox>
              ))}
              {timeline.length > 30 && (
                <Note>... et {timeline.length - 30} autres événements (export JSON)</Note>
              )}
            </>
          ) : (
            <ClearBox title="Aucun événement daté dans la fenêtre">
              Aucune connexion réussie, modification de configuration ni rafale d'envoi n'a été
              datée sur la fenêtre analysée.
            </ClearBox>
          )}
        </Section>

        {outOfWindow.length > 0 && (
          <Section title="Hors fenêtre, pour contexte">
            <Paragraph>
              Ces éléments sont antérieurs à la fenêtre analysée. Ils ne font pas partie de
              l'incident et ne peuvent pas être lus comme un premier accès.
            </Paragraph>
            <InfoBox title={plural(outOfWindow.length, 'élément antérieur', 'éléments antérieurs')}>
              {outOfWindow
                .slice(0, 12)
                .map((event) => `${event.timestampUtc} — ${event.label}`)
                .join('\n')}
            </InfoBox>
          </Section>
        )}
      </ContentPage>

      {/* 3. FAITS ET SIGNAUX */}
      <ContentPage title="Faits et signaux" subtitle="Un bloc par signal, avec sa preuve">
        <Section title={`Retenus (${retained.length})`}>
          {retained.length > 0 ? (
            retained.map((signal) => (
              <InfoBox key={signal.id} title={signal.title}>
                {signal.detail}
                {'\n'}
                Qualification :{' '}
                {signal.class === SIGNAL_CLASS.ESTABLISHED
                  ? 'établie par la donnée, aucune qualification requise'
                  : qualificationOf(signal.id)}
                {determinations.get(signal.id)?.Justification &&
                  `\n${determinations.get(signal.id).Justification}`}
                {'\n'}
                Source : {(signal.evidence || []).join(', ') || 'collecte BEC'}
              </InfoBox>
            ))
          ) : (
            <ClearBox title="Aucun fait retenu">
              Aucun signal n'est établi par la donnée seule, et aucun n'a été qualifié comme
              inattendu par l'analyste.
            </ClearBox>
          )}
        </Section>

        {openQuestions.length > 0 && (
          <Section title={`À qualifier (${openQuestions.length})`}>
            {/* The question on its own is on the decision page. Here it comes with what was
                observed, which is what an analyst needs in order to answer it. */}
            {openQuestions.map((signal) => (
              <AlertBox key={signal.id} title={signal.title}>
                {signal.detail}
                {'\n'}
                Question : {signal.question}
                {'\n'}
                Source : {(signal.evidence || []).join(', ') || 'collecte BEC'}
              </AlertBox>
            ))}
          </Section>
        )}

        <Section title={`Écartés du verdict (${setAside.length})`}>
          {setAside.length > 0 ? (
            <InfoBox title="Conservés pour audit">
              {setAside
                .map((signal) => {
                  const determination = determinations.get(signal.id)
                  const reason = determination
                    ? `qualifié ${VERDICT_WORDS[determination.Verdict]} par ${
                        determination.Analyst
                      }${determination.Justification ? ` : ${determination.Justification}` : ''}`
                    : 'écarté automatiquement'
                  return `• ${signal.title}\n  ${reason}`
                })
                .join('\n')}
            </InfoBox>
          ) : (
            <Note>Rien n'a été écarté.</Note>
          )}
        </Section>
      </ContentPage>

      {/* 4. COUVERTURE ET LIMITES */}
      <ContentPage
        title="Couverture et limites"
        subtitle="Ce qui a été regardé, ce qui ne peut pas être conclu"
      >
        <Section title="Provenance des données">
          <InfoBox title="Collecte">
            Extraction : {formatDate(becData?.ExtractedAt)}
            {'\n'}
            Journal d'audit : {becData?.ExtractResult || 'état inconnu'}
            {'\n'}
            Lignes de suivi des messages collectées : {mail.counts.collected} sur{' '}
            {mail.counts.totalRecipients} destinataires signalés par le service
            {'\n'}
            Connexions analysées : {(becData?.SuspectUserSignIns || []).length} (les plus récentes)
            {mail.derivedLocally &&
              '\nClassification du courrier (interne, automatique, infrastructure Microsoft) calculée à la génération du rapport : la collecte est antérieure à sa mise en place côté API.'}
          </InfoBox>
          {becData?.SuspectUserSignInsError && (
            <AlertBox title="Journaux de connexion incomplets">
              {becData.SuspectUserSignInsError}
            </AlertBox>
          )}
          {becData?.SafelistError && (
            <AlertBox title="Listes d'expéditeurs non récupérables">
              {becData.SafelistError}
            </AlertBox>
          )}
        </Section>

        <Section title="Ne peut être ni confirmé ni écarté">
          <Paragraph>
            La collecte interroge un ensemble de sources défini. Les éléments suivants n'en font pas
            partie : leur absence dans ce rapport ne vaut pas absence de fait.
          </Paragraph>
          <BulletList>
            {exposure.notCovered.map((item, index) => (
              <Bullet key={`nc-${index}`}>{item}</Bullet>
            ))}
          </BulletList>
        </Section>

        <Section title="Conservation et conformité">
          <Paragraph>
            Ce rapport documente une investigation de réponse à incident. Il contribue aux exigences
            de détection, d'analyse et de documentation des incidents des référentiels ISO 27001
            (A.16.1), SOC 2 (CC7.3, CC7.4) et NIST CSF (fonctions Detect et Respond), ainsi qu'aux
            articles 32 et 33 du RGPD s'agissant d'une éventuelle violation de données à caractère
            personnel — dont l'appréciation relève du responsable de traitement. Il doit être
            conservé selon la politique documentaire de l'organisation, à accès restreint.
          </Paragraph>
        </Section>
      </ContentPage>

      {/* ANNEXE A — COUVERTURE PUIS DÉTAIL */}
      <ContentPage
        title="Annexe A — couverture des vérifications"
        subtitle="Les onze contrôles de la collecte et leur résultat"
      >
        <Section>
          <Paragraph>
            La collecte exécute onze contrôles, tous listés ci-dessous qu'ils aient ou non retourné
            quelque chose : c'est ce tableau qui atteste de l'étendue de l'analyse. Les contrôles
            qui ont retourné des éléments sont détaillés ensuite ; les autres n'ont rien à montrer
            de plus que cette ligne.
          </Paragraph>
        </Section>

        <Section title="Résultats">
          <DataTable
            columns={[
              { header: 'Contrôle', key: 'control', width: 2, bold: true },
              {
                header: 'Résultat',
                key: 'result',
                width: 3,
                colour: (row) => (row.attention ? '#9B2C2C' : undefined),
              },
            ]}
            rows={coverage}
            limit={11}
          />
        </Section>

        {senderListEntries > 0 && safelistChanges.length === 0 && (
          /* Les listes complètes ne sont pas reproduites : données personnelles de tiers, sans
             valeur d'enquête en l'absence de modification dans la fenêtre. */
          <Note>
            Les {senderListEntries} entrées des listes d'expéditeurs ne sont pas reproduites ici :
            aucune n'a été modifiée pendant la fenêtre, et il s'agit de données personnelles de
            tiers. Elles figurent dans l'export JSON.
          </Note>
        )}
      </ContentPage>

      {hasAnyDetail && (
        <ContentPage
          title="Annexe A — détail des contrôles"
          subtitle="Uniquement les contrôles qui ont retourné des éléments"
        >
          {detail.rules && (
            <Section title="1. Règles de boîte de réception">
              {psitAsArray(becData?.NewRules).map((rule, index) => {
                const signal = signals.find((item) => item.id.endsWith(`:${rule?.Name}`))
                return (
                  <InfoBox key={`rule-${index}`} title={rule?.Name || 'Règle sans nom'}>
                    {rule?.MoveToFolder ? `Déplace vers : ${rule.MoveToFolder}\n` : ''}
                    {rule?.ForwardTo ? `Transfère vers : ${rule.ForwardTo}\n` : ''}
                    {rule?.DeleteMessage ? 'Supprime les messages\n' : ''}
                    {rule?.RecentlyChanged ? 'Créée ou modifiée pendant la fenêtre\n' : ''}
                    Qualification : {signal ? qualificationOf(signal.id) : 'non évaluée'}
                  </InfoBox>
                )
              })}
              {ruleChangeCount > 0 && (
                <InfoBox
                  title={plural(
                    ruleChangeCount,
                    'modification de règle dans la fenêtre',
                    'modifications de règles dans la fenêtre'
                  )}
                >
                  {psitAsArray(becData?.InboxRuleChanges)
                    .slice(0, 8)
                    .map(
                      (change) =>
                        `${formatUtc(change?.Date)} — ${change?.Operation} « ${
                          change?.RuleName || 'sans nom'
                        } » depuis ${change?.ClientIP || 'IP inconnue'}${
                          change?.Country ? ` (${change.Country})` : ''
                        }`
                    )
                    .join('\n')}
                </InfoBox>
              )}
            </Section>
          )}

          {detail.newUsers && (
            <Section title="2. Comptes créés récemment">
              <InfoBox title={plural(newUserCount, 'compte créé', 'comptes créés')}>
                {psitAsArray(becData?.NewUsers)
                  .slice(0, 10)
                  .map((user) => `${user?.userPrincipalName} — ${formatUtc(user?.createdDateTime)}`)
                  .join('\n')}
              </InfoBox>
            </Section>
          )}

          {detail.apps && (
            <Section title="3. Applications">
              {maliciousAppCount > 0 && (
                <AlertBox
                  title={plural(
                    maliciousAppCount,
                    'application du catalogue malveillant présente',
                    'applications du catalogue malveillant présentes'
                  )}
                >
                  {psitAsArray(becData?.MaliciousSPs)
                    .slice(0, 8)
                    .map(
                      (app) =>
                        `${app?.displayName} (${app?.appId}) — ${app?.CatalogName || 'catalogue'}`
                    )
                    .join('\n')}
                </AlertBox>
              )}
              {addedAppCount > 0 && (
                <InfoBox
                  title={plural(
                    addedAppCount,
                    'application ajoutée dans la fenêtre',
                    'applications ajoutées dans la fenêtre'
                  )}
                >
                  {psitAsArray(becData?.AddedApps)
                    .slice(0, 8)
                    .map(
                      (app) =>
                        `${app?.displayName || app?.appDisplayName} — ${formatUtc(
                          app?.createdDateTime
                        )}${app?.MaliciousMatch ? ' — correspond au catalogue malveillant' : ''}`
                    )
                    .join('\n')}
                </InfoBox>
              )}
            </Section>
          )}

          {detail.permissions && (
            <Section title="4. Permissions de boîte">
              <InfoBox
                title={plural(
                  permissionChangeCount,
                  'modification de permission',
                  'modifications de permissions'
                )}
              >
                {psitAsArray(becData?.MailboxPermissionChanges)
                  .slice(0, 8)
                  .map(
                    (change) =>
                      `${change?.Operation} par ${change?.UserKey || 'inconnu'} sur ${
                        change?.ObjectId || 'N/D'
                      }${change?.TargetsSuspect === true ? ' — concerne cette boîte' : ''}`
                  )
                  .join('\n')}
              </InfoBox>
            </Section>
          )}

          {detail.outbound && (
            <Section title="5. Courrier sortant">
              <InfoBox title="Volumes">
                Lignes de suivi collectées : {mail.counts.collected}
                {'\n'}
                Dont destinataires externes, envoyés par l'utilisateur : {mail.counts.humanExternal}
                {'\n'}
                Dont générés par le service (réponses automatiques, non-remises) :{' '}
                {mail.counts.systemGenerated}
                {'\n'}
                Dont destinataires internes : {mail.counts.internal}
                {'\n'}
                Envoyés depuis une adresse hors zone, hors service :{' '}
                {mail.foreignHumanExternal.length}
              </InfoBox>
              {psitAsArray(analysis?.Bursts).length > 0 && (
                <InfoBox
                  title={plural(
                    psitAsArray(analysis?.Bursts).length,
                    "rafale d'envoi",
                    "rafales d'envoi"
                  )}
                >
                  {psitAsArray(analysis?.Bursts)
                    .slice(0, 5)
                    .map(
                      (burst) =>
                        `${formatUtc(burst?.WindowStart)} — ${burst?.MessageCount} message(s) vers ${
                          burst?.RecipientCount
                        } destinataire(s) : ${burst?.TopSubject || 'objet inconnu'}`
                    )
                    .join('\n')}
                </InfoBox>
              )}
              {mail.humanExternal.length > 0 && (
                <InfoBox title="Échantillon de courrier externe">
                  {mail.humanExternal
                    .slice(0, 8)
                    .map(
                      (message) =>
                        `${formatUtc(message?.Received)} — ${message?.RecipientAddress} — ${
                          message?.Subject || '(sans objet)'
                        } — depuis ${message?.FromIP || 'IP inconnue'}${
                          message?.Country ? ` (${message.Country})` : ''
                        }`
                    )
                    .join('\n')}
                </InfoBox>
              )}
            </Section>
          )}

          <Section title="6. Méthodes d'authentification">
            {mfaCount > 0 ? (
              <InfoBox
                title={`${plural(mfaCount, 'méthode enregistrée', 'méthodes enregistrées')}${
                  recentMfa.length > 0 ? `, dont ${recentMfa.length} dans la fenêtre` : ''
                }`}
              >
                {psitAsArray(becData?.MFADevices)
                  .map(
                    (method) =>
                      `${String(method?.['@odata.type'] || 'inconnue')
                        .replace('#microsoft.graph.', '')
                        .replace('AuthenticationMethod', '')} — ${
                        method?.displayName || 'sans nom'
                      } — ${
                        method?.createdDateTime
                          ? formatUtc(method.createdDateTime)
                          : 'date non exposée'
                      }`
                  )
                  .join('\n')}
              </InfoBox>
            ) : (
              <AlertBox title="Aucune méthode d'authentification multifacteur">
                Aucune méthode n'est enregistrée sur ce compte.
              </AlertBox>
            )}
          </Section>

          {detail.passwords && (
            <Section title="7. Mot de passe du compte">
              <InfoBox title="Changement pendant la fenêtre">
                Sur le compte analysé :{' '}
                {formatUtc(suspectPasswordChange[0]?.lastPasswordChangeDateTime)}
                {'\n'}
                Sur d'autres comptes du tenant : {otherPasswordChanges} — activité du tenant, sans
                lien établi avec cette boîte
              </InfoBox>
            </Section>
          )}

          {detail.safelist && (
            <Section title="8. Expéditeurs approuvés et bloqués">
              <InfoBox title="Modifications dans la fenêtre">
                {safelistChanges
                  .slice(0, 8)
                  .map(
                    (change) =>
                      `${formatUtc(change?.Date)} — par ${change?.UserKey || 'inconnu'} depuis ${
                        change?.ClientIP || 'IP inconnue'
                      }${change?.Country ? ` (${change.Country})` : ''}`
                  )
                  .join('\n')}
              </InfoBox>
            </Section>
          )}

          {detail.intune && (
            <Section title="9. Appareils Intune">
              {becData?.IntuneDevicesError ? (
                <AlertBox title="Appareils non récupérables">{becData.IntuneDevicesError}</AlertBox>
              ) : (
                <InfoBox title={plural(intuneCount, 'appareil géré', 'appareils gérés')}>
                  {psitAsArray(becData?.IntuneDevices)
                    .slice(0, 8)
                    .map(
                      (device) =>
                        `${device?.deviceName} — ${
                          device?.operatingSystem || 'OS inconnu'
                        } — inscrit le ${formatUtc(device?.enrolledDateTime)} — conformité : ${
                          device?.complianceState || 'N/D'
                        }`
                    )
                    .join('\n')}
                </InfoBox>
              )}
            </Section>
          )}

          {detail.signIns && (
            <Section title="10. Connexions par adresse source">
              {signInGroups
                .filter((group) => group.successes > 0)
                .slice(0, 8)
                .map((group) => (
                  <InfoBox
                    key={`grp-${group.ip}`}
                    title={`${plural(
                      group.successes,
                      'connexion réussie',
                      'connexions réussies'
                    )} — ${group.ip}${group.country ? ` (${group.country})` : ''}${
                      group.foreign ? ' — hors zone' : ''
                    }`}
                  >
                    {group.cities.join(', ') || 'ville inconnue'}
                    {'\n'}
                    Du {formatUtc(group.firstSeenUtc)} au {formatUtc(group.lastSeenUtc)}
                    {'\n'}
                    Applications : {group.apps.slice(0, 5).join(', ') || 'N/D'}
                    {group.failures > 0
                      ? `\nÉchecs depuis la même adresse : ${group.failures}`
                      : ''}
                  </InfoBox>
                ))}
              {signInGroups.filter((group) => group.successes === 0).length > 0 && (
                <Note>
                  {signInGroups
                    .filter((group) => group.successes === 0)
                    .reduce((total, group) => total + group.failures, 0)}{' '}
                  tentative(s) en échec depuis{' '}
                  {signInGroups.filter((group) => group.successes === 0).length} autre(s) adresse(s)
                  : pulvérisation de mots de passe, aucune n'a abouti.
                </Note>
              )}
            </Section>
          )}

          {detail.sharing && (
            <Section title="11. Liens de partage">
              <InfoBox
                title={plural(sharingCount, 'modification de partage', 'modifications de partages')}
              >
                {psitAsArray(becData?.SharingChanges)
                  .slice(0, 8)
                  .map(
                    (change) =>
                      `${formatUtc(change?.Date)} — ${change?.Operation} — ${
                        change?.FileName || change?.ItemUrl || 'élément inconnu'
                      }${change?.Target ? ` — partagé avec ${change.Target}` : ''}`
                  )
                  .join('\n')}
              </InfoBox>
            </Section>
          )}
        </ContentPage>
      )}

      {/* ANNEXE C — INDICATEURS */}
      {iocs.total > 0 && (
        <ContentPage
          title="Annexe C — indicateurs observés"
          subtitle="Éléments techniques réutilisables, avec leur origine"
        >
          <Section>
            <Paragraph>
              Ces éléments ont été observés pendant la fenêtre analysée. Ils sont regroupés ici pour
              pouvoir être repris ailleurs : blocage, recherche sur d'autres boîtes, transmission à
              un tiers.{' '}
              <Bold>
                Leur présence n'est pas un verdict : une adresse figure ici parce qu'elle a été vue,
                pas parce qu'elle est malveillante.
              </Bold>{' '}
              Les adresses d'infrastructure Microsoft sont exclues : les bloquer bloquerait le
              courrier de l'organisation.
            </Paragraph>
          </Section>

          <Section title="Adresses et destinataires">
            <DataTable
              columns={[
                { header: 'Indicateur', key: 'value', width: 2, bold: true },
                { header: 'Ce qui a été observé', key: 'detail', width: 3 },
                { header: 'Source', key: 'basis', width: 2 },
              ]}
              rows={[...iocs.signInIps, ...iocs.sendingIps, ...iocs.forwardTargets]}
              limit={30}
              emptyText="Aucune adresse à signaler."
            />
          </Section>

          {(iocs.ruleNames.length > 0 || iocs.apps.length > 0 || iocs.subjects.length > 0) && (
            <Section title="Règles, applications et objets">
              <DataTable
                columns={[
                  { header: 'Indicateur', key: 'value', width: 2, bold: true },
                  { header: 'Ce qui a été observé', key: 'detail', width: 3 },
                  { header: 'Source', key: 'basis', width: 2 },
                ]}
                rows={[...iocs.ruleNames, ...iocs.apps, ...iocs.subjects]}
                limit={30}
                emptyText="Rien à signaler."
              />
            </Section>
          )}
        </ContentPage>
      )}

      {/* ANNEXE B — COMPRENDRE LE BEC */}
      <ContentPage
        title="Annexe B — comprendre la compromission de messagerie"
        subtitle="Pour le lecteur non technique"
      >
        <Section>
          <Paragraph>
            La compromission de messagerie professionnelle (BEC) est une cyberattaque au cours de
            laquelle des criminels obtiennent un accès non autorisé à une boîte de messagerie
            d'entreprise. Une fois à l'intérieur, ils surveillent les échanges pour comprendre les
            processus financiers, usurpent l'identité de dirigeants ou de fournisseurs, détournent
            des paiements en modifiant des coordonnées bancaires, et créent des règles de messagerie
            pour que la victime ne voie pas les réponses.
          </Paragraph>
          <Paragraph>
            L'accès initial vient presque toujours de l'un de ces chemins : hameçonnage
            d'identifiants sur un faux site, pulvérisation de mots de passe courants, réutilisation
            d'identifiants divulgués ailleurs, ou logiciel malveillant sur un poste. Une fois
            l'accès obtenu, l'attaquant cherche à le rendre durable : méthode d'authentification
            ajoutée, consentement applicatif, transfert automatique, règle masquée — autant de
            portes qui survivent à une simple réinitialisation de mot de passe, et c'est pourquoi ce
            rapport les traite séparément.
          </Paragraph>
        </Section>

        <Section title="Ce que ce rapport prouve, et ce qu'il ne prouve pas">
          <BulletList>
            <Bullet label="Il prouve :">
              {' '}
              ce que les journaux Microsoft ont enregistré sur la fenêtre analysée, avec l'origine
              de chaque affirmation.
            </Bullet>
            <Bullet label="Il ne prouve pas :">
              {' '}
              qu'un message a été lu — cela suppose un niveau d'audit supérieur —, ni l'absence de
              ce que la collecte ne regarde pas, listé en section « Couverture et limites ».
            </Bullet>
            <Bullet label="Il ne décide pas :">
              {' '}
              la qualification juridique d'une violation de données et la décision de notifier
              appartiennent au responsable de traitement.
            </Bullet>
          </BulletList>
        </Section>
      </ContentPage>
    </ReportDocument>
  )
}

export const PsitBecReportFrButton = ({ userData, becData, tenantName, triage }) => {
  const [dialogOpen, setDialogOpen] = useState(false)

  const hasData = userData && becData && !becData.Waiting

  const brandingSettings = useBrandingSettings()
  const variables = useReportVariables()

  // Fetched here rather than in the document: react-pdf renders through its own reconciler,
  // outside the React tree, where there is no query client. React Query dedupes both keys with the
  // panels on the page.
  const triageRequest = ApiGetCall({
    url: `/api/PSITListBecTriage?tenantFilter=${tenantName}&userId=${userData?.id}`,
    queryKey: `PSITBecTriage-${tenantName}-${userData?.id}`,
    waiting: Boolean(hasData && tenantName && userData?.id && !triage),
  })
  const caseRequest = ApiGetCall({
    url: `/api/PSITListBecIncident?tenantFilter=${tenantName}&userId=${userData?.id}&userPrincipalName=${userData?.userPrincipalName}`,
    queryKey: `PSITBecIncident-${tenantName}-${userData?.id}`,
    waiting: Boolean(hasData && tenantName && userData?.id),
  })
  const resolvedTriage = psitAsArray(triage ?? triageRequest.data?.Determinations)
  const incident = caseRequest.data?.Incident || {}

  if (!hasData) {
    return null
  }

  // Same guard as the incident report: a cached failure looks like an empty collection, and an
  // investigation report built on one would state "aucune règle, aucune connexion" as findings.
  const collection = getCollectionStatus(becData)
  if (collection.blocksReport) {
    return (
      <Tooltip title="Rapport FR indisponible : la collecte doit être relancée avant de produire un document">
        <span>
          <Button variant="contained" startIcon={<PictureAsPdf />} disabled>
            Rapport FR
          </Button>
        </span>
      </Tooltip>
    )
  }

  const openQuestions = buildVerdict(buildSignals(becData, userData), resolvedTriage).openQuestions
    .length

  const documentNode = (
    <PsitBecReportFrDocument
      userData={userData}
      becData={becData}
      brandingSettings={brandingSettings}
      tenantName={tenantName}
      variables={variables}
      triage={resolvedTriage}
      incident={incident}
    />
  )

  return (
    <>
      {/* The tooltip title becomes the button's accessible name, so it has to start with the
          visible label: an accessible name that does not contain the visible text breaks
          WCAG 2.5.3 (Label in Name) and voice control. */}
      <Tooltip title="Rapport FR : générer le rapport d'investigation en français">
        <Button
          variant="contained"
          startIcon={<PictureAsPdf />}
          onClick={() => setDialogOpen(true)}
          color="primary"
        >
          Rapport FR
        </Button>
      </Tooltip>

      <Dialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        maxWidth="lg"
        fullWidth
        PaperProps={{
          sx: {
            height: '90vh',
          },
        }}
      >
        <DialogTitle>
          <Box display="flex" justifyContent="space-between" alignItems="center">
            <Box>
              <Typography variant="h6" component="div">
                Aperçu du rapport d'investigation
              </Typography>
              {/* Avertit sans bloquer : un rapport « à qualifier » assumé vaut mieux qu'un niveau
                  de risque que personne ne peut défendre. */}
              {openQuestions > 0 && (
                <Typography variant="body2" color="warning.main">
                  {openQuestions} question(s) sans réponse : le rapport ne conclura pas sur un
                  niveau de risque. Qualifiez-les dans le panneau « Qualification avant diffusion ».
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
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Fermer</Button>
          <PDFDownloadLink
            document={documentNode}
            fileName={`Investigation_BEC_${userData?.userPrincipalName}_${
              new Date().toISOString().split('T')[0]
            }.pdf`}
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
