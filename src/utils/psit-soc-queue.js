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

  const untaken = rows
    .filter((row) => row?.Status === 'new')
    .map((row) => ({ row, age: psitSocAge(row?.CreatedUtc, now) }))
    .filter((entry) => entry.age)
    .sort((a, b) => b.age.minutes - a.age.minutes)

  return {
    total: rows.length,
    open: rows.filter((row) => PSIT_SOC_OPEN_STATUSES.includes(row?.Status)).length,
    counts,
    oldestUntaken: untaken.length > 0 ? untaken[0] : null,
  }
}

/**
 * The word the queue shows for a case's severity: the emitter's own tag when the case carries
 * one - that is the vocabulary the analyst reads in the alert mail - our P level otherwise.
 * 'Unknown' is the automation's fallback for "the mail named no priority": an absence, not a
 * tag, so it never shadows a severity set by hand on the case.
 */
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
