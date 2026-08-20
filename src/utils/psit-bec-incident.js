// Derives, from a BEC collection, the exposure facts an incident report must state - and, just as
// importantly, the ones it must refuse to state.
//
// The trap this module exists to avoid: writing "no data was read" because the audit log is silent.
// Reading mail only produces a MailItemsAccessed record with Purview Audit (Premium), and the BEC
// collection does not gather it at all. So the honest default is "cannot be established either
// way", and the analyst has to override it deliberately after checking Purview.

import { SIGNAL_CLASS, classifySentMessages, toUtc } from './psit-bec-signals'
import { psitAsArray } from './psit-as-array'

/** Categories of data subjects, for the GDPR article 33(3) description. */
export const DATA_SUBJECT_CATEGORIES = [
  'Salariés',
  'Candidats',
  'Clients',
  'Prospects',
  'Fournisseurs et sous-traitants',
  'Patients',
  'Mineurs',
  'Représentants légaux',
  'Autres tiers',
]

/** Categories of personal data a mailbox may hold. */
export const DATA_CATEGORIES = [
  'Identification (nom, coordonnées)',
  'Vie professionnelle (poste, CV, évaluations)',
  'Données RH et paie',
  'Données bancaires ou financières',
  'Documents d’identité (pièce d’identité, numéro de sécurité sociale)',
  'Données de santé',
  'Données relatives à des condamnations ou infractions',
  'Données contractuelles et commerciales',
  'Secrets d’affaires',
  'Identifiants et secrets techniques',
]

export const MAIL_READ_STATUS = {
  PROVEN: 'proven',
  NOT_PROVABLE: 'not-provable',
  EXCLUDED: 'excluded',
  UNKNOWN: 'unknown',
}

export const MAIL_READ_LABELS = {
  [MAIL_READ_STATUS.PROVEN]: 'Établie par le journal d’audit',
  [MAIL_READ_STATUS.NOT_PROVABLE]:
    'Ne peut être ni établie ni exclue : le niveau d’audit du tenant ne l’enregistre pas',
  [MAIL_READ_STATUS.EXCLUDED]: 'Exclue par le journal d’audit',
  [MAIL_READ_STATUS.UNKNOWN]: 'Non déterminée à ce stade',
}

export const INCIDENT_STATUS_LABELS = {
  ongoing: 'En cours de traitement',
  contained: 'Confinée',
  monitoring: 'Sous surveillance',
  closed: 'Clôturée',
}

const domainOf = (address) =>
  String(address || '')
    .split('@')
    .pop()
    .toLowerCase()

/**
 * Third parties who received mail from the mailbox during the window, restricted to the sends that
 * looked wrong: a flagged campaign, a burst, or a send whose source address was outside the user's
 * usage location. Deliberately not called "fraud victims" - the collection never reads message
 * content, so what this produces is a list to verify, not a list of proven victims.
 *
 * Goes in an annex, not in the body: it is personal data belonging to third parties.
 */
