import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardHeader,
  Chip,
  Divider,
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
  Tooltip,
} from '@mui/material'
import { ApiGetCall, ApiPostCall } from '../../../api/ApiCall'
import { PsitIpChip } from './PsitIpChip'
import { usePsitIpReputation } from '../../../hooks/use-psit-ip-reputation'
import { CippApiResults } from '../../CippComponents/CippApiResults'
import { PsitSocLoading } from './PsitSocLoading'
import {
  PSIT_AUDIT_WINDOWS,
  psitAuditKindLabel,
  psitAuditOperations,
  psitAuditWindowLabel,
  psitReadCaseAudit,
} from '../../../utils/psit-soc-case-audit'

const MAX_ROWS = 50

/**
 * What a role-change, inbox-rule or mailbox-access dossier is actually about: the audit trail.
 *
 * Same doctrine as the download panel it generalises. The search is launched here, automatically,
 * the moment the dossier is opened: the analyst arrives to an answer being computed rather than
 * to a console they have to go open. The search is asynchronous and takes minutes, so the panel
 * polls while it runs and says it is running — it never renders an empty list to mean « pas
 * fini », because that reads as « rien ne s'est passé » and this panel sits next to a decision.
 *
 * The window is anchored on the alert, not on now, and widening it keeps the search it replaces
 * filed on the dossier rather than erasing it.
 */
