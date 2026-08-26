// Turns a BEC collection into decision material: three classes of signal, an aggregation of
// sign-ins by source address, a UTC chronology, and a verdict that refuses to invent itself.
//
// Why this exists: the upstream report scores counters. On a real case that produced "risque
// élevé" out of 12 points, 9 of which were artefacts (service-generated mail counted as foreign
// activity, a recruiter's morning counted as a mass-mail campaign, two supplier filing rules
// counted merely for existing) while the one genuine signal - 22 successful sign-ins from a
// single Italian address - was worth 3 and would have scored "faible" on its own. Counting is not
// judging, so signals are separated by *who can decide them*:
//
//   established - the data settles it, no human input needed.
//   toQualify   - the data is real, its meaning depends on a fact only a human holds.
//   noise       - excluded from the verdict, kept visible so the exclusion is auditable.
//
// Everything here is a pure function of becData plus the recorded triage, so it is unit-testable
// and produces the same verdict in the panel and in the report.

import { psitAsArray } from './psit-as-array'
import { countryName } from './psit-country-names'
import { agree, cardinal, counted, dateProse, enumerate } from './psit-report-prose'

// Exported since the SOC checks read rules the same way: two definitions of "a folder the
// account holder never opens" would drift apart, and the drift would be silent.
export const HIDING_FOLDER_PATTERN =
  /rss|conversation history|archive|junk|deleted|notes|sync issues|corbeille|indésirable|éléments supprimés/i

export const SIGNAL_CLASS = {
  ESTABLISHED: 'established',
  TO_QUALIFY: 'toQualify',
  NOISE: 'noise',
}

export const VERDICT_STATUS = {
  COMPROMISED: 'compromised',
  TO_QUALIFY: 'toQualify',
  UNDETERMINED: 'undetermined',
  CLEAN: 'clean',
}

/** ISO 8601 in UTC, seconds precision. One time base for the whole report. */
export const toUtc = (value) => {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return `${date.toISOString().slice(0, 19)}Z`
}

