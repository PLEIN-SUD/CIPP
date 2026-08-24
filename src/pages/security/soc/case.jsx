import { useRouter } from 'next/router'
import { Layout as DashboardLayout } from '../../../layouts/index.js'
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  Chip,
  Container,
  Skeleton,
  Stack,
  SvgIcon,
  Typography,
} from '@mui/material'
import { Grid } from '@mui/system'
import { Sync, ArrowBack } from '@mui/icons-material'
import Link from 'next/link'
import { ApiGetCall } from '../../../api/ApiCall'
import { CippHead } from '../../../components/CippComponents/CippHead'
import { PropertyList } from '../../../components/property-list'
import { PropertyListItem } from '../../../components/property-list-item'
import { PsitSocGuidePanel } from '../../../components/psit/soc/PsitSocGuidePanel'
import { PsitSocQualificationPanel } from '../../../components/psit/soc/PsitSocQualificationPanel'
import { PsitSocActionLog } from '../../../components/psit/soc/PsitSocActionLog'
import { PsitSocUserContext } from '../../../components/psit/soc/PsitSocUserContext'
import { PSIT_SOC_SOURCES, psitSocTypeById } from '../../../utils/psit-soc-types'

const SEVERITY_COLOUR = { P1: 'error', P2: 'error', P3: 'warning', P4: 'default' }

/**
 * One SOC case: the identity card of the alert, the investigation guide with its FP/TP clues,
 * the qualification (written on the case and pushed back to Defender when the case came from
 * there), and the action log. The context panels (user sessions, device state) arrive with the
 * next phase and will slot into the left column, driven by the case's entities.
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

  return (
    <>
      <CippHead title={`Cas SOC ${caseId ?? ''}`} />
      <Container maxWidth={false} sx={{ py: 2 }}>
        <Stack spacing={2}>
          <Stack direction="row" spacing={2} alignItems="center">
            <Button
              component={Link}
              href="/security/soc"
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

          {socCase && (
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, md: 8 }}>
                <Stack spacing={2}>
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
                          label="Référence externe"
                          value={socCase.ExternalRef || 'aucune'}
                        />
                        <PropertyListItem
                          label="Référence ticket"
                          value={socCase.TicketRef || 'aucune'}
                        />
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

                  <PsitSocGuidePanel socCase={socCase} queryKey={queryKey} />
                  {(socCase.Entities?.upn || socCase.Entities?.userId) && (
                    <PsitSocUserContext socCase={socCase} queryKey={queryKey} />
                  )}
                  <PsitSocQualificationPanel socCase={socCase} queryKey={queryKey} />
                </Stack>
              </Grid>

              <Grid size={{ xs: 12, md: 4 }}>
                <PsitSocActionLog socCase={socCase} queryKey={queryKey} />
              </Grid>
            </Grid>
          )}
        </Stack>
      </Container>
    </>
  )
}

Page.getLayout = (page) => <DashboardLayout>{page}</DashboardLayout>

export default Page
