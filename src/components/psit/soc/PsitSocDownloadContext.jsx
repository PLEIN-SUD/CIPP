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
import { PsitAdminBadge } from './PsitAdminBadge'
import { PsitSocDownloadReportButton } from '../PsitSocDownloadReportFr'
import {
  PSIT_DOWNLOAD_WINDOWS,
  psitDownloadBySite,
  psitDownloadClientLabel,
  psitDownloadOperationLabel,
  psitDownloadOperations,
  psitDownloadSpanMinutes,
  psitDownloadWindowLabel,
  psitReadDownloadAudit,
} from '../../../utils/psit-soc-download'

const MAX_ROWS = 50

/**
 * What a mass-download dossier is actually about: the files.
 *
 * Before this, the panel handed the alert back to the analyst — a number and a name — and the file
 * list lived in a console nobody had open. So the search is launched here, automatically, the
 * moment the dossier is opened: the analyst arrives to an answer being computed rather than to a
 * question they have to go and ask somewhere else.
 *
 * The search is asynchronous and takes minutes, so the panel polls while it runs and says it is
 * running. It never renders an empty list to mean "not finished": that reads as an account that
 * downloaded nothing, and this panel sits next to a decision.
 *
 * The window is anchored on the alert, not on now. An analyst picking the dossier up the next
 * morning would otherwise search a day when nothing happened — and can widen it here, which keeps
 * the search it replaces filed on the dossier rather than erasing it.
 */