/** Human-readable UTC, unambiguous and locale-independent: "2026-08-20 06:54 UTC". */
export const formatUtc = (value) => {
  const iso = toUtc(value)
  if (!iso) return 'N/D'
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`
}

const domainOf = (address) =>
  String(address || '')
    .split('@')
    .pop()
    .toLowerCase()

/**
 * The analysis window, ending at ExtractedAt. The chronology has to be bounded by it: without this,
 * an MFA method registered in 2021 lands in the timeline of a 7-day investigation and, worse, gets
 * read as the first unauthorised access.
 *
 * The length is read from the collection (AnalysisWindowDays), not assumed: both reports print the
 * window as a fact, and if upstream ever changes the depth of the collection a hardcoded 7 would
 * make every report state a window that was never analysed. The fallback stays 7, which is what
 * the collection has always used.
 */
export const getAnalysisWindow = (becData = {}, days = null) => {
  const declared = Number(becData?.AnalysisWindowDays)
  const span = days ?? (Number.isFinite(declared) && declared > 0 ? declared : 7)
  const end = toUtc(becData?.ExtractedAt) || toUtc(new Date().toISOString())
  const endMs = new Date(end).getTime()
  return {
    days: span,
    // Disclosed so a report can say whether the window is the collection's own or an assumption.
    daysDeclared: Number.isFinite(declared) && declared > 0,
    startUtc: `${new Date(endMs - span * 24 * 60 * 60 * 1000).toISOString().slice(0, 19)}Z`,
    endUtc: end,
  }
}

// Subject prefixes for mail the service or the client generates on the user's behalf. Mirrors the
// pattern in Get-PSITBecOutboundClassification.ps1; kept here as well because a report is often
// rendered from a collection made before that classification existed, and a client-facing document
// must not depend on a flag that may be absent.
const SYSTEM_SUBJECT_PATTERN =
  /^\s*(r[ée]ponse\s+auto(matique)?|automatic\s+reply|automatische\s+antwort|respuesta\s+autom[áa]tica|out\s+of\s+office|undeliverable|non[- ]remis|[ée]chec\s+de\s+la\s+remise|delivery\s+status\s+notification|mail\s+delivery\s+failed)\s*[:\-]/i

const MICROSOFT_PREFIXES = [
  { v: 6, prefix: '2603:1000::', bits: 24 },
  { v: 6, prefix: '2a01:0111::', bits: 32 },
  { v: 6, prefix: '2620:01ec::', bits: 36 },
  { v: 4, prefix: '40.92.0.0', bits: 15 },
  { v: 4, prefix: '40.107.0.0', bits: 16 },
  { v: 4, prefix: '52.100.0.0', bits: 14 },
  { v: 4, prefix: '104.47.0.0', bits: 17 },
]

const ipv4ToInt = (address) =>
  address.split('.').reduce((total, part) => total * 256 + (Number(part) & 0xff), 0)

const ipv6ToBits = (address) => {
  const [head, tail = ''] = address.replace(/^\[|\]$/g, '').split('::')
  const headGroups = head ? head.split(':').filter(Boolean) : []
  const tailGroups = tail ? tail.split(':').filter(Boolean) : []
  const missing = 8 - headGroups.length - tailGroups.length
  const groups = [...headGroups, ...Array(Math.max(missing, 0)).fill('0'), ...tailGroups]
  return groups
    .slice(0, 8)
    .map((group) =>
      parseInt(group || '0', 16)
        .toString(2)
        .padStart(16, '0')
    )
    .join('')
}

/** Is this the address of Microsoft's own mail infrastructure rather than the user's? */
export const isServiceIp = (value) => {
  const raw = String(value || '')
    .replace(/^\[|\]$/g, '')
    .trim()
  if (!raw) return false
  const isV6 = raw.includes(':') && !/^\d{1,3}(\.\d{1,3}){3}:\d+$/.test(raw)
  const address = isV6 ? raw.split('%')[0] : raw.replace(/:\d+$/, '')

  for (const entry of MICROSOFT_PREFIXES) {
    if (entry.v === 6 && isV6) {
      if (
        ipv6ToBits(address).slice(0, entry.bits) === ipv6ToBits(entry.prefix).slice(0, entry.bits)
      ) {
        return true
      }
    }
    if (entry.v === 4 && !isV6 && /^\d{1,3}(\.\d{1,3}){3}$/.test(address)) {
      const mask = entry.bits === 0 ? 0 : (-1 << (32 - entry.bits)) >>> 0
      if ((ipv4ToInt(address) & mask) === (ipv4ToInt(entry.prefix) & mask)) return true
    }
  }
  return false
}

/**
 * Classifies the outbound trace rows the collection returned. Uses the API flags when present and
 * derives them otherwise, so a report never asserts "166 messages sent from abroad" about mail that
 * Exchange Online submitted on the user's behalf.
 */
export const classifySentMessages = (becData = {}, userData = {}) => {
  const userDomain = domainOf(userData?.userPrincipalName)
  const rows = (becData?.SentMessages || []).map((message) => {
    const subject = String(message?.Subject || '')
    const recipientDomain = domainOf(message?.RecipientAddress)
    const systemGenerated =
      typeof message?.SystemGenerated === 'boolean'
        ? message.SystemGenerated
        : SYSTEM_SUBJECT_PATTERN.test(subject)
    const serviceIp =
      typeof message?.ServiceIp === 'boolean' ? message.ServiceIp : isServiceIp(message?.FromIP)
    const internal =
      typeof message?.Internal === 'boolean'
        ? message.Internal
        : Boolean(recipientDomain) && recipientDomain === userDomain
    return { ...message, systemGenerated, serviceIp, internal }
  })

  const humanExternal = rows.filter((row) => !row.systemGenerated && !row.internal)
  return {
    rows,
    humanExternal,
    // Only mail a person actually sent outside the organisation, from an address that is not
    // Microsoft's, can be read as activity from an unexpected place.
    foreignHumanExternal: humanExternal.filter(
      (row) => !row.serviceIp && row.ForeignLocation === true
    ),
    counts: {
      collected: rows.length,
      systemGenerated: rows.filter((row) => row.systemGenerated).length,
      serviceIp: rows.filter((row) => row.serviceIp).length,
      internal: rows.filter((row) => row.internal).length,
      humanExternal: humanExternal.length,
      totalRecipients: becData?.SentMessageAnalysis?.TotalRecipients ?? rows.length,
      totalMessages: becData?.SentMessageAnalysis?.TotalMessages ?? rows.length,
    },
    // True when the collection predates the API-side classification, which is worth stating: the
    // numbers below were derived locally rather than at collection time.
    derivedLocally: (becData?.SentMessages || []).some(
      (message) => typeof message?.SystemGenerated !== 'boolean'
    ),
  }
}

/**
 * Consecutive sign-ins from one address are one session, not twenty findings. Grouping is per
 * address and independent of the order events arrive in: interleaving two addresses must not split
 * either of them. A 30-minute gap
 * starts a new one, which is what turns three pages of near-identical chronology lines into the
 * two sessions they actually represent.
 */
export const buildSignInSessions = (signIns = [], gapMinutes = 30) => {
  const successful = signIns
    .filter((signIn) => signIn?.Status === 'Success' && toUtc(signIn?.CreatedDateTime))
    .map((signIn) => ({ ...signIn, stamp: toUtc(signIn.CreatedDateTime) }))
    .sort((a, b) => a.stamp.localeCompare(b.stamp))

  const gapMs = gapMinutes * 60 * 1000
  const sessions = []
  // One open session per address, held by address rather than by arrival order.
  //
  // This used to extend a session only when it was the LAST one pushed, so two addresses active in
  // alternation - a compromise while the account holder keeps working, which is the ordinary case -
  // fragmented into one zero-length session per event. Six sign-ins over twenty minutes from two
  // addresses produced six instantaneous sessions instead of two twenty-minute windows, and the
  // chronology said so in writing.
  const open = new Map()

  for (const signIn of successful) {
    const ip = String(signIn.IPAddress || 'inconnue')
    const current = open.get(ip)
    // `<=` on purpose: a sign-in exactly `gapMinutes` after the previous one continues the session.
    const continues =
      current && new Date(signIn.stamp).getTime() - new Date(current.endUtc).getTime() <= gapMs

    if (continues) {
      current.endUtc = signIn.stamp
      current.count += 1
      if (signIn.AppDisplayName) current.apps.add(signIn.AppDisplayName)
      if (signIn.City) current.cities.add(signIn.City)
    } else {
      const session = {
        ip,
        country: signIn.Country || null,
        startUtc: signIn.stamp,
        endUtc: signIn.stamp,
        count: 1,
        foreign: signIn.ForeignLocation === true,
        apps: new Set([signIn.AppDisplayName].filter(Boolean)),
        cities: new Set([signIn.City].filter(Boolean)),
      }
      sessions.push(session)
      open.set(ip, session)
    }
  }

  return sessions.map((session) => ({
    ...session,
    apps: [...session.apps],
    cities: [...session.cities],
  }))
}

const ruleTargets = (rule) =>
  [rule?.ForwardTo, rule?.ForwardAsAttachmentTo, rule?.RedirectTo]
    .flatMap((value) => {
      if (!value) return []
      const text = Array.isArray(value) ? value.join(' ') : String(value)
      return text.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) || []
    })
    .map((address) => address.toLowerCase())

/**
 * Groups sign-ins by source address. Twenty-two events from one address are one fact, not
 * twenty-two findings, and the split between successes and failures is the whole point: failed
 * attempts from fifteen countries are password spraying, successes from one address are access.
 */
export const groupSignInsByIp = (signIns = []) => {
  const groups = new Map()

  for (const signIn of signIns) {
    const ip = String(signIn?.IPAddress || 'unknown')
    if (!groups.has(ip)) {
      groups.set(ip, {
        ip,
        country: signIn?.Country || null,
        cities: new Set(),
        apps: new Set(),
        successes: 0,
        failures: 0,
        firstSeenUtc: null,
        lastSeenUtc: null,
        foreign: signIn?.ForeignLocation === true,
      })
    }
    const group = groups.get(ip)
    if (signIn?.City) group.cities.add(signIn.City)
    if (signIn?.AppDisplayName) group.apps.add(signIn.AppDisplayName)
    if (signIn?.Status === 'Success') group.successes += 1
    else group.failures += 1
    if (signIn?.ForeignLocation === true) group.foreign = true

    const stamp = toUtc(signIn?.CreatedDateTime)
    if (stamp) {
      if (!group.firstSeenUtc || stamp < group.firstSeenUtc) group.firstSeenUtc = stamp
      if (!group.lastSeenUtc || stamp > group.lastSeenUtc) group.lastSeenUtc = stamp
    }
  }

  return (
    [...groups.values()]
      .map((group) => ({
        ...group,
        cities: [...group.cities],
        apps: [...group.apps],
        total: group.successes + group.failures,
      }))
      // Successful and foreign first: that is the order an analyst reads in.
      .sort(
        (a, b) =>
          Number(b.foreign && b.successes > 0) - Number(a.foreign && a.successes > 0) ||
          b.successes - a.successes ||
          b.total - a.total
      )
  )
}

/**
 * One chronology, in UTC, merging what the upstream report scatters across six pages in two
 * different time bases. This is what makes "signed in from Italy at 06:49Z, sent mail from France
 * at 07:52Z" visible at all.
 */
export const buildTimeline = (becData = {}) => {
  const window = getAnalysisWindow(becData)
  const events = []
  const context = []
  const push = (timestamp, kind, label, detail) => {
    const stamp = toUtc(timestamp)
    if (!stamp) return
    const entry = { timestampUtc: stamp, kind, label, detail }
    // Out of window goes to `context`, never into the chronology: an authentication method
    // registered in 2021 has no business in the timeline of a seven-day investigation, and it must
    // never be mistaken for the first unauthorised access.
    if (stamp < window.startUtc || stamp > window.endUtc) context.push(entry)
    else events.push(entry)
  }

  for (const session of buildSignInSessions(becData?.SuspectUserSignIns || [])) {
    const span =
      session.startUtc === session.endUtc
        ? ''
        : ` jusqu'à ${session.endUtc.slice(11, 19)}, ${counted(session.count, 'connexion')}`
    push(
      session.startUtc,
      'signin',
      `Session depuis ${session.ip}${
        session.country ? `, ${countryName(session.country)}` : ''
      }${span}`,
      [session.cities.join(', '), session.apps.slice(0, 4).join(', ')].filter(Boolean).join(', ')
    )
  }
  for (const change of becData?.InboxRuleChanges || []) {
    push(
      change?.Date,
      'rule',
      `Règle ${change?.Operation || 'modifiée'} : ${change?.RuleName || 'sans nom'}`,
      change?.ClientIP || ''
    )
  }
  for (const change of becData?.SafelistChanges || []) {
    push(change?.Date, 'safelist', "Modification des listes d'expéditeurs", change?.ClientIP || '')
  }
  for (const change of becData?.SharingChanges || []) {
    push(
      change?.Date,
      'sharing',
      `Partage : ${change?.Operation || 'modifié'}`,
      change?.FileName || change?.ItemUrl || ''
    )
  }
  for (const burst of becData?.SentMessageAnalysis?.Bursts || []) {
    push(
      burst?.WindowStart,
      'mail',
      `Rafale d'envoi : ${counted(burst?.MessageCount ?? 0, 'message')} vers ${counted(
        burst?.RecipientCount ?? 0,
        'destinataire'
      )}`,
      burst?.TopSubject || ''
    )
  }
  for (const method of becData?.MFADevices || []) {
    push(
      method?.createdDateTime,
      'mfa',
      `Méthode MFA enregistrée : ${method?.displayName || method?.['@odata.type'] || 'inconnue'}`,
      ''
    )
  }

  events.sort((a, b) => a.timestampUtc.localeCompare(b.timestampUtc))
  context.sort((a, b) => a.timestampUtc.localeCompare(b.timestampUtc))
  // Returns an array so existing callers keep working, with the out-of-window items attached.
  events.context = context
  events.window = window
  return events
}