export const buildThirdPartyExposure = (becData = {}, userData = {}) => {
  const analysis = becData?.SentMessageAnalysis || {}
  const mail = classifySentMessages(becData, userData)
  const flaggedSubjects = new Set(
    (analysis.RepeatedSubjects || [])
      .filter((group) => group.Flagged)
      .map((group) =>
        String(group.Subject || '')
          .trim()
          .toLowerCase()
      )
  )
  const burstWindows = (analysis.Bursts || [])
    .map((burst) => {
      const start = toUtc(burst.WindowStart)
      if (!start) return null
      const startMs = new Date(start).getTime()
      return [startMs, startMs + (burst.WindowMinutes || 10) * 60 * 1000]
    })
    .filter(Boolean)

  // Human, external mail only. The classification is derived locally when the collection predates
  // the API-side flags, which is what once put the mailbox owner, his colleagues and the recipients
  // of automatic replies to newsletters into this annex - 65 "third parties" over nine pages.
  const rows = mail.humanExternal

  const byRecipient = new Map()
  for (const message of rows) {
    const address = String(message?.RecipientAddress || '').toLowerCase()
    if (!address) continue

    const reasons = new Set()
    const subject = String(message?.Subject || '')
      .trim()
      .toLowerCase()
    if (flaggedSubjects.has(subject)) reasons.add('campagne à objet répété')
    if (message?.ForeignLocation === true) reasons.add('envoi depuis une IP hors zone')
    const stamp = toUtc(message?.Received)
    if (stamp) {
      const ms = new Date(stamp).getTime()
      if (burstWindows.some(([from, to]) => ms >= from && ms <= to)) reasons.add("rafale d'envoi")
    }
    if (reasons.size === 0) continue

    if (!byRecipient.has(address)) {
      byRecipient.set(address, {
        address,
        domain: domainOf(address),
        messages: 0,
        firstUtc: null,
        lastUtc: null,
        reasons: new Set(),
        subjects: new Set(),
      })
    }
    const entry = byRecipient.get(address)
    entry.messages += 1
    for (const reason of reasons) entry.reasons.add(reason)
    if (message?.Subject) entry.subjects.add(String(message.Subject))
    if (stamp) {
      if (!entry.firstUtc || stamp < entry.firstUtc) entry.firstUtc = stamp
      if (!entry.lastUtc || stamp > entry.lastUtc) entry.lastUtc = stamp
    }
  }

  const recipients = [...byRecipient.values()]
    .map((entry) => ({
      ...entry,
      reasons: [...entry.reasons],
      subjects: [...entry.subjects].slice(0, 3),
    }))
    .sort((a, b) => b.messages - a.messages || a.address.localeCompare(b.address))

  // The collection caps the message list it returns, so the annex must say when it is a sample.
  const collected = mail.counts.collected
  const total = analysis.TotalRecipients ?? collected

  return {
    recipients,
    domains: [...new Set(recipients.map((entry) => entry.domain))],
    truncated: total > collected,
    collectedRecipients: collected,
    totalRecipients: total,
    excluded: {
      systemGenerated: mail.counts.systemGenerated,
      internal: mail.counts.internal,
    },
    derivedLocally: mail.derivedLocally,
  }
}

/**
 * What can and cannot be asserted about exposure. Every field carries its basis, because an
 * incident report that states a fact without its basis is a liability.
 */
