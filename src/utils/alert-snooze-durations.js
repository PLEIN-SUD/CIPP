// Snooze durations offered for an individual alert item. Kept in one place so the snooze
// dialog and the deep-link page (/cipp/snooze-alert, reached from the buttons in alert
// emails) can never offer a value the backend rejects - ExecSnoozeAlert validates the
// incoming Duration against the same list (Get-CIPPAlertSnoozeDuration).
export const SNOOZE_DURATIONS = [7, 14, 30, 90, 180, 365]

export const snoozeDurationLabel = (days) => {
  const value = Number(days)
  if (value === -1) return 'forever'
  if (value === 365) return '1 year'
  return `${value} days`
}

export const SNOOZE_OPTIONS = SNOOZE_DURATIONS.map((days) => ({
  value: String(days),
  label: `Snooze for ${snoozeDurationLabel(days)}`,
}))

export const isValidSnoozeDuration = (days) => SNOOZE_DURATIONS.includes(Number(days))
