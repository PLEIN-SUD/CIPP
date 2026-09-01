import { useMemo, useState } from 'react'
import {
  Alert,
  AlertTitle,
  Collapse,
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
  SvgIcon,
  TextField,
  Typography,
  Tooltip,
} from '@mui/material'
import { Add, DeleteOutline, ArchiveOutlined } from '@mui/icons-material'
import ExpandMoreIcon from '@heroicons/react/24/outline/ChevronDownIcon'
import { ApiGetCall, ApiPostCall } from '../../api/ApiCall'
import { CippApiResults } from '../CippComponents/CippApiResults'
import { psitAsArray } from '../../utils/psit-as-array'
import { cardinal, lexiconWarnings, phrase } from '../../utils/psit-report-prose'
import { PsitBecArchivedEvidenceButton } from './PsitBecArchivedEvidenceButton'
import {
  VERDICT_STATUS,
  buildSignals,
  buildVerdict,
  formatUtc,
  partitionDeterminations,
} from '../../utils/psit-bec-signals'
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

// Constrained values. The enumerations are enforced by the API as well: a channel posted straight
// to the endpoint is how "Pigeon voyageur" reached a client annex.
const TLP_VALUES = ['TLP:CLEAR', 'TLP:GREEN', 'TLP:AMBER', 'TLP:AMBER+STRICT', 'TLP:RED']

const CHANNEL_LABELS = {
  courriel: 'Courriel',
  telephone: 'Téléphone',
  portail: 'Portail de déclaration',
  courrier: 'Courrier',
}

const EFFECT_LABELS = {
  'mass-send': 'Envoi en masse',
  'thread-hijack': 'Détournement de fils',
  both: 'Envoi en masse et détournement de fils',
  'access-only': 'Accès sans envoi observé',
  other: 'Autre (à préciser)',
}

// Indicative only: an unusual ticket is flagged, never refused. Rigidity here would block a save on
// a numbering scheme that changed.
const TICKET_PATTERN = /^T\d{8}\.\d{4}$/

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

