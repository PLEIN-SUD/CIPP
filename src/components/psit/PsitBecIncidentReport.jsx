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
import { PDFViewer, PDFDownloadLink } from '@react-pdf/renderer'
import { useReportVariables } from '../CippPdf/useReportVariables'
import { useBrandingSettings } from '../CippPdf/useBrandingSettings'
import { ApiGetCall } from '../../api/ApiCall'
import { getCollectionStatus } from '../../utils/psit-bec-collection'
import { psitAsArray } from '../../utils/psit-as-array'
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
import {
  SIGNAL_CLASS,
  VERDICT_STATUS,
  buildSignals,
  buildTimeline,
  buildVerdict,
  firstUnauthorisedAccessUtc,
  formatUtc,
  getAnalysisWindow,
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
  const doneActions = containment.filter((action) => action.done)
  const attestedCount = doneActions.length

  return (
    <ReportDocument
      brandingSettings={brandingSettings}
      tenantName={tenantName}
      reportName="Rapport d'incident"
      generatedOn={currentDate}
      variables={variables}
      coverLabel="RAPPORT D'INCIDENT DE SÉCURITÉ"
      coverTitle="Compromission"
      coverAccent="Constatée"
      coverSubtitle={`Compromission de messagerie professionnelle — ${
        incident?.Reference || 'référence à attribuer'
      }`}
      coverTenant={userData?.displayName || 'Utilisateur inconnu'}
      coverFallbackImage="/reportImages/soc.jpg"
      coverFooterNote="Confidentiel - Diffusion restreinte"
      footerLabel={`${tenantName} - ${incident?.Reference || 'Rapport d’incident'} - ${
        userData?.displayName
      }`}
      coverMeta={
        <CoverMeta
          lines={[userData?.userPrincipalName || 'utilisateur@domaine.fr']}
          note={`Détection : ${formatUtc(incident?.DetectedUtc)} — Statut : ${
            INCIDENT_STATUS_LABELS[incident?.Status] || 'à préciser'
          }${incident?.AutotaskTicket ? ` — Ticket ${incident.AutotaskTicket}` : ''}`}
        />
      }
    >
      {/* 1 & 2. IDENTIFICATION ET RÉSUMÉ */}
      <ContentPage
        title="Résumé de l'incident"
        subtitle="Ce qui s'est passé, ce qui est établi, ce qu'il reste à faire"
      >
        <Section title="Identification">
          <InfoBox title="Incident">
            Référence : {incident?.Reference || 'à attribuer'}
            {incident?.CreatedUtc ? ` (dossier ouvert le ${formatUtc(incident.CreatedUtc)})` : ''}
            {'\n'}
            Ticket Autotask : {incident?.AutotaskTicket || 'non renseigné'}
            {'\n'}
            Rapport d'investigation associé : collecte du {formatUtc(becData?.ExtractedAt)}
            {'\n'}
            Compte concerné : {userData?.userPrincipalName}
            {'\n'}
            Organisation : {tenantName}
            {'\n'}
            Détection : {formatUtc(incident?.DetectedUtc)}
            {'\n'}
            Confinement :{' '}
            {incident?.ContainedUtc ? formatUtc(incident.ContainedUtc) : 'non confiné à ce stade'}
            {'\n'}
            Statut : {INCIDENT_STATUS_LABELS[incident?.Status] || 'à préciser'}
            {'\n'}
            Qualification : {verdict.label}
            {'\n'}
            Rapport établi par : {incident?.UpdatedBy || incident?.CreatedBy || 'N/D'} le{' '}
            {formatUtc(incident?.UpdatedUtc)}
          </InfoBox>
        </Section>

        <Section title="Résumé">
          <StatRow
            stats={[
              { value: established.length + confirmed.length, label: 'Faits retenus' },
              { value: exposure.exfiltration.length, label: "Voies d'exfiltration" },
              { value: attestedCount, label: 'Actions de confinement attestées' },
              { value: thirdParties.recipients.length, label: 'Tiers destinataires à vérifier' },
            ]}
          />

          {verdict.status === VERDICT_STATUS.COMPROMISED ? (
            <AlertBox colour="#742A2A" title="Compromission retenue">
              {verdict.detail}
            </AlertBox>
          ) : (
            <AlertBox title="Attention : ce rapport a été produit sans compromission retenue">
              Le dossier d'investigation ne conclut pas à une compromission ({verdict.label}). Ce
              document ne devrait pas être diffusé en l'état.
            </AlertBox>
          )}

          {psitAsArray(incident?.PreviousCases).length > 0 && (
            <AlertBox
              colour="#742A2A"
              title={`Compromission répétée : ${psitAsArray(incident.PreviousCases).length} dossier(s) antérieur(s) sur cette boîte`}
            >
              {psitAsArray(incident.PreviousCases)
                .map(
                  (previous) =>
                    `${previous.Reference} — détection ${
                      previous.DetectedUtc ? formatUtc(previous.DetectedUtc) : 'non renseignée'
                    }, clos le ${previous.ClosedUtc ? formatUtc(previous.ClosedUtc) : 'N/D'}`
                )
                .join('\n')}
            </AlertBox>
          )}

          {incident?.ExecutiveNote && <Paragraph>{incident.ExecutiveNote}</Paragraph>}

          <Paragraph>
            L'accès non autorisé au compte{' '}
            {exposure.accessEstablished ? 'est établi' : "n'est pas établi"} par les éléments listés
            en section « Faits établis ». La lecture des messages de la boîte :{' '}
            <Bold>{MAIL_READ_LABELS[mailReadStatus]}</Bold>.
            {exposure.exfiltration.length > 0
              ? ` ${exposure.exfiltration.length} voie(s) d'exfiltration ont été relevées.`
              : " Aucune voie d'exfiltration n'a été relevée parmi celles que cette collecte couvre."}
          </Paragraph>
        </Section>
      </ContentPage>

      {/* 3. CHRONOLOGIE */}
      <ContentPage
        title="Chronologie de l'incident"
        subtitle="Horodatages en UTC, toutes sources confondues"
      >
        <Section title="Déroulé">
          {timeline.length > 0 ? (
            <>
              {timeline.slice(0, 35).map((event, index) => (
                <InfoBox key={`tl-${index}`} title={`${event.timestampUtc} — ${event.label}`}>
                  {event.detail || ' '}
                </InfoBox>
              ))}
              {timeline.length > 35 && (
                <Note>
                  ... et {timeline.length - 35} autres événements (voir le rapport d'investigation)
                </Note>
              )}
            </>
          ) : (
            <Note>Aucun événement daté n'a pu être reconstitué sur la fenêtre analysée.</Note>
          )}
        </Section>

        <Section title="Interventions">
          {doneActions.length > 0 ? (
            doneActions.map((action) => (
              <InfoBox
                key={action.key}
                title={`${action.firstUtc || 'date inconnue'} — ${action.label}`}
              >
                Opérateur : {action.operator || 'N/D'}
                {action.hasFailure &&
                  '\n⚠️ Au moins une erreur a été journalisée pour cette action'}
              </InfoBox>
            ))
          ) : (
            <Note>
              Aucune action de remédiation n'a été retrouvée dans le journal CIPP pour ce compte.
            </Note>
          )}
          {psitAsArray(incident?.ExternalActions).map((action, index) => (
            <InfoBox
              key={`ext-${index}`}
              title={`${action?.DoneUtc ? formatUtc(action.DoneUtc) : 'date déclarée'} — ${
                action?.Action || 'action hors CIPP'
              }`}
            >
              Déclarée par : {action?.By || 'N/D'}
              {action?.Note && `\n${action.Note}`}
            </InfoBox>
          ))}
        </Section>
      </ContentPage>

      {/* 4. FAITS ÉTABLIS */}
      <ContentPage title="Faits établis" subtitle="Ce que les données prouvent, et sur quelle base">
        <Section title="Éléments retenus">
          {[...established, ...confirmed].length > 0 ? (
            [...established, ...confirmed].map((signal) => {
              const determination = psitAsArray(liveTriage).find(
                (entry) => entry.SignalId === signal.id
              )
              return (
                <InfoBox key={signal.id} title={signal.title}>
                  {signal.detail}
                  {determination &&
                    `\nQualifié « inattendu » par ${determination.Analyst} le ${formatUtc(
                      determination.DecidedUtc
                    )}${determination.Justification ? ` : ${determination.Justification}` : ''}`}
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
            Cette section fournit les éléments que le responsable de traitement doit décrire en cas
            de violation de données à caractère personnel : la nature de la violation, les
            catégories et le nombre approximatif de personnes concernées, les catégories et le
            volume d'enregistrements concernés, les conséquences probables et les mesures prises.
            <Bold>
              {' '}
              La qualification juridique de la violation et la décision de notifier relèvent du
              responsable de traitement
            </Bold>
            , assisté le cas échéant de son délégué à la protection des données ; le présent
            document ne s'y substitue pas.
          </Paragraph>
        </Section>

        <Section title="Nature de la violation">
          <InfoBox title="Nature">
            Accès non autorisé à une boîte de messagerie professionnelle
            {exposure.exfiltration.length > 0 ? ', avec voie(s) d’exfiltration établie(s)' : ''}.
            {'\n'}
            Compte concerné : {userData?.userPrincipalName}
            {'\n'}
            {/* The window starts at the first access the evidence actually supports, not at the
                first collected row: an MFA method registered years earlier once became "premier
                accès non autorisé observé" in a client document. */}
            Période d'exposition : de{' '}
            {firstAccessUtc ? formatUtc(firstAccessUtc) : formatUtc(incident?.DetectedUtc)} (
            {firstAccessUtc ? 'premier accès retenu' : 'détection'}) à{' '}
            {incident?.ContainedUtc ? formatUtc(incident.ContainedUtc) : 'ce jour (non confinée)'}
            {'\n'}
            Premier accès non autorisé observé :{' '}
            {firstAccessUtc
              ? formatUtc(firstAccessUtc)
              : "non déterminé : aucun signal de connexion n'a été retenu"}
            {'\n'}
            {/* The DPO reads this section, and this is the sentence that keeps the date from being
                quoted as the start of the intrusion. */}
            Borne de début limitée par la collecte : elle porte sur la fenêtre du{' '}
            {formatUtc(window.startUtc)} au {formatUtc(window.endUtc)}, dans la limite de rétention
            des journaux Microsoft. Un accès antérieur ne serait pas visible.
          </InfoBox>
        </Section>

        <Section title="Personnes concernées">
          <InfoBox title="Catégories de personnes">
            {psitAsArray(incident?.DataSubjectCategories).join(', ') ||
              'Non renseigné : à compléter par l’analyste avant diffusion'}
          </InfoBox>
          <InfoBox title="Nombre approximatif">
            {incident?.AffectedPersonsEstimate || 'Non renseigné'}
            {incident?.AffectedPersonsBasis &&
              `\nBase d'estimation : ${incident.AffectedPersonsBasis}`}
          </InfoBox>
          {/* A measurable floor, labelled as the narrow thing it is: the estimate above is the
              analyst's and the controller's, this is only what the trace shows. */}
          <Note>
            Repère mesurable : {exposure.correspondentFloor.distinct} correspondant(s) externe(s)
            distinct(s) ont échangé avec cette boîte pendant la fenêtre analysée
            {exposure.correspondentFloor.truncated
              ? `, sur un suivi partiel (${exposure.correspondentFloor.collectedRecipients} lignes collectées pour ${exposure.correspondentFloor.declaredRecipients} destinataires annoncés)`
              : ''}
            . Ce nombre ne dit rien du contenu de la boîte : il ne mesure pas les personnes dont les
            données y figurent, seulement les correspondants observés sur la fenêtre. Il constitue
            un plancher, pas une estimation.
          </Note>
        </Section>

        <Section title="Données concernées">
          <InfoBox title="Catégories de données présentes dans la boîte">
            {psitAsArray(incident?.DataCategories).join(', ') ||
              'Non renseigné : à compléter par l’analyste avant diffusion'}
          </InfoBox>
          <InfoBox
            tone={mailReadStatus === MAIL_READ_STATUS.PROVEN ? 'warn' : undefined}
            title="Lecture des messages"
          >
            {MAIL_READ_LABELS[mailReadStatus]}
            {'\n'}
            {exposure.mailReadNote}
          </InfoBox>
          {exposure.exfiltration.length > 0 ? (
            exposure.exfiltration.map((item, index) => (
              <InfoBox key={`exf-${index}`} title={`Exfiltration : ${item.label}`}>
                {item.detail}
                {'\n'}
                Base : {item.basis}
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
              "Non renseigné : à compléter par l'analyste. À défaut, le responsable de traitement ne dispose pas d'un des éléments exigés par l'article 33.3."}
          </Paragraph>
        </Section>
      </ContentPage>

      {/* 6 & 7. CONFINEMENT ET PERSISTANCES */}
      <ContentPage
        title="Confinement et suites"
        subtitle="Ce qui a été fait, ce qui reste à vérifier"
      >
        <Section title="Actions de confinement">
          <Paragraph>
            Les actions ci-dessous sont relevées dans le journal de CIPP : leur horodatage et leur
            opérateur sont attestés par l'outil. Une action menée hors de CIPP figure comme déclarée
            et non attestée.
          </Paragraph>
          {/* One box, not nine: a full page of "non attestée" says nothing a ten-line list
              cannot. */}
          <InfoBox
            title={`Attestées par le journal CIPP : ${doneActions.length} sur ${containment.length}`}
          >
            {containment
              .map((action) =>
                action.done
                  ? `${action.label} : le ${action.firstUtc || 'date inconnue'} par ${
                      action.operator || 'N/D'
                    }${action.hasFailure ? ' (au moins une erreur journalisée)' : ''}`
                  : `${action.label} : non attestée`
              )
              .join('\n')}
          </InfoBox>
        </Section>

        <Section title="Persistances non écartées">
          <Paragraph>
            Une compromission de messagerie laisse des accès qui survivent à la réinitialisation du
            mot de passe. Les points suivants doivent être vérifiés explicitement :
          </Paragraph>
          <BulletList>
            {exposure.notCovered.map((item, index) => (
              <Bullet key={`pers-${index}`}>{item}</Bullet>
            ))}
          </BulletList>
        </Section>

        <Section title="Tiers prévenus">
          {psitAsArray(incident?.ThirdPartiesNotified).length > 0 ? (
            psitAsArray(incident.ThirdPartiesNotified).map((entry, index) => (
              <InfoBox key={`tp-${index}`} title={entry?.Name || entry?.name || 'Tiers'}>
                {entry?.NotifiedUtc || entry?.notifiedUtc
                  ? `Prévenu le ${formatUtc(entry.NotifiedUtc || entry.notifiedUtc)}`
                  : 'Date non renseignée'}
                {(entry?.Channel || entry?.channel) &&
                  `\nCanal : ${entry.Channel || entry.channel}`}
              </InfoBox>
            ))
          ) : (
            <Note>Aucun tiers n'est enregistré comme prévenu à ce stade.</Note>
          )}
        </Section>
      </ContentPage>

      {/* 8. RECOMMANDATIONS */}
      <ContentPage title="Suites recommandées" subtitle="Pour le responsable de traitement">
        <Section title="Sans délai">
          <BulletList>
            <Bullet marker="1." label="Vérifier les persistances listées ci-dessus :">
              {' '}
              consentements applicatifs, secrets d'application, méthodes d'authentification,
              transfert de boîte, protocoles hérités.
            </Bullet>
            <Bullet marker="2." label="Prévenir les tiers concernés :">
              {' '}
              la liste des destinataires des envois signalés figure en annexe. Un tiers qui a reçu
              une demande de virement depuis cette boîte doit être appelé, pas seulement écrit.
            </Bullet>
            <Bullet marker="3." label="En cas de virement exécuté :">
              {' '}
              contacter immédiatement la banque émettrice — un rappel de fonds n'est possible que
              dans un délai très court — puis déposer plainte.
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

        <Section title="Réduction du risque de récidive">
          <BulletList>
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
        title="Annexe — destinataires des envois signalés"
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
              Échantillon : la collecte a retourné {thirdParties.collectedRecipients} lignes de
              suivi sur {thirdParties.totalRecipients}. La liste ci-dessous est donc partielle.
            </Note>
          )}
          <Note>
            Exclus de cette liste : {thirdParties.excluded.systemGenerated} message(s) générés par
            le service (réponses automatiques, avis de non-remise) et{' '}
            {thirdParties.excluded.internal} destinataire(s) interne(s) à l'organisation — une
            réponse automatique partie vers une lettre d'information n'est pas un tiers à prévenir.
            {thirdParties.derivedLocally &&
              ' Cette classification a été calculée à la génération du rapport : la collecte est antérieure à sa mise en place côté API.'}
          </Note>
        </Section>

        <Section title={`Destinataires (${thirdParties.recipients.length})`}>
          {thirdParties.recipients.length > 0 ? (
            <>
              {thirdParties.recipients.slice(0, 60).map((entry, index) => (
                <InfoBox
                  key={entry.address}
                  title={
                    pseudonymise
                      ? `T-${String(index + 1).padStart(2, '0')} — ${entry.domain || 'domaine inconnu'}`
                      : entry.address
                  }
                >
                  {entry.messages} message(s) — {entry.reasons.join(', ')}
                  {'\n'}
                  Du {entry.firstUtc || 'N/D'} au {entry.lastUtc || 'N/D'}
                  {!pseudonymise &&
                    entry.subjects.length > 0 &&
                    `\nObjets : ${entry.subjects.join(' | ')}`}
                </InfoBox>
              ))}
              {thirdParties.recipients.length > 60 && (
                <Note>
                  ... et {thirdParties.recipients.length - 60} autres destinataires (export JSON)
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
        subtitle="Qui a reçu ce rapport, quand, et ce qu'il reste à valider"
      >
        <Section>
          <Paragraph>
            Ce document est produit par Plein Sud IT en qualité de sous-traitant. Les constats et
            les mesures qu'il rapporte relèvent de notre intervention ; les décisions qui en
            découlent — qualification juridique d'une violation de données, notification à
            l'autorité de contrôle et aux personnes concernées, déclaration à l'assureur, dépôt de
            plainte — relèvent du responsable de traitement.
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
          ) : (
            <Note>
              Aucun accusé de réception n'a été enregistré à la date de génération de ce rapport.
              L'absence d'accusé ne vaut pas absence de transmission ; elle signifie que la
              transmission n'a pas été confirmée par écrit.
            </Note>
          )}
        </Section>

        <Section title="Validation par le responsable de traitement">
          <Paragraph>
            À compléter par le client. La signature vaut réception du présent rapport, non
            approbation de son contenu.
          </Paragraph>
          {/* Deliberately blank lines: the signed copy is the artefact, and it has to be printable
              from the PDF without anyone retyping the case reference. */}
          <InfoBox title={`Dossier ${incident?.Reference || 'sans référence'}`}>
            Nom et fonction : ______________________________________________
            {'\n\n'}
            Date : ______________________
            {'\n\n'}
            Signature : ______________________________________________
            {'\n\n'}
            Suite décidée (notification, dépôt de plainte, déclaration assureur, aucune) :{'\n'}
            ______________________________________________________________
          </InfoBox>
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
                  Téléchargement bloqué — à compléter dans la fiche de dossier :{' '}
                  {missing.join(', ')}. Ces éléments sont ceux que l'article 33.3 du RGPD demande de
                  décrire ; un rapport qui les laisse vides a l'air complet, ce qui est pire que pas
                  de rapport. L'aperçu reste consultable.
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
                fileName={`${incident?.Reference || 'Incident_BEC'}_${userData?.userPrincipalName}${
                  pseudonymise ? '_pseudonymise' : ''
                }.pdf`}
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
