/**
 * Who actually worked on a dossier, for the reports that say so.
 *
 * A report signed only by whoever happens to hold the dossier misnames the work: an
 * investigation is usually several people, and the one who closed it is rarely the only one who
 * looked. The journal already knows - every entry carries its author - so the list is read from
 * what happened rather than declared.
 *
 * Automatic actors are left out. 'webhook' ingested the alert; it did not investigate it, and a
 * client report listing it as an intervener would be false in a way nobody could correct.
 */

const AUTOMATION = ['webhook', 'system', 'cipp', 'automation']

const isPerson = (who) => {
  const value = String(who ?? '').trim()
  if (!value) return false
  // A person here is an address. Anything else is a service account or a label, and neither has
  // a photo, a job title, or a hand in the investigation.
  if (!value.includes('@')) return false
  return !AUTOMATION.includes(value.toLowerCase())
}

const earlier = (a, b) => (!a ? b : !b ? a : a < b ? a : b)
const later = (a, b) => (!a ? b : !b ? a : a > b ? a : b)

/**
 * @param {object} sources
 * @param {Array}  sources.actionLog     A SOC dossier's journal: { Analyst, Action, Utc, OccurredUtc }.
 * @param {Array}  sources.triage        BEC determinations: { Analyst, DecidedUtc }.
 * @param {object} sources.incident      A BEC record: { CreatedBy, UpdatedBy, ClosedBy, ... }.
 * @param {object} sources.socCase       A SOC dossier: AssignedTo and its qualification.
 * @returns {Array} One entry per person, in the order they first appear, each with what they did.
 */
export const psitReportContributors = ({ actionLog, triage, incident, socCase } = {}) => {
  const found = new Map()

  const record = (who, what, when) => {
    if (!isPerson(who)) return
    const key = String(who).trim().toLowerCase()
    const entry = found.get(key) ?? {
      upn: String(who).trim(),
      actions: new Set(),
      firstUtc: null,
      lastUtc: null,
    }
    if (what) entry.actions.add(what)
    const stamp = when ? String(when) : null
    entry.firstUtc = earlier(entry.firstUtc, stamp)
    entry.lastUtc = later(entry.lastUtc, stamp)
    found.set(key, entry)
  }

  for (const line of Array.isArray(actionLog) ? actionLog : []) {
    record(line?.Analyst, String(line?.Action ?? '').trim() || null, line?.OccurredUtc || line?.Utc)
  }
  for (const determination of Array.isArray(triage) ? triage : []) {
    record(determination?.Analyst, 'qualification des signaux', determination?.DecidedUtc)
  }
  if (incident) {
    record(incident.CreatedBy, 'ouverture de la fiche', incident.CreatedUtc)
    record(incident.UpdatedBy, 'tenue de la fiche', incident.UpdatedUtc)
    record(incident.ClosedBy, 'clôture', incident.ClosedUtc)
  }
  if (socCase) {
    record(socCase.Qualification?.Analyst, 'qualification', socCase.Qualification?.DecidedUtc)
    record(socCase.ClosedBy, 'clôture', socCase.ClosedUtc)
    // Last, and without a timestamp: holding a dossier is a fact about now, not an action that
    // happened at a moment. It only adds someone the journal never named.
    record(socCase.AssignedTo, 'prise en charge', null)
  }

  return [...found.values()].map((entry) => ({
    upn: entry.upn,
    actions: [...entry.actions],
    firstUtc: entry.firstUtc,
    lastUtc: entry.lastUtc,
  }))
}

/**
 * The line printed under a name: what this person did, in their own count of gestures.
 * Says nothing rather than inventing a role when the sources named none.
 */
export const psitContributorRole = (contributor) => {
  const actions = contributor?.actions ?? []
  if (actions.length === 0) return ''
  if (actions.length <= 3) return actions.join(', ')
  return `${actions.slice(0, 3).join(', ')} et ${actions.length - 3} autres gestes`
}
