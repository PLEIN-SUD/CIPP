import { psitSocTypeById } from './psit-soc-types'

/**
 * The readings the triage queue shows above and inside its table.
 *
 * The queue is the screen an analyst opens first and returns to between cases, so it has to
 * answer "what do I do now" before he reads a single row. These functions produce that answer:
 * how old a case is in words, how far its guide got, and what the whole queue amounts to.
 *
 * They live apart from the page so they can be tested without rendering a table.
 */

/** Statuses that still need someone. Closed and qualified cases are finished work. */
export const PSIT_SOC_OPEN_STATUSES = ['new', 'investigating', 'contained']

/**
 * The status words the queue displays. The stored codes stay English (they are the API contract
 * and the values every filter and action manipulates); the column shows the analysts' language.
 * An unknown code passes through unchanged: showing raw data beats hiding a state.
 */
export const PSIT_SOC_STATUS_LABELS_FR = {
  new: 'Nouveau',
  investigating: 'En cours',
  'qualified-fp': 'Faux positif',
  'qualified-tp': 'Vrai positif',
  // Detection right, behaviour real, no compromise: the fourth honest outcome.
  'qualified-btp': 'VP bénin',
  // Waiting on the emitter or the client: out of the to-take pile, still open.
  'on-hold': 'En attente',
  contained: 'Confiné',
  closed: 'Clos',
}

export const psitSocStatusLabel = (status) => PSIT_SOC_STATUS_LABELS_FR[status] ?? (status || '')

/**
 * Chip colors keyed by the displayed French word, matching the queue's own summary chips: red
 * calls for someone, orange is being worked, green turned out benign, grey is done.
 */
export const PSIT_SOC_STATUS_CHIP_COLORS = {
  Nouveau: 'error',
  'En cours': 'warning',
  'Vrai positif': 'secondary',
  'VP bénin': 'primary',
  'En attente': 'warning',
  'Faux positif': 'success',
  Confiné: 'info',
  Clos: 'default',
}

/** Order the analyst should work in: P1 before P4, and within a level, the oldest first. */
const SEVERITY_RANK = { P1: 0, P2: 1, P3: 2, P4: 3 }

/**
 * How long ago, in words. Returns null rather than a fabricated duration when the date is absent
 * or unreadable: an empty cell says "unknown", where "0 min" would say "just now".
 */
export const psitSocAge = (iso, now = Date.now()) => {
  if (!iso) return null
  const then = Date.parse(iso)
  if (Number.isNaN(then)) return null

  const minutes = Math.max(0, Math.round((now - then) / 60000))
  if (minutes < 60) return { minutes, label: `${minutes} min` }
  const hours = Math.round(minutes / 60)
  if (hours < 48) return { minutes, label: `${hours} h` }
  return { minutes, label: `${Math.round(hours / 24)} j` }
}

/**
 * Progress through the investigation guide of the case's type. A step is counted as handled when
 * it is done or deliberately skipped, since both are decisions; only 'pending' is outstanding.
 *
 * Returns null when the type declares no guide, so the column stays empty instead of showing an
 * authoritative "0/0".
 */
export const psitSocGuideProgress = (socCase) => {
  const steps = psitSocTypeById(socCase?.TypeId)?.guide ?? []
  if (steps.length === 0) return null

  const progress = socCase?.GuideProgress ?? {}
  const handled = steps.filter((step) => {
    const state = progress?.[step.id]?.State ?? progress?.[step.id]
    return state === 'done' || state === 'skipped'
  }).length

  return { done: handled, total: steps.length, label: `${handled}/${steps.length}` }
}

/** The type in words. The number alone asks the analyst to know a catalogue by heart. */
/** The entity keys, said in French: raw API names on a chip read as a bug, not a fact. */
export const PSIT_SOC_ENTITY_LABELS = {
  upn: 'Compte',
  userId: 'Id du compte',
  deviceName: 'Machine',
  deviceId: 'Id de la machine',
  azureADDeviceId: 'Id Entra de la machine',
  appId: 'Application (appId)',
  networkMessageId: 'Message (networkMessageId)',
  sender: 'Expéditeur',
  recipient: 'Destinataire',
}

export const psitSocEntityLabel = (kind) => PSIT_SOC_ENTITY_LABELS[kind] ?? String(kind || '')

/**
 * The journal action tokens, said in French. The journal is the analyst's reading surface:
 * 'remediate-user' as the bold title of a French line reads as a bug. Free-text actions typed by
 * an analyst pass through untouched — they are already words.
 */
