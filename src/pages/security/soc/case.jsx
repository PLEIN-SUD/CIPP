import { useState } from 'react'
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
} from '@mui/material'
import { Grid } from '@mui/system'
import { Sync, ArrowBack } from '@mui/icons-material'
import Link from 'next/link'
import { ApiGetCall } from '../../../api/ApiCall'
import { CippHead } from '../../../components/CippComponents/CippHead'
import { PropertyList } from '../../../components/property-list'
import { PropertyListItem } from '../../../components/property-list-item'
import { psitSocNextStep } from '../../../utils/psit-soc-next-step'
import { PsitSocGuidePanel } from '../../../components/psit/soc/PsitSocGuidePanel'
import { PsitSocQualificationPanel } from '../../../components/psit/soc/PsitSocQualificationPanel'
import { PsitSocActionLog } from '../../../components/psit/soc/PsitSocActionLog'
import { PsitSocUserContext } from '../../../components/psit/soc/PsitSocUserContext'
import { PsitSocDeviceContext } from '../../../components/psit/soc/PsitSocDeviceContext'
import { PsitSocMailContext } from '../../../components/psit/soc/PsitSocMailContext'
import { PsitSocAppContext } from '../../../components/psit/soc/PsitSocAppContext'
import { PSIT_SOC_SOURCES, psitSocTypeById } from '../../../utils/psit-soc-types'
import { usePsitSocEvidence } from '../../../hooks/use-psit-soc-evidence'

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
  // Read once, above everything else: the status, the guide and the verdict already said where
  // the case stood, but only to someone willing to read three panels and put them together.
  const nextStep = psitSocNextStep(socCase)
  // Gathered once and shared: the guide answers its steps from the same requests the panels
  // below already make, so showing the answers costs no extra call.
  const evidence = usePsitSocEvidence(socCase)

  return (
    <>
      <CippHead title={`Cas SOC ${caseId ?? ''}`} />
      <Container maxWidth={false} sx={{ py: 2 }}>
        <Stack spacing={2}>
          <PsitSocWipBanner />
          <Stack direction="row" spacing={2} alignItems="center">
            <Button
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
            <Typography variant="h5">{socCase?.Title ?? 'Cas SOC'}</Typography>
            {socCase?.Severity && (
              <Chip
                size="small"
                color={SEVERITY_COLOUR[socCase.Severity] ?? 'default'}
                label={socCase.Severity}
              />
            )}
            {socCase?.Status && <Chip size="small" label={socCase.Status} />}
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
          </Stack>

          {caseRequest.isFetching && !socCase && <Skeleton variant="rounded" height={160} />}
          {!caseRequest.isFetching && !socCase && (
            <Card variant="outlined">
              <CardContent>
                <Typography variant="body2">
                  Aucun cas pour cet identifiant sur ce tenant. Il a pu être créé sur un autre
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
                <Tab value="investigation" label="Investigation" />
                <Tab value="decision" label="Décision" />
              </Tabs>

              {tab === 'summary' && (
                <Grid container spacing={2}>
                  <Grid size={{ xs: 12, md: 7 }}>
                    <Card variant="outlined">
                      <CardHeader title="Cas" subheader={socCase.CaseId} />
                      <CardContent>
                        <PropertyList>
                          <PropertyListItem label="Tenant" value={socCase.Tenant} />
                          <PropertyListItem
                            label="Type"
                            value={
                              catalogueEntry
                                ? `${socCase.TypeId} - ${catalogueEntry.label}`
                                : String(socCase.TypeId ?? 'inconnu')
                            }
                          />
                          <PropertyListItem
                            label="Source"
                            value={PSIT_SOC_SOURCES[socCase.Source] ?? socCase.Source}
                          />
                          <PropertyListItem
                            label="Pris par"
                            value={socCase.AssignedTo || 'personne'}
                          />
                          <PropertyListItem
                            label="Référence externe"
                            value={socCase.ExternalRef || 'aucune'}
                          />
                          <PropertyListItem
                            label="Référence ticket"
                            value={socCase.TicketRef || socCase.ExternalRef || 'aucune'}
                          />
                          {socCase.TicketUrl && (
                            <PropertyListItem
                              label="Ticket"
                              value={
                                <MuiLink href={socCase.TicketUrl} target="_blank" rel="noreferrer">
                                  Ouvrir dans Autotask
                                </MuiLink>
                              }
                            />
                          )}
                          <PropertyListItem
                            label="Entités"
                            value={JSON.stringify(socCase.Entities ?? {})}
                          />
                          <PropertyListItem
                            label="Créé"
                            value={`${socCase.CreatedUtc} par ${socCase.CreatedBy}`}
                          />
                          <PropertyListItem
                            label="Mis à jour"
                            value={`${socCase.UpdatedUtc} par ${socCase.UpdatedBy}`}
                          />
                          {socCase.ClosedUtc && (
                            <PropertyListItem
                              label="Clos"
                              value={`${socCase.ClosedUtc} par ${socCase.ClosedBy}`}
                            />
                          )}
                        </PropertyList>
                      </CardContent>
                    </Card>
                  </Grid>
                  <Grid size={{ xs: 12, md: 5 }}>
                    <PsitSocActionLog socCase={socCase} queryKey={queryKey} />
                  </Grid>
                </Grid>
              )}

              {tab === 'investigation' && (
                <Stack spacing={2}>
                  <PsitSocGuidePanel socCase={socCase} queryKey={queryKey} evidence={evidence} />
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

              {tab === 'decision' && (
                <PsitSocQualificationPanel socCase={socCase} queryKey={queryKey} />
              )}
            </>
          )}
        </Stack>
      </Container>
    </>
  )
}

Page.getLayout = (page) => <DashboardLayout>{page}</DashboardLayout>

export default Page
