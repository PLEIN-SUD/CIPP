import { psitSocTypeById } from './psit-soc-types'

// The seven-step investigation frame, as tabs.
//
// Five phases carry guide steps (validate, scope, collect, reconstruct, map); Document is not a
// phase but the journal, visible everywhere; Decision & Response closes the chain. A tab unlocks
// when the previous phase's steps are all done or skipped ('sans objet' counts: stating that a
// step does not apply IS the work) - never by clicking harder. Going back is always free: new
// evidence widens scope.
//
// 'unknown' ('sans réponse': looked, cannot answer) deliberately does NOT unlock: an unanswered
// question blocks the walk, and the exits are the honest ones - find the answer, qualify early
// through a shortcut (FP, benign, confirmed TP), escalate, or put the dossier on hold. The
// recorded impasse then feeds the Décision tab as a push toward 'indéterminé'.

export const PSIT_SOC_PHASES = [
  { key: 'validate', label: '1. Valider', title: 'Valider l’alerte' },
  { key: 'scope', label: '2. Périmètre', title: 'Délimiter le périmètre' },
  { key: 'collect', label: '3. Preuves', title: 'Collecter et préserver' },
  { key: 'reconstruct', label: '4. Chronologie', title: 'Reconstituer la chronologie' },
  { key: 'map', label: '5. Analyse', title: 'Techniques et cause racine' },
  { key: 'decision', label: '6. Décision & Réponse', title: 'Qualifier et répondre' },
]

// Dossiers created before the tabbed frame shipped are grandfathered: their guides were walked
// under the old free navigation, and locking their tabs after the fact would punish work already
// done. An explicit date, not a heuristic - it is testable and it will read honestly in a year.
export const PSIT_PHASE_GATING_SINCE = '2026-09-01T00:00:00Z'

const stepState = (socCase, stepId) => {
  const entry = socCase?.GuideProgress?.[stepId]
  // Two shapes tolerated on read, like the other GuideProgress readers: { State } or a bare string.
  return typeof entry === 'string' ? entry : entry?.State
}

/** The guide steps of one phase for the dossier's type (empty for unknown types). */
export const psitSocPhaseSteps = (socCase, phaseKey) => {
  const entry = psitSocTypeById(socCase?.TypeId)
  return (entry?.guide ?? []).filter((step) => step.phase === phaseKey)
}

/** A phase with no steps for this type is complete by definition: nothing was asked. */
export const psitSocPhaseComplete = (socCase, phaseKey) => {
  const steps = psitSocPhaseSteps(socCase, phaseKey)
  return steps.every((step) => {
    const state = stepState(socCase, step.id)
    return state === 'done' || state === 'skipped'
  })
}

/**
 * Whether the frame gates at all for this dossier. It does not when the investigation is already
 * decided or archived (a verdict, containment or closure means everything is consultation), for
 * the to-be-retyped type 99 (its guide says to fix the type first), and for dossiers older than
 * the frame (grandfather clause: no migration, no retroactive locking).
 */
export const psitSocPhaseGatingActive = (socCase) => {
  if (!socCase?.CaseId) return false
  if (socCase?.Qualification?.Verdict) return false
  if (['qualified-fp', 'qualified-tp', 'qualified-btp', 'contained', 'closed'].includes(socCase?.Status)) {
    return false
  }
  const entry = psitSocTypeById(socCase?.TypeId)
  if (!entry || entry.id === 99) return false
  const created = Date.parse(socCase?.CreatedUtc ?? '')
  if (Number.isNaN(created) || created < Date.parse(PSIT_PHASE_GATING_SINCE)) return false
  return true
}

/**
 * The set of unlocked phase keys. The first phase is always open; each next one opens when the
 * previous is complete. When gating is off, everything is open.
 */
export const psitSocUnlockedPhases = (socCase) => {
  const all = new Set(PSIT_SOC_PHASES.map((phase) => phase.key))
  if (!psitSocPhaseGatingActive(socCase)) return all

  const unlocked = new Set()
  for (const phase of PSIT_SOC_PHASES) {
    unlocked.add(phase.key)
    if (!psitSocPhaseComplete(socCase, phase.key)) break
  }
  return unlocked
}

/**
 * The steps still owed before a locked phase opens: what the tooltip names. Each carries its
 * state so the hint can say which ones are recorded impasses rather than simply not done.
 */
export const psitSocPhaseRemaining = (socCase, phaseKey) => {
  const order = PSIT_SOC_PHASES.map((phase) => phase.key)
  const index = order.indexOf(phaseKey)
  if (index <= 0) return []
  const remaining = []
  for (const previous of order.slice(0, index)) {
    for (const step of psitSocPhaseSteps(socCase, previous)) {
      const state = stepState(socCase, step.id)
      if (state !== 'done' && state !== 'skipped') remaining.push({ ...step, state })
    }
  }
  return remaining
}

/**
 * The recorded impasses across the whole guide: steps someone looked at and could not answer.
 * The Décision tab counts them as a push toward the 'indéterminé' verdict or the escalation.
 */
export const psitSocUnansweredSteps = (socCase) => {
  const entry = psitSocTypeById(socCase?.TypeId)
  return (entry?.guide ?? []).filter((step) => stepState(socCase, step.id) === 'unknown')
}
