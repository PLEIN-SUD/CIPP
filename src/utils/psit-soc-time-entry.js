import { psitSocTypeLabel } from './psit-soc-queue'
import { PSIT_SOC_SOURCES } from './psit-soc-types'

/**
 * The text of an Autotask time entry, written from what the dossier already recorded.
 *
 * Closing an investigation used to mean retelling it in the ticket from memory, hours after the
 * fact - which is how a real gesture ends up undescribed and an hour ends up unbilled. The
 * journal holds every action with its author and its timestamp; this turns it into the summary
 * an analyst would have typed, and nothing more: it never invents a duration, never states a
 * conclusion the dossier has not qualified, and never writes an action nobody logged.
 */

const VERDICT_SENTENCE = {
  'false-positive': "Qualification : faux positif (l'alerte ne correspond pas à une compromission).",
  'true-positive': 'Qualification : vrai positif (compromission retenue).',
}

const STATUS_SENTENCE = {
  contained: 'Statut : confiné.',
  closed: 'Statut : clos.',
}

const formatUtc = (value) => {
  const parsed = Date.parse(value)
  if (!value || Number.isNaN(parsed)) return null
  return new Date(parsed).toLocaleString('fr-FR', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'UTC',
  })
}

/**
 * Elapsed time between the first and the last journal entry, in hours, rounded to the quarter.
 *
 * It is offered as a starting point and labelled as one: the wall clock of a dossier is not the
 * time worked on it, and only the analyst knows the difference. Returns null rather than a
 * fabricated number when the journal cannot say - one entry, or none.
 */
export const psitSocElapsedHours = (journal = []) => {
  const stamps = journal
    .map((entry) => Date.parse(entry?.OccurredUtc || entry?.Utc))
    .filter((value) => !Number.isNaN(value))
    .sort((a, b) => a - b)
  if (stamps.length < 2) return null
  const hours = (stamps[stamps.length - 1] - stamps[0]) / 3600000
  const quarters = Math.round(hours * 4) / 4
  return quarters > 0 ? quarters : null
}

export const psitSocTimeEntry = (socCase) => {
  if (!socCase?.CaseId) return null

  const journal = [...(socCase?.ActionLog ?? [])].sort((a, b) =>
    String(a?.OccurredUtc || a?.Utc || '').localeCompare(String(b?.OccurredUtc || b?.Utc || ''))
  )

  const header = [
    `Investigation SOC ${socCase.CaseId}`,
    `Client : ${socCase.Tenant ?? 'non renseigné'}`,
    `Type : ${psitSocTypeLabel(socCase.TypeId)}`,
    `Origine : ${PSIT_SOC_SOURCES[socCase.Source] ?? socCase.Source ?? 'non renseignée'}`,
  ]

  const entities = Object.entries(socCase.Entities ?? {})
  if (entities.length > 0) {
    header.push(`Objet : ${entities.map(([kind, value]) => `${kind} ${value}`).join(', ')}`)
  }

  const body = ['', 'Déroulé :']
  if (journal.length === 0) {
    // An empty journal is stated, not filled in: a time entry that describes work nobody
    // recorded is exactly the kind of text a client should never receive.
    body.push("- Aucune action journalisée sur ce dossier ; à compléter avant l'envoi.")
  } else {
    for (const entry of journal) {
      const when = formatUtc(entry?.OccurredUtc || entry?.Utc)
      const detail = String(entry?.Detail ?? '').trim()
      body.push(
        `- ${when ? `${when} UTC : ` : ''}${String(entry?.Action ?? '').trim()}${
          detail ? `. ${detail}` : ''
        }`
      )
    }
  }

  const outcome = []
  // Qualification.Verdict is the reader's shape; the flat Verdict is the writer's parameter.
  const verdict = socCase.Qualification?.Verdict
  if (verdict && VERDICT_SENTENCE[verdict]) {
    outcome.push('', VERDICT_SENTENCE[verdict])
    const justification = String(socCase.Qualification?.Justification ?? '').trim()
    if (justification) outcome.push(justification)
  } else if (STATUS_SENTENCE[socCase.Status]) {
    outcome.push('', STATUS_SENTENCE[socCase.Status])
  }

  return [...header, ...body, ...outcome].join('\n')
}
