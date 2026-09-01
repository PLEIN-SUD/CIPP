import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { Layout as DashboardLayout } from '../../../layouts/index.js'
import { PsitSocWipBanner } from '../../../components/psit/soc/PsitSocWipBanner'
import {
  Alert,
  Button,
  Link as MuiLink,
  Card,
  CardContent,
  CardHeader,
  Chip,
  Container,
  Skeleton,
  Stack,
  SvgIcon,
  Tab,
  Tabs,
  Typography,
  Tooltip,
} from '@mui/material'
import { Grid } from '@mui/system'
import { Sync, ArrowBack, Launch, Lock } from '@mui/icons-material'
import Link from 'next/link'
import { ApiGetCall } from '../../../api/ApiCall'
import { CippHead } from '../../../components/CippComponents/CippHead'
import { PropertyList } from '../../../components/property-list'
import { PropertyListItem } from '../../../components/property-list-item'
import { psitSocNextStep } from '../../../utils/psit-soc-next-step'
import { PsitSocGuidePanel } from '../../../components/psit/soc/PsitSocGuidePanel'
import { PsitSocQualificationPanel } from '../../../components/psit/soc/PsitSocQualificationPanel'
import { PsitSocResponseBlock } from '../../../components/psit/soc/PsitSocResponseBlock'
import { PsitSocRestoreChecklist } from '../../../components/psit/soc/PsitSocRestoreChecklist'
import { PsitSocBecSection } from '../../../components/psit/soc/PsitSocBecSection'
import { PsitSocActionLog } from '../../../components/psit/soc/PsitSocActionLog'
import { PsitSocUserContext } from '../../../components/psit/soc/PsitSocUserContext'
import { PsitSocDownloadContext } from '../../../components/psit/soc/PsitSocDownloadContext'
import {
  PsitSocCaseReportButton,
  PsitSocInterimReportButton,
} from '../../../components/psit/PsitSocCaseReportFr'
import { PsitSocAuditContext } from '../../../components/psit/soc/PsitSocAuditContext'
import { PsitSocCaseTimeline } from '../../../components/psit/soc/PsitSocCaseTimeline'
import { PsitSocAnalysisPanel } from '../../../components/psit/soc/PsitSocAnalysisPanel'
import { PsitSocValidateShortcut } from '../../../components/psit/soc/PsitSocValidateShortcut'
import { PsitSocEmergencyContainment } from '../../../components/psit/soc/PsitSocEmergencyContainment'
import { PsitSocHoldControls } from '../../../components/psit/soc/PsitSocHoldControls'
import { PsitAdminBadge } from '../../../components/psit/soc/PsitAdminBadge'
import { PsitSocDeviceContext } from '../../../components/psit/soc/PsitSocDeviceContext'
import { PsitSocMailContext } from '../../../components/psit/soc/PsitSocMailContext'
import { PsitSocAppContext } from '../../../components/psit/soc/PsitSocAppContext'
import { PSIT_SOC_SOURCES, psitSocTypeById } from '../../../utils/psit-soc-types'
import { psitSocIsDownloadCase } from '../../../utils/psit-soc-download'
import { psitSocIsAuditCase } from '../../../utils/psit-soc-case-audit'
import {
  PSIT_SOC_PHASES,
  psitSocPhaseGatingActive,
  psitSocPhaseRemaining,
  psitSocUnlockedPhases,
} from '../../../utils/psit-soc-phases'
import {
  PSIT_SOC_STATUS_CHIP_COLORS,
  psitSocDisplaySeverity,
  psitSocStatusLabel,
  psitSocEntityLabel,
  psitSocTypeLabel,
} from '../../../utils/psit-soc-queue'
import { PsitSocAnalystCell } from '../../../components/psit/PsitSocAnalystCell'
import { PsitSocTimeEntry } from '../../../components/psit/soc/PsitSocTimeEntry'
import { PsitSocAutotaskNote } from '../../../components/psit/soc/PsitSocAutotaskNote'
import {
  PsitSocSourceMailButton,
  PsitSocSourceMailCard,
} from '../../../components/psit/soc/PsitSocSourceMail'
import { usePsitSocEvidence } from '../../../hooks/use-psit-soc-evidence'