/**
 * The earliest access that the investigation actually retains as unauthorised - never simply the
 * first row of the timeline, which is how a 2021 authentication method once became "premier accès
 * non autorisé observé" in an incident report meant for a DPO.
 *
 * Derived from the retained sign-in signals only: an established signal, or one the analyst
 * qualified as unexpected. Returns null when nothing supports a date, and the report then says so.
 */
export const firstUnauthorisedAccessUtc = (becData = {}, signals = [], triage = []) => {
  const determinations = new Map(
    psitAsArray(triage).map((entry) => [String(entry?.SignalId), entry])
  )
  const retainedIps = signals
    .filter(
      (signal) =>
        signal.id.startsWith('signin-ip:') &&
        (signal.class === SIGNAL_CLASS.ESTABLISHED ||
          determinations.get(signal.id)?.Verdict === 'unexpected')
    )
    .map((signal) => signal.id.replace('signin-ip:', ''))

  if (retainedIps.length === 0) return null

  const stamps = (becData?.SuspectUserSignIns || [])
    .filter(
      (signIn) => signIn?.Status === 'Success' && retainedIps.includes(String(signIn?.IPAddress))
    )
    .map((signIn) => toUtc(signIn.CreatedDateTime))
    .filter(Boolean)
    .sort()

  return stamps[0] || null
}

