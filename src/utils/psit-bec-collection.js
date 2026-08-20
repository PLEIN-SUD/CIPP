// State of the BEC collection behind the page, which is not the same question as "what does the
// collection say".
//
// The upstream cache (table cachebec, one row per user) stores a failed run exactly like a
// successful one, with Status = 'Error' and a payload of {Results: "<message>", Exception: {...}}.
// The HTTP endpoint only re-queues a run when the cached Results are empty, so a failure is sticky:
// it survives every reload until someone forces an overwrite. And because the front receives the
// payload without its Status, a failed run reaches the page looking like a successful collection
// that happens to have found nothing - which is how a report can be generated from an error.
//
// Hence this: name the state, and let the callers refuse to produce a document from it.

export const COLLECTION_STATUS = {
  RUNNING: 'running',
  FAILED: 'failed',
  MISSING: 'missing',
  STALE: 'stale',
  OK: 'ok',
}

// The collection looks 7 days back, so a report built on a month-old run describes a window that
// closed long before the reader's question. It is a warning, not a refusal: an old collection is
// still evidence of what was true then.
const DEFAULT_STALE_AFTER_DAYS = 7

const toDate = (value) => {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

/**
 * Classifies what the page was handed. Returns the status, a message fit to show an analyst, and
 * whether a report may be generated from it.
 */
export const getCollectionStatus = (becData, options = {}) => {
  const staleAfterDays = options.staleAfterDays ?? DEFAULT_STALE_AFTER_DAYS
  const now = toDate(options.nowUtc) || new Date()

  const base = { extractedAtUtc: null, ageDays: null, message: null }

  if (!becData || Object.keys(becData).length === 0) {
    return {
      ...base,
      status: COLLECTION_STATUS.MISSING,
      blocksReport: true,
      message: "Aucune collecte n'a été retournée pour ce compte.",
    }
  }

  if (becData.Waiting === true) {
    return {
      ...base,
      status: COLLECTION_STATUS.RUNNING,
      blocksReport: true,
      message: 'La collecte est en cours.',
    }
  }

  // The error payload's signature: a top-level Results string. A successful run has no such
  // property - its data sits in SentMessages, NewRules, and so on.
  const errorText = typeof becData.Results === 'string' ? becData.Results.trim() : ''
  if (errorText) {
    return {
      ...base,
      status: COLLECTION_STATUS.FAILED,
      blocksReport: true,
      extractedAtUtc: becData.ExtractedAt || null,
      message: errorText,
    }
  }

  const extractedAt = toDate(becData.ExtractedAt)
  if (!extractedAt) {
    return {
      ...base,
      status: COLLECTION_STATUS.MISSING,
      blocksReport: true,
      message: "La collecte n'a pas d'horodatage d'extraction : son contenu n'est pas exploitable.",
    }
  }

  const ageDays = Math.floor((now.getTime() - extractedAt.getTime()) / 86400000)
  if (ageDays > staleAfterDays) {
    return {
      status: COLLECTION_STATUS.STALE,
      blocksReport: false,
      extractedAtUtc: becData.ExtractedAt,
      ageDays,
      message: `La collecte date de ${ageDays} jours et ne couvre que les 7 jours qui l'ont précédée.`,
    }
  }

  return {
    status: COLLECTION_STATUS.OK,
    blocksReport: false,
    extractedAtUtc: becData.ExtractedAt,
    ageDays,
    message: null,
  }
}
