// What the steering endpoint answers, normalised for the Pilotage screen and the monthly report.
//
// The API aggregates (counts by verdict, status, severity, type and tenant, a monthly series,
// median delays) so that forty tenants of dossiers travel as a few hundred bytes. This module
// reads that answer and owns the two translations both consumers need: a median in minutes said
// as a human duration, and a 'yyyy-MM' bucket said as a French month.

const asArray = (value) => (Array.isArray(value) ? value : [])

/** The verdict words, 'none' included: dossiers awaiting a verdict are a number, not a gap. */
export const PSIT_METRICS_VERDICT_LABELS = {
  'true-positive': 'Vrai positif',
  'benign-true-positive': 'VP bénin',
  'false-positive': 'Faux positif',
  undetermined: 'Indéterminé',
  none: 'À qualifier',
}

export const psitMetricsVerdictLabel = (verdict) =>
  PSIT_METRICS_VERDICT_LABELS[verdict] ?? String(verdict || '')

/** The endpoint's answer, normalised. Numbers only: labels are asked for where they are shown. */
export const psitReadSocMetrics = (data) => {
  if (!data || typeof data.CaseCount === 'undefined') return null
  const delays = data.Delays ?? {}
  return {
    caseCount: Number(data.CaseCount ?? 0),
    openCount: Number(data.OpenCount ?? 0),
    byVerdict: asArray(data.ByVerdict).map((entry) => ({
      verdict: entry?.Verdict ?? '',
      count: Number(entry?.Count ?? 0),
    })),
    byStatus: asArray(data.ByStatus).map((entry) => ({
      status: entry?.Status ?? '',
      count: Number(entry?.Count ?? 0),
    })),
    bySeverity: asArray(data.BySeverity).map((entry) => ({
      severity: entry?.Severity ?? '',
      count: Number(entry?.Count ?? 0),
    })),
    byType: asArray(data.ByType).map((entry) => ({
      typeId: entry?.TypeId ?? null,
      count: Number(entry?.Count ?? 0),
      qualified: Number(entry?.Qualified ?? 0),
      truePositives: Number(entry?.TruePositives ?? 0),
      benignTruePositives: Number(entry?.BenignTruePositives ?? 0),
      falsePositives: Number(entry?.FalsePositives ?? 0),
      undetermined: Number(entry?.Undetermined ?? 0),
      // null stays null: a type with no verdict yet has no rate, not a rate of zero.
      fpRatePercent: entry?.FpRatePercent ?? null,
    })),
    byTenant: asArray(data.ByTenant).map((entry) => ({
      tenant: entry?.Tenant ?? '',
      count: Number(entry?.Count ?? 0),
      open: Number(entry?.Open ?? 0),
      truePositives: Number(entry?.TruePositives ?? 0),
    })),
    byMonth: asArray(data.ByMonth).map((entry) => ({
      month: entry?.Month ?? '',
      count: Number(entry?.Count ?? 0),
      truePositives: Number(entry?.TruePositives ?? 0),
      falsePositives: Number(entry?.FalsePositives ?? 0),
    })),
    delays: {
      takeMedianMinutes: delays.TakeMedianMinutes ?? null,
      takeCount: Number(delays.TakeCount ?? 0),
      verdictMedianMinutes: delays.VerdictMedianMinutes ?? null,
      verdictCount: Number(delays.VerdictCount ?? 0),
      closeMedianMinutes: delays.CloseMedianMinutes ?? null,
      closeCount: Number(delays.CloseCount ?? 0),
    },
    window: data.Window
      ? {
          tenant: data.Window.Tenant ?? '',
          startUtc: data.Window.StartUtc || null,
          endUtc: data.Window.EndUtc || null,
        }
      : null,
  }
}

/**
 * A median in minutes, said as a person would: '45 min', '3 h', '2 j 4 h'. 'N/D' when nothing
 * could be measured — which is not the same as a median of zero.
 */
export const psitMinutesLabel = (minutes) => {
  if (minutes === null || minutes === undefined || Number.isNaN(Number(minutes))) return 'N/D'
  const whole = Math.round(Number(minutes))
  if (whole < 60) return `${whole} min`
  if (whole < 48 * 60) {
    const hours = Math.floor(whole / 60)
    const rest = whole % 60
    return rest > 0 ? `${hours} h ${String(rest).padStart(2, '0')}` : `${hours} h`
  }
  const days = Math.floor(whole / (24 * 60))
  const hours = Math.round((whole % (24 * 60)) / 60)
  return hours > 0 ? `${days} j ${hours} h` : `${days} j`
}

const MONTHS_FR = [
  'janvier',
  'février',
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  'août',
  'septembre',
  'octobre',
  'novembre',
  'décembre',
]

/** '2026-08' said as 'août 2026'; anything unreadable comes back as it arrived. */
export const psitMonthLabel = (month) => {
  const match = /^(\d{4})-(\d{2})$/.exec(String(month || ''))
  if (!match) return String(month || '')
  const index = Number(match[2]) - 1
  if (index < 0 || index > 11) return String(month)
  return `${MONTHS_FR[index]} ${match[1]}`
}

/** The month's UTC bounds, for asking the endpoint about exactly one month. */
export const psitMonthBounds = (month) => {
  const match = /^(\d{4})-(\d{2})$/.exec(String(month || ''))
  if (!match) return null
  const year = Number(match[1])
  const index = Number(match[2]) - 1
  const start = new Date(Date.UTC(year, index, 1))
  const end = new Date(Date.UTC(year, index + 1, 1))
  return { startUtc: start.toISOString(), endUtc: end.toISOString() }
}

/** The last N closed months plus the current one, newest first, for the month picker. */
export const psitRecentMonths = (count = 6, now = new Date()) => {
  const months = []
  for (let i = 0; i < count; i++) {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1))
    const month = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
    months.push({ month, label: psitMonthLabel(month) })
  }
  return months
}
