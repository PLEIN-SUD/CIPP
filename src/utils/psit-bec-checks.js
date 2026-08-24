import { psitAsArray } from './psit-as-array'
import { groupSignInsByIp, HIDING_FOLDER_PATTERN } from './psit-bec-signals'

// The eleven checks of a BEC collection, as data.
//
// The upstream page renders them as seven hundred lines of bespoke JSX, one block per check.
// Described here instead - a count, a one-line reading, a list of items - they become testable
// without a DOM, reusable on any investigation screen, and cheap to extend: a twelfth check is an
// entry, not a component.
//
// Two departures from the upstream rendering, both deliberate:
// - a count is not a verdict. 113 sign-in rows are 3 addresses; 278 sender-list entries are an
//   unchanged history. The counts below count what an analyst would act on, and the reading says
//   what the rest is.
// - what matters is ordered first. A rule that forwards outside the organisation is not the
//   eleventh line of a list sorted by nothing.

/** An item line: label, value, and how it reads. */
const item = (label, value, tone = 'neutral') => ({ label, value, tone })

const countOf = (value) => psitAsArray(value).length

export const PSIT_BEC_CHECKS = [
  {
    id: 'rules',
    title: 'Règles de boîte de réception',
    count: (bec) => countOf(bec?.NewRules) + countOf(bec?.InboxRuleChanges),
    reading: (bec) => {
      const rules = psitAsArray(bec?.NewRules)
      const changes = psitAsArray(bec?.InboxRuleChanges)
      const exfiltrating = rules.filter((rule) => rule?.ForwardTo || rule?.RedirectTo)
      const hiding = rules.filter(
        (rule) => rule?.DeleteMessage || HIDING_FOLDER_PATTERN.test(String(rule?.MoveToFolder ?? ''))
      )
      if (exfiltrating.length > 0) {
        return {
          tone: 'bad',
          text: `${exfiltrating.length} règle(s) envoient du courrier hors de l’organisation : un transfert survit à une réinitialisation de mot de passe.`,
        }
      }
      if (hiding.length > 0) {
        return { tone: 'bad', text: `${hiding.length} règle(s) suppriment ou dissimulent du courrier.` }
      }
      if (rules.length === 0 && changes.length === 0) {
        return { tone: 'good', text: 'Aucune règle, aucune modification sur la fenêtre.' }
      }
      return {
        tone: 'neutral',
        text: `${rules.length} règle(s) en place, ${changes.length} modification(s) sur la fenêtre : aucune n’exfiltre, à confronter au fonctionnement du poste.`,
      }
    },
    items: (bec) => [
      ...psitAsArray(bec?.NewRules)
        .map((rule) => {
          const exfiltrating = Boolean(rule?.ForwardTo || rule?.RedirectTo)
          const hiding =
            rule?.DeleteMessage || HIDING_FOLDER_PATTERN.test(String(rule?.MoveToFolder ?? ''))
          return item(
            rule?.Name ?? 'Règle sans nom',
            [
              rule?.ForwardTo ? `transfère vers ${rule.ForwardTo}` : null,
              rule?.RedirectTo ? `redirige vers ${rule.RedirectTo}` : null,
              rule?.DeleteMessage ? 'supprime les messages' : null,
              rule?.MoveToFolder ? `déplace vers ${rule.MoveToFolder}` : null,
              rule?.RecentlyChanged ? 'créée ou modifiée sur la fenêtre' : null,
            ]
              .filter(Boolean)
              .join(', ') || 'aucune action notable',
            exfiltrating || hiding ? 'bad' : 'neutral'
          )
        })
        // What matters first: a rule that exfiltrates is not the eleventh line.
        .sort((a, b) => Number(b.tone === 'bad') - Number(a.tone === 'bad')),
      ...psitAsArray(bec?.InboxRuleChanges).map((change) =>
        item(
          `${change?.Operation ?? 'modification'} — ${change?.RuleName ?? 'sans nom'}`,
          `${change?.Date ?? ''} par ${change?.UserKey ?? 'inconnu'}${
            change?.ClientIP ? ` depuis ${change.ClientIP}` : ''
          }`,
          change?.ForeignLocation === true ? 'bad' : 'neutral'
        )
      ),
    ],
  },
  {
    id: 'new-users',
    title: 'Comptes créés dans le tenant',
    count: (bec) => countOf(bec?.NewUsers),
    reading: (bec) =>
      countOf(bec?.NewUsers) === 0
        ? { tone: 'good', text: 'Aucun compte créé sur la fenêtre.' }
        : {
            tone: 'neutral',
            text: `${countOf(bec?.NewUsers)} compte(s) créé(s) : à rapprocher des arrivées connues.`,
          },
    items: (bec) =>
      psitAsArray(bec?.NewUsers).map((user) =>
        item(user?.userPrincipalName ?? 'compte sans nom', `créé le ${user?.createdDateTime ?? 'date inconnue'}`)
      ),
  },
  {
    id: 'apps',
    title: 'Applications',
    // Only what an analyst acts on: an application in the catalogue, or added during the window.
    count: (bec) =>
      countOf(bec?.MaliciousSPs) +
      psitAsArray(bec?.AddedApps).filter((app) => app?.MaliciousMatch).length,
    reading: (bec) => {
      const catalogued = countOf(bec?.MaliciousSPs)
      const added = countOf(bec?.AddedApps)
      if (catalogued > 0) {
        return {
          tone: 'bad',
          text: `${catalogued} application(s) du catalogue malveillant présentes : un accès par consentement ne disparaît pas avec le mot de passe. Vérifier leur date d’apparition avant de les rattacher à cet incident.`,
        }
      }
      if (added > 0) {
        return { tone: 'neutral', text: `${added} application(s) apparues sur la fenêtre, aucune au catalogue.` }
      }
      return { tone: 'good', text: 'Aucune application ajoutée, aucune du catalogue.' }
    },
    items: (bec) => [
      ...psitAsArray(bec?.MaliciousSPs).map((app) =>
        item(
          app?.displayName ?? app?.appId,
          `catalogue ${app?.CatalogName ?? 'malveillant'}, présente depuis ${
            app?.createdDateTime ?? 'date inconnue'
          }`,
          'bad'
        )
      ),
      ...psitAsArray(bec?.AddedApps).map((app) =>
        item(
          app?.displayName ?? app?.appDisplayName ?? app?.appId,
          `ajoutée le ${app?.createdDateTime ?? 'date inconnue'}`,
          app?.MaliciousMatch ? 'bad' : 'neutral'
        )
      ),
    ],
  },
  {
    id: 'permissions',
    title: 'Permissions de boîte',
    count: (bec) => psitAsArray(bec?.MailboxPermissionChanges).filter((c) => c?.TargetsSuspect === true).length,
    reading: (bec) => {
      const changes = psitAsArray(bec?.MailboxPermissionChanges)
      const targeting = changes.filter((change) => change?.TargetsSuspect === true)
      if (targeting.length > 0) {
        return { tone: 'bad', text: `${targeting.length} modification(s) visent cette boîte : à regarder en premier.` }
      }
      if (changes.length > 0) {
        return {
          tone: 'neutral',
          text: `${changes.length} modification(s) dans le tenant, aucune ne vise cette boîte.`,
        }
      }
      return { tone: 'good', text: 'Aucune modification de permission.' }
    },
    items: (bec) =>
      psitAsArray(bec?.MailboxPermissionChanges)
        .map((change) =>
          item(
            `${change?.Operation ?? 'modification'} par ${change?.UserKey ?? 'inconnu'}`,
            change?.Date ?? '',
            change?.TargetsSuspect === true ? 'bad' : 'neutral'
          )
        )
        .sort((a, b) => Number(b.tone === 'bad') - Number(a.tone === 'bad')),
  },
  {
    id: 'outbound',
    title: 'Courrier sortant',
    // Not the raw row count: service-generated mail is not the user's activity.
    count: (bec) => bec?.SentMessageAnalysis?.FlaggedSubjectCount ?? 0,
    reading: (bec) => {
      const analysis = bec?.SentMessageAnalysis
      if (!analysis) return { tone: 'neutral', text: 'Pas d’analyse d’envoi dans cette collecte.' }
      const bursts = psitAsArray(analysis.Bursts).length
      if (analysis.Flagged) {
        return {
          tone: 'bad',
          text: `${analysis.FlaggedSubjectCount ?? 0} objet(s) répété(s) et ${bursts} rafale(s) sur ${
            analysis.TotalMessages ?? 0
          } message(s) : à confronter à l’activité normale du poste.`,
        }
      }
      return {
        tone: 'good',
        text: `${analysis.TotalMessages ?? 0} message(s) envoyés, aucun schéma d’envoi signalé.`,
      }
    },
    items: (bec) =>
      psitAsArray(bec?.SentMessageAnalysis?.RepeatedSubjects)
        .filter((entry) => entry?.Flagged)
        .map((entry) => item(entry?.Subject ?? 'objet vide', `${entry?.Count ?? 0} message(s)`, 'bad')),
  },
  {
    id: 'mfa',
    title: 'Méthodes d’authentification',
    count: (bec) => countOf(bec?.MFADevices),
    reading: (bec) =>
      countOf(bec?.MFADevices) === 0
        ? { tone: 'bad', text: 'Aucune méthode enregistrée : le compte n’est pas protégé par MFA.' }
        : {
            tone: 'neutral',
            text: `${countOf(bec?.MFADevices)} méthode(s) enregistrées : vérifier les dates d’ajout récentes.`,
          },
    items: (bec) =>
      psitAsArray(bec?.MFADevices).map((method) =>
        item(
          method?.displayName ?? method?.['@odata.type'] ?? 'méthode',
          `enregistrée le ${method?.createdDateTime ?? 'date inconnue'}`
        )
      ),
  },
  {
    id: 'passwords',
    title: 'Mots de passe',
    count: (bec) => psitAsArray(bec?.ChangedPasswords).filter((u) => u?.IsSuspectUser === true).length,
    reading: (bec) => {
      const all = psitAsArray(bec?.ChangedPasswords)
      const suspect = all.filter((user) => user?.IsSuspectUser === true)
      if (suspect.length > 0) {
        return { tone: 'bad', text: 'Le mot de passe de ce compte a changé sur la fenêtre.' }
      }
      return {
        tone: 'good',
        text: `Aucun changement sur ce compte (${all.length} sur d’autres comptes du tenant).`,
      }
    },
    items: (bec) =>
      psitAsArray(bec?.ChangedPasswords).map((user) =>
        item(
          user?.userPrincipalName ?? 'compte',
          user?.lastPasswordChangeDateTime ?? '',
          user?.IsSuspectUser === true ? 'bad' : 'neutral'
        )
      ),
  },
  {
    id: 'senders',
    title: 'Expéditeurs approuvés et bloqués',
    // The lists themselves are history: only a change during the window is a signal.
    count: (bec) => countOf(bec?.SafelistChanges),
    reading: (bec) => {
      const changes = countOf(bec?.SafelistChanges)
      const entries = countOf(bec?.TrustedSenders) + countOf(bec?.BlockedSenders)
      if (changes > 0) {
        return { tone: 'bad', text: `${changes} modification(s) des listes sur la fenêtre.` }
      }
      return {
        tone: 'good',
        text: `${entries} entrée(s) au total, aucune modifiée sur la fenêtre : historique du poste, pas un signal.`,
      }
    },
    items: (bec) =>
      psitAsArray(bec?.SafelistChanges).map((change) =>
        item(change?.Operation ?? 'modification', `${change?.Date ?? ''} ${change?.ClientIP ?? ''}`.trim(), 'bad')
      ),
  },
  {
    id: 'intune',
    title: 'Appareils Intune',
    count: (bec) => countOf(bec?.IntuneDevices),
    reading: (bec) => {
      if (bec?.IntuneDevicesError) {
        // Never a green "no devices" on a query that failed.
        return { tone: 'unknown', text: `Interrogation Intune en échec : ${bec.IntuneDevicesError}` }
      }
      return countOf(bec?.IntuneDevices) === 0
        ? { tone: 'neutral', text: 'Aucun appareil géré pour ce compte.' }
        : { tone: 'neutral', text: `${countOf(bec?.IntuneDevices)} appareil(s) géré(s).` }
    },
    items: (bec) =>
      psitAsArray(bec?.IntuneDevices).map((device) =>
        item(device?.deviceName ?? 'appareil', `${device?.operatingSystem ?? ''} ${device?.complianceState ?? ''}`.trim())
      ),
  },
  {
    id: 'signins',
    title: 'Connexions par adresse',
    // Addresses, not rows: 113 sign-in events are commonly three addresses.
    count: (bec) => groupSignInsByIp(psitAsArray(bec?.SuspectUserSignIns)).filter((g) => g.successes > 0).length,
    reading: (bec) => {
      const groups = groupSignInsByIp(psitAsArray(bec?.SuspectUserSignIns))
      const foreignSuccess = groups.filter((group) => group.foreign && group.successes > 0)
      if (foreignSuccess.length > 0) {
        return {
          tone: 'bad',
          text: `${foreignSuccess.length} adresse(s) en succès hors du pays d’utilisation, dont ${foreignSuccess[0].ip}.`,
        }
      }
      const failures = groups.filter((group) => group.successes === 0)
      return {
        tone: 'good',
        text: `Aucun succès hors zone. ${failures.length} adresse(s) en échec seul : pulvérisation, présente sur la plupart des tenants.`,
      }
    },
    items: (bec) =>
      groupSignInsByIp(psitAsArray(bec?.SuspectUserSignIns)).map((group) =>
        item(
          `${group.ip}${group.country ? ` (${group.country})` : ''}`,
          `${group.successes} réussie(s), ${group.failures} échec(s)${
            group.apps.length > 0 ? ` — ${group.apps.slice(0, 3).join(', ')}` : ''
          }`,
          group.foreign && group.successes > 0 ? 'bad' : 'neutral'
        )
      ),
  },
  {
    id: 'sharing',
    title: 'Liens de partage',
    count: (bec) => countOf(bec?.SharingChanges),
    reading: (bec) => {
      const changes = psitAsArray(bec?.SharingChanges)
      const anonymous = changes.filter((change) =>
        String(change?.Operation ?? '').startsWith('AnonymousLink')
      )
      if (anonymous.length > 0) {
        return {
          tone: 'bad',
          text: `${anonymous.length} lien(s) de partage anonyme : accessible à quiconque détient l’URL, indépendamment de toute remédiation sur le compte.`,
        }
      }
      return changes.length === 0
        ? { tone: 'good', text: 'Aucun partage créé ni modifié.' }
        : { tone: 'neutral', text: `${changes.length} modification(s) de partage.` }
    },
    items: (bec) =>
      psitAsArray(bec?.SharingChanges).map((change) =>
        item(
          change?.Operation ?? 'partage',
          `${change?.Date ?? ''} ${change?.FileName ?? change?.ItemUrl ?? ''}`.trim(),
          String(change?.Operation ?? '').startsWith('AnonymousLink') ? 'bad' : 'neutral'
        )
      ),
  },
]

/**
 * Every check, resolved against one collection. Never throws on a malformed field: a check that
 * cannot be computed says so, and the ten others still render.
 */
export const psitBecChecks = (becData) =>
  PSIT_BEC_CHECKS.map((check) => {
    try {
      return {
        id: check.id,
        title: check.title,
        count: check.count(becData) ?? 0,
        reading: check.reading(becData),
        items: check.items(becData) ?? [],
      }
    } catch {
      return {
        id: check.id,
        title: check.title,
        count: 0,
        reading: { tone: 'unknown', text: 'Donnée illisible pour ce contrôle.' },
        items: [],
      }
    }
  })
