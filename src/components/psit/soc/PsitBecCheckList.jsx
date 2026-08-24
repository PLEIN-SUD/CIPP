import { useMemo } from 'react'
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Chip,
  Stack,
  SvgIcon,
  Typography,
} from '@mui/material'
import ExpandMoreIcon from '@heroicons/react/24/outline/ChevronDownIcon'
import { psitBecChecks } from '../../../utils/psit-bec-checks'

const TONE_COLOUR = {
  bad: 'error.main',
  good: 'success.main',
  unknown: 'text.secondary',
  neutral: 'text.primary',
}

/**
 * The eleven checks of a BEC collection, rendered from the catalogue.
 *
 * Same material as the upstream page, read differently in two ways that matter on a real case:
 *
 * - the count counts what an analyst acts on. Upstream shows 113 on sign-in locations and 278 on
 *   sender lists; those are three addresses and an unchanged history. A count that inflates is a
 *   count nobody reads twice, and the badge next to a check is the first thing the eye lands on.
 * - each check states its reading in one line before its rows, so scrolling a list is a choice
 *   rather than the only way to know whether it matters.
 *
 * A check that reads as compromise opens by itself: on a page of eleven accordions, what matters
 * should not need a click to be seen.
 */
export const PsitBecCheckList = ({ becData, title = 'Contrôles de la collecte' }) => {
  const checks = useMemo(() => psitBecChecks(becData), [becData])

  if (!becData || becData.Waiting) return null

  const flagged = checks.filter((check) => check.reading?.tone === 'bad').length

  return (
    <Stack spacing={1}>
      <Stack direction="row" spacing={1} alignItems="center">
        <Typography variant="subtitle2">{title}</Typography>
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

      {checks.map((check) => (
        <Accordion
          key={check.id}
          variant="outlined"
          defaultExpanded={check.reading?.tone === 'bad'}
        >
          <AccordionSummary
            expandIcon={
              <SvgIcon fontSize="small">
                <ExpandMoreIcon />
              </SvgIcon>
            }
          >
            <Stack
              direction="row"
              spacing={2}
              alignItems="center"
              justifyContent="space-between"
              sx={{ width: '100%', pr: 1 }}
            >
              <Typography variant="body1">{check.title}</Typography>
              <Chip
                size="small"
                color={check.reading?.tone === 'bad' ? 'error' : 'default'}
                label={check.count}
              />
            </Stack>
          </AccordionSummary>
          <AccordionDetails>
            <Typography
              variant="body2"
              sx={{ color: TONE_COLOUR[check.reading?.tone] ?? 'text.primary', mb: 1 }}
            >
              {check.reading?.text}
            </Typography>
            {check.items.length > 0 && (
              // Capped height: a check with 278 rows must not push the ten others off the screen.
              <Box sx={{ maxHeight: 300, overflowY: 'auto' }}>
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
            )}
          </AccordionDetails>
        </Accordion>
      ))}
    </Stack>
  )
}