/**
 * Splits recorded determinations into the ones that still speak for the collection in hand and the
 * ones that no longer do.
 *
 * Why this exists: signal ids are derived from stable discriminators - a source address, a rule
 * name - so they survive across collections on purpose, which is what lets a determination outlive
 * a re-run. The same property is a trap when the mailbox is compromised a second time months later:
 * the attacker returns from the same address, and the answer given in August ("attendu, l'utilisateur
 * était en Italie") is applied to a November event and files it as noise, without asking anyone.
 *
 * So an answer decided before the current window opened is stale: the signal goes back to being a
 * question, and the previous answer is shown as history rather than acted on. Closing the case
 * archives determinations properly (see Close-PSITBecIncident); this covers the case nobody closed.
 */
export const partitionDeterminations = (triage = [], becData = {}) => {
  const window = getAnalysisWindow(becData)
  const current = []
  const stale = []

  for (const determination of psitAsArray(triage)) {
    const decided = toUtc(determination?.DecidedUtc)
    // No timestamp: treated as current. A determination without a date is a data problem, not a
    // reason to discard a human answer.
    if (!decided || decided >= window.startUtc) {
      current.push(determination)
    } else {
      stale.push(determination)
    }
  }

  return { current, stale, windowStartUtc: window.startUtc }
}

/**
 * The signal set. Ids are the triage keys, so they are derived from stable discriminators (source
 * address, rule name) rather than from array positions - a determination must survive the next
 * collection. Renaming a rule does start a fresh question, which is the honest behaviour: it is a
 * different rule as far as the evidence goes.
 */
