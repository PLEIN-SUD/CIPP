import { AlertBox, ClearBox, InfoBox, Note, Section } from '../CippPdf'
import {
  SIGNAL_CLASS,
  VERDICT_STATUS,
  buildSignals,
  buildVerdict,
  formatUtc,
} from '../../utils/psit-bec-signals'

// The block that turns both BEC reports into a dated, attributable assessment instead of a
// machine score: what the data settles on its own, what an analyst determined and on what grounds,
// and which questions are still open. Pure props - it renders inside the react-pdf tree, where
// there are no hooks and no query client.
//
// Bilingual through a small dictionary rather than two components: the same block appears in the
// French client report and in the upstream English one, and duplicating it would guarantee the two
// drift apart.

const STRINGS = {
  fr: {
    section: "Évaluation de l'analyste",
    verdictTitle: (label) => `Conclusion : ${label}`,
    establishedTitle: 'Signaux établis par la donnée',
    qualifiedTitle: 'Qualifications enregistrées',
    openTitle: 'Questions ouvertes — le verdict en dépend',
    noneQualified:
      "Aucune qualification enregistrée à ce jour. Le rapport n'affiche pas de niveau de risque : le sens des signaux ci-dessus dépend de faits qui n'ont pas encore été confirmés.",
    verdicts: { expected: 'attendu', unexpected: 'inattendu', undetermined: 'indéterminé' },
    by: 'par',
    on: 'le',
    noJustification: 'sans justification consignée',
    verdictLabel: 'Verdict :',
    disclaimer:
      "Ce document rapporte des constats et les qualifications de l'analyste. Il ne conclut pas au-delà de ce que les données et ces qualifications permettent d'affirmer.",
  },
  en: {
    section: 'Analyst assessment',
    verdictTitle: (label) => `Conclusion: ${label}`,
    establishedTitle: 'Signals settled by the data',
    qualifiedTitle: 'Recorded determinations',
    openTitle: 'Open questions — the verdict depends on them',
    noneQualified:
      'No determination recorded yet. This report states no risk level: the meaning of the signals above depends on facts that have not been confirmed.',
    verdicts: { expected: 'expected', unexpected: 'unexpected', undetermined: 'undetermined' },
    by: 'by',
    on: 'on',
    noJustification: 'no justification recorded',
    verdictLabel: 'Verdict:',
    disclaimer:
      'This document reports findings and the analyst determinations. It does not conclude beyond what the data and those determinations support. The "Threat Assessment" banner earlier in this report is a mechanical score over counters; where the two differ, this assessment supersedes it.',
  },
}

export const PsitBecAssessmentSection = ({
  verdict,
  signals = [],
  triage = [],
  language = 'fr',
}) => {
  const t = STRINGS[language] || STRINGS.fr
  const determinations = new Map((triage || []).map((entry) => [String(entry?.SignalId), entry]))
  const established = signals.filter((signal) => signal.class === SIGNAL_CLASS.ESTABLISHED)
  const qualified = signals
    .filter((signal) => signal.class === SIGNAL_CLASS.TO_QUALIFY)
    .map((signal) => ({ signal, determination: determinations.get(signal.id) }))
  const answered = qualified.filter((entry) => entry.determination)
  const open = qualified.filter((entry) => !entry.determination)

  const Box = verdict?.status === VERDICT_STATUS.CLEAN ? ClearBox : AlertBox

  return (
    <Section title={t.section}>
      <Box colour={verdict?.colour} title={t.verdictTitle(verdict?.label)}>
        {verdict?.detail}
      </Box>

      {established.length > 0 && (
        <InfoBox title={t.establishedTitle}>
          {established.map((signal) => `• ${signal.title}\n  ${signal.detail}`).join('\n')}
        </InfoBox>
      )}

      {answered.length > 0 ? (
        <InfoBox title={t.qualifiedTitle}>
          {answered
            .map(
              ({ signal, determination }) =>
                // No arrow glyph: Helvetica's WinAnsi encoding has no U+2192, and react-pdf drew a
                // curly quote instead in every generated report.
                `• ${signal.title}\n  ${t.verdictLabel} ${t.verdicts[determination.Verdict] || determination.Verdict} ${t.by} ${
                  determination.Analyst || 'N/D'
                } ${t.on} ${formatUtc(determination.DecidedUtc)}\n  ${
                  determination.Justification || t.noJustification
                }`
            )
            .join('\n')}
        </InfoBox>
      ) : (
        qualified.length > 0 && (
          <InfoBox tone="warn" title={t.qualifiedTitle}>
            {t.noneQualified}
          </InfoBox>
        )
      )}

      {open.length > 0 && (
        <AlertBox title={t.openTitle}>
          {open.map((entry) => `• ${entry.signal.question}`).join('\n')}
        </AlertBox>
      )}

      <Note>{t.disclaimer}</Note>
    </Section>
  )
}

/**
 * Self-contained variant for a report that only has becData to hand - the upstream English
 * document, which receives the determinations through becData.PsitTriage because it renders
 * outside the React tree and cannot fetch anything itself. No hooks, so it is safe inside the
 * react-pdf reconciler.
 */
export const PsitBecAssessmentBlock = ({ becData, userData, language = 'fr' }) => {
  const signals = buildSignals(becData, userData)
  const triage = becData?.PsitTriage || []
  return (
    <PsitBecAssessmentSection
      verdict={buildVerdict(signals, triage)}
      signals={signals}
      triage={triage}
      language={language}
    />
  )
}