export const PsitBecIncidentPanel = ({
  userData,
  becData,
  tenantFilter,
  triage = [],
  collapsible = false,
  defaultExpanded = true,
  // The Autotask ticket the SOC dossier already knows, offered when the record has none of its
  // own. A suggestion, never an override: an edit or a stored value always wins.
  suggestedTicket = '',
}) => {
  const [expanded, setExpanded] = useState(defaultExpanded)
  const userId = userData?.id
  const incidentRequest = ApiGetCall({
    url: `/api/PSITListBecIncident?tenantFilter=${tenantFilter}&userId=${userId}&userPrincipalName=${userData?.userPrincipalName}`,
    queryKey: `PSITBecIncident-${tenantFilter}-${userId}`,
    waiting: Boolean(tenantFilter && userId),
  })
  // Deletion is super-admin territory server-side: anyone else gets a refusal, not a deletion.
  // Closing keeps the record; this removes it, for test dossiers and mistakes.
  const removeRequest = ApiPostCall({
    // The endpoint empties both tables, so both caches have to go: leaving the triage key behind
    // kept qualifications on screen that no longer existed anywhere.
    relatedQueryKeys: [
      `PSITBecIncident-${tenantFilter}-${userId}`,
      `PSITBecTriage-${tenantFilter}-${userId}`,
    ],
  })
  const removeRecord = () => {
    if (
      !window.confirm(
        'Supprimer définitivement cette fiche BEC et ses qualifications ? Une investigation terminée se clôt, elle ne se supprime pas : la suppression est pour les tests et les erreurs.'
      )
    ) {
      return
    }
    removeRequest.mutate({
      url: '/api/PSITExecBecIncidentRemove',
      data: { tenantFilter, userId },
    })
  }

  const saveRequest = ApiPostCall({
    relatedQueryKeys: [`PSITBecIncident-${tenantFilter}-${userId}`],
  })

  const signals = useMemo(() => buildSignals(becData, userData), [becData, userData])
  // Only determinations that still speak for this collection count towards the verdict; see
  // partitionDeterminations.
  const liveTriage = useMemo(
    () => partitionDeterminations(triage, becData).current,
    [triage, becData]
  )
  const verdict = useMemo(() => buildVerdict(signals, liveTriage), [signals, liveTriage])
  const exposure = useMemo(
    () => buildExposure(becData, signals, liveTriage, userData),
    [becData, signals, liveTriage, userData]
  )

  const stored = useMemo(() => incidentRequest.data?.Incident || {}, [incidentRequest.data])
  const remediation = useMemo(() => incidentRequest.data?.Remediation || {}, [incidentRequest.data])
  const containment = useMemo(() => buildContainment(remediation), [remediation])

  // Local state holds only edits; everything displayed falls back to the stored record. Same
  // reason as the triage panel: mirroring server state through an effect loops.
  const [edits, setEdits] = useState({})
  const [closing, setClosing] = useState(false)
  const [closureNote, setClosureNote] = useState('')
  const value = (field, fallback = '') => edits[field] ?? stored?.[field] ?? fallback
  // Read once, used everywhere the field appears (display, validation, save): what the analyst
  // sees prefilled is exactly what a save records.
  const autotaskTicket = value('AutotaskTicket', suggestedTicket)
  const ticketIsSuggested = Boolean(suggestedTicket) && !edits.AutotaskTicket && !stored?.AutotaskTicket
  // psitAsArray, not `?? []`: the worker serialises a one-row list as a bare object, and this
  // is what `list(field).map(...)` blew up on.
  const list = (field) => psitAsArray(edits[field] ?? stored?.[field])
  const set = (field, next) => setEdits((previous) => ({ ...previous, [field]: next }))

  const handleSave = () => {
    saveRequest.mutate({
      url: '/api/PSITExecBecIncident',
      data: {
        tenantFilter,
        userId,
        userPrincipalName: userData?.userPrincipalName,
        autotaskTicket,
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
        tlp: value('Tlp', 'TLP:AMBER+STRICT'),
        effectDescription: value('EffectDescription'),
        effectDescriptionOther: value('EffectDescriptionOther'),
        relatedTickets: list('RelatedTickets'),
        deliveredTo: value('DeliveredTo'),
        deliveredUtc: value('DeliveredUtc'),
        deliveryChannel: value('DeliveryChannel'),
        acknowledgedBy: value('AcknowledgedBy'),
        acknowledgedUtc: value('AcknowledgedUtc'),
        followUpDecision: value('FollowUpDecision'),
        followUpDecisionUtc: value('FollowUpDecisionUtc'),
      },
    })
  }

  const handleClose = () => {
    saveRequest.mutate({
      url: '/api/PSITExecBecIncident',
      data: {
        tenantFilter,
        userId,
        userPrincipalName: userData?.userPrincipalName,
        action: 'close',
        closureNote,
      },
    })
    setEdits({})
    setClosing(false)
    setClosureNote('')
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
        title="Fiche BEC"
        subheader={
          stored?.Reference
            ? `${stored.Reference}, dernière mise à jour par ${stored.UpdatedBy || 'N/D'} le ${formatUtc(
                stored.UpdatedUtc
              )}`
            : "Aucune fiche ouverte : l'enregistrement en créera une avec sa référence"
        }
        // The delete keeps out of the main action row on purpose: it is not analyst vocabulary.
        titleTypographyProps={{ variant: 'h6' }}
        action={
          collapsible ? (
            <Tooltip describeChild title={expanded ? 'Replier la fiche BEC' : 'Déplier la fiche BEC'}>
              <IconButton
                aria-label={expanded ? 'Replier la fiche BEC' : 'Déplier la fiche BEC'}
                onClick={() => setExpanded((previous) => !previous)}
            >
              <SvgIcon
                fontSize="small"
                sx={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: '0.2s' }}
              >
                <ExpandMoreIcon />
              </SvgIcon>
              </IconButton>
            </Tooltip>
          ) : null
        }
      />
      <Collapse in={!collapsible || expanded}>
        <CardContent>
          {/* The verdict detail belongs to the decision card in rail mode; here it would be the
              third copy of the same sentence on one screen. What this panel adds is what it does
              with the verdict, so that is all that stays. */}
          <Alert severity={isCompromised ? 'error' : 'info'} sx={{ mb: 2 }}>
            <AlertTitle>{verdict.label}</AlertTitle>
            {isCompromised
              ? collapsible
                ? null
                : verdict.detail
              : `${collapsible ? '' : `${verdict.detail} `}Les champs propres à l'incident (exposition des données, confinement, tiers) apparaîtront si une compromission est retenue.`}
          </Alert>

          <Stack spacing={2} divider={<Divider flexItem />}>
            <Stack spacing={2}>
              <Typography variant="subtitle2">Références</Typography>
              <TextField
                label="Ticket Autotask"
                size="small"
                fullWidth
                placeholder="ex. T20260820.0042"
                error={Boolean(autotaskTicket) && !TICKET_PATTERN.test(autotaskTicket)}
                helperText={
                  autotaskTicket && !TICKET_PATTERN.test(autotaskTicket)
                    ? 'Forme inhabituelle (attendu T20260820.0042). Vérifiez la saisie ; ce contrôle ne bloque pas.'
                    : ticketIsSuggested
                      ? 'Repris du dossier SOC, modifiable. Référence client, reprise sur les deux rapports.'
                      : 'Référence client, reprise sur les deux rapports et sur le nom du fichier PDF.'
                }
                value={autotaskTicket}
                onChange={(event) => set('AutotaskTicket', event.target.value)}
              />
              <TextField
                label="Tickets liés (optionnel)"
                size="small"
                fullWidth
                placeholder="T20260820.0043, T20260821.0002"
                helperText="Séparés par des virgules. Affichés sous le ticket principal."
                value={list('RelatedTickets').join(', ')}
                onChange={(event) =>
                  set(
                    'RelatedTickets',
                    event.target.value
                      .split(',')
                      .map((ticket) => ticket.trim())
                      .filter(Boolean)
                  )
                }
              />
              <TextField
                select
                label="Marquage de diffusion (TLP : qui a le droit de relire ce document)"
                size="small"
                fullWidth
                helperText="Porté par la couverture et par chaque page des deux rapports."
                value={value('Tlp', 'TLP:AMBER+STRICT')}
                onChange={(event) => set('Tlp', event.target.value)}
              >
                {TLP_VALUES.map((tlp) => (
                  <MenuItem key={tlp} value={tlp}>
                    {tlp}
                  </MenuItem>
                ))}
              </TextField>
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
                      label="Confinement (vide si aucune action)"
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
                    select
                    label="Effet observé de l'accès"
                    size="small"
                    fullWidth
                    helperText={
                      phrase('effect', value('EffectDescription')) ||
                      "Saisi, jamais déduit : la collecte ne distingue pas un fil détourné d'un envoi en masse, et le résumé l'affirme."
                    }
                    value={value('EffectDescription')}
                    onChange={(event) => set('EffectDescription', event.target.value)}
                  >
                    {Object.entries(EFFECT_LABELS).map(([key, label]) => (
                      <MenuItem key={key} value={key}>
                        {label}
                      </MenuItem>
                    ))}
                  </TextField>
                  {value('EffectDescription') === 'other' && (
                    <TextField
                      label="Préciser (une ligne, reprise telle quelle dans le résumé)"
                      size="small"
                      fullWidth
                      helperText="Enregistré au journal, pour enrichir la liste des valeurs proposées."
                      value={value('EffectDescriptionOther')}
                      onChange={(event) => set('EffectDescriptionOther', event.target.value)}
                    />
                  )}
                  <TextField
                    label="Note de synthèse (complément, après le paragraphe composé)"
                    size="small"
                    multiline
                    minRows={2}
                    fullWidth
                    error={lexiconWarnings(value('ExecutiveNote')).length > 0}
                    helperText={
                      /* Le lint ne voit pas les données saisies ; ce panneau, si. */
                      lexiconWarnings(value('ExecutiveNote')).join(' ') ||
                      'Facultative. Le résumé du rapport est composé à partir des champs ci-dessus.'
                    }
                    value={value('ExecutiveNote')}
                    onChange={(event) => set('ExecutiveNote', event.target.value)}
                  />
                </Stack>

                <Stack spacing={2}>
                  <Typography variant="subtitle2">
                    Exposition des données : éléments de l'article 33.3 du RGPD
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
                      helperText={`Repère : ${cardinal(
                        exposure.correspondentFloor.distinct,
                        'correspondant'
                      )} distinct sur la fenêtre${
                        exposure.correspondentFloor.truncated ? ', suivi partiel' : ''
                      }, plancher observé et non une estimation.`}
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
                  <Typography variant="subtitle2">
                    Confinement attesté par le journal CIPP
                  </Typography>
                  {/* 'non attestée' is an affirmative finding: the log was read and says nothing
                      happened. While the log has NOT been read (the trail is only scanned once a
                      fiche exists), a row of 'non attestée' chips states the opposite of what is
                      known - an analyst who had just remediated read it as a regression. So the
                      chips only render once the log answered; before that, the explanation alone. */}
                  {remediation?.Unavailable ? (
                    <Alert severity="info">{remediation.Unavailable}</Alert>
                  ) : (
                    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                      {containment.map((action) => (
                        <Chip
                          key={action.key}
                          size="small"
                          color={
                            action.done ? (action.hasFailure ? 'warning' : 'success') : 'default'
                          }
                          variant={action.done ? 'filled' : 'outlined'}
                          label={
                            action.done
                              ? `${action.label} : ${action.firstUtc || 'date inconnue'}`
                              : `${action.label} : non attestée`
                          }
                        />
                      ))}
                    </Stack>
                  )}
                </Stack>

                <Stack spacing={1}>
                  <Typography variant="subtitle2">
                    Actions menées hors CIPP (déclaratives)
                  </Typography>
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
                      <Tooltip describeChild title="Supprimer cette ligne">
                        <IconButton
                          aria-label="Supprimer l'action"
                          onClick={() => removeRow('ExternalActions', index)}
                        >
                          <DeleteOutline fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </Stack>
                  ))}
                  <Button
                    size="small"
                    variant="outlined"
                    startIcon={<Add />}
                    onClick={() => addRow('ExternalActions', { Action: '', DoneUtc: '', By: '' })}
                  >
                    Ajouter une action
                  </Button>
                </Stack>

                <Stack spacing={2}>
                  <Typography variant="subtitle2">Remise du rapport et validation</Typography>
                  <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
                    <TextField
                      label="Remis à"
                      size="small"
                      fullWidth
                      placeholder="nom et fonction chez le client"
                      value={value('DeliveredTo')}
                      onChange={(event) => set('DeliveredTo', event.target.value)}
                    />
                    <TextField
                      type="datetime-local"
                      label="Remis le"
                      size="small"
                      InputLabelProps={{ shrink: true }}
                      value={toLocalInput(value('DeliveredUtc'))}
                      onChange={(event) => set('DeliveredUtc', toUtcFromInput(event.target.value))}
                    />
                    <TextField
                      select
                      label="Canal"
                      size="small"
                      sx={{ minWidth: 200 }}
                      value={value('DeliveryChannel')}
                      onChange={(event) => set('DeliveryChannel', event.target.value)}
                    >
                      {Object.entries(CHANNEL_LABELS).map(([key, label]) => (
                        <MenuItem key={key} value={key}>
                          {label}
                        </MenuItem>
                      ))}
                    </TextField>
                  </Stack>
                  <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
                    <TextField
                      label="Accusé de réception par"
                      size="small"
                      fullWidth
                      helperText="Laisser vide si le client n'a pas encore accusé réception : le rapport le dira."
                      value={value('AcknowledgedBy')}
                      onChange={(event) => set('AcknowledgedBy', event.target.value)}
                    />
                    <TextField
                      type="datetime-local"
                      label="Accusé le"
                      size="small"
                      InputLabelProps={{ shrink: true }}
                      value={toLocalInput(value('AcknowledgedUtc'))}
                      onChange={(event) =>
                        set('AcknowledgedUtc', toUtcFromInput(event.target.value))
                      }
                    />
                  </Stack>
                  {/* What the client decided to do with the report. This replaced a handwritten box
                      in the PDF that nobody ever filled in, and it is the only evidence of what the
                      client did with the document - the counterpart of their duty to notify. Kept
                      here rather than in the PSA because there is no Autotask integration: the
                      ticket number is a string an analyst types, nothing reads or writes the ticket. */}
                  <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
                    <TextField
                      label="Suite décidée par le client"
                      size="small"
                      fullWidth
                      multiline
                      minRows={2}
                      helperText="Notification à l'autorité, information des personnes, dépôt de plainte, déclaration à l'assureur, aucune suite. Le rapport rend ce texte tel quel."
                      value={value('FollowUpDecision')}
                      onChange={(event) => set('FollowUpDecision', event.target.value)}
                    />
                    <TextField
                      type="datetime-local"
                      label="Décidée le"
                      size="small"
                      InputLabelProps={{ shrink: true }}
                      value={toLocalInput(value('FollowUpDecisionUtc'))}
                      onChange={(event) =>
                        set('FollowUpDecisionUtc', toUtcFromInput(event.target.value))
                      }
                    />
                  </Stack>
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
                        select
                        label="Canal"
                        size="small"
                        sx={{ minWidth: 180 }}
                        value={row?.Channel || ''}
                        onChange={(event) =>
                          patchRow('ThirdPartiesNotified', index, { Channel: event.target.value })
                        }
                      >
                        {Object.entries(CHANNEL_LABELS).map(([key, label]) => (
                          <MenuItem key={key} value={key}>
                            {label}
                          </MenuItem>
                        ))}
                      </TextField>
                      <Tooltip describeChild title="Supprimer cette ligne">
                        <IconButton
                          aria-label="Supprimer le tiers"
                          onClick={() => removeRow('ThirdPartiesNotified', index)}
                        >
                          <DeleteOutline fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </Stack>
                  ))}
                  <Button
                    size="small"
                    variant="outlined"
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

            {psitAsArray(stored?.PreviousCases).length > 0 && (
              <Stack spacing={1}>
                <Typography variant="subtitle2">Antécédents sur cette boîte</Typography>
                {psitAsArray(stored.PreviousCases).map((previous) => (
                  <Alert key={previous.Reference} severity="warning" variant="outlined">
                    <AlertTitle sx={{ mb: 0 }}>
                      {previous.Reference}
                      {previous.AutotaskTicket ? `, ticket ${previous.AutotaskTicket}` : ''}
                    </AlertTitle>
                    <Typography variant="body2">
                      Détection{' '}
                      {previous.DetectedUtc ? formatUtc(previous.DetectedUtc) : 'non renseignée'},
                      clos le {previous.ClosedUtc ? formatUtc(previous.ClosedUtc) : 'N/D'} par{' '}
                      {previous.ClosedBy || 'N/D'}
                      {previous.ClosureNote ? ` : ${previous.ClosureNote}` : ''}
                    </Typography>
                    <PsitBecArchivedEvidenceButton
                      tenantFilter={tenantFilter}
                      userId={userId}
                      userPrincipalName={userData?.userPrincipalName}
                      reference={previous.Reference}
                    />
                  </Alert>
                ))}
                <Typography variant="body2" color="text.secondary">
                  Les qualifications de ces dossiers sont archivées avec eux : elles ne pèsent pas
                  sur le verdict courant.
                </Typography>
              </Stack>
            )}

            {stored?.Reference && (
              <Stack spacing={1}>
                <Typography variant="subtitle2">Clôture de la fiche BEC</Typography>
                {closing ? (
                  <>
                    <Alert severity="warning">
                      <AlertTitle>Clore {stored.Reference} ?</AlertTitle>
                      La fiche et ses qualifications sont archivées et restent consultables. La
                      fiche est ensuite vide, et la prochaine sauvegarde ouvre une fiche neuve avec
                      une nouvelle référence. Rien n'est hérité, pour qu'une seconde compromission
                      ne reprenne ni la date de détection, ni les tiers, ni l'accusé de réception du
                      fiche précédente.
                    </Alert>
                    <TextField
                      label="Note de clôture (facultative)"
                      size="small"
                      fullWidth
                      placeholder="ex. confinée, rapport remis et validé par le client"
                      value={closureNote}
                      onChange={(event) => setClosureNote(event.target.value)}
                    />
                    <Stack direction="row" spacing={2}>
                      <Button
                        variant="contained"
                        color="warning"
                        disabled={saveRequest.isPending}
                        onClick={handleClose}
                      >
                        Confirmer la clôture
                      </Button>
                      <Button onClick={() => setClosing(false)}>Annuler</Button>
                    </Stack>
                  </>
                ) : (
                  <Stack direction="row">
                    <Tooltip describeChild title="Clore la fiche BEC : archive la fiche et fige l'attestation de confinement (une note de clôture est demandée avant)">
                      <Button
                        size="small"
                        variant="outlined"
                        color="warning"
                        startIcon={<ArchiveOutlined />}
                        onClick={() => setClosing(true)}
                      >
                        Clore la fiche BEC
                      </Button>
                    </Tooltip>
                  </Stack>
                )}
              </Stack>
            )}

            <Stack direction="row" spacing={2} alignItems="center">
              <Tooltip describeChild title="Enregistrer la fiche : écrit les champs modifiés et relit le journal CIPP pour l'attestation de confinement">
                <span>
                  <Button
                    variant="contained"
                    disabled={Object.keys(edits).length === 0 || saveRequest.isPending}
                    onClick={handleSave}
                  >
                    {saveRequest.isPending ? 'Enregistrement...' : 'Enregistrer la fiche'}
                  </Button>
                </span>
              </Tooltip>
              {saveRequest.isSuccess && (
                <Typography variant="body2" color="success.main">
                  Fiche enregistrée.
                </Typography>
              )}
              {saveRequest.isError && (
                /* The reason, not just the failure: "échec de l'enregistrement" alone sent an
                   analyst hunting for a cause the API had already named. */
                <Typography variant="body2" color="error.main">
                  {saveRequest.error?.response?.data?.Results ??
                    saveRequest.error?.message ??
                    "Échec de l'enregistrement."}
                </Typography>
              )}
            </Stack>
          </Stack>
        </CardContent>
      </Collapse>
          <Stack direction="row" spacing={2} alignItems="center" sx={{ px: 2, pb: 2 }}>
        <Tooltip describeChild title="Supprimer la fiche BEC : suppression définitive de la fiche et de ses qualifications, réservée aux enregistrements de test (une fiche réelle se clôt)">
          <span>
            <Button
              size="small"
              variant="outlined"
              color="error"
              onClick={removeRecord}
              disabled={removeRequest.isPending}
            >
              Supprimer la fiche BEC (super admin)
            </Button>
          </span>
        </Tooltip>
        <CippApiResults apiObject={removeRequest} />
      </Stack>
</Card>
  )
}