// Timestamps land as UTC ISO strings; the analyst reads them in his own clock. An unreadable or
// absent date shows nothing rather than 'Invalid Date'.
const frDate = (iso) => {
  const parsed = Date.parse(iso)
  if (!iso || Number.isNaN(parsed)) return null
  return new Date(parsed).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })
}

const SEVERITY_COLOUR = { P1: 'error', P2: 'error', P3: 'warning', P4: 'default' }

/**
 * One SOC case: the identity card of the alert, the investigation guide with its FP/TP clues, the
 * context panels, the qualification (written on the case and pushed back to Defender when the
 * case came from there), and the action log.
 *
 * The context panels are driven by the case's entities, not by its type: a case naming a user
 * gets the identity panel, one naming a machine gets the device panel, one naming a message gets
 * the mail panel, and a case naming several gets several. An incident rarely stays in one lane -
 * an infostealer on a laptop is a machine case AND an identity case - and the panels follow the
 * facts rather than the label.
 */
/**
 * The footer of a phase tab: what the next tab still waits for. Disabled tabs cannot carry a
 * tooltip, so the explanation lives where the analyst is working.
 */
const PsitSocNextLockHint = ({ socCase, gating, currentPhase }) => {
  if (!gating) return null
  const order = PSIT_SOC_PHASES.map((phase) => phase.key)
  const nextKey = order[order.indexOf(currentPhase) + 1]
  if (!nextKey) return null
  const remaining = psitSocPhaseRemaining(socCase, nextKey)
  if (remaining.length === 0) return null
  return (
    <Alert severity="info">
      {`Onglet suivant verrouillé. Reste à traiter (cocher chaque étape, ou la marquer « Sans objet ») : ${remaining
        .slice(0, 4)
        .map((step) => (step.state === 'unknown' ? `${step.label} (sans réponse)` : step.label))
        .join(' · ')}${remaining.length > 4 ? '…' : ''}${
        remaining.some((step) => step.state === 'unknown')
          ? ' — une étape sans réponse se débloque en qualifiant tôt, en escaladant ou en mettant en attente.'
          : ''
      }`}
    </Alert>
  )
}