export const PsitSocDownloadContext = ({ socCase, queryKey }) => {
  const tenant = socCase?.Tenant
  const caseId = socCase?.CaseId
  const upn = socCase?.Entities?.upn
  const userId = socCase?.Entities?.userId
  const [windowHours, setWindowHours] = useState(PSIT_DOWNLOAD_WINDOWS[0].hours)
  const [showAll, setShowAll] = useState(false)
  // Operations kept, not operations dropped: an empty set means everything, and the set resets
  // with the search it filtered.
  const [operationFilter, setOperationFilter] = useState(() => new Set())

  const auditQueryKey = `PSITSocDownload-${tenant}-${caseId}`
  const audit = ApiGetCall({
    url: `/api/PSITExecDownloadAudit?tenantFilter=${tenant}&CaseId=${caseId}`,
    queryKey: auditQueryKey,
    waiting: Boolean(tenant && caseId),
    // Only the polling loop should be short-lived; a finished search is a fixed answer.
    staleTime: 0,
    refetchInterval: (query) => (query?.state?.data?.Running === true ? 8000 : false),
  })

  const read = useMemo(() => psitReadDownloadAudit(audit.data), [audit.data])

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
      url: '/api/PSITExecDownloadAudit',
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
      url: '/api/PSITExecDownloadAudit',
      data: { tenantFilter: tenant, CaseId: caseId, Restart: true, HoursBefore: windowHours },
    })
  }

  // 'Consulté' is not 'téléchargé': the filter lets the analyst read one story at a time, and
  // the per-site table follows it, because 'quels sites ont perdu quoi' changes with the verb.
  const operations = useMemo(() => psitDownloadOperations(read.files), [read.files])
  const filteredFiles = useMemo(
    () =>
      operationFilter.size === 0
        ? read.files
        : read.files.filter((file) => operationFilter.has(file?.Operation)),
    [read.files, operationFilter]
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
  const bySite = useMemo(() => psitDownloadBySite({ files: filteredFiles }), [filteredFiles])
  const span = psitDownloadSpanMinutes(read)
  const rows = showAll ? filteredFiles : filteredFiles.slice(0, MAX_ROWS)
  const ipReputation = usePsitIpReputation([
    ...read.files.map((file) => file?.Ip),
    ...(read.summary?.addresses ?? []),
  ])
  const loading = (audit.isFetching && !audit.isFetched) || launch.isPending

  if (!caseId) {
    return (
      <Card variant="outlined">
        <CardHeader title="Téléchargements" />
        <CardContent>
          <Typography variant="body2" color="text.secondary">
            Consultation hors dossier : la recherche dans le journal d’audit s’exécute depuis un
            dossier, pour que la recherche et sa fenêtre restent attachées à ce qu’elles prouvent.
          </Typography>
        </CardContent>
      </Card>
    )
  }

  if (!upn) {
    return (
      <Card variant="outlined">
        <CardHeader title="Téléchargements" />
        <CardContent>
          <Typography variant="body2" color="text.secondary">
            Ce dossier ne nomme aucun utilisateur : renseigner l’UPN sur le dossier pour chercher
            ses téléchargements dans le journal d’audit.
          </Typography>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card variant="outlined">
      <CardHeader
        title="Téléchargements"
        subheader={upn}
        action={
          <Stack direction="row" spacing={1} alignItems="center">
            <PsitSocDownloadReportButton socCase={socCase} read={read} />
            {userId ? <PsitAdminBadge tenant={tenant} userId={userId} caseId={caseId} /> : null}
          </Stack>
        }
      />
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
            <Alert severity="info">
              Aucune recherche n’a encore été lancée sur ce dossier.
            </Alert>
          )}

          {read.window && (
            <Typography variant="body2" color="text.secondary">
              {`Fenêtre cherchée : ${psitDownloadWindowLabel(read) ?? 'non renseignée'}`}
              {read.window.launchedBy ? ` — lancée par ${read.window.launchedBy}` : ''}
            </Typography>
          )}

          {read.summary && !read.running && (
            <>
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                <Chip
                  color={read.summary.fileCount > 0 ? 'error' : 'default'}
                  label={`${read.summary.fileCount} fichier(s)`}
                />
                <Chip variant="outlined" label={`${read.summary.siteCount} site(s)`} />
                <Chip
                  variant="outlined"
                  label={`${read.summary.addressCount} adresse(s) : ${
                    read.summary.addresses.slice(0, 2).join(', ') || 'aucune'
                  }`}
                />
                {span !== null && (
                  <Chip
                    variant="outlined"
                    label={span === 0 ? 'en moins d’une minute' : `étalé sur ${span} min`}
                  />
                )}
                {psitDownloadClientLabel(read) && (
                  <Chip variant="outlined" label={psitDownloadClientLabel(read)} />
                )}
              </Stack>

              {read.summary.fileCount === 0 && (
                <Alert severity="warning">
                  Aucun téléchargement sur cette fenêtre. Le journal d’audit unifié garde 90 jours
                  au plus, et une alerte peut précéder la fenêtre cherchée : élargir avant de
                  conclure que rien n’a été téléchargé.
                </Alert>
              )}

              {read.summary.extensions.length > 0 && (
                <div>
                  <Typography variant="subtitle2" gutterBottom>
                    Types de fichiers
                  </Typography>
                  <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                    {read.summary.extensions.map((entry) => (
                      <Chip
                        key={entry.extension}
                        size="small"
                        variant="outlined"
                        label={`${entry.extension} : ${entry.count}`}
                      />
                    ))}
                  </Stack>
                </div>
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
                        label={`${entry.label} : ${entry.count}`}
                        color={operationFilter.has(entry.operation) ? 'primary' : 'default'}
                        variant={operationFilter.has(entry.operation) ? 'filled' : 'outlined'}
                        onClick={() => toggleOperation(entry.operation)}
                      />
                    ))}
                  </Stack>
                  {operationFilter.size > 0 && (
                    <Typography variant="caption" color="text.secondary">
                      {`Tables filtrées : ${[...operationFilter]
                        .map((operation) => psitDownloadOperationLabel(operation).toLowerCase())
                        .join(', ')} (${filteredFiles.length} sur ${read.files.length} lignes)`}
                    </Typography>
                  )}
                </div>
              )}

              {bySite.length > 0 && (
                <div>
                  <Typography variant="subtitle2" gutterBottom>
                    Par site
                  </Typography>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Site</TableCell>
                        <TableCell align="right">Fichiers</TableCell>
                        <TableCell>Exemples</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {bySite.map((entry) => (
                        <TableRow key={entry.site}>
                          <TableCell>{entry.site}</TableCell>
                          <TableCell align="right">{entry.count}</TableCell>
                          <TableCell>{entry.names.join(', ')}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}

              {filteredFiles.length > 0 && (
                <div>
                  <Typography variant="subtitle2" gutterBottom>
                    Fichiers
                  </Typography>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Fichier</TableCell>
                        <TableCell>Opération</TableCell>
                        <TableCell>Horodatage</TableCell>
                        <TableCell>Adresse</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {rows.map((file, index) => (
                        <TableRow key={`${file.Path}-${file.WhenUtc}-${index}`}>
                          <TableCell>{file.Name}</TableCell>
                          <TableCell>{psitDownloadOperationLabel(file.Operation)}</TableCell>
                          <TableCell>{file.WhenUtc}</TableCell>
                          <TableCell>
                            {file.Ip}
                            <PsitIpChip ip={file.Ip} reputation={ipReputation.map[file.Ip]} />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  {filteredFiles.length > MAX_ROWS && (
                    <Button size="small" variant="outlined" onClick={() => setShowAll((value) => !value)}>
                      {showAll
                        ? `Réduire à ${MAX_ROWS} lignes`
                        : `Afficher les ${filteredFiles.length} fichiers`}
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
            {/* An alert can arrive well after the fact, and a burst can start before the hour the
                emitter reports. Relaunching keeps the previous search filed on the dossier: a
                report written this morning must still be able to name where its numbers came
                from. */}
            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
              <TextField
                select
                size="small"
                label="Fenêtre"
                value={windowHours}
                onChange={(event) => setWindowHours(Number(event.target.value))}
                sx={{ minWidth: 220 }}
              >
                {PSIT_DOWNLOAD_WINDOWS.map((option) => (
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