export const buildExposure = (becData = {}, signals = [], triage = [], userData = {}) => {
  const determinations = new Map(
    psitAsArray(triage).map((entry) => [String(entry?.SignalId), entry])
  )
  const established = signals.filter((signal) => signal.class === SIGNAL_CLASS.ESTABLISHED)
  const confirmedByAnalyst = signals.filter(
    (signal) => determinations.get(signal.id)?.Verdict === 'unexpected'
  )

  const accessBasis = [...established, ...confirmedByAnalyst].map((signal) => signal.title)

  const exfiltration = []
  for (const signal of established) {
    if (signal.id.startsWith('rule-exfil:')) {
      exfiltration.push({
        label: 'Règle de transfert vers l’extérieur',
        detail: signal.detail,
        basis: signal.title,
      })
    }
    if (signal.id === 'sharing-anonymous') {
      exfiltration.push({
        label: 'Lien de partage anonyme',
        detail: signal.detail,
        basis: signal.title,
      })
    }
  }
  // Human, external mail sent from an address that is neither Microsoft's nor in the usage
  // location. Counting the raw ForeignLocation flag turned 166 service-submitted automatic replies
  // into a claimed exfiltration in a report meant for a DPO.
  const mail = classifySentMessages(becData, userData)
  if (mail.foreignHumanExternal.length > 0) {
    exfiltration.push({
      label: 'Courrier envoyé depuis une adresse hors zone',
      detail: `${mail.foreignHumanExternal.length} message(s) envoyés par l'utilisateur à des destinataires externes depuis une adresse hors du pays d'utilisation déclaré, hors messages générés par le service.`,
      basis: 'Suivi des messages',
    })
  }

  // A measurable floor for the article 33.3 question "approximate number of data subjects". It is
  // NOT that number - the mailbox contents are never read, so who is in it is unknown - but an
  // analyst asked to write "environ 1 200" with nothing to lean on will either guess or leave the
  // field empty, and a DPO cannot defend either. Distinct external correspondents over the window
  // is a fact, and the report labels it as the narrow thing it is.
  const correspondents = new Set(
    mail.humanExternal
      .map((message) => String(message?.RecipientAddress || '').toLowerCase())
      .filter(Boolean)
  )
  const analysis = becData?.SentMessageAnalysis || {}
  const collectedRecipients = mail.counts.collected
  const declaredRecipients = analysis.TotalRecipients ?? collectedRecipients

  return {
    accessEstablished: accessBasis.length > 0,
    accessBasis,
    correspondentFloor: {
      distinct: correspondents.size,
      // True when the trace is a sample: the floor is then itself understated.
      truncated: declaredRecipients > collectedRecipients,
      collectedRecipients,
      declaredRecipients,
    },
    // No MailItemsAccessed in this collection, so reading is never asserted from here.
    mailReadSuggested: MAIL_READ_STATUS.NOT_PROVABLE,
    mailReadNote:
      "La lecture des messages n'est enregistrée que par l'événement MailItemsAccessed, qui relève de Purview Audit (Premium) et n'est pas collecté par cet outil. En l'absence de cet élément, la lecture ne peut être ni établie ni exclue.",
    exfiltration,
    // Persistence paths this collection does not cover, listed so the report cannot be read as
    // clearing them. Verified against what the BEC run actually gathers.
    notCovered: [
      "Consentements OAuth de l'utilisateur (seules les applications créées pendant la fenêtre et celles du catalogue malveillant sont collectées)",
      'Secrets et certificats ajoutés à une application existante',
      'Pass d’accès temporaire (TAP) et méthodes d’authentification ajoutées hors fenêtre',
      'Transfert configuré au niveau de la boîte (ForwardingSmtpAddress)',
      'Protocoles hérités IMAP et POP activés sur la boîte',
      'Règles masquées absentes de la vue Exchange (visibles uniquement en MAPI)',
      'Paramètres de fédération de domaine et accès inter-locataires',
      'Connexions non interactives (jetons, IMAP, EWS)',
    ],
  }
}

/**
 * Canonical containment actions, matched against what CIPP's log actually shows. Anything the log
 * does not attest stays "non attesté" rather than becoming a tick: the difference between the two
 * is the whole value of this section.
 */
export const CONTAINMENT_ACTIONS = [
  { key: 'PasswordReset', label: 'Mot de passe réinitialisé' },
  { key: 'SignInBlocked', label: 'Connexion bloquée' },
  { key: 'SessionsRevoked', label: 'Sessions et jetons révoqués' },
  { key: 'MfaMethodsRemoved', label: 'Méthodes MFA retirées' },
  { key: 'InboxRulesDisabled', label: 'Règles de boîte désactivées' },
  { key: 'SharingDisabled', label: 'Partages OneDrive désactivés' },
  { key: 'ForwardingRemoved', label: 'Transfert supprimé' },
  { key: 'ConsentRevoked', label: 'Consentements applicatifs révoqués' },
  { key: 'AdminRoleRemoved', label: 'Rôles administrateur retirés' },
]

export const buildContainment = (remediation = {}) => {
  const performed = new Map(
    psitAsArray(remediation?.ActionsPerformed).map((entry) => [String(entry.Action), entry])
  )
  return CONTAINMENT_ACTIONS.map((action) => {
    const entry = performed.get(action.key)
    return {
      ...action,
      done: Boolean(entry),
      firstUtc: entry?.FirstUtc || null,
      operator: entry?.Operator || null,
      hasFailure: Boolean(entry?.HasFailure),
      count: entry?.Count || 0,
    }
  })
}
