import { useMemo, useState } from 'react'
import {
  Alert,
  AlertTitle,
  Collapse,
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Button,
  Card,
  CardContent,
  CardHeader,
  Chip,
  Divider,
  IconButton,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material'
import ExpandMoreIcon from '@heroicons/react/24/outline/ChevronDownIcon'
import { SvgIcon } from '@mui/material'
import { ApiGetCall, ApiPostCall } from '../../api/ApiCall'
import { psitAsArray } from '../../utils/psit-as-array'
import {
  SIGNAL_CLASS,
  VERDICT_STATUS,
  buildSignals,
  buildVerdict,
  formatUtc,
  partitionDeterminations,
} from '../../utils/psit-bec-signals'

const VERDICT_CHOICES = [
  { value: 'expected', label: 'Attendu' },
  { value: 'unexpected', label: 'Inattendu' },
  { value: 'undetermined', label: 'Indéterminé' },
]

const STATUS_SEVERITY = {
  [VERDICT_STATUS.COMPROMISED]: 'error',
  [VERDICT_STATUS.TO_QUALIFY]: 'warning',
  [VERDICT_STATUS.UNDETERMINED]: 'warning',
  [VERDICT_STATUS.CLEAN]: 'success',
}

/**
 * The step the report cannot take on its own: an analyst answers the questions the data raises but
 * cannot settle, and the answer is recorded with their name and a timestamp.
 *
 * Until every question is answered the verdict is "À qualifier" with no risk level, on purpose. A
 * level computed from counters is what produced "risque élevé" on a mailbox whose only real signal
 * was one Italian address, and an analyst who has been burned by that stops reading the report.
 */
export const PsitBecTriagePanel = ({
  userData,
  becData,
  tenantFilter,
  collapsible = false,
  defaultExpanded = true,
}) => {
  const [expanded, setExpanded] = useState(defaultExpanded)
  const userId = userData?.id
  const triageRequest = ApiGetCall({
    url: `/api/PSITListBecTriage?tenantFilter=${tenantFilter}&userId=${userId}`,
    queryKey: `PSITBecTriage-${tenantFilter}-${userId}`,
    waiting: Boolean(tenantFilter && userId),
  })
  const saveRequest = ApiPostCall({
    relatedQueryKeys: [`PSITBecTriage-${tenantFilter}-${userId}`],
  })

  const signals = useMemo(() => buildSignals(becData, userData), [becData, userData])
  // Memoised so the derived verdict and lookup below do not rebuild on every render.
  // Split, not just read: an answer given before the current collection's window opened is
  // history. Otherwise a second compromise from the same address inherits the answer given to the
  // first one and gets filed as noise without anyone being asked.
  const partitioned = useMemo(
    () => partitionDeterminations(psitAsArray(triageRequest.data?.Determinations), becData),
    [triageRequest.data, becData]
  )
  const stored = partitioned.current
  const staleById = useMemo(
    () => new Map(partitioned.stale.map((entry) => [entry.SignalId, entry])),
    [partitioned.stale]
  )
  const verdict = useMemo(() => buildVerdict(signals, stored), [signals, stored])

  // Local state holds only what the analyst changed, never a copy of the stored answers. Mirroring
  // server state into local state through an effect is what made this component loop: the effect
  // depended on the query result object, which is a new reference on every render, so it set state
  // forever. The displayed value is derived instead - stored answer unless there is an edit on top.
  const [edits, setEdits] = useState({})

  const storedById = useMemo(
    () => new Map(stored.map((entry) => [entry.SignalId, entry])),
    [stored]
  )

  const shownVerdict = (signalId) =>
    edits[signalId]?.verdict ?? storedById.get(signalId)?.Verdict ?? null
  const shownJustification = (signalId) =>
    edits[signalId]?.justification ?? storedById.get(signalId)?.Justification ?? ''

  const toQualify = signals.filter((signal) => signal.class === SIGNAL_CLASS.TO_QUALIFY)
  const established = signals.filter((signal) => signal.class === SIGNAL_CLASS.ESTABLISHED)
  const noise = signals.filter((signal) => signal.class === SIGNAL_CLASS.NOISE)

  const pending = toQualify.filter((signal) => {
    const verdict = shownVerdict(signal.id)
    if (!verdict) return false
    const saved = storedById.get(signal.id)
    return (
      verdict !== saved?.Verdict || shownJustification(signal.id) !== (saved?.Justification || '')
    )
  })

  const handleSave = () => {
    saveRequest.mutate({
      url: '/api/PSITExecBecTriage',
      data: {
        tenantFilter,
        userId,
        userPrincipalName: userData?.userPrincipalName,
        determinations: pending.map((signal) => ({
          SignalId: signal.id,
          Verdict: shownVerdict(signal.id),
          Justification: shownJustification(signal.id),
        })),
      },
    })
  }

  if (!becData || becData.Waiting) return null

  return (
    <Card variant="outlined" sx={{ mt: 2 }}>
      <CardHeader
        title="Qualification avant diffusion"
        subheader="Les signaux que la donnée ne peut pas trancher seule"
        action={
          collapsible ? (
            <IconButton
              aria-label={expanded ? 'Replier la qualification' : 'Déplier la qualification'}
              onClick={() => setExpanded((previous) => !previous)}
            >
              <SvgIcon
                fontSize="small"
                sx={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: '0.2s' }}
              >
                <ExpandMoreIcon />
              </SvgIcon>
            </IconButton>
          ) : null
        }
      />
      <Collapse in={!collapsible || expanded}>
        <CardContent>
          <Alert severity={STATUS_SEVERITY[verdict.status] || 'info'} sx={{ mb: 2 }}>
            <AlertTitle>{verdict.label}</AlertTitle>
            {/* In rail mode the decision card above already carries the detail, two centimetres
                away. Repeating it there would be noise. */}
            {!collapsible && verdict.detail}
          </Alert>

          {established.length > 0 && (
            <>
              <Typography variant="subtitle2" gutterBottom>
                Établi par la donnée — aucune qualification requise
              </Typography>
              <Stack spacing={1} sx={{ mb: 2 }}>
                {established.map((signal) => (
                  <Alert key={signal.id} severity="error" variant="outlined">
                    <AlertTitle sx={{ mb: 0 }}>{signal.title}</AlertTitle>
                    <Typography variant="body2">{signal.detail}</Typography>
                  </Alert>
                ))}
              </Stack>
            </>
          )}

          {toQualify.length > 0 ? (
            <>
              <Typography variant="subtitle2" gutterBottom>
                À qualifier ({toQualify.filter((s) => !storedById.has(s.id)).length} sans réponse
                sur {toQualify.length})
              </Typography>
              <Stack spacing={2} divider={<Divider flexItem />}>
                {toQualify.map((signal) => {
                  const saved = storedById.get(signal.id)
                  return (
                    <Stack key={signal.id} spacing={1}>
                      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                        <Typography variant="body1" sx={{ fontWeight: 600 }}>
                          {signal.title}
                        </Typography>
                        {saved ? (
                          <Chip
                            size="small"
                            color={saved.Verdict === 'unexpected' ? 'error' : 'default'}
                            label={`${
                              VERDICT_CHOICES.find((choice) => choice.value === saved.Verdict)
                                ?.label || saved.Verdict
                            } — ${saved.Analyst} le ${formatUtc(saved.DecidedUtc)}`}
                          />
                        ) : (
                          <Chip size="small" color="warning" label="sans réponse" />
                        )}
                      </Stack>
                      <Typography variant="body2" color="text.secondary">
                        {signal.detail}
                      </Typography>
                      <Typography variant="body2">{signal.question}</Typography>
                      {staleById.has(signal.id) && (
                        /* The previous answer is shown, never applied: it was given about earlier
                         events. Re-answering is a decision, not a formality. */
                        <Typography variant="body2" color="warning.main">
                          Réponse précédente, antérieure à cette collecte :{' '}
                          {VERDICT_CHOICES.find(
                            (choice) => choice.value === staleById.get(signal.id).Verdict
                          )?.label || staleById.get(signal.id).Verdict}{' '}
                          — {staleById.get(signal.id).Analyst || 'N/D'} le{' '}
                          {formatUtc(staleById.get(signal.id).DecidedUtc)}
                          {staleById.get(signal.id).Justification
                            ? ` : ${staleById.get(signal.id).Justification}`
                            : ''}
                          . Elle ne compte pas dans le verdict : à confirmer ou à revoir pour les
                          événements de cette collecte.
                        </Typography>
                      )}
                      <ToggleButtonGroup
                        exclusive
                        size="small"
                        value={shownVerdict(signal.id)}
                        onChange={(event, value) => {
                          if (!value) return
                          setEdits((previous) => ({
                            ...previous,
                            [signal.id]: { ...previous[signal.id], verdict: value },
                          }))
                        }}
                      >
                        {VERDICT_CHOICES.map((choice) => (
                          <ToggleButton key={choice.value} value={choice.value}>
                            {choice.label}
                          </ToggleButton>
                        ))}
                      </ToggleButtonGroup>
                      <TextField
                        size="small"
                        fullWidth
                        label="Justification (qui a confirmé, comment)"
                        value={shownJustification(signal.id)}
                        onChange={(event) =>
                          setEdits((previous) => ({
                            ...previous,
                            [signal.id]: {
                              ...previous[signal.id],
                              justification: event.target.value,
                            },
                          }))
                        }
                      />
                    </Stack>
                  )
                })}
              </Stack>

              <Stack direction="row" spacing={2} alignItems="center" sx={{ mt: 2 }}>
                <Button
                  variant="contained"
                  disabled={pending.length === 0 || saveRequest.isPending}
                  onClick={handleSave}
                >
                  {saveRequest.isPending
                    ? 'Enregistrement...'
                    : `Enregistrer ${pending.length || ''} qualification(s)`}
                </Button>
                {saveRequest.isSuccess && (
                  <Typography variant="body2" color="success.main">
                    Qualification enregistrée.
                  </Typography>
                )}
                {saveRequest.isError && (
                  <Typography variant="body2" color="error.main">
                    Échec de l'enregistrement.
                  </Typography>
                )}
              </Stack>
            </>
          ) : (
            <Typography variant="body2" color="text.secondary">
              Aucun signal ne requiert de qualification humaine sur cette fenêtre.
            </Typography>
          )}

          {noise.length > 0 && (
            <Accordion variant="outlined" sx={{ mt: 2 }}>
              <AccordionSummary
                expandIcon={
                  <SvgIcon fontSize="small">
                    <ExpandMoreIcon />
                  </SvgIcon>
                }
              >
                <Typography variant="subtitle2">
                  Écarté du verdict ({noise.length}) — conservé pour audit
                </Typography>
              </AccordionSummary>
              <AccordionDetails>
                <Stack spacing={1}>
                  {noise.map((signal) => (
                    <Stack key={signal.id}>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {signal.title}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {signal.detail}
                      </Typography>
                    </Stack>
                  ))}
                </Stack>
              </AccordionDetails>
            </Accordion>
          )}
        </CardContent>
      </Collapse>
    </Card>
  )
}
