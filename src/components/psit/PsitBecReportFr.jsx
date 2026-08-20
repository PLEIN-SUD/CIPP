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
import {
  AlertBox,
  Bold,
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

// French edition of the BEC report, for client-facing delivery.
//
// Deliberately a full parallel document rather than a translation layer over
// BECRemediationReportButton.js: the English strings there are inline JSX children, fragmented by
// interpolation ("{n} Mailbox Rule(s) Found" is several children), so a dictionary walking the
// rendered tree would have to match sentence fragments. It also keeps the upstream report
// untouched, which is what the fork rules ask for.
//
// The structure mirrors the upstream document page for page, section for section, with the same
// display limits (slice(0, 10), slice(0, 8)...). Keep it that way: when upstream changes its
// report, a side-by-side diff of the two files is the only cheap way to see what needs translating.
//
// The threat scoring below is a copy of calculateThreatLevel in
// src/components/BECRemediationReportButton.js (weights and thresholds included) so both reports
// always state the same level. It is duplicated rather than imported because upstream does not
// export it, and refactoring an upstream component to export a closure would be a wider divergence
// than this copy. If upstream ever adjusts the weights, this file has to follow - the unit test
// pins the current thresholds so the copy is at least explicit.

const plural = (count, singular, pluralForm) => `${count} ${count > 1 ? pluralForm : singular}`

export const PsitBecReportFrDocument = ({
  userData,
  becData,
  brandingSettings,
  tenantName,
  variables,
}) => {
  const currentDate = new Date().toLocaleDateString('fr-FR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  const formatDate = (dateString) => {
    if (!dateString) return 'N/D'
    try {
      return new Date(dateString).toLocaleString('fr-FR', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    } catch {
      return dateString
    }
  }

  const formatSafelistValue = (value) => {
    if (!value) return 'inchangé'
    return Array.isArray(value) ? value.join(', ') || 'inchangé' : String(value)
  }

  const stats = {
    newRules: becData?.NewRules?.length || 0,
    ruleChanges: becData?.InboxRuleChanges?.length || 0,
    newUsers: becData?.NewUsers?.length || 0,
    newApps: becData?.AddedApps?.length || 0,
    permissionChanges: becData?.MailboxPermissionChanges?.length || 0,
    permissionChangesTargetingUser: (becData?.MailboxPermissionChanges || []).filter(
      (change) => change?.TargetsSuspect === true
    ).length,
    mfaDevices: becData?.MFADevices?.length || 0,
    passwordChanges: becData?.ChangedPasswords?.length || 0,
    sentMessages: becData?.SentMessages?.length || 0,
    trustedSenders: becData?.TrustedSenders?.length || 0,
    blockedSenders: becData?.BlockedSenders?.length || 0,
    safelistChanges: becData?.SafelistChanges?.length || 0,
    sharingChanges: becData?.SharingChanges?.length || 0,
    anonymousLinks: (becData?.SharingChanges || []).filter((c) =>
      c?.Operation?.startsWith('AnonymousLink')
    ).length,
    intuneDevices: becData?.IntuneDevices?.length || 0,
    signIns: becData?.SuspectUserSignIns?.length || 0,
    sentTotalMessages: becData?.SentMessageAnalysis?.TotalMessages ?? 0,
    sentTotalRecipients: becData?.SentMessageAnalysis?.TotalRecipients ?? 0,
    repeatedSubjects: becData?.SentMessageAnalysis?.FlaggedSubjectCount || 0,
    sendBursts: becData?.SentMessageAnalysis?.Bursts?.length || 0,
    massMailFlagged: becData?.SentMessageAnalysis?.Flagged === true,
    maliciousApps:
      (becData?.AddedApps || []).filter((app) => app?.MaliciousMatch).length +
      (becData?.MaliciousSPs?.length || 0),
  }

  const locationAnalysis = becData?.LocationAnalysis
  stats.foreignSignIns = locationAnalysis?.ForeignSignInCount || 0
  stats.foreignSuccessfulSignIns = locationAnalysis?.ForeignSuccessfulSignInCount || 0
  stats.foreignSentMessages = locationAnalysis?.ForeignSentMessageCount || 0
  stats.foreignActivity =
    (locationAnalysis?.ForeignRuleChangeCount || 0) +
    (locationAnalysis?.ForeignSafelistChangeCount || 0) +
    (locationAnalysis?.ForeignSharingChangeCount || 0) +
    (locationAnalysis?.ForeignSentMessageCount || 0)

  // La fenêtre d'analyse : 7 jours avant l'extraction des données.
  const analysisWindowStart = (() => {
    const extractedAt = becData?.ExtractedAt ? new Date(becData.ExtractedAt) : new Date()
    if (Number.isNaN(extractedAt.getTime())) {
      return new Date(new Date().getTime() - 7 * 24 * 60 * 60 * 1000)
    }
    return new Date(extractedAt.getTime() - 7 * 24 * 60 * 60 * 1000)
  })()

  const recentIntuneDevices = (becData?.IntuneDevices || []).filter((device) => {
    if (!device?.enrolledDateTime) return false
    const enrolled = new Date(device.enrolledDateTime)
    if (Number.isNaN(enrolled.getTime())) return false
    return enrolled >= analysisWindowStart
  })
  stats.recentIntuneDevices = recentIntuneDevices.length

  const isRecentMfaDevice = (method) => {
    if (!method?.createdDateTime) return false
    const created = new Date(method.createdDateTime)
    if (Number.isNaN(created.getTime())) return false
    return created >= analysisWindowStart
  }
  stats.recentMfaDevices = (becData?.MFADevices || []).filter(isRecentMfaDevice).length

  // Les connexions étrangères réussies d'abord : elles prouvent l'accès, les échecs sont
  // essentiellement du bruit de password spraying.
  const foreignSignIns = (becData?.SuspectUserSignIns || [])
    .filter((signIn) => signIn?.ForeignLocation === true)
    .sort((a, b) => (b?.Status === 'Success') - (a?.Status === 'Success'))

  const sortedIntuneDevices = [...(becData?.IntuneDevices || [])].sort((a, b) => {
    const aTime = a?.enrolledDateTime ? new Date(a.enrolledDateTime).getTime() : 0
    const bTime = b?.enrolledDateTime ? new Date(b.enrolledDateTime).getTime() : 0
    return bTime - aTime
  })

  const threatLevel = psitCalculateThreatLevel(stats, becData)

  return (
    <ReportDocument
      brandingSettings={brandingSettings}
      tenantName={tenantName}
      reportName="Rapport d'analyse BEC"
      generatedOn={currentDate}
      variables={variables}
      coverLabel="RAPPORT D'INCIDENT DE SÉCURITÉ"
      coverTitle="Compromission de messagerie"
      coverAccent="Analyse"
      coverSubtitle={`Rapport d'investigation sur une compromission de messagerie professionnelle pour ${
        tenantName || 'votre organisation'
      }`}
      coverTenant={userData?.displayName || 'Utilisateur inconnu'}
      coverFallbackImage="/reportImages/soc.jpg"
      coverFooterNote="Confidentiel - Usage interne uniquement"
      footerLabel={`${tenantName} - Rapport d'analyse BEC pour ${userData?.displayName}`}
      coverMeta={
        <CoverMeta
          lines={[userData?.userPrincipalName || 'utilisateur@domaine.fr']}
          note={`Date d'analyse : ${becData?.ExtractedAt ? formatDate(becData.ExtractedAt) : 'N/D'}`}
        />
      }
    >
      {/* SYNTHÈSE */}
      <ContentPage
        title="Synthèse"
        subtitle="Vue d'ensemble des constats de l'investigation"
      >
        <Section>
          <Paragraph>
            Ce rapport présente les constats d'une investigation pour compromission de messagerie
            professionnelle (BEC) menée sur le compte <Bold>{userData?.userPrincipalName}</Bold> au
            sein de <Bold>{tenantName}</Bold>. L'investigation a analysé les indicateurs d'activité
            suspecte sur une période de 7 jours : règles de boîte de réception, modifications de
            permissions, nouvelles applications, schémas d'authentification et lieux de connexion.
          </Paragraph>

          <Paragraph>
            La compromission de messagerie professionnelle est une fraude élaborée qui cible les
            organisations pratiquant régulièrement des virements ou entretenant des relations avec
            des fournisseurs étrangers. Les attaquants prennent le contrôle de comptes de messagerie
            légitimes par ingénierie sociale ou intrusion informatique, afin de déclencher des
            virements non autorisés, de dérober des informations sensibles ou d'usurper l'identité de
            dirigeants.
          </Paragraph>
        </Section>

        <Section title="Vue d'ensemble de l'investigation">
          <StatRow
            stats={[
              { value: stats.newRules, label: 'Règles de boîte' },
              { value: stats.permissionChanges, label: 'Modifications de permissions' },
              { value: stats.foreignSignIns, label: 'Connexions étrangères' },
              { value: stats.maliciousApps, label: 'Applications malveillantes' },
            ]}
          />

          <AlertBox
            colour={threatLevel.color}
            title={`Évaluation du risque : ${threatLevel.label}`}
          >
            {threatLevel.level === 'High' &&
              "RISQUE ÉLEVÉ : plusieurs indicateurs de compromission ont été détectés. Des actions de remédiation immédiates sont fortement recommandées. Ce compte présente des schémas caractéristiques d'une attaque BEC active."}
            {threatLevel.level === 'Medium' &&
              "RISQUE MOYEN : des activités suspectes ont été détectées. Examinez les constats et envisagez la mise en œuvre des mesures de sécurité recommandées. Certains indicateurs suggèrent un accès non autorisé."}
            {threatLevel.level === 'Low' &&
              "RISQUE FAIBLE : peu d'activité suspecte détectée. Les constats correspondent à un usage normal, sans indicateur significatif de compromission. Maintenez la surveillance par précaution."}
          </AlertBox>
        </Section>

        <Section title="Origine des données">
          <InfoBox title="État du journal d'audit">{becData?.ExtractResult || 'Inconnu'}</InfoBox>
          <InfoBox title="Période analysée">
            7 derniers jours jusqu'au {becData?.ExtractedAt ? formatDate(becData.ExtractedAt) : 'N/D'}
          </InfoBox>
          <InfoBox title="Pays d'utilisation déclaré">
            {locationAnalysis?.UsageLocation ||
              "Non renseigné - les connexions et activités n'ont pas pu être comparées à un pays attendu"}
          </InfoBox>
        </Section>
      </ContentPage>

      {/* COMPRENDRE LE BEC */}
      <ContentPage
        title="Comprendre la compromission de messagerie"
        subtitle="Qu'est-ce qu'une attaque BEC et pourquoi est-ce grave ?"
      >
        <Section title="Qu'est-ce qu'une compromission de messagerie professionnelle ?">
          <Paragraph>
            La compromission de messagerie professionnelle (BEC, Business Email Compromise) est une
            cyberattaque au cours de laquelle des criminels obtiennent un accès non autorisé à une
            boîte de messagerie d'entreprise. Une fois à l'intérieur, ils peuvent :
          </Paragraph>

          <BulletList>
            <Bullet label="Surveiller les échanges :">
              {' '}
              lire les messages sensibles pour comprendre l'activité de l'entreprise, ses processus
              financiers et ses interlocuteurs clés.
            </Bullet>
            <Bullet label="Usurper l'identité de dirigeants :">
              {' '}
              envoyer des messages frauduleux qui semblent provenir de la direction, demandant des
              virements ou des données sensibles.
            </Bullet>
            <Bullet label="Détourner des transactions :">
              {' '}
              intercepter des factures légitimes et modifier les coordonnées bancaires pour
              rediriger les fonds vers des comptes contrôlés par l'attaquant.
            </Bullet>
            <Bullet label="Effacer leurs traces :">
              {' '}
              créer des règles de messagerie qui suppriment ou masquent automatiquement les messages
              pour retarder la détection.
            </Bullet>
          </BulletList>
        </Section>

        <Section title="Modes opératoires courants">
          <Paragraph>
            Les attaquants accèdent généralement aux boîtes de messagerie par les moyens suivants :
          </Paragraph>

          <BulletList>
            <Bullet label="Hameçonnage :">
              {' '}
              messages trompeurs qui incitent l'utilisateur à saisir ses identifiants sur un faux
              site.
            </Bullet>
            <Bullet label="Pulvérisation de mots de passe :">
              {' '}
              tentatives automatisées de connexion avec des mots de passe courants sur de nombreux
              comptes.
            </Bullet>
            <Bullet label="Rejeu d'identifiants :">
              {' '}
              réutilisation d'identifiants et de mots de passe divulgués lors de fuites sur d'autres
              sites.
            </Bullet>
            <Bullet label="Logiciels malveillants :">
              {' '}
              programmes qui enregistrent les frappes clavier ou volent les mots de passe stockés sur
              un poste compromis.
            </Bullet>
          </BulletList>
        </Section>

        <Section title="Pourquoi cette investigation a été menée">
          <Paragraph>
            Cette analyse a été déclenchée parce qu'une activité suspecte a été détectée ou signalée
            sur ce compte. L'investigation examine plusieurs indicateurs pouvant révéler une
            compromission : règles de boîte inhabituelles, modifications de permissions inattendues,
            nouvelles autorisations d'applications et schémas de connexion anormaux. Une détection
            précoce est déterminante pour limiter les dégâts et éviter une perte financière ou un vol
            de données.
          </Paragraph>
        </Section>
      </ContentPage>

      {/* CONSTATS DÉTAILLÉS */}
      <ContentPage title="Constats détaillés" subtitle="Résultats et analyse de l'investigation">
        {/* Vérification 1 : règles de boîte */}
        <Section title="Vérification 1 : règles de boîte de réception">
          <InfoBox title="Pourquoi cette vérification">
            Les attaquants créent souvent des règles de messagerie pour transférer, supprimer ou
            masquer automatiquement des messages, ce qui empêche la victime de voir les traces de la
            fraude. Les règles qui déplacent les messages vers des dossiers peu consultés comme
            « Flux RSS » ou qui les transfèrent vers une adresse externe sont particulièrement
            suspectes.
          </InfoBox>

          {stats.newRules > 0 && (
            <>
              <AlertBox title={`⚠️ ${plural(stats.newRules, 'règle de boîte détectée', 'règles de boîte détectées')}`}>
                Les règles suivantes ont été détectées. Examinez chacune d'elles pour déterminer si
                elle a été créée par l'utilisateur ou par un attaquant. Les règles qui transfèrent
                des messages ou les déplacent vers des dossiers inhabituels doivent être considérées
                comme suspectes par défaut.
              </AlertBox>

              {becData.NewRules.slice(0, 10).map((rule, index) => (
                <InfoBox key={index} title={`Règle : ${rule.Name || 'Règle sans nom'}`}>
                  Description : {rule.Description || 'Aucune description disponible'}
                  {'\n'}
                  {rule.MoveToFolder && `Déplace vers : ${rule.MoveToFolder}`}
                  {rule.ForwardTo && `\nTransfère vers : ${rule.ForwardTo}`}
                  {rule.DeleteMessage && '\nSupprime les messages'}
                  {rule.RecentlyChanged && '\nCréée ou modifiée au cours des 7 derniers jours'}
                </InfoBox>
              ))}
              {becData.NewRules.length > 10 && (
                <Note>
                  ... et {becData.NewRules.length - 10} autres règles (liste complète dans l'export
                  JSON)
                </Note>
              )}
            </>
          )}
          {stats.ruleChanges > 0 && (
            <>
              <AlertBox title={`⚠️ ${plural(stats.ruleChanges, 'modification de règle', 'modifications de règles')} sur les 7 derniers jours`}>
                Le journal d'audit a enregistré des créations, modifications ou suppressions de
                règles sur cette boîte. Une règle supprimée après usage est une manière classique de
                faire disparaître les traces.
              </AlertBox>

              {becData.InboxRuleChanges.slice(0, 10).map((change, index) => (
                <InfoBox
                  key={index}
                  title={`${change.Operation || 'Modification de règle'} : ${
                    change.RuleName || 'Règle sans nom'
                  }`}
                >
                  Date : {change.Date || 'Inconnue'}
                  {'\n'}
                  Par : {change.UserKey || 'Inconnu'}
                  {change.ClientIP &&
                    `\nDepuis : ${change.ClientIP}${change.Country ? ` (${change.Country})` : ''}`}
                  {change.ForeignLocation === true &&
                    "\n⚠️ Origine hors du pays d'utilisation déclaré"}
                  {change.Parameters && `\nParamètres : ${change.Parameters}`}
                </InfoBox>
              ))}
              {becData.InboxRuleChanges.length > 10 && (
                <Note>
                  ... et {becData.InboxRuleChanges.length - 10} autres modifications (liste complète
                  dans l'export JSON)
                </Note>
              )}
            </>
          )}
          {stats.newRules === 0 && stats.ruleChanges === 0 && (
            <ClearBox title="✔️ Aucune règle suspecte">
              Aucune règle de boîte correspondant à un schéma suspect n'a été détectée. C'est un
              indicateur favorable.
            </ClearBox>
          )}
        </Section>
      </ContentPage>

      {/* VÉRIFICATION 2 : NOUVEAUX COMPTES */}
      <ContentPage
        title="Constats détaillés (suite)"
        subtitle="Résultats et analyse de l'investigation"
      >
        <Section title="Vérification 2 : comptes créés récemment">
          <InfoBox title="Pourquoi cette vérification">
            Les attaquants créent parfois de nouveaux comptes pour conserver un accès durable ou
            pour servir de relais à des opérations frauduleuses. Passer en revue les comptes créés
            récemment permet de repérer une création non autorisée.
          </InfoBox>

          {stats.newUsers > 0 ? (
            <>
              <AlertBox title={`ℹ️ ${plural(stats.newUsers, 'nouveau compte détecté', 'nouveaux comptes détectés')}`}>
                Les comptes suivants ont été créés au cours des 7 derniers jours. Vérifiez que
                chaque création était autorisée et légitime.
              </AlertBox>

              {becData.NewUsers.slice(0, 8).map((user, index) => (
                <InfoBox key={index} title={`${user.displayName || 'Inconnu'}`}>
                  Adresse : {user.userPrincipalName || 'N/D'}
                  {'\n'}
                  Créé le : {formatDate(user.createdDateTime)}
                </InfoBox>
              ))}
              {becData.NewUsers.length > 8 && (
                <Note>
                  ... et {becData.NewUsers.length - 8} autres comptes (liste complète dans l'export
                  JSON)
                </Note>
              )}
            </>
          ) : (
            <ClearBox title="✔️ Aucun nouveau compte">
              Aucun compte n'a été créé pendant la période analysée.
            </ClearBox>
          )}
        </Section>

        {/* Vérification 3 : nouvelles applications */}
        <Section title="Vérification 3 : nouvelles applications">
          <InfoBox title="Pourquoi cette vérification">
            Un attaquant peut autoriser des applications tierces malveillantes à accéder à la
            messagerie et aux données. Ces applications peuvent lire les messages, en envoyer et
            accéder aux fichiers sans que l'utilisateur en ait conscience.
          </InfoBox>

          {stats.maliciousApps > 0 && (
            <AlertBox title={`⚠️ ${plural(stats.maliciousApps, 'application malveillante connue détectée', 'applications malveillantes connues détectées')}`}>
              Une ou plusieurs applications de ce tenant correspondent au catalogue d'applications
              malveillantes connues de CIPP. Un accès obtenu par consentement survit à une
              réinitialisation de mot de passe : ces applications doivent être supprimées si leur
              présence n'est pas justifiée.
            </AlertBox>
          )}

          {stats.newApps > 0 ? (
            <>
              <AlertBox title={`⚠️ ${plural(stats.newApps, 'nouvelle application détectée', 'nouvelles applications détectées')}`}>
                De nouvelles applications ont reçu un accès pendant la période analysée. Vérifiez
                pour chacune qu'elle était autorisée et qu'elle provient d'un éditeur de confiance.
              </AlertBox>

              {becData.AddedApps.slice(0, 6).map((app, index) => (
                <InfoBox
                  key={index}
                  title={`${app.displayName || app.appDisplayName || 'Inconnue'}`}
                >
                  Éditeur : {app.publisher || 'Inconnu'}
                  {'\n'}
                  ID d'application : {app.appId || 'N/D'}
                  {'\n'}
                  Créée le : {formatDate(app.createdDateTime)}
                  {app.MaliciousMatch &&
                    `\n⚠️ Correspond à l'entrée « ${app.MaliciousMatch.Name} » du catalogue d'applications malveillantes${
                      app.MaliciousMatch.Categories?.length
                        ? ` (${app.MaliciousMatch.Categories.join(', ')})`
                        : ''
                    }`}
                </InfoBox>
              ))}
              {becData.AddedApps.length > 6 && (
                <Note>
                  ... et {becData.AddedApps.length - 6} autres applications (liste complète dans
                  l'export JSON)
                </Note>
              )}
            </>
          ) : (
            (becData?.MaliciousSPs?.length || 0) === 0 && (
              <ClearBox title="✔️ Aucune nouvelle application">
                Aucune nouvelle application n'a été autorisée pendant la période analysée, et aucune
                application malveillante connue n'est présente dans le tenant.
              </ClearBox>
            )
          )}

          {(becData?.MaliciousSPs?.length || 0) > 0 && (
            <>
              {becData.MaliciousSPs.slice(0, 6).map((app, index) => (
                <InfoBox
                  key={`malsp-${index}`}
                  title={`⚠️ ${app.displayName || 'Inconnue'} (présente dans le tenant)`}
                >
                  Entrée du catalogue : {app.CatalogName || 'Inconnue'}
                  {'\n'}
                  ID d'application : {app.appId || 'N/D'}
                  {'\n'}
                  Catégories : {app.Categories?.length ? app.Categories.join(', ') : 'N/D'}
                  {'\n'}
                  Activée : {app.accountEnabled === true ? 'oui' : app.accountEnabled === false ? 'non' : 'inconnu'}
                  {'\n'}
                  Première apparition : {formatDate(app.createdDateTime)}
                </InfoBox>
              ))}
              {becData.MaliciousSPs.length > 6 && (
                <Note>
                  ... et {becData.MaliciousSPs.length - 6} autres (liste complète dans l'export
                  JSON)
                </Note>
              )}
            </>
          )}
        </Section>
      </ContentPage>

      {/* VÉRIFICATIONS 4 À 7 */}
      <ContentPage
        title="Vérifications complémentaires"
        subtitle="Permissions, courrier sortant, authentification et accès"
      >
        {/* Vérification 4 : permissions de boîte */}
        <Section title="Vérification 4 : modifications des permissions de boîte">
          <InfoBox title="Pourquoi cette vérification">
            Une modification non autorisée des permissions de boîte permet à un attaquant de
            s'octroyer, ou d'octroyer à un complice, le droit de lire, d'envoyer ou de gérer les
            messages. C'est une technique courante pour maintenir un accès durable.
          </InfoBox>

          {stats.permissionChanges > 0 ? (
            <>
              <AlertBox title={`⚠️ ${plural(stats.permissionChanges, 'modification de permission détectée', 'modifications de permissions détectées')}`}>
                Des modifications de permissions de boîte ont été détectées. Vérifiez que chacune
                était autorisée et nécessaire à un usage professionnel légitime.
              </AlertBox>

              {becData.MailboxPermissionChanges.slice(0, 5).map((change, index) => (
                <InfoBox key={index} title={`${change.Operation || 'Modification de permission'}`}>
                  Auteur : {change.UserKey || 'Inconnu'}
                  {'\n'}
                  Cible : {change.ObjectId || 'N/D'}
                  {'\n'}
                  Permissions : {change.Permissions || 'Inconnues'}
                  {change.TargetsSuspect === true && "\n⚠️ Concerne la boîte sous investigation"}
                </InfoBox>
              ))}
              {becData.MailboxPermissionChanges.length > 5 && (
                <Note>
                  ... et {becData.MailboxPermissionChanges.length - 5} autres modifications
                </Note>
              )}
            </>
          ) : (
            <ClearBox title="✔️ Aucune modification de permission">
              Aucune modification des permissions de boîte n'a été détectée pendant la période
              analysée.
            </ClearBox>
          )}
        </Section>

        {/* Vérification 5 : messages envoyés */}
        <Section title="Vérification 5 : messages envoyés">
          <InfoBox title="Pourquoi cette vérification">
            Un attaquant utilise la boîte compromise pour envoyer de fausses factures, des messages
            d'hameçonnage ou des demandes internes usurpant une identité. Le suivi des messages
            montre ce qui est réellement sorti de la boîte pendant la période analysée, y compris
            l'adresse IP d'émission.
          </InfoBox>

          {stats.sentMessages > 0 ? (
            <>
              <Paragraph indent>
                ℹ️ {stats.sentTotalMessages || stats.sentMessages} message(s) envoyé(s) par cette
                boîte vers {stats.sentTotalRecipients || stats.sentMessages} destinataire(s) pendant
                la période analysée
                {stats.foreignSentMessages > 0
                  ? `, dont ${stats.foreignSentMessages} depuis une IP située hors du pays d'utilisation déclaré.`
                  : '.'}
              </Paragraph>

              {stats.massMailFlagged && (
                <AlertBox title="⚠️ Schéma d'envoi en masse détecté">
                  {stats.repeatedSubjects > 0
                    ? `${stats.repeatedSubjects} objet(s) de message ont été envoyés en de nombreux messages distincts ou à de nombreux destinataires. `
                    : ''}
                  {stats.sendBursts > 0
                    ? `${stats.sendBursts} rafale(s) d'envoi à fort volume ont été détectées. `
                    : ''}
                  Les envois en masse à objet identique et les rafales sont la manière dont une boîte
                  compromise diffuse de l'hameçonnage ou de fausses factures. Examinez les campagnes
                  ci-dessous et prévenez les destinataires si le contenu était malveillant.
                </AlertBox>
              )}

              {(becData?.SentMessageAnalysis?.RepeatedSubjects || [])
                .slice(0, 5)
                .map((group, index) => (
                  <InfoBox
                    key={`subject-${index}`}
                    title={`${group.Flagged ? '⚠️ ' : ''}Objet répété : ${
                      group.Subject || '(sans objet)'
                    }`}
                  >
                    Messages : {group.MessageCount}
                    {'\n'}
                    Destinataires : {group.RecipientCount}
                    {'\n'}
                    Premier envoi : {group.FirstSent || 'N/D'}
                    {'\n'}
                    Dernier envoi : {group.LastSent || 'N/D'}
                  </InfoBox>
                ))}
              {(becData?.SentMessageAnalysis?.RepeatedSubjects?.length || 0) > 5 && (
                <Note>
                  ... et {becData.SentMessageAnalysis.RepeatedSubjects.length - 5} autres objets
                  répétés (liste complète dans l'export JSON)
                </Note>
              )}

              {(becData?.SentMessageAnalysis?.Bursts || []).slice(0, 5).map((burst, index) => (
                <InfoBox
                  key={`burst-${index}`}
                  title={`⚠️ Rafale d'envoi : ${burst.MessageCount} message(s) vers ${
                    burst.RecipientCount
                  } destinataire(s) en ${burst.WindowMinutes || 10} minutes`}
                >
                  Début : {burst.WindowStart || 'N/D'}
                  {burst.TopSubject && `\nObjet le plus fréquent : ${burst.TopSubject}`}
                </InfoBox>
              ))}
              {(becData?.SentMessageAnalysis?.Bursts?.length || 0) > 5 && (
                <Note>
                  ... et {becData.SentMessageAnalysis.Bursts.length - 5} autres rafales (liste
                  complète dans l'export JSON)
                </Note>
              )}

              {becData.SentMessages.slice(0, 10).map((msg, index) => (
                <InfoBox key={index} title={`${msg.Subject || '(sans objet)'}`}>
                  À : {msg.RecipientAddress || 'N/D'}
                  {'\n'}
                  Statut : {msg.Status || 'N/D'}
                  {'\n'}
                  Reçu : {msg.Received || 'N/D'}
                  {msg.FromIP &&
                    `\nIP source : ${msg.FromIP}${msg.Country ? ` (${msg.Country})` : ''}`}
                  {msg.ForeignLocation === true &&
                    "\n⚠️ Envoyé hors du pays d'utilisation déclaré"}
                </InfoBox>
              ))}
              {becData.SentMessages.length > 10 && (
                <Note>
                  ... et {becData.SentMessages.length - 10} autres messages (liste complète dans
                  l'export JSON)
                </Note>
              )}
            </>
          ) : (
            <ClearBox title="✔️ Aucun message envoyé">
              Aucun message n'a été envoyé par cette boîte pendant la période analysée.
            </ClearBox>
          )}
        </Section>

        {/* Vérification 6 : méthodes MFA */}
        <Section title="Vérification 6 : méthodes d'authentification multifacteur">
          <InfoBox title="Pourquoi cette vérification">
            L'authentification multifacteur (MFA) ajoute une couche de sécurité. Passer en revue les
            méthodes enregistrées permet de repérer un moyen d'authentification ajouté par un
            attaquant pour contourner les contrôles.
          </InfoBox>

          {stats.mfaDevices > 0 ? (
            <>
              <Paragraph indent>
                ℹ️ {stats.mfaDevices} méthode(s) MFA enregistrée(s)
                {stats.recentMfaDevices > 0
                  ? `, dont ${stats.recentMfaDevices} au cours des 7 derniers jours. Vérifiez que ces enregistrements récents ont bien été faits par l'utilisateur : un attaquant enregistre sa propre méthode pour conserver l'accès après une réinitialisation de mot de passe.`
                  : ". Vérifiez que chaque méthode appartient bien à l'utilisateur."}
              </Paragraph>

              {[...becData.MFADevices]
                .sort(
                  (a, b) => new Date(b?.createdDateTime || 0) - new Date(a?.createdDateTime || 0)
                )
                .slice(0, 5)
                .map((device, index) => (
                  <InfoBox
                    key={index}
                    title={`${
                      device['@odata.type']
                        ?.replace('#microsoft.graph.', '')
                        .replace('AuthenticationMethod', '') || 'Inconnue'
                    }`}
                  >
                    Nom affiché : {device.displayName || 'N/D'}
                    {'\n'}
                    Enregistrée le : {formatDate(device.createdDateTime)}
                    {isRecentMfaDevice(device) && '\n⚠️ Enregistrée au cours des 7 derniers jours'}
                  </InfoBox>
                ))}
              {becData.MFADevices.length > 5 && (
                <Note>
                  ... et {becData.MFADevices.length - 5} autres méthodes (liste complète dans
                  l'export JSON)
                </Note>
              )}
            </>
          ) : (
            <InfoBox tone="warn" title="⚠️ Aucune méthode MFA enregistrée">
              Aucune méthode d'authentification multifacteur n'est enregistrée. La MFA est
              vivement recommandée pour empêcher les accès non autorisés.
            </InfoBox>
          )}
        </Section>

        {/* Vérification 7 : changements de mot de passe */}
        <Section title="Vérification 7 : changements de mot de passe récents">
          <InfoBox title="Pourquoi cette vérification">
            Un attaquant change souvent le mot de passe pour verrouiller l'utilisateur légitime.
            Examiner les changements récents dans le tenant permet de voir si le mot de passe du
            compte compromis a été modifié, ou si d'autres comptes ont été touchés.
          </InfoBox>

          {stats.passwordChanges > 0 ? (
            <>
              <Paragraph indent>
                ℹ️ {stats.passwordChanges} changement(s) de mot de passe détecté(s) dans le tenant
                pendant la période analysée.
              </Paragraph>

              {becData.ChangedPasswords.slice(0, 5).map((user, index) => (
                <InfoBox key={index} title={`${user.displayName || 'Inconnu'}`}>
                  Adresse : {user.userPrincipalName || 'N/D'}
                  {'\n'}
                  Dernier changement : {formatDate(user.lastPasswordChangeDateTime)}
                </InfoBox>
              ))}
              {becData.ChangedPasswords.length > 5 && (
                <Note>
                  ... et {becData.ChangedPasswords.length - 5} autres (liste complète dans l'export
                  JSON)
                </Note>
              )}
            </>
          ) : (
            <Paragraph indent>
              ℹ️ Aucun changement de mot de passe détecté pendant la période analysée.
            </Paragraph>
          )}
        </Section>
      </ContentPage>

      {/* VÉRIFICATIONS 8 À 11 */}
      <ContentPage
        title="Listes, appareils et localisations"
        subtitle="Listes d'expéditeurs, appareils gérés et origines des connexions"
      >
        {/* Vérification 8 : expéditeurs approuvés et bloqués */}
        <Section title="Vérification 8 : expéditeurs approuvés et bloqués">
          <InfoBox title="Pourquoi cette vérification">
            Un attaquant peut ajouter son propre domaine à la liste des expéditeurs approuvés pour
            que ses messages frauduleux échappent au filtrage anti-spam, ou ajouter les domaines de
            la comptabilité ou de la sécurité à la liste des expéditeurs bloqués pour que les
            alertes atterrissent dans le dossier Courrier indésirable.
          </InfoBox>

          {becData?.SafelistError && (
            <AlertBox title="⚠️ Listes d'expéditeurs non récupérables">
              {becData.SafelistError}
              {'\n'}
              Une liste vide ici ne signifie pas que la boîte n'a aucun expéditeur approuvé ou
              bloqué.
            </AlertBox>
          )}

          {stats.safelistChanges > 0 && (
            <>
              <AlertBox title={`⚠️ ${plural(stats.safelistChanges, 'modification de liste', 'modifications de listes')} sur les 7 derniers jours`}>
                Le journal d'audit a enregistré des modifications des listes d'expéditeurs et de
                domaines approuvés ou bloqués sur cette boîte. Examinez chaque modification.
              </AlertBox>

              {becData.SafelistChanges.slice(0, 10).map((change, index) => (
                <InfoBox
                  key={index}
                  title={`${change.Operation || 'Modification de liste'} par ${
                    change.UserKey || 'Inconnu'
                  }`}
                >
                  Date : {formatDate(change.Date)}
                  {change.ClientIP &&
                    `\nDepuis : ${change.ClientIP}${change.Country ? ` (${change.Country})` : ''}`}
                  {change.ForeignLocation === true &&
                    "\n⚠️ Origine hors du pays d'utilisation déclaré"}
                  {'\n'}
                  Approuvés : {formatSafelistValue(change.Trusted)}
                  {'\n'}
                  Bloqués : {formatSafelistValue(change.Blocked)}
                </InfoBox>
              ))}
              {becData.SafelistChanges.length > 10 && (
                <Note>
                  ... et {becData.SafelistChanges.length - 10} autres modifications (liste complète
                  dans l'export JSON)
                </Note>
              )}
            </>
          )}

          {stats.trustedSenders > 0 && (
            <InfoBox title={`Expéditeurs et domaines approuvés (${stats.trustedSenders})`}>
              {becData.TrustedSenders.slice(0, 15).join(', ')}
            </InfoBox>
          )}
          {stats.trustedSenders > 15 && (
            <Note>
              ... et {stats.trustedSenders - 15} autres entrées approuvées (liste complète dans
              l'export JSON)
            </Note>
          )}

          {stats.blockedSenders > 0 && (
            <InfoBox title={`Expéditeurs et domaines bloqués (${stats.blockedSenders})`}>
              {becData.BlockedSenders.slice(0, 15).join(', ')}
            </InfoBox>
          )}
          {stats.blockedSenders > 15 && (
            <Note>
              ... et {stats.blockedSenders - 15} autres entrées bloquées (liste complète dans
              l'export JSON)
            </Note>
          )}

          {!becData?.SafelistError &&
            stats.trustedSenders === 0 &&
            stats.blockedSenders === 0 &&
            stats.safelistChanges === 0 && (
              <ClearBox title="✔️ Aucun expéditeur approuvé ni bloqué">
                Aucune entrée d'expéditeur ou de domaine approuvé ou bloqué n'a été trouvée sur cette
                boîte.
              </ClearBox>
            )}
        </Section>

        {/* Vérification 9 : appareils Intune */}
        <Section title="Vérification 9 : appareils Intune">
          <InfoBox title="Pourquoi cette vérification">
            Un appareil Intune récemment inscrit peut révéler qu'un attaquant a monté une machine
            virtuelle ou un poste personnel sous l'identité compromise, y compris par des chemins
            qui réenregistrent Windows Hello Entreprise. Examinez d'abord les appareils inscrits
            pendant la période analysée.
          </InfoBox>

          {becData?.IntuneDevicesError ? (
            <AlertBox title="⚠️ Appareils Intune non récupérables">
              {becData.IntuneDevicesError}
              {'\n'}
              Une liste vide ici ne signifie pas que l'utilisateur n'a aucun appareil Intune.
            </AlertBox>
          ) : stats.intuneDevices > 0 ? (
            <>
              <Paragraph indent>
                ℹ️ {stats.intuneDevices} appareil(s) géré(s) par Intune associé(s) à cet utilisateur
                {stats.recentIntuneDevices > 0
                  ? `, dont ${stats.recentIntuneDevices} inscrit(s) au cours des 7 derniers jours.`
                  : '. Aucun inscrit au cours des 7 derniers jours.'}
              </Paragraph>

              {sortedIntuneDevices.slice(0, 5).map((device, index) => (
                <InfoBox key={index} title={`${device.deviceName || 'Appareil inconnu'}`}>
                  Système : {device.operatingSystem || 'N/D'}
                  {device.osVersion ? ` ${device.osVersion}` : ''}
                  {'\n'}
                  Inscrit le : {formatDate(device.enrolledDateTime)}
                  {'\n'}
                  Conformité : {device.complianceState || 'N/D'}
                  {'\n'}
                  Type d'inscription : {device.deviceEnrollmentType || 'N/D'}
                  {device.serialNumber ? `\nNuméro de série : ${device.serialNumber}` : ''}
                </InfoBox>
              ))}
              {sortedIntuneDevices.length > 5 && (
                <Note>
                  ... et {sortedIntuneDevices.length - 5} autres appareils (liste complète dans
                  l'export JSON)
                </Note>
              )}
            </>
          ) : (
            <ClearBox title="✔️ Aucun appareil Intune">
              Aucun appareil géré par Intune n'a été trouvé pour cet utilisateur.
            </ClearBox>
          )}
        </Section>

        {/* Vérification 10 : localisation des connexions */}
        <Section title="Vérification 10 : localisation des connexions">
          <InfoBox title="Pourquoi cette vérification">
            Une connexion depuis un pays où l'utilisateur ne travaille pas est l'un des indicateurs
            de compromission les plus forts. Chaque connexion est comparée au pays d'utilisation
            déclaré dans Entra ID
            {locationAnalysis?.UsageLocation ? ` (${locationAnalysis.UsageLocation})` : ''}, et les
            IP clientes derrière les modifications de règles, de listes d'expéditeurs, de partages et
            les messages envoyés sont géolocalisées puis comparées de la même manière.
          </InfoBox>

          {becData?.SuspectUserSignInsError ? (
            <AlertBox title="⚠️ Journaux de connexion non récupérables">
              {becData.SuspectUserSignInsError}
              {'\n'}
              Une liste vide ici ne signifie pas que l'utilisateur ne s'est pas connecté.
            </AlertBox>
          ) : (
            <>
              {!locationAnalysis?.UsageLocation && (
                <InfoBox tone="warn" title="⚠️ Aucun pays d'utilisation déclaré">
                  {locationAnalysis?.Note ||
                    "L'utilisateur n'a aucun pays d'utilisation renseigné dans Entra ID : l'activité ne peut pas être comparée à un pays attendu."}
                </InfoBox>
              )}

              {(locationAnalysis?.SignInCountries?.length || 0) > 0 && (
                <InfoBox
                  title={`Pays de connexion observés (${stats.signIns} dernières connexions)`}
                >
                  {locationAnalysis.SignInCountries.map(
                    (c) => `${c.Country} : ${c.Count} connexion(s)`
                  ).join('\n')}
                </InfoBox>
              )}

              {stats.foreignSignIns > 0 || stats.foreignActivity > 0 ? (
                <>
                  <AlertBox title="⚠️ Activité hors du pays d'utilisation déclaré">
                    {stats.foreignSignIns} connexion(s) (dont {stats.foreignSuccessfulSignIns}{' '}
                    réussie(s)), {locationAnalysis?.ForeignRuleChangeCount || 0} modification(s) de
                    règle, {locationAnalysis?.ForeignSafelistChangeCount || 0} modification(s) de
                    liste d'expéditeurs, {locationAnalysis?.ForeignSharingChangeCount || 0}{' '}
                    modification(s) de partage et {locationAnalysis?.ForeignSentMessageCount || 0}{' '}
                    message(s) envoyé(s) proviennent de l'extérieur de{' '}
                    {locationAnalysis?.UsageLocation}. Les connexions étrangères en échec sont
                    surtout du bruit de pulvérisation de mots de passe ; les réussies prouvent
                    l'accès. Examinez chaque élément : un déplacement légitime peut en expliquer une
                    partie, mais une modification de règle, de liste d'expéditeurs ou de partage
                    depuis une IP étrangère a rarement une explication innocente.
                  </AlertBox>

                  {foreignSignIns.slice(0, 10).map((signIn, index) => (
                    <InfoBox
                      key={index}
                      title={`${formatDate(signIn.CreatedDateTime)} - ${
                        signIn.Country || 'Inconnu'
                      }`}
                    >
                      Application : {signIn.AppDisplayName || 'N/D'}
                      {'\n'}
                      Adresse IP : {signIn.IPAddress || 'N/D'}
                      {'\n'}
                      Ville : {signIn.City || 'N/D'}
                      {'\n'}
                      Résultat : {signIn.Status || 'N/D'}
                    </InfoBox>
                  ))}
                  {foreignSignIns.length > 10 && (
                    <Note>
                      ... et {foreignSignIns.length - 10} autres connexions étrangères (liste
                      complète dans l'export JSON)
                    </Note>
                  )}
                </>
              ) : locationAnalysis?.UsageLocation ? (
                <ClearBox title="✔️ Aucune activité étrangère détectée">
                  Toutes les connexions et activités localisées correspondent au pays d'utilisation
                  déclaré ({locationAnalysis.UsageLocation}).
                </ClearBox>
              ) : null}
            </>
          )}
        </Section>

        {/* Vérification 11 : liens de partage */}
        <Section title="Vérification 11 : liens de partage">
          <InfoBox title="Pourquoi cette vérification">
            Les attaquants partagent des dossiers OneDrive et SharePoint pour se constituer un flux
            de données qui survit à une réinitialisation de mot de passe, et les liens anonymes
            exposent le contenu à quiconque détient l'URL. Cette vérification liste tous les liens de
            partage créés ou modifiés par le compte pendant la période analysée, avec l'adresse IP
            utilisée.
          </InfoBox>

          {stats.sharingChanges > 0 ? (
            <>
              <AlertBox title={`⚠️ ${plural(stats.sharingChanges, 'modification de partage', 'modifications de partages')} sur les 7 derniers jours`}>
                {stats.anonymousLinks > 0
                  ? `${stats.anonymousLinks} d'entre elles concernent des liens anonymes, ouvrables par quiconque possède l'URL. `
                  : ''}
                Examinez chaque lien et supprimez ceux qui ne sont pas justifiés, même si le compte a
                depuis été remédié.
              </AlertBox>

              {becData.SharingChanges.slice(0, 10).map((change, index) => (
                <InfoBox
                  key={index}
                  title={`${change.Operation || 'Modification de partage'} : ${
                    change.FileName || change.ItemUrl || 'Élément inconnu'
                  }`}
                >
                  Date : {formatDate(change.Date)}
                  {'\n'}
                  Service : {change.Workload || 'N/D'}
                  {change.Target && `\nPartagé avec : ${change.Target}`}
                  {change.ClientIP &&
                    `\nDepuis : ${change.ClientIP}${change.Country ? ` (${change.Country})` : ''}`}
                  {change.ForeignLocation === true &&
                    "\n⚠️ Origine hors du pays d'utilisation déclaré"}
                </InfoBox>
              ))}
              {becData.SharingChanges.length > 10 && (
                <Note>
                  ... et {becData.SharingChanges.length - 10} autres modifications (liste complète
                  dans l'export JSON)
                </Note>
              )}
            </>
          ) : (
            <ClearBox title="✔️ Aucune modification de partage">
              Aucun lien de partage n'a été créé ni modifié par ce compte pendant la période
              analysée.
            </ClearBox>
          )}
        </Section>
      </ContentPage>

      {/* RECOMMANDATIONS */}
      <ContentPage
        title="Recommandations"
        subtitle="Actions à mener et bonnes pratiques de prévention"
      >
        <Section title="Actions immédiates">
          <Paragraph>
            Au vu des constats de l'investigation, les actions suivantes doivent être menées sans
            délai :
          </Paragraph>

          <BulletList>
            <Bullet marker="1." label="Réinitialiser le mot de passe :">
              {' '}
              changer immédiatement le mot de passe de l'utilisateur pour couper tout accès non
              autorisé.
            </Bullet>
            <Bullet marker="2." label="Révoquer les sessions :">
              {' '}
              déconnecter l'utilisateur de toutes ses sessions actives afin de mettre fin à l'accès
              de l'attaquant.
            </Bullet>
            <Bullet marker="3." label="Supprimer les règles suspectes :">
              {' '}
              supprimer toute règle de boîte qui transfère, redirige ou masque des messages, en
              particulier celles qui les déplacent vers des dossiers inhabituels.
            </Bullet>
            <Bullet marker="4." label="Contrôler les méthodes MFA :">
              {' '}
              retirer les méthodes que l'utilisateur ne reconnaît pas et réenregistrer les méthodes
              légitimes.
            </Bullet>
            <Bullet marker="5." label="Auditer les permissions :">
              {' '}
              passer en revue et révoquer les permissions de boîte et les consentements
              d'applications non autorisés.
            </Bullet>
            <Bullet marker="6." label="Surveiller le compte :">
              {' '}
              maintenir une surveillance de l'activité du compte pendant au moins 30 jours.
            </Bullet>
          </BulletList>
        </Section>

        <Section title="Prévention à long terme">
          <Paragraph>
            Pour prévenir de futures compromissions de messagerie, mettez en œuvre ces bonnes
            pratiques :
          </Paragraph>

          <BulletList>
            <Bullet label="Imposer l'authentification multifacteur (MFA) :">
              {' '}
              exiger la MFA pour tous les utilisateurs, en priorité pour ceux disposant de
              privilèges d'administration ou d'un accès aux systèmes financiers.
            </Bullet>
            <Bullet label="Sensibiliser les utilisateurs :">
              {' '}
              former les collaborateurs à l'hameçonnage, à l'ingénierie sociale et à la
              reconnaissance des messages suspects. Une formation régulière réduit fortement le taux
              de réussite des attaques.
            </Bullet>
            <Bullet label="Activer la protection avancée contre les menaces :">
              {' '}
              utiliser des solutions de sécurité de la messagerie capables de détecter et bloquer
              l'hameçonnage, les logiciels malveillants et les pièces jointes suspectes.
            </Bullet>
            <Bullet label="Configurer des stratégies d'accès conditionnel :">
              {' '}
              restreindre l'accès selon la localisation, la conformité de l'appareil et le niveau de
              risque afin d'empêcher les connexions non autorisées.
            </Bullet>
            <Bullet label="Surveiller les journaux d'audit :">
              {' '}
              examiner régulièrement les journaux à la recherche d'activités suspectes : connexions
              inhabituelles, création de règles, modifications de permissions.
            </Bullet>
            <Bullet label="Renforcer les contrôles financiers :">
              {' '}
              mettre en place une validation à plusieurs personnes pour les virements et les
              changements de coordonnées bancaires afin d'empêcher les transactions frauduleuses.
            </Bullet>
          </BulletList>
        </Section>

        <Section title="Points de sensibilisation pour l'utilisateur">
          <Paragraph>
            Partagez ces points avec l'utilisateur concerné pour éviter une nouvelle compromission :
          </Paragraph>

          <BulletList>
            <Bullet>
              Ne jamais cliquer sur un lien ni ouvrir une pièce jointe dans un message inattendu,
              même s'il semble provenir d'un contact connu.
            </Bullet>
            <Bullet>
              Toujours vérifier une demande inhabituelle de virement ou d'information sensible par un
              canal différent (appel téléphonique, échange en personne).
            </Bullet>
            <Bullet>
              Utiliser un mot de passe fort et unique pour chaque compte, idéalement avec un
              gestionnaire de mots de passe.
            </Bullet>
            <Bullet>
              Rester prudent avant d'autoriser une nouvelle application ou d'accorder des permissions
              à un service tiers.
            </Bullet>
            <Bullet>
              Signaler immédiatement tout message ou comportement suspect à l'équipe informatique.
            </Bullet>
          </BulletList>
        </Section>
      </ContentPage>

      {/* CONFORMITÉ ET DOCUMENTATION */}
      <ContentPage
        title="Conformité et documentation"
        subtitle="Répondre aux exigences réglementaires et d'audit"
      >
        <Section title="Éléments de conformité">
          <Paragraph>
            Ce rapport contribue aux exigences de documentation et de conformité de plusieurs
            référentiels de sécurité et cadres réglementaires :
          </Paragraph>

          <BulletList>
            <Bullet label="ISO 27001 :">
              {' '}
              démontre l'existence de procédures de détection, d'analyse et de réponse aux incidents
              (mesures A.16.1.1 à A.16.1.7).
            </Bullet>
            <Bullet label="CMMC niveau 2 :">
              {' '}
              apporte la preuve de la surveillance, de l'analyse et de la documentation des
              incidents de sécurité (AC.L2-3.1.12, AU.L2-3.3.1).
            </Bullet>
            <Bullet label="SOC 2 Type II :">
              {' '}
              documente les contrôles de détection et de réponse aux incidents de sécurité (CC7.3,
              CC7.4).
            </Bullet>
            <Bullet label="NIST CSF :">
              {' '}
              s'inscrit dans les fonctions Detect (DE.AE, DE.CM) et Respond (RS.AN, RS.MI).
            </Bullet>
            <Bullet label="RGPD :">
              {' '}
              démontre la détection des violations de sécurité et l'évaluation d'une éventuelle
              violation de données à caractère personnel (articles 32 et 33).
            </Bullet>
          </BulletList>
        </Section>

        <Section title="Piste d'audit">
          <Paragraph>
            Cette investigation et le présent document constituent une piste d'audit de la réponse à
            incident :
          </Paragraph>

          <InfoBox title="Détails de l'investigation">
            Date de l'investigation : {formatDate(becData?.ExtractedAt)}
            {'\n'}
            Utilisateur analysé : {userData?.userPrincipalName}
            {'\n'}
            Organisation : {tenantName}
            {'\n'}
            Période analysée : 7 jours
            {'\n'}
            Pays d'utilisation déclaré : {locationAnalysis?.UsageLocation || 'Non renseigné'}
            {'\n'}
            État du journal d'audit : {becData?.ExtractResult || 'Inconnu'}
          </InfoBox>

          <InfoBox title="Récapitulatif des constats">
            Niveau de risque : {threatLevel.label}
            {'\n'}
            Règles de boîte trouvées : {stats.newRules}
            {'\n'}
            Modifications de règles : {stats.ruleChanges}
            {'\n'}
            Modifications de permissions : {stats.permissionChanges} (
            {stats.permissionChangesTargetingUser} concernant cette boîte)
            {'\n'}
            Nouvelles applications : {stats.newApps}
            {'\n'}
            Applications malveillantes connues : {stats.maliciousApps}
            {'\n'}
            Nouveaux comptes : {stats.newUsers}
            {'\n'}
            Messages envoyés : {stats.sentTotalMessages || stats.sentMessages}
            {'\n'}
            Campagnes à objet répété : {stats.repeatedSubjects}
            {'\n'}
            Rafales d'envoi : {stats.sendBursts}
            {'\n'}
            Méthodes MFA : {stats.mfaDevices}
            {'\n'}
            Enregistrements MFA récents (7 j) : {stats.recentMfaDevices}
            {'\n'}
            Changements de mot de passe : {stats.passwordChanges}
            {'\n'}
            Expéditeurs approuvés : {stats.trustedSenders}
            {'\n'}
            Expéditeurs bloqués : {stats.blockedSenders}
            {'\n'}
            Modifications de listes d'expéditeurs : {stats.safelistChanges}
            {'\n'}
            Modifications de partages : {stats.sharingChanges}
            {'\n'}
            Liens anonymes : {stats.anonymousLinks}
            {'\n'}
            Appareils Intune : {stats.intuneDevices}
            {'\n'}
            Inscriptions Intune récentes (7 j) : {stats.recentIntuneDevices}
            {'\n'}
            Connexions étrangères : {stats.foreignSignIns} ({stats.foreignSuccessfulSignIns}{' '}
            réussies)
            {'\n'}
            Activité étrangère (règles, listes, partages, courrier) : {stats.foreignActivity}
          </InfoBox>
        </Section>

        <Section title="Conservation du document">
          <Paragraph>
            Ce rapport doit être conservé conformément à la politique de conservation documentaire de
            votre organisation et aux obligations réglementaires applicables. Les durées de
            conservation usuelles vont de 3 à 7 ans selon les référentiels de conformité. Conservez
            ce document de manière sécurisée et à accès restreint : il contient des informations de
            sécurité sensibles.
          </Paragraph>
        </Section>

        <Section title="Ressources complémentaires">
          <Paragraph>
            Pour en savoir plus sur la compromission de messagerie professionnelle et les bonnes
            pratiques de cybersécurité :
          </Paragraph>

          <BulletList>
            <Bullet>ANSSI : Agence nationale de la sécurité des systèmes d'information (ssi.gouv.fr)</Bullet>
            <Bullet>Cybermalveillance.gouv.fr : assistance et prévention du risque numérique</Bullet>
            <Bullet>Microsoft Security : ressources sur la compromission de messagerie</Bullet>
          </BulletList>
        </Section>
      </ContentPage>
    </ReportDocument>
  )
}

/**
 * Threat scoring, mirroring calculateThreatLevel in
 * src/components/BECRemediationReportButton.js so the French report never states a different level
 * than the English one for the same data. Exported for the unit test that pins the thresholds.
 */
export const psitCalculateThreatLevel = (stats, becData) => {
  let threatScore = 0
  if (stats.newRules > 0) threatScore += 3
  if (stats.ruleChanges > 0) threatScore += 3
  if (stats.permissionChangesTargetingUser > 0) threatScore += 2
  else if (stats.permissionChanges > 0) threatScore += 1
  if (stats.newApps > 0) threatScore += 1
  if (stats.newUsers > 5) threatScore += 1
  if (stats.safelistChanges > 0) threatScore += 2

  const hasSuspiciousRules = becData?.NewRules?.some((rule) => rule.MoveToFolder?.includes('RSS'))
  if (hasSuspiciousRules) threatScore += 5

  if (stats.maliciousApps > 0) threatScore += 5
  if (stats.foreignSuccessfulSignIns > 0) threatScore += 3
  if (stats.foreignActivity > 0) threatScore += 3
  if (stats.anonymousLinks > 0) threatScore += 3
  if (stats.massMailFlagged) threatScore += 3
  if (stats.recentMfaDevices > 0) threatScore += 2
  if (stats.recentIntuneDevices > 0) threatScore += 2

  if (threatScore >= 7) return { level: 'High', label: 'élevé', color: '#742A2A' }
  if (threatScore >= 4) return { level: 'Medium', label: 'moyen', color: '#744210' }
  return { level: 'Low', label: 'faible', color: '#22543D' }
}

export const PsitBecReportFrButton = ({ userData, becData, tenantName }) => {
  const [dialogOpen, setDialogOpen] = useState(false)

  const hasData = userData && becData && !becData.Waiting

  const brandingSettings = useBrandingSettings()
  const variables = useReportVariables()

  if (!hasData) {
    return null
  }

  return (
    <>
      {/* The tooltip title becomes the button's accessible name, so it has to start with the
          visible label: an accessible name that does not contain the visible text breaks
          WCAG 2.5.3 (Label in Name) and voice control. */}
      <Tooltip title="Rapport FR : générer le rapport BEC en français">
        <Button
          variant="outlined"
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
            <Typography variant="h6" component="div">
              Aperçu du rapport BEC (français)
            </Typography>
            <IconButton onClick={() => setDialogOpen(false)} size="small">
              <Close />
            </IconButton>
          </Box>
        </DialogTitle>
        <DialogContent dividers sx={{ p: 0 }}>
          <PDFViewer width="100%" height="100%">
            <PsitBecReportFrDocument
              userData={userData}
              becData={becData}
              brandingSettings={brandingSettings}
              tenantName={tenantName}
              variables={variables}
            />
          </PDFViewer>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Fermer</Button>
          <PDFDownloadLink
            document={
              <PsitBecReportFrDocument
                userData={userData}
                becData={becData}
                brandingSettings={brandingSettings}
                tenantName={tenantName}
                variables={variables}
              />
            }
            fileName={`Rapport_BEC_${userData?.userPrincipalName}_${
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