export const buildSignals = (becData = {}, userData = {}) => {
  const signals = []
  const userDomain = domainOf(userData?.userPrincipalName)
  const usageLocation = becData?.LocationAnalysis?.UsageLocation || null

  const add = (signal) => signals.push(signal)

  // --- established --------------------------------------------------------------------------
  const rules = becData?.NewRules || []
  for (const rule of rules) {
    const name = rule?.Name || 'Règle sans nom'
    const targets = ruleTargets(rule)
    const externalTargets = targets.filter((address) => domainOf(address) !== userDomain)
    if (externalTargets.length > 0) {
      add({
        id: `rule-exfil:${name}`,
        class: SIGNAL_CLASS.ESTABLISHED,
        category: 'rules',
        title: `La règle « ${name} » envoie du courrier hors de l'organisation`,
        detail: `Destinataires externes : ${externalTargets.join(', ')}. Un transfert ou une redirection vers l'extérieur survit à une réinitialisation de mot de passe.`,
        evidence: ['NewRules'],
      })
      continue
    }
    if (rule?.DeleteMessage || HIDING_FOLDER_PATTERN.test(String(rule?.MoveToFolder || ''))) {
      add({
        id: `rule-hide:${name}`,
        class: SIGNAL_CLASS.ESTABLISHED,
        category: 'rules',
        title: `La règle « ${name} » supprime ou dissimule du courrier`,
        detail: rule?.DeleteMessage
          ? 'La règle supprime les messages entrants.'
          : `La règle déplace les messages vers « ${rule.MoveToFolder} », un dossier que le titulaire du compte ne consulte pas.`,
        evidence: ['NewRules'],
      })
      continue
    }
    // A rule that only files supplier mail into a business folder. Real, benign by default,
    // still worth a yes/no from someone who knows the mailbox.
    add({
      id: `rule-filing:${name}`,
      class: SIGNAL_CLASS.TO_QUALIFY,
      category: 'rules',
      title: `Règle de boîte de réception « ${name} »`,
      detail: `Aucune action d'exfiltration : ${
        rule?.MoveToFolder
          ? `classement vers « ${rule.MoveToFolder} »`
          : 'pas de transfert, pas de suppression'
      }.`,
      question: `La règle « ${name} » fait-elle partie du fonctionnement normal de cette boîte ?`,
      suggestion: 'expected',
      evidence: ['NewRules'],
    })
  }

  // A catalog application matters in two different ways, and conflating them is what put
  // "compromission établie" on a mailbox whose only in-window signal was a single sign-in still
  // waiting to be qualified: PerfectData Software, present in the tenant since April 2024, was read
  // as evidence of a compromise investigated in August 2026. Consent survives a password reset, so
  // an application that appeared during the window is settled by the data alone; the same
  // application present for two years is a standing exposure to remediate, not proof of *this*
  // compromise. Both are reported, each in its own class.
  //
  // The date is the creation of the service principal in the tenant: it bounds the first grant, not
  // the last one. A fresh consent on an application already present does not move it, so the
  // out-of-window wording asks for the grant to be checked rather than declaring the application
  // out of scope, and a catalog application with no date at all becomes a question instead of being
  // dropped. An entry taken from AddedApps is in window by construction, the collection listing
  // only applications created during it, so a missing date there is never read as old.
  const appWindow = getAnalysisWindow(becData)
  const catalogApps = []
  const seenCatalogApps = new Set()
  const addCatalogApp = (app, { collectedInWindow }) => {
    const name =
      app?.displayName || app?.appDisplayName || app?.CatalogName || app?.MaliciousMatch?.Name
    const key = String(app?.appId || name || '').toLowerCase()
    if (!key || seenCatalogApps.has(key)) return
    seenCatalogApps.add(key)
    const createdUtc = toUtc(app?.createdDateTime)
    catalogApps.push({
      key,
      name: name || 'application inconnue',
      createdUtc,
      dated: Boolean(createdUtc) || collectedInWindow,
      inWindow: collectedInWindow || (createdUtc ? createdUtc >= appWindow.startUtc : false),
    })
  }
  // AddedApps first: an application both created during the window and listed in the catalog
  // appears in the two collections, and the audit-based one carries the stronger basis.
  for (const app of psitAsArray(becData?.AddedApps)) {
    if (app?.MaliciousMatch) addCatalogApp(app, { collectedInWindow: true })
  }
  for (const app of psitAsArray(becData?.MaliciousSPs)) {
    addCatalogApp(app, { collectedInWindow: false })
  }
  const appLabel = (app) =>
    app.createdUtc ? `${app.name}, présente depuis ${dateProse(app.createdUtc)}` : app.name

  const appsInWindow = catalogApps.filter((app) => app.inWindow)
  const appsBeforeWindow = catalogApps.filter((app) => !app.inWindow && app.dated)
  const appsUndated = catalogApps.filter((app) => !app.inWindow && !app.dated)

  if (appsInWindow.length > 0) {
    add({
      id: 'app-malicious',
      class: SIGNAL_CLASS.ESTABLISHED,
      category: 'apps',
      title: `${counted(appsInWindow.length, 'application')} du catalogue malveillant ${agree(
        appsInWindow.length,
        'application',
        'apparu'
      )} pendant la fenêtre analysée`,
      detail: `${enumerate(appsInWindow.map(appLabel))}. Un accès obtenu par consentement ne disparaît pas avec le mot de passe.`,
      evidence: ['MaliciousSPs', 'AddedApps'],
    })
  }

  for (const app of appsUndated) {
    add({
      id: `app-malicious-undated:${app.key}`,
      class: SIGNAL_CLASS.TO_QUALIFY,
      category: 'apps',
      title: `Application du catalogue malveillant « ${app.name} », date d'apparition inconnue`,
      detail:
        "La collecte n'a ramené aucune date de création pour cette application : sa présence ne peut être ni rattachée ni écartée de la fenêtre analysée.",
      question: `Le consentement accordé à « ${app.name} » date-t-il de la fenêtre analysée ? La date figure sur les autorisations de l'application dans Entra.`,
      evidence: ['MaliciousSPs'],
    })
  }

  if (appsBeforeWindow.length > 0) {
    add({
      id: 'app-malicious-preexisting',
      class: SIGNAL_CLASS.NOISE,
      category: 'apps',
      title: `${counted(appsBeforeWindow.length, 'application')} du catalogue malveillant ${agree(
        appsBeforeWindow.length,
        'application',
        'antérieur'
      )} à la fenêtre analysée`,
      detail: `${enumerate(
        appsBeforeWindow.map(appLabel)
      )}, soit avant le début de la fenêtre (${formatUtc(
        appWindow.startUtc
      )}). La présence reste à traiter, elle n'établit pas cette compromission. La date est celle de l'apparition de l'application dans le tenant et non celle du dernier consentement. Si la présence n'est pas expliquée, supprimer l'application et contrôler ses autorisations ainsi que la date de son consentement.`,
      evidence: ['MaliciousSPs'],
    })
  }

  const anonymousLinks = (becData?.SharingChanges || []).filter((change) =>
    String(change?.Operation || '').startsWith('AnonymousLink')
  )
  if (anonymousLinks.length > 0) {
    add({
      id: 'sharing-anonymous',
      class: SIGNAL_CLASS.ESTABLISHED,
      category: 'sharing',
      title: `${counted(anonymousLinks.length, 'objet')} de partage anonyme créé pendant la fenêtre`,
      detail:
        "Le contenu est accessible à quiconque détient l'URL, indépendamment de toute remédiation sur le compte.",
      evidence: ['SharingChanges'],
    })
  }

  const foreignConfigChanges = [
    ...(becData?.InboxRuleChanges || []).map((change) => ({ change, what: 'une règle de boîte' })),
    ...(becData?.SafelistChanges || []).map((change) => ({
      change,
      what: "les listes d'expéditeurs",
    })),
    ...(becData?.SharingChanges || []).map((change) => ({ change, what: 'un partage' })),
  ].filter((entry) => entry.change?.ForeignLocation === true)
  if (foreignConfigChanges.length > 0) {
    add({
      id: 'config-change-foreign',
      class: SIGNAL_CLASS.ESTABLISHED,
      category: 'rules',
      title: `${counted(
        foreignConfigChanges.length,
        'modification'
      )} de configuration depuis une adresse hors du pays d'utilisation`,
      detail: `Modifie ${[...new Set(foreignConfigChanges.map((entry) => entry.what))].join(', ')}. Un déplacement explique une connexion, rarement une modification de configuration.`,
      evidence: ['InboxRuleChanges', 'SafelistChanges', 'SharingChanges'],
    })
  }

  // --- to qualify ---------------------------------------------------------------------------
  const signInGroups = groupSignInsByIp(becData?.SuspectUserSignIns || [])
  for (const group of signInGroups) {
    if (group.successes === 0 || !group.foreign) continue
    add({
      id: `signin-ip:${group.ip}`,
      class: SIGNAL_CLASS.TO_QUALIFY,
      category: 'signin',
      title: `${counted(group.successes, 'connexion')} réussie${
        group.successes > 1 ? 's' : ''
      } depuis ${group.ip}${group.country ? `, ${countryName(group.country)}` : ''}`,
      detail: `${group.cities.join(', ') || 'ville non déterminée'}, du ${formatUtc(group.firstSeenUtc)} au ${formatUtc(
        group.lastSeenUtc
      )}. Applications : ${group.apps.slice(0, 4).join(', ') || 'inconnues'}${
        group.failures > 0
          ? `. ${counted(group.failures, 'tentative')} en échec depuis la même adresse.`
          : ''
      }`,
      question: `Le titulaire du compte était-il à cet endroit, ou derrière un VPN ou un roaming, entre le ${formatUtc(
        group.firstSeenUtc
      )} et le ${formatUtc(group.lastSeenUtc)} ?${usageLocation ? ` (pays déclaré : ${usageLocation})` : ''}`,
      evidence: ['SuspectUserSignIns'],
    })
  }

  const analysis = becData?.SentMessageAnalysis
  if (analysis?.Flagged) {
    const bursts = analysis?.Bursts?.length || 0
    const campaigns = analysis?.FlaggedSubjectCount || 0
    const mail = classifySentMessages(becData, userData)
    add({
      id: 'mail-pattern',
      class: SIGNAL_CLASS.TO_QUALIFY,
      category: 'mail',
      title: "Volume d'envoi inhabituel",
      detail: `${counted(campaigns, 'objet')} répété et ${counted(
        bursts,
        'tentative'
      )} en rafale. Sur ${counted(mail.counts.collected, 'ligneSuivi')} collectée : ${counted(
        mail.counts.humanExternal,
        'destinataire'
      )} externe, ${counted(
        mail.counts.systemGenerated,
        'message'
      )} généré par le service et ${counted(
        mail.counts.internal,
        'destinataire'
      )} interne, exclus du calcul.`,
      question:
        "Ce volume correspond-il à l'activité normale de ce poste (commercial, recrutement, support) ?",
      evidence: ['SentMessageAnalysis'],
    })
  }

  const recentMfa = (becData?.MFADevices || []).filter((method) => {
    const created = toUtc(method?.createdDateTime)
    if (!created) return false
    const extracted = toUtc(becData?.ExtractedAt) || toUtc(new Date().toISOString())
    const windowStart = new Date(
      new Date(extracted).getTime() - 7 * 24 * 60 * 60 * 1000
    ).toISOString()
    return created >= `${windowStart.slice(0, 19)}Z`
  })
  if (recentMfa.length > 0) {
    add({
      id: 'mfa-recent',
      class: SIGNAL_CLASS.TO_QUALIFY,
      category: 'mfa',
      title: `${counted(recentMfa.length, 'methode')} d'authentification enregistrée pendant la fenêtre`,
      detail: recentMfa
        .map(
          (method) =>
            `${method?.displayName || method?.['@odata.type']} le ${formatUtc(method?.createdDateTime)}`
        )
        .join(' ; '),
      question: "Le titulaire du compte a-t-il lui-même enregistré cette méthode d'authentification ?",
      evidence: ['MFADevices'],
    })
  }

  const permissionChanges = (becData?.MailboxPermissionChanges || []).filter(
    (change) => change?.TargetsSuspect === true
  )
  if (permissionChanges.length > 0) {
    add({
      id: 'permission-targeting-user',
      class: SIGNAL_CLASS.TO_QUALIFY,
      category: 'permissions',
      title: `${counted(permissionChanges.length, 'modification')} de permission sur cette boîte`,
      detail: permissionChanges
        .map((change) => `${change?.Operation} par ${change?.UserKey || 'inconnu'}`)
        .join(' ; '),
      question: 'Cette délégation a-t-elle été demandée par le service concerné ?',
      evidence: ['MailboxPermissionChanges'],
    })
  }

  // --- noise, kept visible ------------------------------------------------------------------
  const failedOnly = signInGroups.filter((group) => group.successes === 0)
  if (failedOnly.length > 0) {
    const attempts = failedOnly.reduce((total, group) => total + group.failures, 0)
    add({
      id: 'signin-failures',
      class: SIGNAL_CLASS.NOISE,
      category: 'signin',
      title: `${counted(attempts, 'tentative')} de connexion en échec depuis ${counted(
        failedOnly.length,
        'adresse'
      )}`,
      detail:
        "Pulvérisation de mots de passe, présente sur la plupart des tenants. Aucune n'a abouti.",
      evidence: ['SuspectUserSignIns'],
    })
  }
  const serviceMail = becData?.SentMessageAnalysis?.SystemGeneratedMessages || 0
  if (serviceMail > 0) {
    add({
      id: 'mail-service-generated',
      class: SIGNAL_CLASS.NOISE,
      category: 'mail',
      title: `${counted(serviceMail, 'message')} généré par le service, exclu de l'analyse`,
      detail:
        "Réponses automatiques et avis de non-remise soumis par l'infrastructure Exchange Online : leur adresse source est une adresse Microsoft, sans rapport avec la localisation du titulaire du compte.",
      evidence: ['SentMessageAnalysis'],
    })
  }
  const otherPasswordChanges = (becData?.ChangedPasswords || []).filter(
    (user) => user?.IsSuspectUser === false
  )
  if (otherPasswordChanges.length > 0) {
    add({
      id: 'password-other-users',
      class: SIGNAL_CLASS.NOISE,
      category: 'tenant',
      title: `${counted(
        otherPasswordChanges.length,
        'modification'
      )} de mot de passe sur d'autres comptes`,
      detail: 'Activité du tenant, sans lien établi avec cette boîte.',
      evidence: ['ChangedPasswords'],
    })
  }
  if (
    (becData?.SafelistChanges?.length || 0) === 0 &&
    ((becData?.TrustedSenders?.length || 0) > 0 || (becData?.BlockedSenders?.length || 0) > 0)
  ) {
    add({
      id: 'safelist-unchanged',
      class: SIGNAL_CLASS.NOISE,
      category: 'mail',
      title: `Listes d'expéditeurs inchangées (${becData?.TrustedSenders?.length || 0} approuvés, ${
        becData?.BlockedSenders?.length || 0
      } bloqués)`,
      detail:
        'Aucune modification pendant la fenêtre analysée : historique du poste, pas un signal.',
      evidence: ['TrustedSenders', 'BlockedSenders'],
    })
  }

  return signals
}

