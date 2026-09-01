// What the unified audit log answers about a role-change, inbox-rule or mailbox-access alert.
//
// The download search (type 20) taught the pattern: the guide steps that say « retrouver la
// création dans l'audit » used to mean a console and a notepad. This module reads the typed
// search the API runs for types 4, 5 and 7 — who did what, on what, from where, over which
// window — and turns it into the few sentences the panel and the guide actually show.
//
// Same two rules as the download reading, for the same reasons:
// - a search that has not finished is said to be running, never rendered as an empty list. An
//   empty list reads as « rien ne s'est passé », which is the opposite of what is known;
// - a count is never shown without the window it counts over.

export const PSIT_AUDIT_TYPE_IDS = [4, 5, 7]

/** The windows a relaunch can widen to, from the alert's own hour backwards. */
export const PSIT_AUDIT_WINDOWS = [
  { hours: 48, label: '48 h avant l’alerte' },
  { hours: 168, label: '7 jours avant l’alerte' },
]

/**
 * Does this dossier deserve the audit panel? Its type says so, or it already carries a search —
 * a dossier retyped after the fact must not lose the evidence it gathered under its old type.
 */
export const psitSocIsAuditCase = (socCase) =>
  PSIT_AUDIT_TYPE_IDS.includes(socCase?.TypeId) || Boolean(socCase?.Evidence?.audit?.searchId)

/** What each search kind looked for, in the analyst's language. Keys come from the API. */
export const PSIT_AUDIT_KIND_LABELS = {
  roles: 'changements de rôles',
  'mailbox-rules': 'règles de boîte et transferts',
  'mailbox-access': 'accès et délégations',
}

export const psitAuditKindLabel = (kind) => PSIT_AUDIT_KIND_LABELS[kind] ?? String(kind || '')

const asArray = (value) => (Array.isArray(value) ? value : [])

/**
 * The endpoint's answer, normalised.
 *
 * `started` false means no search has ever been launched for this dossier — distinct from a
 * search that ran and found nothing, which is `started` true with an empty event list. The panel
 * says something different in each case, so they must not collapse into one another here.
 */
export const psitReadCaseAudit = (data) => {
  const summary = data?.Summary ?? null
  const window = data?.Window ?? null
  return {
    started: data?.Started === true,
    running: data?.Running === true,
    status: data?.Status ?? null,
    searchId: data?.SearchId ?? null,
    events: asArray(data?.Records),
    warnings: asArray(data?.Warnings),
    window: window
      ? {
          kind: window.Kind ?? null,
          user: window.User ?? null,
          startUtc: window.StartUtc ?? null,
          endUtc: window.EndUtc ?? null,
          launchedUtc: window.LaunchedUtc ?? null,
          launchedBy: window.LaunchedBy ?? null,
        }
      : null,
    summary: summary
      ? {
          eventCount: Number(summary.EventCount ?? 0),
          operations: asArray(summary.Operations).map((entry) => ({
            operation: entry?.Operation ?? '',
            count: Number(entry?.Count ?? 0),
          })),
          actors: asArray(summary.Actors).map((entry) => ({
            actor: entry?.Actor ?? '',
            count: Number(entry?.Count ?? 0),
          })),
          addresses: asArray(summary.Addresses),
          addressCount: Number(summary.AddressCount ?? 0),
          firstUtc: summary.FirstUtc || null,
          lastUtc: summary.LastUtc || null,
        }
      : null,
  }
}

/** The operations present in an event list, counted, biggest first: what the filter chips show. */
export const psitAuditOperations = (events) => {
  const counts = new Map()
  for (const event of asArray(events)) {
    const operation = event?.Operation || ''
    if (!operation) continue
    counts.set(operation, (counts.get(operation) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([operation, count]) => ({ operation, count }))
    .sort((a, b) => b.count - a.count)
}

const frDateTime = (value) => {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return date.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })
}

/** « du 26/08/2026 15:27 au 28/08/2026 19:27 », or null when the window is unknown. */
export const psitAuditWindowLabel = (read) => {
  const from = frDateTime(read?.window?.startUtc)
  const to = frDateTime(read?.window?.endUtc)
  if (!from || !to) return null
  return `du ${from} au ${to}`
}

/**
 * The one line the guide shows under « retrouver la création dans l'audit ».
 *
 * Reports, never concludes: it counts, names the top operation and the actors, and leaves
 * « légitime ou pas » to the analyst who knows the tenant. 'unknown' whenever the answer has not
 * arrived — which is not the same as an answer of zero.
 */
export const psitAuditHeadline = (read) => {
  if (!read || !read.started) return { tone: 'unknown', text: 'recherche non lancée' }
  if (read.running) return { tone: 'unknown', text: 'recherche en cours dans le journal d’audit' }
  if (!read.summary) return { tone: 'unknown', text: 'résultats non lus' }

  const { eventCount, operations, actors } = read.summary
  if (eventCount === 0) {
    return {
      tone: 'unknown',
      text: `aucun événement trouvé ${psitAuditWindowLabel(read) ?? 'sur la fenêtre cherchée'} (rétention du journal, ou fenêtre à élargir)`,
    }
  }

  const parts = [`${eventCount} événement(s)`]
  if (operations.length > 0) {
    parts.push(`dont ${operations[0].count} ${operations[0].operation}`)
  }
  if (actors.length === 1) {
    parts.push(`par ${actors[0].actor}`)
  } else if (actors.length > 1) {
    parts.push(`par ${actors.length} acteurs, d’abord ${actors[0].actor}`)
  }
  return { tone: 'bad', text: parts.join(', ') }
}
