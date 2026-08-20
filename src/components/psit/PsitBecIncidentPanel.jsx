import { useMemo, useState } from 'react'
import {
  Alert,
  AlertTitle,
  Autocomplete,
  Button,
  Card,
  CardContent,
  CardHeader,
  Chip,
  Divider,
  IconButton,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import { Add, DeleteOutline } from '@mui/icons-material'
import { ApiGetCall, ApiPostCall } from '../../api/ApiCall'
import { VERDICT_STATUS, buildSignals, buildVerdict, formatUtc } from '../../utils/psit-bec-signals'
import {
  DATA_CATEGORIES,
  DATA_SUBJECT_CATEGORIES,
  INCIDENT_STATUS_LABELS,
  MAIL_READ_LABELS,
  MAIL_READ_STATUS,
  buildContainment,
  buildExposure,
} from '../../utils/psit-bec-incident'

// Captures the case facts the collection cannot know, so both reports are generated from a record
// rather than hand-written. The Autotask ticket is always editable - it is the client-facing
// reference and belongs on the investigation report too - while the incident-specific fields
// (article 33.3 exposure, containment, third parties) only appear once a compromise is retained.

const toLocalInput = (utcValue) => {
  if (!utcValue) return ''
  const date = new Date(utcValue)
  if (Number.isNaN(date.getTime())) return ''
  const offset = date.getTimezoneOffset() * 60000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

const toUtcFromInput = (localValue) => {
  if (!localValue) return ''
  const date = new Date(localValue)
  if (Number.isNaN(date.getTime())) return ''
  return `${date.toISOString().slice(0, 19)}Z`
}

export const PsitBecIncidentPanel = ({ userData, becData, tenantFilter, triage = [] }) => {
  const userId = userData?.id
  const incidentRequest = ApiGetCall({
    url: `/api/PSITListBecIncident?tenantFilter=${tenantFilter}&userId=${userId}&userPrincipalName=${userData?.userPrincipalName}`,
    queryKey: `PSITBecIncident-${tenantFilter}-${userId}`,
    waiting: Boolean(tenantFilter && userId),
  })
  const saveRequest = ApiPostCall({
    relatedQueryKeys: [`PSITBecIncident-${tenantFilter}-${userId}`],
  })

  const signals = useMemo(() => buildSignals(becData, userData), [becData, userData])
  const verdict = useMemo(() => buildVerdict(signals, triage), [signals, triage])
  const exposure = useMemo(
    () => buildExposure(becData, signals, triage, userData),
    [becData, signals, triage, userData]
  )

  const stored = useMemo(() => incidentRequest.data?.Incident || {}, [incidentRequest.data])
  const remediation = useMemo(() => incidentRequest.data?.Remediation || {}, [incidentRequest.data])
  const containment = useMemo(() => buildContainment(remediation), [remediation])

  // Local state holds only edits; everything displayed falls back to the stored record. Same
  // reason as the triage panel: mirroring server state through an effect loops.
  const [edits, setEdits] = useState({})
  const value = (field, fallback = '') => edits[field] ?? stored?.[field] ?? fallback
  const list = (field) => edits[field] ?? stored?.[field] ?? []
  const set = (field, next) => setEdits((previous) => ({ ...previous, [field]: next }))

  const handleSave = () => {
    saveRequest.mutate({
      url: '/api/PSITExecBecIncident',
      data: {
        tenantFilter,
        userId,
        userPrincipalName: userData?.userPrincipalName,
        autotaskTicket: value('AutotaskTicket'),
        detectedUtc: value('DetectedUtc'),
        containedUtc: value('ContainedUtc'),
        status: value('Status', 'ongoing'),
        dataSubjectCategories: list('DataSubjectCategories'),
        dataCategories: list('DataCategories'),
        affectedPersonsEstimate: value('AffectedPersonsEstimate'),
        affectedPersonsBasis: value('AffectedPersonsBasis'),
        mailReadStatus: value('MailReadStatus', exposure.mailReadSuggested),
        likelyConsequences: value('LikelyConsequences'),
        executiveNote: value('ExecutiveNote'),
        externalActions: list('ExternalActions'),
        thirdPartiesNotified: list('ThirdPartiesNotified'),
      },
    })
  }

  const addRow = (field, row) => set(field, [...list(field), row])
  const removeRow = (field, index) =>
    set(
      field,
      list(field).filter((_, position) => position !== index)
    )
  const patchRow = (field, index, patch) =>
    set(
      field,
      list(field).map((row, position) => (position === index ? { ...row, ...patch } : row))
    )

  if (!becData || becData.Waiting) return null
  // The record exists from the start, because the Autotask ticket has to appear on the
  // investigation report too. Only the incident-specific fields wait for a retained compromise.
  const isCompromised = verdict.status === VERDICT_STATUS.COMPROMISED

  return (
    <Card variant="outlined" sx={{ mt: 2, borderColor: isCompromised ? 'error.main' : 'divider' }}>
      <CardHeader
        title="Fiche de dossier"
        subheader={
          stored?.Reference
            ? `${stored.Reference} — dernière mise à jour par ${stored.UpdatedBy || 'N/D'} le ${formatUtc(
                stored.UpdatedUtc
              )}`
            : "Aucune fiche ouverte : l'enregistrement en créera une avec sa référence"
        }
      />
      <CardContent>
        <Alert severity={isCompromised ? 'error' : 'info'} sx={{ mb: 2 }}>
          <AlertTitle>{verdict.label}</AlertTitle>
          {isCompromised
            ? verdict.detail
            : `${verdict.detail} Les champs propres à l'incident (exposition des données, confinement, tiers) apparaîtront si une compromission est retenue.`}
        </Alert>

        <Stack spacing={2} divider={<Divider flexItem />}>
          <Stack spacing={2}>
            <Typography variant="subtitle2">Références</Typography>
            <TextField
              label="Ticket Autotask"
              size="small"
              fullWidth
              placeholder="ex. T20260820.0042"
              helperText="Référence métier, reprise sur les deux rapports."
              value={value('AutotaskTicket')}
              onChange={(event) => set('AutotaskTicket', event.target.value)}
            />
          </Stack>

          {isCompromised && (
            <>
              <Stack spacing={2}>
                <Typography variant="subtitle2">Cadre de l'incident</Typography>
                <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
                  <TextField
                    type="datetime-local"
                    label="Détection (heure locale, stockée en UTC)"
                    size="small"
                    fullWidth
                    InputLabelProps={{ shrink: true }}
                    value={toLocalInput(value('DetectedUtc'))}
                    onChange={(event) => set('DetectedUtc', toUtcFromInput(event.target.value))}
                  />
                  <TextField
                    type="datetime-local"
                    label="Confinement (vide si non confinée)"
                    size="small"
                    fullWidth
                    InputLabelProps={{ shrink: true }}
                    value={toLocalInput(value('ContainedUtc'))}
                    onChange={(event) => set('ContainedUtc', toUtcFromInput(event.target.value))}
                  />
                  <TextField
                    select
                    label="Statut"
                    size="small"
                    fullWidth
                    value={value('Status', 'ongoing')}
                    onChange={(event) => set('Status', event.target.value)}
                  >
                    {Object.entries(INCIDENT_STATUS_LABELS).map(([key, label]) => (
                      <MenuItem key={key} value={key}>
                        {label}
                      </MenuItem>
                    ))}
                  </TextField>
                </Stack>
                <TextField
                  label="Note de synthèse (reprise en tête du rapport)"
                  size="small"
                  multiline
                  minRows={2}
                  fullWidth
                  value={value('ExecutiveNote')}
                  onChange={(event) => set('ExecutiveNote', event.target.value)}
                />
              </Stack>

              <Stack spacing={2}>
                <Typography variant="subtitle2">
                  Exposition des données — éléments de l'article 33.3 du RGPD
                </Typography>
                <Autocomplete
                  multiple
                  freeSolo
                  size="small"
                  options={DATA_SUBJECT_CATEGORIES}
                  value={list('DataSubjectCategories')}
                  onChange={(event, next) => set('DataSubjectCategories', next)}
                  renderInput={(params) => (
                    <TextField {...params} label="Catégories de personnes concernées" />
                  )}
                />
                <Autocomplete
                  multiple
                  freeSolo
                  size="small"
                  options={DATA_CATEGORIES}
                  value={list('DataCategories')}
                  onChange={(event, next) => set('DataCategories', next)}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      label="Catégories de données présentes dans la boîte"
                      helperText="Non dérivable des données collectées : le contenu des messages n'est jamais lu par l'outil."
                    />
                  )}
                />
                <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
                  <TextField
                    label="Nombre approximatif de personnes"
                    size="small"
                    fullWidth
                    value={value('AffectedPersonsEstimate')}
                    onChange={(event) => set('AffectedPersonsEstimate', event.target.value)}
                  />
                  <TextField
                    label="Base d'estimation"
                    size="small"
                    fullWidth
                    placeholder="ex. volume de la boîte, base candidats"
                    value={value('AffectedPersonsBasis')}
                    onChange={(event) => set('AffectedPersonsBasis', event.target.value)}
                  />
                </Stack>
                <TextField
                  select
                  label="Lecture des messages"
                  size="small"
                  fullWidth
                  value={value('MailReadStatus', exposure.mailReadSuggested)}
                  onChange={(event) => set('MailReadStatus', event.target.value)}
                  helperText={exposure.mailReadNote}
                >
                  {Object.values(MAIL_READ_STATUS).map((status) => (
                    <MenuItem key={status} value={status}>
                      {MAIL_READ_LABELS[status]}
                    </MenuItem>
                  ))}
                </TextField>
                <TextField
                  label="Conséquences probables"
                  size="small"
                  multiline
                  minRows={2}
                  fullWidth
                  value={value('LikelyConsequences')}
                  onChange={(event) => set('LikelyConsequences', event.target.value)}
                />
              </Stack>

              <Stack spacing={1}>
                <Typography variant="subtitle2">Confinement attesté par le journal CIPP</Typography>
                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                  {containment.map((action) => (
                    <Chip
                      key={action.key}
                      size="small"
                      color={action.done ? (action.hasFailure ? 'warning' : 'success') : 'default'}
                      variant={action.done ? 'filled' : 'outlined'}
                      label={
                        action.done
                          ? `${action.label} — ${action.firstUtc || 'date inconnue'}`
                          : `${action.label} — non attestée`
                      }
                    />
                  ))}
                </Stack>
                {remediation?.Unavailable && (
                  <Typography variant="body2" color="text.secondary">
                    {remediation.Unavailable}
                  </Typography>
                )}
              </Stack>

              <Stack spacing={1}>
                <Typography variant="subtitle2">Actions menées hors CIPP (déclaratives)</Typography>
                {list('ExternalActions').map((row, index) => (
                  <Stack
                    key={`ext-${index}`}
                    direction={{ xs: 'column', md: 'row' }}
                    spacing={1}
                    alignItems="center"
                  >
                    <TextField
                      label="Action"
                      size="small"
                      fullWidth
                      value={row?.Action || ''}
                      onChange={(event) =>
                        patchRow('ExternalActions', index, { Action: event.target.value })
                      }
                    />
                    <TextField
                      type="datetime-local"
                      label="Date"
                      size="small"
                      InputLabelProps={{ shrink: true }}
                      value={toLocalInput(row?.DoneUtc)}
                      onChange={(event) =>
                        patchRow('ExternalActions', index, {
                          DoneUtc: toUtcFromInput(event.target.value),
                        })
                      }
                    />
                    <TextField
                      label="Par"
                      size="small"
                      value={row?.By || ''}
                      onChange={(event) =>
                        patchRow('ExternalActions', index, { By: event.target.value })
                      }
                    />
                    <IconButton
                      aria-label="Supprimer l'action"
                      onClick={() => removeRow('ExternalActions', index)}
                    >
                      <DeleteOutline fontSize="small" />
                    </IconButton>
                  </Stack>
                ))}
                <Button
                  size="small"
                  startIcon={<Add />}
                  onClick={() => addRow('ExternalActions', { Action: '', DoneUtc: '', By: '' })}
                >
                  Ajouter une action
                </Button>
              </Stack>

              <Stack spacing={1}>
                <Typography variant="subtitle2">Tiers prévenus</Typography>
                {list('ThirdPartiesNotified').map((row, index) => (
                  <Stack
                    key={`tp-${index}`}
                    direction={{ xs: 'column', md: 'row' }}
                    spacing={1}
                    alignItems="center"
                  >
                    <TextField
                      label="Tiers"
                      size="small"
                      fullWidth
                      value={row?.Name || ''}
                      onChange={(event) =>
                        patchRow('ThirdPartiesNotified', index, { Name: event.target.value })
                      }
                    />
                    <TextField
                      type="datetime-local"
                      label="Prévenu le"
                      size="small"
                      InputLabelProps={{ shrink: true }}
                      value={toLocalInput(row?.NotifiedUtc)}
                      onChange={(event) =>
                        patchRow('ThirdPartiesNotified', index, {
                          NotifiedUtc: toUtcFromInput(event.target.value),
                        })
                      }
                    />
                    <TextField
                      label="Canal"
                      size="small"
                      placeholder="téléphone, courriel"
                      value={row?.Channel || ''}
                      onChange={(event) =>
                        patchRow('ThirdPartiesNotified', index, { Channel: event.target.value })
                      }
                    />
                    <IconButton
                      aria-label="Supprimer le tiers"
                      onClick={() => removeRow('ThirdPartiesNotified', index)}
                    >
                      <DeleteOutline fontSize="small" />
                    </IconButton>
                  </Stack>
                ))}
                <Button
                  size="small"
                  startIcon={<Add />}
                  onClick={() =>
                    addRow('ThirdPartiesNotified', { Name: '', NotifiedUtc: '', Channel: '' })
                  }
                >
                  Ajouter un tiers
                </Button>
              </Stack>
            </>
          )}

          <Stack direction="row" spacing={2} alignItems="center">
            <Button
              variant="contained"
              color="error"
              disabled={Object.keys(edits).length === 0 || saveRequest.isPending}
              onClick={handleSave}
            >
              {saveRequest.isPending ? 'Enregistrement...' : 'Enregistrer la fiche'}
            </Button>
            {saveRequest.isSuccess && (
              <Typography variant="body2" color="success.main">
                Fiche enregistrée.
              </Typography>
            )}
            {saveRequest.isError && (
              <Typography variant="body2" color="error.main">
                Échec de l'enregistrement.
              </Typography>
            )}
          </Stack>
        </Stack>
      </CardContent>
    </Card>
  )
}