/**
 * The verdict. Order matters and encodes the decision rule given to the analyst:
 * anything established is a compromise; otherwise a signal the analyst called unexpected is a
 * compromise; otherwise an unanswered question means no level at all - "à qualifier" - because a
 * number nobody can defend is worse than an open question.
 */
export const buildVerdict = (signals = [], triage = []) => {
  const determinations = new Map(
    (Array.isArray(triage) ? triage : []).map((entry) => [String(entry?.SignalId), entry])
  )
  const established = signals.filter((signal) => signal.class === SIGNAL_CLASS.ESTABLISHED)
  const toQualify = signals.filter((signal) => signal.class === SIGNAL_CLASS.TO_QUALIFY)

  const qualified = toQualify.map((signal) => ({
    signal,
    determination: determinations.get(signal.id) || null,
  }))
  const unexpected = qualified.filter((entry) => entry.determination?.Verdict === 'unexpected')
  const unanswered = qualified.filter((entry) => !entry.determination)
  const undetermined = qualified.filter((entry) => entry.determination?.Verdict === 'undetermined')

  if (established.length > 0) {
    return {
      status: VERDICT_STATUS.COMPROMISED,
      label: 'Compromission établie',
      colour: '#742A2A',
      detail: `${cardinal(established.length, 'signal')} que la donnée seule suffit à qualifier : ${established
        .map((signal) => signal.title)
        .join(' ; ')}.`,
      openQuestions: unanswered.map((entry) => entry.signal),
      established,
      unexpected: unexpected.map((entry) => entry.signal),
    }
  }
  if (unexpected.length > 0) {
    return {
      status: VERDICT_STATUS.COMPROMISED,
      label: 'Compromission retenue par l’analyste',
      colour: '#742A2A',
      detail: `${cardinal(unexpected.length, 'signal')} qualifié inattendu : ${unexpected
        .map((entry) => entry.signal.title)
        .join(' ; ')}.`,
      openQuestions: unanswered.map((entry) => entry.signal),
      established,
      unexpected: unexpected.map((entry) => entry.signal),
    }
  }
  if (unanswered.length > 0) {
    return {
      status: VERDICT_STATUS.TO_QUALIFY,
      label: 'À qualifier',
      colour: '#744210',
      detail: `Le verdict dépend de ${cardinal(
        unanswered.length,
        'question'
      )} restée sans réponse. Aucun niveau de risque n'est affiché tant qu'elle n'est pas tranchée.`,
      openQuestions: unanswered.map((entry) => entry.signal),
      established,
      unexpected: [],
    }
  }
  if (undetermined.length > 0) {
    return {
      status: VERDICT_STATUS.UNDETERMINED,
      label: 'Indéterminé',
      colour: '#744210',
      detail: `${cardinal(
        undetermined.length,
        'signal'
      )} n'a pu être tranché : titulaire du compte injoignable ou information indisponible. Le dossier reste ouvert.`,
      openQuestions: [],
      established,
      unexpected: [],
    }
  }
  return {
    status: VERDICT_STATUS.CLEAN,
    label: 'Aucun signal retenu',
    colour: '#22543D',
    detail: toQualify.length
      ? `${cardinal(toQualify.length, 'signal')} ${agree(toQualify.length, 'signal', 'relevé')} ${
          toQualify.length > 1 ? 'ont été' : 'a été'
        } ${agree(toQualify.length, 'signal', 'qualifié', 'attendu')} par l'analyste.`
      : 'Aucun signal établi ni à qualifier sur la fenêtre analysée.',
    openQuestions: [],
    established: [],
    unexpected: [],
  }
}
