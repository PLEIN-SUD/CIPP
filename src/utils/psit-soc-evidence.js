import { groupSignInsByIp } from './psit-bec-signals'
import { adaptGraphSignIns, readSignInGroup } from './psit-soc-signin-adapter'
import { readAppScopes } from './psit-soc-app-scopes'

// The answers the guide steps carry.
//
// A guide that asks "read the permissions granted" while the permissions sit in another card two
// screens down turns a check into an errand. Each step that CIPP can answer therefore names an
// evidence key, and this module turns the case's context into the one-line answer displayed under
// the step.
//
// Three rules, because this text sits next to a decision:
// - it reports, it never concludes. 'bad' means "reads as compromise", not "compromised";
// - not knowing is said, never implied. Data that has not arrived reads 'unknown', which is not
//   the same as data that arrived empty;
// - it stays one line. The panels below hold the detail; this is what the eye needs to tick the
//   box or go look.

/** A step's answer. tone drives the colour: good reads as expected, bad reads as compromise. */
const answer = (tone, text) => ({ tone, text })
const unknown = (text) => answer('unknown', text)

const RESOLVERS = {
  /** Sign-ins grouped by source address: the shape of the account's activity in one line. */
  'user.sessions': (evidence) => {
    const signIns = evidence?.user?.signIns
    if (!Array.isArray(signIns)) return unknown('connexions non récupérées')
    const groups = groupSignInsByIp(adaptGraphSignIns(signIns, evidence?.user?.usageLocation))
    if (groups.length === 0) return unknown('aucune connexion sur la période')

    const foreignSuccess = groups.filter((group) => readSignInGroup(group).foreignSuccess)
    if (foreignSuccess.length > 0) {
      const first = foreignSuccess[0]
      return answer(
        'bad',
        `${foreignSuccess.length} adresse(s) en succès hors zone, dont ${first.ip}${
          first.country ? ` (${first.country})` : ''
        }`
      )
    }
    return answer('good', `${groups.length} adresse(s), aucun succès hors zone`)
  },

  /** The spray-that-got-in pattern, and legacy clients MFA cannot protect. */
  'user.signin-quality': (evidence) => {
    const signIns = evidence?.user?.signIns
    if (!Array.isArray(signIns)) return unknown('connexions non récupérées')
    const groups = groupSignInsByIp(adaptGraphSignIns(signIns, evidence?.user?.usageLocation))
    const flags = []
    for (const group of groups) {
      const clue = readSignInGroup(group)
      if (clue.successAfterFailures) flags.push(`succès après rafale depuis ${group.ip}`)
      if (clue.usesLegacyClient) flags.push(`client hérité depuis ${group.ip}`)
    }
    if (flags.length > 0) return answer('bad', flags.join(' ; '))
    if (groups.length === 0) return unknown('aucune connexion sur la période')
    return answer('good', 'aucun succès après rafale, aucun client hérité')
  },

  /** Inbox rules, read for what they do rather than counted. */
  'user.rules': (evidence) => {
    const rules = evidence?.user?.rules
    if (!Array.isArray(rules)) return unknown('règles non récupérées')
    if (rules.length === 0) return answer('good', 'aucune règle sur la boîte')

    const exfiltrating = rules.filter((rule) => rule?.ForwardTo || rule?.RedirectTo)
    const deleting = rules.filter((rule) => rule?.DeleteMessage)
    if (exfiltrating.length > 0 || deleting.length > 0) {
      const what = [
        exfiltrating.length > 0 ? `${exfiltrating.length} transfère(nt) vers l’extérieur` : null,
        deleting.length > 0 ? `${deleting.length} supprime(nt) des messages` : null,
      ].filter(Boolean)
      return answer('bad', `${rules.length} règle(s) : ${what.join(', ')}`)
    }
    return answer('good', `${rules.length} règle(s), aucune exfiltration`)
  },

  /** Is this application in the catalogue CIPP ships? */
  'app.catalogue': (evidence) => {
    const catalogue = evidence?.app?.catalogue
    const appId = evidence?.app?.appId
    if (!Array.isArray(catalogue)) return unknown('catalogue non récupéré')
    if (!appId) return unknown('application non identifiée')

    const match = catalogue.find(
      (entry) => String(entry?.AppId ?? '').toLowerCase() === String(appId).toLowerCase()
    )
    return match
      ? answer('bad', `présente au catalogue : ${match.Name}`)
      : answer('good', 'absente du catalogue CIPP')
  },

  /** What the consent actually allows. */
  'app.scopes': (evidence) => {
    const scope = evidence?.app?.scope
    if (scope === null || scope === undefined) return unknown('consentements non récupérés')
    const read = readAppScopes(scope)
    if (read.granted.length === 0) return unknown('aucune permission lue')
    if (read.risky.length > 0) {
      return answer(
        'bad',
        `${read.risky.map((entry) => entry.scope).join(', ')}${
          read.hasPersistence ? ' + offline_access' : ''
        }`
      )
    }
    return answer('good', `${read.granted.length} permission(s), aucune à risque`)
  },

  /** Who published it, and since when it has been in the tenant. */
  'app.publisher': (evidence) => {
    const principal = evidence?.app?.principal
    if (!principal) return unknown('application non trouvée dans le tenant')
    const verified = principal.verifiedPublisher?.displayName
    const since = principal.createdDateTime ? `, apparue le ${String(principal.createdDateTime).slice(0, 10)}` : ''
    return verified
      ? answer('good', `éditeur vérifié : ${verified}${since}`)
      : answer('bad', `éditeur non vérifié${since}`)
  },

  /** Intune's verdict on the machine. */
  'device.compliance': (evidence) => {
    const device = evidence?.device?.device
    if (!device) return unknown('machine non trouvée dans Intune')
    return device.complianceState === 'compliant'
      ? answer('good', `conforme, utilisateur ${device.userPrincipalName ?? 'non renseigné'}`)
      : answer('bad', `conformité : ${device.complianceState ?? 'inconnue'}`)
  },

  /** Whether the antivirus is in a state to have seen anything. */
  'device.defender': (evidence) => {
    const state = evidence?.device?.defenderState
    if (!state) return unknown('état Defender non récupéré')
    if (state.signatureUpdateOverdue === true || state.malwareProtectionEnabled === false) {
      return answer('bad', 'protection en défaut : signatures en retard ou antivirus désactivé')
    }
    return answer('good', `signatures ${state.signatureVersion ?? 'à jour'}`)
  },
}

/**
 * The answer for one guide step, or null when the step has no evidence key or nothing resolves.
 * Null means the panel renders the step alone, exactly as before.
 */
export const psitSocStepEvidence = (evidenceKey, evidence) => {
  if (!evidenceKey) return null
  const resolver = RESOLVERS[evidenceKey]
  if (!resolver) return null
  try {
    return resolver(evidence)
  } catch {
    // A malformed payload must not take the guide down with it: the step still renders, and the
    // analyst goes and looks, which is what they would do anyway.
    return unknown('donnée illisible')
  }
}

export const PSIT_SOC_EVIDENCE_KEYS = Object.keys(RESOLVERS)