export const PsitSocAuditContext = ({ socCase, queryKey }) => {
  const tenant = socCase?.Tenant
  const caseId = socCase?.CaseId
  const upn = socCase?.Entities?.upn
  const [windowHours, setWindowHours] = useState(PSIT_AUDIT_WINDOWS[0].hours)
  const [showAll, setShowAll] = useState(false)
  const [operationFilter, setOperationFilter] = useState(() => new Set())

  const auditQueryKey = `PSITSocCaseAudit-${tenant}-${caseId}`
  const audit = ApiGetCall({
    url: `/api/PSITExecCaseAuditSearch?tenantFilter=${tenant}&CaseId=${caseId}`,
    queryKey: auditQueryKey,
    waiting: Boolean(tenant && caseId),
    // Only the polling loop should be short-lived; a finished search is a fixed answer.
    staleTime: 0,
    refetchInterval: (query) => (query?.state?.data?.Running === true ? 8000 : false),
  })

  const read = useMemo(() => psitReadCaseAudit(audit.data), [audit.data])

  const launch = ApiPostCall({ relatedQueryKeys: [auditQueryKey, ...(queryKey ? [queryKey] : [])] })

  // Fired once per mounted dossier. Without the ref the mutation's own invalidation re-renders
  // this component before the refetch lands, and the effect fires again on the same stale answer.
  const autoStarted = useRef(false)
  useEffect(() => {
    if (autoStarted.current) return
    if (!tenant || !caseId || !upn) return
    if (!audit.isFetched || audit.isFetching) return
    if (read.started) return
    autoStarted.current = true
    launch.mutate({
      url: '/api/PSITExecCaseAuditSearch',
      data: { tenantFilter: tenant, CaseId: caseId, Start: true, HoursBefore: windowHours },
    })
    // windowHours is deliberately absent: changing the window is a relaunch, an explicit gesture,
    // never something the automatic first search should re-trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenant, caseId, upn, audit.isFetched, audit.isFetching, read.started])

  const relaunch = () => {
    setShowAll(false)
    setOperationFilter(new Set())
    launch.mutate({
      url: '/api/PSITExecCaseAuditSearch',
      data: { tenantFilter: tenant, CaseId: caseId, Restart: true, HoursBefore: windowHours },
    })
  }

  const operations = useMemo(() => psitAuditOperations(read.events), [read.events])
  const filteredEvents = useMemo(
    () =>
      operationFilter.size === 0
        ? read.events
        : read.events.filter((event) => operationFilter.has(event?.Operation)),
    [read.events, operationFilter]
  )
  const toggleOperation = (operation) => {
    setShowAll(false)
    setOperationFilter((current) => {
      const next = new Set(current)
      if (next.has(operation)) {
        next.delete(operation)
      } else {
        next.add(operation)
      }
      return next
    })
  }
  const rows = showAll ? filteredEvents : filteredEvents.slice(0, MAX_ROWS)
  const ipReputation = usePsitIpReputation([
    ...read.events.map((event) => event?.Ip),
    ...(read.summary?.addresses ?? []),
  ])
  const loading = (audit.isFetching && !audit.isFetched) || launch.isPending
  const title = read.window?.kind
    ? `Journal d’audit — ${psitAuditKindLabel(read.window.kind)}`
    : 'Journal d’audit'

  if (!upn) {
    return (
      <Card variant="outlined">
        <CardHeader title="Journal d’audit" />
        <CardContent>
          <Typography variant="body2" color="text.secondary">
            Ce dossier ne nomme aucun utilisateur : renseigner l’UPN sur le dossier pour chercher
            ses traces dans le journal d’audit.
          </Typography>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card variant="outlined">
      <CardHeader title={title} subheader={upn} />
      <CardContent>
        {loading && <PsitSocLoading label="Interrogation du journal d’audit" />}

        <Stack spacing={2} sx={loading ? { display: 'none' } : undefined}>
          {read.warnings.map((warning) => (
            <Alert key={warning} severity="warning">
              {warning}
            </Alert>
          ))}

          {read.running && (
            <Alert severity="info" icon={false}>
              <Stack direction="row" spacing={1.5} alignItems="center">
                <PsitSocLoading label="Recherche en cours dans le journal d’audit" />
              </Stack>
              Microsoft met généralement quelques minutes à répondre. Cet écran se met à jour tout
              seul, il n’y a rien à relancer.
            </Alert>
          )}

          {!read.started && !read.running && (
            <Alert severity="info">Aucune recherche n’a encore été lancée sur ce dossier.</Alert>
          )}

          {read.window && (
            <Typography variant="body2" color="text.secondary">
              {`Fenêtre cherchée : ${psitAuditWindowLabel(read) ?? 'non renseignée'}`}
              {read.window.launchedBy ? ` — lancée par ${read.window.launchedBy}` : ''}
            </Typography>
          )}

          {read.summary && !read.running && (
            <>
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                <Chip
                  color={read.summary.eventCount > 0 ? 'error' : 'default'}
                  label={`${read.summary.eventCount} événement(s)`}
                />
                {read.summary.actors.length > 0 && (
                  <Chip
                    variant="outlined"
                    label={`${read.summary.actors.length} acteur(s) : ${read.summary.actors
                      .slice(0, 2)
                      .map((entry) => entry.actor)
                      .join(', ')}`}
                  />
                )}
                <Chip
                  variant="outlined"
                  label={`${read.summary.addressCount} adresse(s) : ${
                    read.summary.addresses.slice(0, 2).join(', ') || 'aucune'
                  }`}
                />
              </Stack>

              {read.summary.eventCount === 0 && (
                <Alert severity="warning">
                  Aucun événement sur cette fenêtre. Le journal d’audit unifié garde 90 jours au
                  plus, et une alerte peut précéder la fenêtre cherchée : élargir avant de conclure
                  que rien ne s’est passé.
                </Alert>
              )}

              {operations.length > 0 && (
                <div>
                  <Typography variant="subtitle2" gutterBottom>
                    Type d&rsquo;action (cliquer pour filtrer les tables)
                  </Typography>
                  <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                    {operations.map((entry) => (
                      <Chip
                        key={entry.operation}
                        size="small"
                        label={`${entry.operation} : ${entry.count}`}
                        color={operationFilter.has(entry.operation) ? 'primary' : 'default'}
                        variant={operationFilter.has(entry.operation) ? 'filled' : 'outlined'}
                        onClick={() => toggleOperation(entry.operation)}
                      />
                    ))}
                  </Stack>
                  {operationFilter.size > 0 && (
                    <Typography variant="caption" color="text.secondary">
                      {`Table filtrée : ${[...operationFilter].join(', ')} (${filteredEvents.length} sur ${read.events.length} lignes)`}
                    </Typography>
                  )}
                </div>
              )}

              {filteredEvents.length > 0 && (
                <div>
                  <Typography variant="subtitle2" gutterBottom>
                    Événements
                  </Typography>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Horodatage</TableCell>
                        <TableCell>Opération</TableCell>
                        <TableCell>Acteur</TableCell>
                        <TableCell>Cible</TableCell>
                        <TableCell>Réputation</TableCell>
                        <TableCell>Adresse</TableCell>
                        <TableCell>Détail</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {rows.map((event, index) => (
                        <TableRow key={`${event.WhenUtc}-${event.Operation}-${index}`}>
                          <TableCell>{event.WhenUtc}</TableCell>
                          <TableCell>{event.Operation}</TableCell>
                          <TableCell>{event.Actor}</TableCell>
                          <TableCell>{event.Target}</TableCell>
                          <TableCell>
                            <PsitIpChip ip={event.Ip} reputation={ipReputation.map[event.Ip]} />
                          </TableCell>
                          <TableCell>{event.Ip}</TableCell>
                          {/* The rule's conditions or the rights granted: the substance, compact. */}
                          <TableCell sx={{ maxWidth: 320, overflowWrap: 'anywhere' }}>
                            <Typography variant="caption">{event.Detail}</Typography>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  {filteredEvents.length > MAX_ROWS && (
                    <Button size="small" variant="outlined" onClick={() => setShowAll((value) => !value)}>
                      {showAll
                        ? `Réduire à ${MAX_ROWS} lignes`
                        : `Afficher les ${filteredEvents.length} événements`}
                    </Button>
                  )}
                </div>
              )}
            </>
          )}

          <Divider />

          <div>
            <Typography variant="subtitle2" gutterBottom>
              Élargir la fenêtre
            </Typography>
            {/* An alert can arrive well after the fact. Relaunching keeps the previous search
                filed on the dossier: a journal entry written this morning must still be able to
                name where its numbers came from. */}
            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
              <TextField
                select
                size="small"
                label="Fenêtre"
                value={windowHours}
                onChange={(event) => setWindowHours(Number(event.target.value))}
                sx={{ minWidth: 220 }}
              >
                {PSIT_AUDIT_WINDOWS.map((option) => (
                  <MenuItem key={option.hours} value={option.hours}>
                    {option.label}
                  </MenuItem>
                ))}
              </TextField>
              <Tooltip describeChild title="Relancer la recherche : nouvelle recherche sur la fenêtre choisie — la recherche précédente reste classée au dossier">
                <span>
                  <Button
                    size="small"
                    variant="outlined"
                    disabled={launch.isPending || read.running}
                    onClick={relaunch}
                  >
                    Relancer la recherche
                  </Button>
                </span>
              </Tooltip>
            </Stack>
            <CippApiResults apiObject={launch} errorsOnly />
          </div>
        </Stack>
      </CardContent>
    </Card>
  )
}
