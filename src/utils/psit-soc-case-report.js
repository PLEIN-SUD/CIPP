import { psitSocTypeById } from './psit-soc-types'
import { psitSocActionLabel, psitSocEntityLabel, psitSocTypeLabel } from './psit-soc-queue'
import { psitSocPhaseSteps, PSIT_SOC_PHASES } from './psit-soc-phases'

/**
 * The model behind the two type-agnostic dossier documents: the investigation report (final,
 * verdict required) and the point de situation (interim, explicitly non-conclusive).
 *
 * The reader is the client. Every fact arrives dated and attributed, every guide step arrives
 * with its recorded finding, and the interim document says in its first sentence that it does
 * not conclude. The documents render; this file decides what they say.
 */

export const CASE_CONCLUSIONS = {
  'true-positive':
    "L'investigation qualifie le signalement vrai positif : une activité malveillante ou une compromission est établie. Les mesures prises et les faits relevés figurent dans ce document.",
  'benign-true-positive':
    "Le signalement était fondé : le comportement signalé est réel, sans compromission. Il a été traité comme décrit dans ce document, et la détection reste pertinente.",
  'false-positive':
    "L'investigation conclut au faux positif : l'activité signalée relève d'un usage normal ou d'une corrélation erronée. Le détail figure dans ce document.",
  undetermined:
    "L'investigation n'a pas permis de trancher : les éléments réunis n'établissent ni un usage normal ni une compromission. Les faits relevés et les questions restées ouvertes figurent dans ce document.",
}

/** Said once, in the interim document's first lines: this is not the conclusion. */
export const INTERIM_CONTEXT_SENTENCE =
  "Ce document est un point de situation établi en cours d'investigation. Il décrit les faits établis et les actions menées à la date de génération, et ne constitue pas la conclusion de l'investigation."

const STATE_WORDS = {
  done: 'faite',
  skipped: 'sans objet',
  unknown: 'sans réponse',
  pending: 'à faire',
}

const VERDICT_WORDS = {
  'true-positive': 'vrai positif',
  'benign-true-positive': 'vrai positif bénin',
  'false-positive': 'faux positif',
  undetermined: 'indéterminé',
}

/**
 * The guide walked, step by step, with what each one recorded. `includePending` is the interim
 * document's need: what remains to do is part of a point de situation, not of a conclusion.
 */
export const psitCaseReportFindings = (socCase, { includePending = false } = {}) => {
  const entry = psitSocTypeById(socCase?.TypeId)
  if (!entry) return []
  const rows = []
  for (const phase of PSIT_SOC_PHASES) {
    for (const step of psitSocPhaseSteps(socCase, phase.key)) {
      const state = socCase?.GuideProgress?.[step.id]
      const stateKey = typeof state === 'string' ? state : (state?.State ?? 'pending')
      if (!includePending && (stateKey === 'pending' || !state)) continue
      rows.push({
        phase: phase.title,
        label: step.label,
        state: STATE_WORDS[stateKey] ?? stateKey,
        note: typeof state === 'object' ? (state?.Note ?? '') : '',
        by: typeof state === 'object' ? (state?.By ?? '') : '',
        utc: typeof state === 'object' ? (state?.Utc ?? '') : '',
      })
    }
  }
  return rows
}

/** The journal, oldest first, actions said in French: what the documents print as actions menées. */
export const psitCaseReportJournal = (socCase) =>
  [...(socCase?.ActionLog ?? [])].reverse().map((entry) => ({
    utc: entry?.OccurredUtc || entry?.Utc || '',
    action: psitSocActionLabel(entry?.Action),
    detail: entry?.Detail ?? '',
    by: entry?.Analyst ?? '',
  }))

/** The dossier's facts, phrased once for both documents. */
export const buildCaseReportModel = (socCase) => {
  const catalogueEntry = psitSocTypeById(socCase?.TypeId)
  const verdict = socCase?.Qualification?.Verdict ?? null
  return {
    caseId: socCase?.CaseId ?? '',
    tenant: socCase?.Tenant ?? '',
    title: socCase?.Title ?? '',
    ticket: socCase?.TicketRef || socCase?.ExternalRef || socCase?.CaseId || 'sans référence',
    typeLabel: psitSocTypeLabel(socCase?.TypeId),
    typeDescription: catalogueEntry?.description ?? '',
    createdUtc: socCase?.CreatedUtc ?? '',
    status: socCase?.Status ?? '',
    assignedTo: socCase?.AssignedTo ?? '',
    entities: Object.entries(socCase?.Entities ?? {}).map(([kind, value]) => ({
      label: psitSocEntityLabel(kind),
      value: String(value ?? ''),
    })),
    verdict,
    verdictWord: verdict ? (VERDICT_WORDS[verdict] ?? verdict) : null,
    conclusion: verdict ? (CASE_CONCLUSIONS[verdict] ?? null) : null,
    justification: socCase?.Qualification?.Justification ?? '',
    decidedBy: socCase?.Qualification?.Analyst ?? '',
    decidedUtc: socCase?.Qualification?.DecidedUtc ?? '',
    rootCause: socCase?.Qualification?.RootCause ?? '',
    attackTechniques: Array.isArray(socCase?.Qualification?.AttackTechniques)
      ? socCase.Qualification.AttackTechniques
      : [],
    findings: psitCaseReportFindings(socCase),
    remaining: psitCaseReportFindings(socCase, { includePending: true }).filter(
      (row) => row.state === 'à faire' || row.state === 'sans réponse'
    ),
    journal: psitCaseReportJournal(socCase),
  }
}
