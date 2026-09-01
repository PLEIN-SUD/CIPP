import { cardinal, counted } from './psit-report-prose'
import { psitSocTypeLabel } from './psit-soc-queue'
import { psitMinutesLabel, psitMonthLabel } from './psit-soc-metrics'

/**
 * The model behind the monthly activity report: what the SOC did for one client, one month.
 *
 * The reader is the client, and most often a non-technical one. Every number arrives already
 * agreed in French, every category arrives as its catalogue label rather than an id, and the
 * month with nothing to report is a sentence too: a page of zeros reads as a broken export, a
 * sentence saying the month was quiet reads as surveillance that worked. The document renders;
 * this file decides.
 */

/** What the report is, said once for a reader who does not live in these consoles. */
export const MONTHLY_CONTEXT_SENTENCE =
  "Ce document rend compte de l'activité de surveillance de sécurité sur votre environnement Microsoft 365 : chaque signalement reçu ouvre un dossier, chaque dossier est investigué puis qualifié, et les incidents réels sont traités. Les chiffres ci-dessous couvrent uniquement le mois indiqué."

const VERDICT_SENTENCES = {
  'true-positive': (count) =>
    `${counted(count, 'incident')} ${count > 1 ? 'réels confirmés' : 'réel confirmé'} et ${
      count > 1 ? 'traités' : 'traité'
    }`,
  'benign-true-positive': (count) =>
    `${counted(count, 'signalement')} ${
      count > 1 ? 'fondés' : 'fondé'
    } sur un comportement réel jugé acceptable`,
  'false-positive': (count) => `${counted(count, 'signalement')} sans objet après investigation`,
  undetermined: (count) =>
    `${counted(count, 'dossier')} ${count > 1 ? 'restés indéterminés' : 'resté indéterminé'}`,
  none: (count) =>
    `${counted(count, 'dossier')} encore en cours de qualification à la date de ce document`,
}

/**
 * The report's model. `metrics` is the normalised answer of the steering endpoint, already
 * bounded to one tenant and one month; this function only phrases it.
 */
export const buildMonthlyReportModel = ({ tenant, month, metrics }) => {
  const monthLabel = psitMonthLabel(month)
  const caseCount = metrics?.caseCount ?? 0

  const headline =
    caseCount === 0
      ? `Aucun signalement de sécurité n'a concerné votre environnement en ${monthLabel}. La surveillance est restée active sur toute la période.`
      : `En ${monthLabel}, ${cardinal(caseCount, 'signalement')} de sécurité ${
          caseCount > 1 ? 'ont été reçus et investigués' : 'a été reçu et investigué'
        } sur votre environnement.`

  const verdicts = []
  for (const entry of metrics?.byVerdict ?? []) {
    const phrase = VERDICT_SENTENCES[entry.verdict]
    if (phrase && entry.count > 0) verdicts.push(phrase(entry.count))
  }

  const truePositives = (metrics?.byVerdict ?? []).find(
    (entry) => entry.verdict === 'true-positive'
  )
  const incidentSentence =
    caseCount === 0
      ? null
      : truePositives && truePositives.count > 0
        ? `${cardinal(truePositives.count, 'signalement')} ${
            truePositives.count > 1 ? 'correspondaient' : 'correspondait'
          } à un incident réel : le détail et les actions menées figurent dans les rapports d'investigation transmis au fil du mois.`
        : 'Aucun incident réel n’a été confirmé ce mois-ci : les signalements investigués relevaient d’usages légitimes ou de comportements acceptés.'

  const types = (metrics?.byType ?? []).map((entry) => ({
    label: entry.typeId === null ? 'Sans catégorie' : psitSocTypeLabel(entry.typeId),
    count: entry.count,
    truePositives: entry.truePositives,
    falsePositives: entry.falsePositives,
    fpRate: entry.fpRatePercent === null ? 'N/D' : `${entry.fpRatePercent} %`,
  }))

  const delays = metrics?.delays ?? {}
  const delayRows = [
    {
      label: 'Prise en charge',
      value: psitMinutesLabel(delays.takeMedianMinutes),
      measured: delays.takeCount ?? 0,
    },
    {
      label: 'Premier verdict',
      value: psitMinutesLabel(delays.verdictMedianMinutes),
      measured: delays.verdictCount ?? 0,
    },
    {
      label: 'Clôture',
      value: psitMinutesLabel(delays.closeMedianMinutes),
      measured: delays.closeCount ?? 0,
    },
  ]
  const delaysNote =
    "Délais médians, mesurés depuis la réception de chaque signalement. La médiane décrit le dossier typique : elle n'est pas gonflée par un dossier resté ouvert en attente d'un retour."

  const openCount = metrics?.openCount ?? 0
  const openSentence =
    caseCount === 0
      ? null
      : openCount === 0
        ? 'Tous les dossiers du mois sont clos à la date de ce document.'
        : `${cardinal(openCount, 'dossier')} du mois ${
            openCount > 1 ? 'restent ouverts' : 'reste ouvert'
          } à la date de ce document (investigation en cours, ou attente d'un retour).`

  return {
    tenant: tenant || '',
    monthLabel,
    caseCount,
    headline,
    verdicts,
    incidentSentence,
    types,
    delayRows,
    delaysNote,
    openSentence,
    quiet: caseCount === 0,
  }
}