export const PSIT_SOC_ACTION_LABELS = {
  created: 'Dossier créé',
  ingested: 'Ingestion',
  enriched: 'Pré-rempli à l’ingestion',
  status: 'Changement de statut',
  qualified: 'Qualification',
  reopened: 'Réouverture',
  escalated: 'Escalade',
  'on-hold': 'Mise en attente',
  resumed: 'Reprise',
  'duplicate-signal': 'Signal doublon rattaché',
  'audit-search': 'Recherche d’audit',
  'report-generated': 'Rapport généré',
  restored: 'Restauration',
  'log-truncated': 'Journal tronqué',
  'remediate-user': 'Remédiation du compte',
  'mde-isolate': 'Isolation réseau (MDE)',
  'mde-unisolate': 'Levée d’isolation (MDE)',
  'defender-scan': 'Analyse Defender lancée',
  'device-reboot': 'Redémarrage du poste',
  'mail-soft-delete': 'Suppression du message (réversible)',
  'revoke-app-consent': 'Consentement d’application révoqué',
  'bec-import': 'Import BEC',
}

export const psitSocActionLabel = (action) =>
  PSIT_SOC_ACTION_LABELS[action] ?? String(action || '')

export const psitSocTypeLabel = (typeId) => {
  const entry = psitSocTypeById(typeId)
  if (!entry) return typeId ? `Type ${typeId}` : ''
  return entry.label
}

/**
 * What the queue amounts to, for the strip above the table: how many cases are waiting, how many
 * are in hand, and which untouched case has waited longest.
 *
 * The oldest untouched case is named rather than counted. "Trois nouveaux" tells an analyst there
 * is work; naming the one that has waited five hours tells him which.
 */
export const psitSocQueueSummary = (cases, now = Date.now()) => {
  const rows = Array.isArray(cases) ? cases : []
  const counts = {}
  for (const row of rows) {
    const status = row?.Status ?? 'unknown'
    counts[status] = (counts[status] ?? 0) + 1
  }

  // Unclaimed is about who holds a dossier, not about its status: releasing one leaves it
  // 'investigating' with nobody on it, and counting only 'new' hid exactly the dossier the
  // release gesture was meant to put back in front of someone.
  const unclaimed = rows.filter(
    (row) =>
      PSIT_SOC_OPEN_STATUSES.includes(row?.Status) &&
      !String(row?.AssignedTo ?? '').trim()
  )

  const untaken = unclaimed
    .map((row) => ({ row, age: psitSocAge(row?.CreatedUtc, now) }))
    .filter((entry) => entry.age)
    .sort((a, b) => b.age.minutes - a.age.minutes)

  return {
    total: rows.length,
    open: rows.filter((row) => PSIT_SOC_OPEN_STATUSES.includes(row?.Status)).length,
    counts,
    unclaimed: unclaimed.length,
    oldestUntaken: untaken.length > 0 ? untaken[0] : null,
  }
}

/**
 * The ticket number and the ticket's address in one cell value.
 *
 * The table recurses an object cell into dotted sub-columns, which deletes the named column the
 * page asks for - so the number and its link cannot travel as { label, href }, and putting the
 * link in a column of its own separated the icon from the number it belongs to. They travel as
 * one string instead, joined by a unit separator that appears in neither part.
 *
 * What the analyst reads, sorts, searches and exports is the number alone: only the renderer
 * ever sees the second half.
 */
export const PSIT_SOC_TICKET_SEPARATOR = String.fromCharCode(31)

export const psitSocTicketCell = (ticket, url, mail) => {
  const number = String(ticket ?? '').trim()
  const href = String(url ?? '').trim()
  const preview = String(mail ?? '').trim()
  if (!number) return ''
  if (!href && !preview) return number
  return [number, href, preview].join(PSIT_SOC_TICKET_SEPARATOR)
}

/** The halves back, for a renderer. An absent address or mail is absent, never an empty one. */
export const psitSocTicketParts = (value) => {
  const [label = '', href = '', mail = ''] = String(value ?? '').split(PSIT_SOC_TICKET_SEPARATOR)
  return { label, href: href || null, mail: mail || null }
}

/**
 * The dossier title with the emitter's raw subject packed behind it: the queue shows the title,
 * and the original wording answers on hover. Same one-string discipline as the ticket cell -
 * export, sort and search see the title alone.
 */
/**
 * The entity the alert is about - the account's UPN, else the machine, the application or the
 * message - with the admin verdict packed behind it so the cell can wear the badge. Export,
 * sort and search see the entity alone; the full verdict (including 'Non vérifié') stays
 * readable in the row drawer.
 */
export const psitSocEntityCell = (row) => {
  const entity =
    String(row?.Entities?.upn ?? '').trim() ||
    String(row?.Entities?.deviceName ?? '').trim() ||
    String(row?.Entities?.appId ?? '').trim() ||
    String(row?.Entities?.networkMessageId ?? '').trim()
  if (!entity) return ''
  // The badge only makes sense for an account; the verdict word is the admin cell's first half.
  const verdict = row?.Entities?.upn ? psitSocAdminCell(row).split(' — ')[0] : ''
  return verdict ? `${entity}${PSIT_SOC_TICKET_SEPARATOR}${verdict}` : entity
}

