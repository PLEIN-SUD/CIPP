import { psitSocTypeLabel } from './psit-soc-queue'

/**
 * The internal notes an analyst pastes into the Autotask ticket at the dossier's milestones.
 *
 * Same doctrine as the time entry: CIPP generates the text, the analyst reads it and pastes it -
 * no Autotask credentials in CIPP, no write API. Each note is self-sufficient for a reader who
 * only has the ticket: the dossier reference, what just happened, who did it and when, and the
 * link back to the full journal.
 */

const VERDICT_WORDS = {
  'true-positive': 'vrai positif',
  'benign-true-positive': 'vrai positif bénin',
  'false-positive': 'faux positif',
  undetermined: 'indéterminé',
}

const frUtc = (value) => {
  if (!value) return 'date non renseignée'
  try {
    return `${new Date(value).toLocaleString('fr-FR', {
      dateStyle: 'short',
      timeStyle: 'short',
      timeZone: 'UTC',
    })} UTC`
  } catch {
    return String(value)
  }
}

const latestEntry = (socCase, predicate) =>
  (socCase?.ActionLog ?? []).find(predicate) ?? null

/**
 * The milestones this dossier can report to the ticket, most recent first. Each carries the
 * journal entry (or qualification) it reads from, so the note quotes the recorded fact rather
 * than the screen's current state.
 */
export const psitAutotaskMilestones = (socCase) => {
  const milestones = []

  const taken = latestEntry(
    socCase,
    (entry) => entry?.Action === 'status' && entry?.Detail === 'investigating'
  )
  if (taken) {
    milestones.push({ key: 'taken', label: 'Prise en charge', utc: taken.Utc, entry: taken })
  }

  if (socCase?.Qualification?.Verdict) {
    milestones.push({
      key: 'qualified',
      label: 'Qualification',
      utc: socCase.Qualification.DecidedUtc ?? '',
    })
  }

  const contained = latestEntry(socCase, (entry) =>
    ['remediate-user', 'mde-isolate'].includes(entry?.Action)
  )
  if (contained) {
    milestones.push({
      key: 'contained',
      label: 'Confinement / remédiation',
      utc: contained.Utc,
      entry: contained,
    })
  }

  const hold = latestEntry(socCase, (entry) => entry?.Action === 'on-hold')
  if (socCase?.Status === 'on-hold' && hold) {
    milestones.push({ key: 'on-hold', label: 'Mise en attente', utc: hold.Utc, entry: hold })
  }

  const escalated = latestEntry(socCase, (entry) => entry?.Action === 'escalated')
  if (escalated) {
    milestones.push({ key: 'escalated', label: 'Escalade', utc: escalated.Utc, entry: escalated })
  }

  if (socCase?.Status === 'closed') {
    milestones.push({ key: 'closed', label: 'Clôture', utc: socCase.ClosedUtc ?? '' })
  }

  return milestones.sort((a, b) => String(b.utc).localeCompare(String(a.utc)))
}

const bodyFor = (socCase, milestone) => {
  const verdict = socCase?.Qualification?.Verdict
  const verdictWord = VERDICT_WORDS[verdict] ?? verdict
  switch (milestone.key) {
    case 'taken':
      return `Dossier pris en charge par ${milestone.entry?.Analyst ?? 'N/D'} le ${frUtc(milestone.entry?.Utc)}. Investigation en cours selon le guide de la catégorie.`
    case 'qualified':
      return `Verdict posé le ${frUtc(socCase?.Qualification?.DecidedUtc)} par ${
        socCase?.Qualification?.Analyst ?? 'N/D'
      } : ${verdictWord}. Justification enregistrée au dossier : ${
        socCase?.Qualification?.Justification || 'voir le dossier'
      }`
    case 'contained':
      return `${milestone.entry?.Detail ?? 'Remédiation exécutée.'} Geste journalisé le ${frUtc(
        milestone.entry?.Utc
      )} par ${milestone.entry?.Analyst ?? 'N/D'}.`
    case 'on-hold':
      return `Dossier mis en attente le ${frUtc(milestone.entry?.Utc)} par ${
        milestone.entry?.Analyst ?? 'N/D'
      }. Motif : ${milestone.entry?.Detail || 'voir le dossier'}`
    case 'escalated':
      return `${milestone.entry?.Detail ?? 'Dossier escaladé.'} Escalade journalisée le ${frUtc(
        milestone.entry?.Utc
      )} par ${milestone.entry?.Analyst ?? 'N/D'}.`
    case 'closed':
      return `Dossier clos le ${frUtc(socCase?.ClosedUtc)} par ${socCase?.ClosedBy ?? 'N/D'}${
        verdict ? ` sur verdict ${verdictWord}` : ''
      }. Le rapport d'investigation est généré depuis le dossier.`
    default:
      return ''
  }
}

/** The note itself, ready to paste. `origin` is the portal's base URL (window.location.origin). */
export const psitAutotaskNote = (socCase, milestone, origin = '') => {
  if (!socCase?.CaseId || !milestone) return ''
  const link = origin
    ? `${origin}/security/soc/case?caseId=${socCase.CaseId}&tenantFilter=${socCase.Tenant}`
    : ''
  const lines = [
    `[SOC] ${milestone.label}, dossier ${socCase.CaseId}`,
    `Signalement : ${socCase.Title || psitSocTypeLabel(socCase.TypeId)} (${socCase.Tenant})`,
    '',
    bodyFor(socCase, milestone),
  ]
  if (link) {
    lines.push('', `Dossier complet et journal : ${link}`)
  }
  return lines.join('\n')
}
