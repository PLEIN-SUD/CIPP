import { useMemo } from 'react'
import { Box, Chip, Stack, Typography } from '@mui/material'
import { CippBannerListCard } from '../../CippCards/CippBannerListCard'
import { psitBecChecks } from '../../../utils/psit-bec-checks'

const TONE_COLOUR = {
  bad: 'error.main',
  good: 'success.main',
  unknown: 'warning.main',
  neutral: 'text.secondary',
}
const TONE_LABEL = {
  bad: 'à regarder',
  good: 'rien à signaler',
  unknown: 'non déterminé',
  neutral: 'informatif',
}

/**
 * The eleven checks of a BEC collection, on the banner lists the native screens use.
 *
 * The first version hid its own point: each check carried a one-line reading built precisely so
 * the analyst would not have to expand anything, and that line sat inside the accordion, behind
 * the expand. Eleven identical stacked rows, all mute until clicked. The reading and its status
 * now show on the closed row - count, one line, a colour - and expanding is for the detail only.
 *
 * The counts keep their rule: they count what an analyst acts on. Upstream shows 113 on sign-in
 * locations and 278 on sender lists; those are three addresses and an unchanged history, and a
 * count that inflates is a count nobody reads twice.
 *
 * What reads as compromise is listed first: on a list of eleven, the order is the hierarchy.
 */
export const PsitBecCheckList = ({ becData, title = 'Contrôles de la collecte' }) => {
  const checks = useMemo(() => {
    const built = psitBecChecks(becData)
    // Bad first, catalogue order preserved within each tone: the catalogue already orders by
    // what matters, the sort only lifts what demands attention today.
    return [...built].sort(
      (a, b) => (a.reading?.tone === 'bad' ? 0 : 1) - (b.reading?.tone === 'bad' ? 0 : 1)
    )
  }, [becData])

  if (!becData || becData.Waiting) return null

  const flagged = checks.filter((check) => check.reading?.tone === 'bad').length

  const items = checks.map((check) => ({
    id: check.id,
    cardLabelBox: { cardLabelBoxHeader: String(check.count) },
    text: check.title,
    subtext: check.reading?.text,
    statusColor: TONE_COLOUR[check.reading?.tone] ?? 'text.secondary',
    statusText: TONE_LABEL[check.reading?.tone] ?? '',
    children:
      check.items.length > 0 ? (
        // Capped height: a check with 278 rows must not push the ten others off the screen.
        <Box sx={{ maxHeight: 300, overflowY: 'auto', pb: 1 }}>
          <Stack spacing={0.5}>
            {check.items.map((entry, index) => (
              <Stack key={index}>
                <Typography
                  variant="body2"
                  sx={{ fontWeight: 600, color: TONE_COLOUR[entry.tone] ?? 'text.primary' }}
                >
                  {entry.label}
                </Typography>
                {entry.value && (
                  <Typography variant="caption" color="text.secondary">
                    {entry.value}
                  </Typography>
                )}
              </Stack>
            ))}
          </Stack>
        </Box>
      ) : (
        <Typography variant="body2" color="text.secondary" sx={{ pb: 1 }}>
          Rien à détailler au-delà de la lecture ci-dessus.
        </Typography>
      ),
  }))

  return (
    <Stack spacing={1}>
      <Stack direction="row" spacing={1} alignItems="center">
        <Typography variant="h6">{title}</Typography>
        <Chip
          size="small"
          color={flagged > 0 ? 'error' : 'success'}
          label={
            flagged > 0
              ? `${flagged} contrôle(s) à regarder sur ${checks.length}`
              : `${checks.length} contrôles, rien à signaler`
          }
        />
      </Stack>
      <CippBannerListCard items={items} isCollapsible={true} />
    </Stack>
  )
}
