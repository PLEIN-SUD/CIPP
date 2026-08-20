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
} from '../../utils/psit-bec-signals'
import { INCIDENT_STATUS_LABELS, buildExposure } from '../../utils/psit-bec-incident'
import {
  AlertBox,
  Bullet,
  BulletList,
  ClearBox,
  ContentPage,
  CoverMeta,
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
  const signals = buildSignals(becData, userData)
  const verdict = buildVerdict(signals, triage)
  const timeline = buildTimeline(becData)
  const outOfWindow = timeline.context || []
  const signInGroups = groupSignInsByIp(becData?.SuspectUserSignIns || [])
  const mail = classifySentMessages(becData, userData)
  const exposure = buildExposure(becData, signals, triage, userData)

  const determinations = new Map((triage || []).map((entry) => [String(entry?.SignalId), entry]))
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

        <PsitBecAssessmentSection
          verdict={verdict}
          signals={signals}
          triage={triage}
          language="fr"
        />

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
          <Section title={`Questions ouvertes (${openQuestions.length})`}>
            <AlertBox title="Le verdict dépend de ces réponses">
              {openQuestions.map((signal) => `• ${signal.question}`).join('\n')}
            </AlertBox>
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

      {/* ANNEXE A — LES ONZE VÉRIFICATIONS */}
      <ContentPage
        title="Annexe A — vérifications"
        subtitle="Les onze contrôles de la collecte, dans leur état brut"
      >
        <Section title="1. Règles de boîte de réception">
          {(becData?.NewRules || []).length > 0 ? (
            (becData.NewRules || []).map((rule, index) => {
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
            })
          ) : (
            <ClearBox title="Aucune règle">Aucune règle de boîte n'a été trouvée.</ClearBox>
          )}
          {(becData?.InboxRuleChanges || []).length > 0 && (
            <InfoBox
              title={plural(
                becData.InboxRuleChanges.length,
                'modification de règle dans la fenêtre',
                'modifications de règles dans la fenêtre'
              )}
            >
              {becData.InboxRuleChanges.slice(0, 8)
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

        <Section title="2. Comptes créés récemment">
          {(becData?.NewUsers || []).length > 0 ? (
            <InfoBox title={plural(becData.NewUsers.length, 'compte créé', 'comptes créés')}>
              {becData.NewUsers.slice(0, 10)
                .map((user) => `${user?.userPrincipalName} — ${formatUtc(user?.createdDateTime)}`)
                .join('\n')}
            </InfoBox>
          ) : (
            <ClearBox title="Aucun compte créé">Aucun compte créé pendant la fenêtre.</ClearBox>
          )}
        </Section>

        <Section title="3. Applications">
          {(becData?.MaliciousSPs || []).length > 0 && (
            <AlertBox
              title={plural(
                becData.MaliciousSPs.length,
                'application du catalogue malveillant présente',
                'applications du catalogue malveillant présentes'
              )}
            >
              {becData.MaliciousSPs.slice(0, 8)
                .map(
                  (app) =>
                    `${app?.displayName} (${app?.appId}) — ${app?.CatalogName || 'catalogue'}`
                )
                .join('\n')}
            </AlertBox>
          )}
          {(becData?.AddedApps || []).length > 0 ? (
            <InfoBox
              title={plural(
                becData.AddedApps.length,
                'application ajoutée dans la fenêtre',
                'applications ajoutées dans la fenêtre'
              )}
            >
              {becData.AddedApps.slice(0, 8)
                .map(
                  (app) =>
                    `${app?.displayName || app?.appDisplayName} — ${formatUtc(
                      app?.createdDateTime
                    )}${app?.MaliciousMatch ? ' — correspond au catalogue malveillant' : ''}`
                )
                .join('\n')}
            </InfoBox>
          ) : (
            (becData?.MaliciousSPs || []).length === 0 && (
              <ClearBox title="Aucune application">
                Aucune application ajoutée pendant la fenêtre, aucune application malveillante
                connue présente dans le tenant.
              </ClearBox>
            )
          )}
        </Section>

        <Section title="4. Permissions de boîte">
          {(becData?.MailboxPermissionChanges || []).length > 0 ? (
            <InfoBox
              title={plural(
                becData.MailboxPermissionChanges.length,
                'modification de permission',
                'modifications de permissions'
              )}
            >
              {becData.MailboxPermissionChanges.slice(0, 8)
                .map(
                  (change) =>
                    `${change?.Operation} par ${change?.UserKey || 'inconnu'} sur ${
                      change?.ObjectId || 'N/D'
                    }${change?.TargetsSuspect === true ? ' — concerne cette boîte' : ''}`
                )
                .join('\n')}
            </InfoBox>
          ) : (
            <ClearBox title="Aucune modification">
              Aucune modification des permissions de boîte pendant la fenêtre.
            </ClearBox>
          )}
        </Section>

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
            Envoyés depuis une adresse hors zone, hors service : {mail.foreignHumanExternal.length}
          </InfoBox>
          {(analysis?.Bursts || []).length > 0 && (
            <InfoBox title={plural(analysis.Bursts.length, "rafale d'envoi", "rafales d'envoi")}>
              {analysis.Bursts.slice(0, 5)
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
      </ContentPage>

      <ContentPage
        title="Annexe A — vérifications (suite)"
        subtitle="Authentification, appareils, localisations, partages"
      >
        <Section title="6. Méthodes d'authentification">
          {(becData?.MFADevices || []).length > 0 ? (
            <InfoBox
              title={`${plural(
                becData.MFADevices.length,
                'méthode enregistrée',
                'méthodes enregistrées'
              )}${recentMfa.length > 0 ? `, dont ${recentMfa.length} dans la fenêtre` : ''}`}
            >
              {becData.MFADevices.map(
                (method) =>
                  `${String(method?.['@odata.type'] || 'inconnue')
                    .replace('#microsoft.graph.', '')
                    .replace('AuthenticationMethod', '')} — ${
                    method?.displayName || 'sans nom'
                  } — ${
                    method?.createdDateTime ? formatUtc(method.createdDateTime) : 'date non exposée'
                  }`
              ).join('\n')}
            </InfoBox>
          ) : (
            <AlertBox title="Aucune méthode d'authentification multifacteur">
              Aucune méthode n'est enregistrée sur ce compte.
            </AlertBox>
          )}
        </Section>

        <Section title="7. Mots de passe">
          <InfoBox title="Changements pendant la fenêtre">
            Sur le compte analysé :{' '}
            {suspectPasswordChange.length > 0
              ? formatUtc(suspectPasswordChange[0]?.lastPasswordChangeDateTime)
              : 'aucun'}
            {'\n'}
            Sur d'autres comptes du tenant : {otherPasswordChanges} — activité du tenant, sans lien
            établi avec cette boîte
          </InfoBox>
        </Section>

        <Section title="8. Expéditeurs approuvés et bloqués">
          <InfoBox title="État">
            Expéditeurs approuvés : {(becData?.TrustedSenders || []).length}
            {'\n'}
            Expéditeurs bloqués : {(becData?.BlockedSenders || []).length}
            {'\n'}
            Modifications pendant la fenêtre : {safelistChanges.length}
          </InfoBox>
          {safelistChanges.length > 0 ? (
            <InfoBox title="Modifications">
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
          ) : (
            /* Les listes complètes ne sont pas reproduites : données personnelles de tiers, sans
               valeur d'enquête en l'absence de modification dans la fenêtre. */
            <Note>
              Les {senderListEntries} entrées des listes ne sont pas reproduites ici : aucune n'a
              été modifiée pendant la fenêtre, et il s'agit de données personnelles de tiers. Elles
              figurent dans l'export JSON.
            </Note>
          )}
        </Section>

        <Section title="9. Appareils Intune">
          {becData?.IntuneDevicesError ? (
            <AlertBox title="Appareils non récupérables">{becData.IntuneDevicesError}</AlertBox>
          ) : (becData?.IntuneDevices || []).length > 0 ? (
            <InfoBox
              title={plural(becData.IntuneDevices.length, 'appareil géré', 'appareils gérés')}
            >
              {becData.IntuneDevices.slice(0, 8)
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
          ) : (
            <ClearBox title="Aucun appareil Intune">
              Aucun appareil géré n'est associé à cet utilisateur.
            </ClearBox>
          )}
        </Section>

        <Section title="10. Connexions par adresse source">
          {signInGroups.length > 0 ? (
            <>
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
            </>
          ) : (
            <Note>Aucune connexion n'a été retournée par la collecte.</Note>
          )}
        </Section>

        <Section title="11. Liens de partage">
          {(becData?.SharingChanges || []).length > 0 ? (
            <InfoBox
              title={plural(
                becData.SharingChanges.length,
                'modification de partage',
                'modifications de partages'
              )}
            >
              {becData.SharingChanges.slice(0, 8)
                .map(
                  (change) =>
                    `${formatUtc(change?.Date)} — ${change?.Operation} — ${
                      change?.FileName || change?.ItemUrl || 'élément inconnu'
                    }${change?.Target ? ` — partagé avec ${change.Target}` : ''}`
                )
                .join('\n')}
            </InfoBox>
          ) : (
            <ClearBox title="Aucun partage">
              Aucun lien de partage créé ni modifié pendant la fenêtre.
            </ClearBox>
          )}
        </Section>
      </ContentPage>

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
  const resolvedTriage = triage ?? triageRequest.data?.Determinations ?? []
  const incident = caseRequest.data?.Incident || {}

  if (!hasData) {
    return null
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
