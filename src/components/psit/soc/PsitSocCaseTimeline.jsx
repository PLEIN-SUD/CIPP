import { useMemo } from 'react'
import {
  Card,
  CardContent,
  CardHeader,
  Chip,
  Stack,
  Typography,
} from '@mui/material'
import { PSIT_TIMELINE_KINDS, psitSocTimeline } from '../../../utils/psit-soc-timeline'

const KIND_COLOURS = {
  alert: 'error',
  journal: 'default',
  signin: 'info',
  download: 'warning',
  consent: 'secondary',
}

const frDateTime = (value) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return date.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'medium', timeZone: 'UTC' })
}

/**
 * One axis for everything the dossier knows: the alert, the sign-ins, the audit downloads, the
 * consents, and the journal (on the hour the gesture happened, not the hour it was typed).
 * Reads what the evidence hook already fetched - no call of its own.
 */
export const PsitSocCaseTimeline = ({ socCase, evidence }) => {
  const events = useMemo(() => psitSocTimeline(socCase, evidence), [socCase, evidence])

  return (
    <Card variant="outlined">
      <CardHeader
        title="Chronologie"
        subheader="Toutes les sources sur un axe, heures UTC. Le journal se place à l’heure réelle du geste."
      />
      <CardContent>
        {events.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            Rien à placer encore : la chronologie se remplit avec les preuves collectées.
          </Typography>
        ) : (
          <Stack spacing={1}>
            {events.map((entry, index) => (
              <Stack key={`${entry.whenUtc}-${index}`} direction="row" spacing={1.5} alignItems="baseline">
                <Typography variant="caption" sx={{ minWidth: 130, fontVariantNumeric: 'tabular-nums' }}>
                  {frDateTime(entry.whenUtc)}
                </Typography>
                <Chip
                  size="small"
                  variant="outlined"
                  color={KIND_COLOURS[entry.kind] ?? 'default'}
                  label={PSIT_TIMELINE_KINDS[entry.kind] ?? entry.kind}
                />
                <Typography variant="body2" sx={{ flexGrow: 1 }}>
                  {entry.label}
                  {entry.detail && (
                    <Typography component="span" variant="body2" color="text.secondary">
                      {` — ${entry.detail}`}
                    </Typography>
                  )}
                </Typography>
              </Stack>
            ))}
          </Stack>
        )}
      </CardContent>
    </Card>
  )
}
