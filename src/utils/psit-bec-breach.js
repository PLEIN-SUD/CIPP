import { psitAsArray } from './psit-as-array'
import { cardinal, dateProse, enumerate, phrase } from './psit-report-prose'

/**
 * The breach-exposure snapshot, read defensively for the reports.
 *
 * The dossier holds what the collection wrote, and the collection is a version behind the front end
 * as often as not: an older dossier has no BreachExposure block at all, and that is not the same
 * thing as a check that found nothing. Four states, and the report has four sentences.
 *
 * Nothing is computed from the addresses here and nothing is looked up. This reads a snapshot.
 */

export const BREACH_STATE = {
  /** Breaches found, at least one exposing passwords. */
  EXPOSED_PASSWORDS: 'exposed-passwords',
  /** Breaches found, none of them exposing passwords. */
  EXPOSED: 'exposed',
  /** The check ran and found nothing referenced. */
  CLEAR: 'clear',
  /** The check did not run, or could not. */
  UNCHECKED: 'unchecked',
}

/** Why the check did not produce an answer, in the words the report prints. */
const REASONS = {
  'not-configured': "le service n'est pas configuré pour cette instance",
  'rate-limited': 'quota du service atteint',
  error: 'service indisponible',
  missing: "la collecte de ce dossier est antérieure à la mise en place de la vérification",
}

const yearOf = (value) => {
  const year = Number(String(value ?? '').slice(0, 4))
  return Number.isFinite(year) && year > 1900 ? year : null
}

/**
 * The snapshot, normalised.
 *
 * `state` drives which sentence the report prints; `breaches` is for the investigation report only,
 * which is the single document where a breach is named.
 */
export const readBreachExposure = (becData) => {
  const raw = becData?.BreachExposure

  if (!raw || typeof raw !== 'object') {
    return {
      state: BREACH_STATE.UNCHECKED,
      reason: REASONS.missing,
      checkedUtc: null,
      source: null,
      addresses: [],
      breaches: [],
      count: 0,
      passwordCount: 0,
      yearMin: null,
      yearMax: null,
    }
  }

  const status = String(raw.Status ?? raw.status ?? '')
  const checkedUtc = raw.CheckedUtc ?? raw.checkedUtc ?? null
  const source = raw.Source ?? raw.source ?? null
  const addresses = psitAsArray(raw.Addresses ?? raw.addresses).map((value) => String(value))

  if (status !== 'ok') {
    return {
      state: BREACH_STATE.UNCHECKED,
      reason: REASONS[status] || REASONS.error,
      checkedUtc,
      source,
      addresses,
      breaches: [],
      count: 0,
      passwordCount: 0,
      yearMin: null,
      yearMax: null,
    }
  }

  const breaches = psitAsArray(raw.Breaches ?? raw.breaches)
    .filter(Boolean)
    .map((breach) => ({
      name: String(breach.Name ?? breach.name ?? '').trim(),
      breachDate: breach.BreachDate ?? breach.breachDate ?? null,
      dataClasses: psitAsArray(breach.DataClasses ?? breach.dataClasses).map((value) =>
        String(value)
      ),
      // Never a value, always the flag the collection derived from the data classes.
      password: Boolean(breach.Password ?? breach.password),
      logo: breach.Logo ?? breach.logo ?? null,
    }))
    .filter((breach) => breach.name)
    // Oldest first: the report reads as a history, and the year range is its two ends.
    .sort((a, b) => String(a.breachDate ?? '').localeCompare(String(b.breachDate ?? '')))

  const years = breaches.map((breach) => yearOf(breach.breachDate)).filter(Boolean)
  const passwordCount = breaches.filter((breach) => breach.password).length

  return {
    state:
      breaches.length === 0
        ? BREACH_STATE.CLEAR
        : passwordCount > 0
          ? BREACH_STATE.EXPOSED_PASSWORDS
          : BREACH_STATE.EXPOSED,
    reason: null,
    checkedUtc,
    source,
    addresses,
    breaches,
    count: breaches.length,
    passwordCount,
    yearMin: years.length > 0 ? Math.min(...years) : null,
    yearMax: years.length > 0 ? Math.max(...years) : null,
  }
}

/**
 * The data classes across all breaches, deduplicated.
 *
 * The client report names the KINDS of data exposed but never the breaches themselves: which
 * services an employee used is not the controller's business, and the aggregate is what bears on
 * the risk.
 */
export const breachDataClasses = (exposure) => {
  const seen = new Set()
  for (const breach of exposure.breaches) {
    for (const value of breach.dataClasses) {
      const trimmed = value.trim()
      if (trimmed) seen.add(trimmed)
    }
  }
  return [...seen].sort((a, b) => a.localeCompare(b, 'fr'))
}

/**
 * The sentence the client report prints, filled from the snapshot.
 *
 * The template lives in the prose dictionary and the cardinalities go through cardinal(), so the
 * count agrees with its noun without the template having to know French. Every state ends with when
 * and by what the check was made, except the state where no check happened.
 */
export const breachSentence = (exposure, upn) => {
  const template = phrase('breach', exposure.state)
  if (!template) return null

  const filled = template
    .replace('{upn}', String(upn ?? 'adresse non renseignée'))
    .replace('{n}', cardinal(exposure.count, 'compromission'))
    .replace('{m}', cardinal(exposure.passwordCount, 'compromission'))
    .replace('{min}', String(exposure.yearMin ?? 'année non déterminée'))
    .replace('{max}', String(exposure.yearMax ?? 'année non déterminée'))
    .replace('{reason}', exposure.reason ?? 'raison non enregistrée')

  if (exposure.state === BREACH_STATE.UNCHECKED) return filled

  const provenance = `Vérification effectuée ${dateProse(exposure.checkedUtc)} via ${
    exposure.source ?? 'source non enregistrée'
  }.`
  const classes = breachDataClasses(exposure)
  // The kinds of data, never the services: which sites an employee used is not the controller's
  // business, and the aggregate is what bears on the risk.
  const kinds =
    classes.length > 0 ? `Catégories de données exposées : ${enumerate(classes)}.` : null

  return [filled, kinds, provenance].filter(Boolean).join(' ')
}

/** True in the two states where a reused password is a live risk, and only those. */
export const breachSuggestsPasswordReset = (exposure) =>
  exposure.state === BREACH_STATE.EXPOSED_PASSWORDS || exposure.state === BREACH_STATE.EXPOSED