const Page = () => {
  const router = useRouter()
  const { caseId, tenantFilter } = router.query
  const queryKey = `PSITSocCase-${tenantFilter}-${caseId}`

  const caseRequest = ApiGetCall({
    url: `/api/PSITListSocCases?tenantFilter=${tenantFilter}&CaseId=${caseId}`,
    queryKey: queryKey,
    waiting: Boolean(caseId && tenantFilter),
  })
  const socCase = Array.isArray(caseRequest.data) ? caseRequest.data[0] : caseRequest.data


  const catalogueEntry = psitSocTypeById(socCase?.TypeId)
  // The same three tabs as the BEC screen, in the same order, so the two investigation views
  // share one mental model: the situation, then the evidence and the gestures, then the decision.
  // The next-step line stays above all three.
  const [tab, setTab] = useState('summary')
  const [becStarted, setBecStarted] = useState(false)
  // The frame's locks, computed from the guide's own checkmarks. Going back is always free;
  // going forward is earned. Grandfathered and already-decided dossiers are never gated.
  const gating = psitSocPhaseGatingActive(socCase)
  const unlockedPhases = psitSocUnlockedPhases(socCase)
  useEffect(() => {
    if (gating && tab !== 'summary' && !unlockedPhases.has(tab)) setTab('summary')
    // unlockedPhases is derived from socCase; keying on the dossier avoids a Set identity loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gating, tab, socCase])
  // Read once, above everything else: the status, the guide and the verdict already said where
  // the case stood, but only to someone willing to read three panels and put them together.
  const nextStep = psitSocNextStep(socCase)
  // Gathered once and shared: the guide answers its steps from the same requests the panels
  // below already make, so showing the answers costs no extra call.
  const evidence = usePsitSocEvidence(socCase)

  return (
    <>
      <CippHead title={`Dossier SOC ${caseId ?? ''}`} />
      <Container maxWidth={false} sx={{ py: 2 }}>
        <Stack spacing={2}>
          <PsitSocWipBanner />
          <Stack direction="row" spacing={2} alignItems="center">
            <Tooltip describeChild title="File d’attente : revenir à la liste des dossiers">
              <Button
                size="small"
                variant="outlined"
                component={Link}
                href="/security/soc/queue"
                startIcon={
                  <SvgIcon fontSize="small">
                    <ArrowBack />
                  </SvgIcon>
                }
              >
                File d’attente
              </Button>
            </Tooltip>
            <Typography variant="h5">{socCase?.Title ?? 'Dossier SOC'}</Typography>
            {/* Gated on what it displays, not on the P level: a dossier ingested with the
                emitter's wording and no P level of its own showed no severity at all, which is
                every dossier the emitter-tag feature was built for. */}
            {psitSocDisplaySeverity(socCase) && (
              <Chip
                size="small"
                color={SEVERITY_COLOUR[socCase.Severity] ?? 'default'}
                label={psitSocDisplaySeverity(socCase)}
              />
            )}
            {socCase?.Status && (
              <Chip
                size="small"
                color={PSIT_SOC_STATUS_CHIP_COLORS[psitSocStatusLabel(socCase.Status)] ?? 'default'}
                label={psitSocStatusLabel(socCase.Status)}
              />
            )}
            <PsitSocSourceMailButton socCase={socCase} />
            <Tooltip describeChild title="Actualiser : recharger le dossier et ses panneaux">
              <Button
                size="small"
                variant="outlined"
                onClick={() => caseRequest.refetch()}
                startIcon={
                  <SvgIcon fontSize="small">
                    <Sync />
                  </SvgIcon>
                }
              >
                Actualiser
              </Button>
            </Tooltip>
            {/* Whatever the investigation was, it ends the same way: an entry in the
                ticket. The text is written from the journal, here rather than in a tab,
                because it is reached for at the end of any of them. */}
            <PsitSocEmergencyContainment socCase={socCase} queryKey={queryKey} />
            <PsitSocHoldControls socCase={socCase} queryKey={queryKey} />
            <PsitSocTimeEntry socCase={socCase} />
            <PsitSocAutotaskNote socCase={socCase} />
            {socCase?.TicketUrl && (
              <Tooltip describeChild title="Ouvrir dans Autotask : le ticket lié, dans un nouvel onglet">
                <Button
                  size="small"
                  variant="outlined"
                  component="a"
                  href={socCase.TicketUrl}
                  target="_blank"
                  rel="noreferrer"
                  startIcon={
                    <SvgIcon fontSize="small">
                      <Launch />
                    </SvgIcon>
                  }
                >
                  Ouvrir dans Autotask
                </Button>
              </Tooltip>
            )}
          </Stack>

          {caseRequest.isFetching && !socCase && <Skeleton variant="rounded" height={160} />}
          {!caseRequest.isFetching && !socCase && (
            <Card variant="outlined">
              <CardContent>
                <Typography variant="body2">
                  Aucun dossier pour cet identifiant sur ce tenant. Il a pu être créé sur un autre
                  tenant : vérifier la file d’attente.
                </Typography>
              </CardContent>
            </Card>
          )}

          {socCase && nextStep && (
            <Alert
              severity={
                nextStep.tone === 'done'
                  ? 'success'
                  : nextStep.tone === 'critical'
                    ? 'warning'
                    : 'info'
              }
            >
              <Typography variant="subtitle2">{nextStep.title}</Typography>
              <Typography variant="body2">{nextStep.detail}</Typography>
            </Alert>
          )}

          {socCase && (
            <>
              <Tabs
                value={tab}
                onChange={(event, value) => setTab(value)}
                variant="scrollable"
                allowScrollButtonsMobile
              >
                <Tab value="summary" label="Synthèse" />
                {PSIT_SOC_PHASES.map((phase) => (
                  <Tab
                    key={phase.key}
                    value={phase.key}
                    disabled={gating && !unlockedPhases.has(phase.key)}
                    label={
                      gating && !unlockedPhases.has(phase.key) ? (
                        <Stack direction="row" spacing={0.5} alignItems="center">
                          <SvgIcon fontSize="inherit">
                            <Lock />
                          </SvgIcon>
                          <span>{phase.label}</span>
                        </Stack>
                      ) : (
                        phase.label
                      )
                    }
                  />
                ))}
              </Tabs>

              <Grid container spacing={2} alignItems="flex-start">
              <Grid size={{ xs: 12, lg: 8 }}>
              {tab === 'summary' && (
                <Grid container spacing={2}>
                  <Grid size={{ xs: 12, md: 7 }}>
                    <Card variant="outlined">
                      <CardHeader title="Signalement" subheader={socCase.CaseId} />
                      <CardContent>
                        <Grid container spacing={2}>
                          <Grid size={{ xs: 12, sm: 6 }}>
                            <PropertyList>
                              <PropertyListItem label="Client" value={socCase.Tenant} />
                              <PropertyListItem
                                label="Catégorie"
                                value={
                                  catalogueEntry
                                    ? psitSocTypeLabel(socCase.TypeId)
                                    : `Type ${socCase.TypeId ?? 'inconnu'}`
                                }
                              />
                              <PropertyListItem
                                label="Source"
                                value={PSIT_SOC_SOURCES[socCase.Source] ?? socCase.Source}
                              />
                            </PropertyList>
                          </Grid>
                          <Grid size={{ xs: 12, sm: 6 }}>
                            <PropertyList>
                              <PropertyListItem
                                label="Sévérité"
                                value={psitSocDisplaySeverity(socCase) || 'non renseignée'}
                              />
                              <PropertyListItem
                                label="Ticket Autotask"
                                value={
                                  socCase.TicketRef || socCase.ExternalRef ? (
                                    socCase.TicketUrl ? (
                                      <MuiLink
                                        href={socCase.TicketUrl}
                                        target="_blank"
                                        rel="noreferrer"
                                      >
                                        {socCase.TicketRef || socCase.ExternalRef}
                                      </MuiLink>
                                    ) : (
                                      socCase.TicketRef || socCase.ExternalRef
                                    )
                                  ) : (
                                    'aucun'
                                  )
                                }
                              />
                              <PropertyListItem
                                label="Référence externe"
                                value={socCase.ExternalRef || 'aucune'}
                              />
                            </PropertyList>
                          </Grid>
                        </Grid>
                        {/* The entities drive the investigation panels; chips read better than
                            the JSON the record stores. */}
                        {Object.keys(socCase.Entities ?? {}).length > 0 && (
                          <Stack
                            direction="row"
                            spacing={1}
                            flexWrap="wrap"
                            useFlexGap
                            sx={{ mt: 2 }}
                          >
                            {Object.entries(socCase.Entities ?? {}).map(([kind, value]) => (
                              <Chip
                                key={kind}
                                size="small"
                                variant="outlined"
                                label={`${psitSocEntityLabel(kind)} : ${value}`}
                              />
                            ))}
                          </Stack>
                        )}
                      </CardContent>
                    </Card>
                  </Grid>
                  <Grid size={{ xs: 12, md: 5 }}>
                    <Stack spacing={2}>
                      <Card variant="outlined">
                        <CardHeader
                          title="Suivi du dossier"
                          action={<PsitSocInterimReportButton socCase={socCase} />}
                        />
                        <CardContent>
                          <PropertyList>
                            <PropertyListItem
                              label="Pris par"
                              value={
                                socCase.AssignedTo ? (
                                  <PsitSocAnalystCell upn={socCase.AssignedTo} />
                                ) : (
                                  'personne'
                                )
                              }
                            />
                            <PropertyListItem
                              label="Créé"
                              value={`${frDate(socCase.CreatedUtc) ?? socCase.CreatedUtc} par ${socCase.CreatedBy}`}
                            />
                            <PropertyListItem
                              label="Mis à jour"
                              value={`${frDate(socCase.UpdatedUtc) ?? socCase.UpdatedUtc} par ${socCase.UpdatedBy}`}
                            />
                            {socCase.ClosedUtc && (
                              <PropertyListItem
                                label="Clos"
                                value={`${frDate(socCase.ClosedUtc) ?? socCase.ClosedUtc} par ${socCase.ClosedBy}`}
                              />
                            )}
                          </PropertyList>
                        </CardContent>
                      </Card>
                    </Stack>
                  </Grid>
                  <Grid size={{ xs: 12 }}>
                    <PsitSocSourceMailCard socCase={socCase} />
                  </Grid>
                </Grid>
              )}


              {tab === 'validate' && (
                <Stack spacing={2}>
                  <Card variant="outlined">
                    <CardHeader title="L’alerte" subheader={socCase.Title} />
                    <CardContent>
                      <Typography variant="body2" color="text.secondary">
                        {catalogueEntry?.description ?? 'Type inconnu : corriger le type depuis la file d’attente.'}
                      </Typography>
                    </CardContent>
                  </Card>
                  <PsitSocSourceMailCard socCase={socCase} />
                  <PsitSocGuidePanel
                    socCase={socCase}
                    queryKey={queryKey}
                    evidence={evidence}
                    phase="validate"
                    title="Valider l’alerte"
                    showClues={false}
                  />
                  <PsitSocValidateShortcut socCase={socCase} queryKey={queryKey} />
                  <PsitSocNextLockHint socCase={socCase} gating={gating} currentPhase="validate" />
                </Stack>
              )}

              {tab === 'scope' && (
                <Stack spacing={2}>
                  <Card variant="outlined">
                    <CardHeader
                      title="Entités du dossier"
                      action={
                        socCase.Entities?.userId ? (
                          <PsitAdminBadge
                            tenant={socCase.Tenant}
                            userId={socCase.Entities.userId}
                            caseId={socCase.CaseId}
                          />
                        ) : null
                      }
                    />
                    <CardContent>
                      {Object.keys(socCase.Entities ?? {}).length > 0 ? (
                        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                          {Object.entries(socCase.Entities ?? {}).map(([kind, value]) => (
                            <Chip
                              key={kind}
                              size="small"
                              variant="outlined"
                              label={`${psitSocEntityLabel(kind)} : ${value}`}
                            />
                          ))}
                        </Stack>
                      ) : (
                        <Typography variant="body2" color="text.secondary">
                          Aucune entité sur ce dossier : renseigner l’UPN, la machine ou l’application
                          concernée pour que les onglets suivants aient une cible.
                        </Typography>
                      )}
                    </CardContent>
                  </Card>
                  {/* Filed by the ingestion-time enrichment: a repeat customer is a scope fact
                      worth knowing before the first click, and its absence is just silence. */}
                  {(socCase.Evidence?.related?.cases ?? []).length > 0 && (
                    <Card variant="outlined">
                      <CardHeader
                        title="Dossiers récents sur la même entité"
                        subheader={`Relevé à l'ingestion (${socCase.Evidence.related.readUtc ?? ''})`}
                      />
                      <CardContent>
                        <Stack spacing={1}>
                          {socCase.Evidence.related.cases.map((related) => (
                            <Stack key={related.caseId} direction="row" spacing={1} alignItems="center">
                              <Chip
                                size="small"
                                variant="outlined"
                                color={PSIT_SOC_STATUS_CHIP_COLORS[psitSocStatusLabel(related.status)] ?? 'default'}
                                label={psitSocStatusLabel(related.status)}
                              />
                              <MuiLink
                                href={`/security/soc/case?caseId=${related.caseId}&tenantFilter=${socCase.Tenant}`}
                              >
                                {related.title || related.caseId}
                              </MuiLink>
                              {related.verdict && (
                                <Typography variant="caption" color="text.secondary">
                                  {related.verdict}
                                </Typography>
                              )}
                            </Stack>
                          ))}
                        </Stack>
                      </CardContent>
                    </Card>
                  )}
                  <PsitSocGuidePanel
                    socCase={socCase}
                    queryKey={queryKey}
                    evidence={evidence}
                    phase="scope"
                    title="Délimiter le périmètre"
                    showClues={false}
                  />
                  <PsitSocNextLockHint socCase={socCase} gating={gating} currentPhase="scope" />
                </Stack>
              )}

              {tab === 'collect' && (
                <Stack spacing={2}>
                  <PsitSocGuidePanel
                    socCase={socCase}
                    queryKey={queryKey}
                    evidence={evidence}
                    phase="collect"
                    title="Collecter et préserver"
                    showClues={false}
                  />
                  {/* Evidence only here: the gestures live on the response tab, plus the
                      emergency hatch in the header. */}
                  {(socCase.Entities?.upn || socCase.Entities?.userId) && (
                    <>
                      <PsitSocUserContext socCase={socCase} queryKey={queryKey} hideActions />
                      <PsitSocBecSection
                        socCase={socCase}
                        queryKey={queryKey}
                        part="collect"
                        started={becStarted}
                        onStart={() => setBecStarted(true)}
                      />
                    </>
                  )}
                  {(socCase.Entities?.deviceId || socCase.Entities?.deviceName) && (
                    <PsitSocDeviceContext socCase={socCase} queryKey={queryKey} hideActions />
                  )}
                  {socCase.Entities?.networkMessageId && (
                    <PsitSocMailContext socCase={socCase} queryKey={queryKey} hideActions />
                  )}
                  {psitSocIsDownloadCase(socCase) && (
                    <PsitSocDownloadContext socCase={socCase} queryKey={queryKey} />
                  )}
                  {psitSocIsAuditCase(socCase) && (
                    <PsitSocAuditContext socCase={socCase} queryKey={queryKey} />
                  )}
                  {socCase.Entities?.appId && (
                    <PsitSocAppContext socCase={socCase} queryKey={queryKey} hideActions />
                  )}
                  <PsitSocNextLockHint socCase={socCase} gating={gating} currentPhase="collect" />
                </Stack>
              )}

              {tab === 'reconstruct' && (
                <Stack spacing={2}>
                  <PsitSocGuidePanel
                    socCase={socCase}
                    queryKey={queryKey}
                    evidence={evidence}
                    phase="reconstruct"
                    title="Reconstituer la chronologie"
                    showClues={false}
                  />
                  <PsitSocCaseTimeline socCase={socCase} evidence={evidence} />
                  <PsitSocNextLockHint socCase={socCase} gating={gating} currentPhase="reconstruct" />
                </Stack>
              )}

              {tab === 'map' && (
                <Stack spacing={2}>
                  <PsitSocAnalysisPanel socCase={socCase} queryKey={queryKey} />
                  <PsitSocGuidePanel
                    socCase={socCase}
                    queryKey={queryKey}
                    evidence={evidence}
                    phase="map"
                    title="Indices d’interprétation"
                  />
                  <PsitSocNextLockHint socCase={socCase} gating={gating} currentPhase="map" />
                </Stack>
              )}

              {tab === 'decision' && (
                <Stack spacing={2}>
                  <PsitSocQualificationPanel socCase={socCase} queryKey={queryKey} />
                  <PsitSocRestoreChecklist socCase={socCase} queryKey={queryKey} />
                  <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                    <PsitSocCaseReportButton socCase={socCase} />
                    <PsitSocResponseBlock socCase={socCase} />
                  </Stack>
                  {(socCase.Entities?.upn || socCase.Entities?.userId) && (
                    <PsitSocBecSection
                      socCase={socCase}
                      queryKey={queryKey}
                      part="decision"
                      started={becStarted}
                      onStart={() => setBecStarted(true)}
                    />
                  )}
                  {/* The gestures, next to the evidence that justifies them: the same panels as
                      the collect tab, actions included. React Query dedupes the reads. */}
                  {(socCase.Entities?.upn || socCase.Entities?.userId) && (
                    <PsitSocUserContext socCase={socCase} queryKey={queryKey} />
                  )}
                  {(socCase.Entities?.deviceId || socCase.Entities?.deviceName) && (
                    <PsitSocDeviceContext socCase={socCase} queryKey={queryKey} />
                  )}
                  {socCase.Entities?.networkMessageId && (
                    <PsitSocMailContext socCase={socCase} queryKey={queryKey} />
                  )}
                  {socCase.Entities?.appId && (
                    <PsitSocAppContext socCase={socCase} queryKey={queryKey} />
                  )}
                </Stack>
              )}
              </Grid>
              <Grid size={{ xs: 12, lg: 4 }} sx={{ position: { lg: 'sticky' }, top: 16 }}>
                {/* Document as you go: the journal is not a tab, it is the margin of every tab. */}
                <PsitSocActionLog socCase={socCase} queryKey={queryKey} />
              </Grid>
              </Grid>
            </>
          )}
        </Stack>
      </Container>
    </>
  )
}

Page.getLayout = (page) => <DashboardLayout>{page}</DashboardLayout>

export default Page
