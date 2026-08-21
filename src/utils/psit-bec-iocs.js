// Indicators an analyst can act on elsewhere: a blocklist, a hunt in another tenant, a note to a
// bank. The collection already holds them, scattered across eleven checks and five report pages;
// this gathers them into one list per kind so nobody has to re-read the document with a highlighter.
//
// Two rules. Nothing here is a verdict - an address appears because it was observed, and the report
// says on what grounds. And Microsoft's own submission ranges never appear: blocking an Exchange
// Online address would block the client's own mail, which is exactly the mistake the outbound
// classification exists to prevent.

import { classifySentMessages, groupSignInsByIp, isServiceIp } from './psit-bec-signals'
import { psitAsArray } from './psit-as-array'
import { counted } from './psit-report-prose'

const uniqueBy = (items, key) => {
  const seen = new Map()
  for (const item of items) {
    const id = key(item)
    if (!id) continue
    if (!seen.has(id)) seen.set(id, item)
  }
  return [...seen.values()]
}

/**
 * @returns {{signInIps: object[], sendingIps: object[], forwardTargets: object[],
 *   ruleNames: object[], apps: object[], subjects: object[], total: number}}
 */
export const buildIocs = (becData = {}, userData = {}) => {
  const signInGroups = groupSignInsByIp(psitAsArray(becData?.SuspectUserSignIns))
  const mail = classifySentMessages(becData, userData)

  // Source addresses of sign-ins, successes and failures alike: a failed spray is still an
  // indicator, it is just not evidence of access.
  const signInIps = signInGroups.map((group) => ({
    value: group.ip,
    country: group.country || null,
    detail: `${counted(group.successes, 'connexion')} réussie${
      group.successes > 1 ? 's' : ''
    }, ${counted(group.failures, 'tentative')} en échec${
      group.foreign ? ', hors du pays d’utilisation déclaré' : ''
    }`,
    basis: 'Journal de connexion Entra ID',
  }))

  // Submission addresses of human, external mail, service ranges excluded.
  const sendingIps = uniqueBy(
    mail.humanExternal
      .map((message) => String(message?.FromIP || '').trim())
      .filter((ip) => ip && !isServiceIp(ip))
      .map((ip) => ({
        value: ip,
        detail: "Adresse de soumission d'un message envoyé vers l'extérieur",
        basis: 'Suivi des messages',
      })),
    (entry) => entry.value.toLowerCase()
  )

  const rules = psitAsArray(becData?.NewRules)
  const forwardTargets = uniqueBy(
    rules
      .flatMap((rule) =>
        [rule?.ForwardTo, rule?.RedirectTo, rule?.ForwardAsAttachmentTo]
          .filter(Boolean)
          .map((target) => ({
            value: String(target),
            detail: `Destinataire d'un transfert configuré par la règle « ${rule?.Name || 'sans nom'} »`,
            basis: 'Règles de boîte',
          }))
      )
      .filter((entry) => entry.value),
    (entry) => entry.value.toLowerCase()
  )

  const ruleNames = rules
    .filter((rule) => rule?.Name)
    .map((rule) => ({
      value: String(rule.Name),
      detail: [
        rule?.MoveToFolder ? `déplace vers ${rule.MoveToFolder}` : null,
        rule?.DeleteMessage ? 'supprime les messages' : null,
        rule?.ForwardTo || rule?.RedirectTo ? 'transfère vers l’extérieur' : null,
        rule?.RecentlyChanged ? 'créée ou modifiée dans la fenêtre' : null,
      ]
        .filter(Boolean)
        .join(', '),
      basis: 'Règles de boîte',
    }))

  const apps = uniqueBy(
    [
      ...psitAsArray(becData?.MaliciousSPs).map((app) => ({
        value: String(app?.appId || app?.displayName || ''),
        detail: `${app?.displayName || 'application'}, catalogue ${
          app?.CatalogName || 'malveillant'
        }`,
        basis: 'Catalogue CIPP',
      })),
      ...psitAsArray(becData?.AddedApps)
        .filter((app) => app?.MaliciousMatch)
        .map((app) => ({
          value: String(app?.appId || app?.displayName || ''),
          detail: `${app?.displayName || app?.appDisplayName || 'application'}, ajoutée dans la fenêtre`,
          basis: 'Journal d’audit',
        })),
    ],
    (entry) => entry.value.toLowerCase()
  )

  // Repeated subjects the collection flagged, plus the subject that headlines each burst: the
  // material for a search across other mailboxes.
  const analysis = becData?.SentMessageAnalysis || {}
  const subjects = uniqueBy(
    [
      ...psitAsArray(analysis.RepeatedSubjects)
        .filter((entry) => entry?.Flagged)
        .map((entry) => ({
          value: String(entry?.Subject || ''),
          detail: `objet répété${entry?.Count ? ` (${entry.Count} messages)` : ''}`,
          basis: 'Suivi des messages',
        })),
      ...psitAsArray(analysis.Bursts).map((burst) => ({
        value: String(burst?.TopSubject || ''),
        detail: "objet principal d'une rafale d'envoi",
        basis: 'Suivi des messages',
      })),
    ],
    (entry) => entry.value.toLowerCase()
  )

  const total =
    signInIps.length +
    sendingIps.length +
    forwardTargets.length +
    ruleNames.length +
    apps.length +
    subjects.length

  return { signInIps, sendingIps, forwardTargets, ruleNames, apps, subjects, total }
}
