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

const HIDING_FOLDER_PATTERN =
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

const domainOf = (address) => String(address || '').split('@').pop().toLowerCase()

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

  return [...groups.values()]
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
}

/**
 * One chronology, in UTC, merging what the upstream report scatters across six pages in two
 * different time bases. This is what makes "signed in from Italy at 06:49Z, sent mail from France
 * at 07:52Z" visible at all.
 */
export const buildTimeline = (becData = {}) => {
  const events = []
  const push = (timestamp, kind, label, detail) => {
    const stamp = toUtc(timestamp)
    if (!stamp) return
    events.push({ timestampUtc: stamp, kind, label, detail })
  }

  for (const signIn of becData?.SuspectUserSignIns || []) {
    if (signIn?.Status !== 'Success') continue
    push(
      signIn.CreatedDateTime,
      'signin',
      `Connexion réussie depuis ${signIn.IPAddress || 'IP inconnue'}${
        signIn.Country ? ` (${signIn.Country})` : ''
      }`,
      signIn.AppDisplayName || ''
    )
  }
  for (const change of becData?.InboxRuleChanges || []) {
    push(change?.Date, 'rule', `Règle ${change?.Operation || 'modifiée'} : ${change?.RuleName || 'sans nom'}`, change?.ClientIP || '')
  }
  for (const change of becData?.SafelistChanges || []) {
    push(change?.Date, 'safelist', "Modification des listes d'expéditeurs", change?.ClientIP || '')
  }
  for (const change of becData?.SharingChanges || []) {
    push(change?.Date, 'sharing', `Partage : ${change?.Operation || 'modifié'}`, change?.FileName || change?.ItemUrl || '')
  }
  for (const burst of becData?.SentMessageAnalysis?.Bursts || []) {
    push(
      burst?.WindowStart,
      'mail',
      `Rafale d'envoi : ${burst?.MessageCount} message(s) vers ${burst?.RecipientCount} destinataire(s)`,
      burst?.TopSubject || ''
    )
  }
  for (const method of becData?.MFADevices || []) {
    push(method?.createdDateTime, 'mfa', `Méthode MFA enregistrée : ${method?.displayName || method?.['@odata.type'] || 'inconnue'}`, '')
  }

  return events.sort((a, b) => a.timestampUtc.localeCompare(b.timestampUtc))
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
          : `La règle déplace les messages vers « ${rule.MoveToFolder} », un dossier que l'utilisateur ne consulte pas.`,
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
      title: `Règle de classement « ${name} »`,
      detail: `Aucune action d'exfiltration : ${
        rule?.MoveToFolder ? `classement vers « ${rule.MoveToFolder} »` : 'pas de transfert, pas de suppression'
      }.`,
      question: `La règle « ${name} » fait-elle partie du fonctionnement normal de cette boîte ?`,
      suggestion: 'expected',
      evidence: ['NewRules'],
    })
  }

  if ((becData?.MaliciousSPs?.length || 0) > 0 || (becData?.AddedApps || []).some((app) => app?.MaliciousMatch)) {
    const names = [
      ...(becData?.MaliciousSPs || []).map((app) => app?.displayName),
      ...(becData?.AddedApps || []).filter((app) => app?.MaliciousMatch).map((app) => app?.displayName),
    ].filter(Boolean)
    add({
      id: 'app-malicious',
      class: SIGNAL_CLASS.ESTABLISHED,
      category: 'apps',
      title: 'Application référencée comme malveillante présente dans le tenant',
      detail: `${names.join(', ') || 'application inconnue'}. Un accès obtenu par consentement ne disparaît pas avec le mot de passe.`,
      evidence: ['MaliciousSPs', 'AddedApps'],
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
      title: `${anonymousLinks.length} lien(s) de partage anonyme(s) créé(s) pendant la fenêtre`,
      detail: "Le contenu est accessible à quiconque détient l'URL, indépendamment de toute remédiation sur le compte.",
      evidence: ['SharingChanges'],
    })
  }

  const foreignConfigChanges = [
    ...(becData?.InboxRuleChanges || []).map((change) => ({ change, what: 'une règle de boîte' })),
    ...(becData?.SafelistChanges || []).map((change) => ({ change, what: "les listes d'expéditeurs" })),
    ...(becData?.SharingChanges || []).map((change) => ({ change, what: 'un partage' })),
  ].filter((entry) => entry.change?.ForeignLocation === true)
  if (foreignConfigChanges.length > 0) {
    add({
      id: 'config-change-foreign',
      class: SIGNAL_CLASS.ESTABLISHED,
      category: 'rules',
      title: `${foreignConfigChanges.length} modification(s) de configuration depuis une IP hors du pays d'utilisation`,
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
      title: `${group.successes} connexion(s) réussie(s) depuis ${group.ip}${group.country ? ` (${group.country})` : ''}`,
      detail: `${group.cities.join(', ') || 'ville inconnue'} — du ${formatUtc(group.firstSeenUtc)} au ${formatUtc(
        group.lastSeenUtc
      )}. Applications : ${group.apps.slice(0, 4).join(', ') || 'inconnues'}${
        group.failures > 0 ? `. ${group.failures} échec(s) depuis la même adresse.` : ''
      }`,
      question: `L'utilisateur était-il à cet endroit, ou derrière un VPN ou un roaming, entre le ${formatUtc(
        group.firstSeenUtc
      )} et le ${formatUtc(group.lastSeenUtc)} ?${usageLocation ? ` (pays déclaré : ${usageLocation})` : ''}`,
      evidence: ['SuspectUserSignIns'],
    })
  }

  const analysis = becData?.SentMessageAnalysis
  if (analysis?.Flagged) {
    const bursts = analysis?.Bursts?.length || 0
    const campaigns = analysis?.FlaggedSubjectCount || 0
    add({
      id: 'mail-pattern',
      class: SIGNAL_CLASS.TO_QUALIFY,
      category: 'mail',
      title: "Volume d'envoi inhabituel",
      detail: `${campaigns} campagne(s) à objet répété et ${bursts} rafale(s), sur ${
        analysis?.AnalysableMessages ?? analysis?.TotalMessages ?? 0
      } message(s) envoyés à des destinataires externes${
        analysis?.SystemGeneratedMessages
          ? ` (${analysis.SystemGeneratedMessages} réponse(s) automatique(s) exclue(s) du calcul)`
          : ''
      }.`,
      question: "Ce volume correspond-il à l'activité normale de ce poste (commercial, recrutement, support) ?",
      evidence: ['SentMessageAnalysis'],
    })
  }

  const recentMfa = (becData?.MFADevices || []).filter((method) => {
    const created = toUtc(method?.createdDateTime)
    if (!created) return false
    const extracted = toUtc(becData?.ExtractedAt) || toUtc(new Date().toISOString())
    const windowStart = new Date(new Date(extracted).getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()
    return created >= `${windowStart.slice(0, 19)}Z`
  })
  if (recentMfa.length > 0) {
    add({
      id: 'mfa-recent',
      class: SIGNAL_CLASS.TO_QUALIFY,
      category: 'mfa',
      title: `${recentMfa.length} méthode(s) MFA enregistrée(s) pendant la fenêtre`,
      detail: recentMfa
        .map((method) => `${method?.displayName || method?.['@odata.type']} le ${formatUtc(method?.createdDateTime)}`)
        .join(' ; '),
      question: "L'utilisateur a-t-il lui-même enregistré cette méthode d'authentification ?",
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
      title: `${permissionChanges.length} modification(s) de permission sur cette boîte`,
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
      title: `${attempts} tentative(s) de connexion en échec depuis ${failedOnly.length} adresse(s)`,
      detail: 'Pulvérisation de mots de passe, présente sur la plupart des tenants. Aucune n\'a abouti.',
      evidence: ['SuspectUserSignIns'],
    })
  }
  const serviceMail = becData?.SentMessageAnalysis?.SystemGeneratedMessages || 0
  if (serviceMail > 0) {
    add({
      id: 'mail-service-generated',
      class: SIGNAL_CLASS.NOISE,
      category: 'mail',
      title: `${serviceMail} message(s) générés par le service, exclus de l'analyse`,
      detail:
        "Réponses automatiques et avis de non-remise soumis par l'infrastructure Exchange Online : leur IP source est une adresse Microsoft, sans rapport avec la localisation de l'utilisateur.",
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
      title: `${otherPasswordChanges.length} changement(s) de mot de passe sur d'autres comptes`,
      detail: "Activité du tenant, sans lien établi avec cette boîte.",
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
      detail: 'Aucune modification pendant la fenêtre analysée : historique du poste, pas un signal.',
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
      detail: `${established.length} signal(s) que la donnée seule suffit à qualifier : ${established
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
      detail: `${unexpected.length} signal(s) qualifié(s) comme inattendus : ${unexpected
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
      detail: `Le verdict dépend de ${unanswered.length} question(s) restée(s) sans réponse. Aucun niveau de risque n'est affiché tant qu'elles ne sont pas tranchées.`,
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
      detail: `${undetermined.length} signal(s) n'ont pas pu être tranchés (utilisateur injoignable ou information indisponible). Le dossier reste ouvert.`,
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
      ? `Les ${toQualify.length} signal(s) relevés ont tous été qualifiés comme attendus par l'analyste.`
      : 'Aucun signal établi ni à qualifier sur la fenêtre analysée.',
    openQuestions: [],
    established: [],
    unexpected: [],
  }
}