export const psitSocEntityCellParts = (value) => {
  const [entity = '', verdict = ''] = String(value ?? '').split(PSIT_SOC_TICKET_SEPARATOR)
  return { entity, verdict: verdict || null }
}

export const psitSocTitleCell = (title, subject) => {
  const label = String(title ?? '').trim()
  const raw = String(subject ?? '').trim()
  if (!label) return ''
  // The subject IS the title on old dossiers ingested before it was stored, and repeating the
  // title as its own tooltip would say nothing.
  if (!raw || raw === label) return label
  return `${label}${PSIT_SOC_TICKET_SEPARATOR}${raw}`
}

export const psitSocTitleParts = (value) => {
  const [label = '', subject = ''] = String(value ?? '').split(PSIT_SOC_TICKET_SEPARATOR)
  return { label, subject: subject || null }
}

/** The hover preview of the emitter's mail: subject line, then the stored excerpt, capped. */
export const psitSocMailPreview = (row) => {
  const subject = String(row?.SourceSubject ?? '').trim()
  const body = String(row?.SourceMail ?? '').trim()
  if (!subject && !body) return ''
  const excerpt = body.length > 600 ? `${body.slice(0, 600)}…` : body
  return [subject ? `Sujet : ${subject}` : null, excerpt || null].filter(Boolean).join('\n\n')
}

/**
 * The 'Compte admin' cell: does this alert touch an admin account, and which one.
 *
 * Reads what the dossier recorded when the identity was looked at (Evidence.identity), never
 * Entra per row. Three states that must not collapse into each other:
 * - 'Oui — upn' / 'Éligible — upn' : the roles were read and the account holds (or can elect)
 *   admin roles. The name is in the cell because "Admin" alone left the reader guessing whose
 *   privilege it was;
 * - 'Non' : the roles were read and came back empty — an answer;
 * - '' : nobody has looked yet — the absence of one.
 */
export const psitSocAdminCell = (row) => {
  const identity = row?.Evidence?.identity
  // 'Non vérifié' rather than an empty cell: 'Non' is an answer (roles read, none found), and
  // the absence of a read must not look like it.
  if (!identity || !identity.readUtc) return 'Non vérifié'
  const upn = row?.Entities?.upn || ''
  if (identity.isAdmin) return upn ? `Oui — ${upn}` : 'Oui'
  if (identity.isEligible) return upn ? `Éligible — ${upn}` : 'Éligible'
  return 'Non'
}

/**
 * The word the queue shows for a case's severity: the emitter's own tag when the case carries
 * one - that is the vocabulary the analyst reads in the alert mail - our P level otherwise.
 * 'Unknown' is the automation's fallback for "the mail named no priority": an absence, not a
 * tag, so it never shadows a severity set by hand on the case.
 */
/**
 * How long a dossier has been waiting: from its most recent 'on-hold' journal entry. Null when
 * the dossier is not on hold - an age that outlives its state would keep counting after resume.
 */
export const psitSocHoldAge = (row, now = Date.now()) => {
  if (row?.Status !== 'on-hold') return null
  const stamps = (row?.ActionLog ?? [])
    .filter((entry) => entry?.Action === 'on-hold')
    .map((entry) => Date.parse(entry?.Utc))
    .filter((stamp) => !Number.isNaN(stamp))
  if (stamps.length === 0) return psitSocAge(row?.UpdatedUtc, now)
  return psitSocAge(new Date(Math.max(...stamps)).toISOString(), now)
}

export const psitSocDisplaySeverity = (row) => {
  const tag = row?.SeverityTag
  if (tag && tag !== 'Unknown') return tag
  return row?.Severity || ''
}

/**
 * The order the queue is worth reading in: open cases first, then by severity, then oldest first.
 *
 * Finished cases are not hidden. An analyst looking for what he closed yesterday must find it,
 * and a queue that quietly drops rows is a queue nobody trusts. They simply sink.
 */
export const psitSocQueueOrder = (cases) => {
  const rows = Array.isArray(cases) ? [...cases] : []
  return rows.sort((a, b) => {
    const openA = PSIT_SOC_OPEN_STATUSES.includes(a?.Status) ? 0 : 1
    const openB = PSIT_SOC_OPEN_STATUSES.includes(b?.Status) ? 0 : 1
    if (openA !== openB) return openA - openB

    const sevA = SEVERITY_RANK[a?.Severity] ?? 9
    const sevB = SEVERITY_RANK[b?.Severity] ?? 9
    if (sevA !== sevB) return sevA - sevB

    return (Date.parse(a?.CreatedUtc) || 0) - (Date.parse(b?.CreatedUtc) || 0)
  })
}
