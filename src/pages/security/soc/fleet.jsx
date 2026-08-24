import { useMemo } from 'react'
import Link from 'next/link'
import {
  Alert,
  Button,
  Card,
  CardContent,
  Chip,
  Container,
  Skeleton,
  Stack,
  SvgIcon,
  Typography,
} from '@mui/material'
import { Grid } from '@mui/system'
import { Sync } from '@mui/icons-material'
import { Layout as DashboardLayout } from '../../../layouts/index.js'
import { TabbedLayout } from '../../../layouts/TabbedLayout.jsx'
import { ApiGetCall } from '../../../api/ApiCall'
import { CippHead } from '../../../components/CippComponents/CippHead'
import { CippDataTable } from '../../../components/CippTable/CippDataTable.js'
import { useSettings } from '../../../hooks/use-settings'
import tabOptions from './tabOptions.json'

/**
 * Fleet health: Defender protection across every managed tenant, in one screen.
 *
 * This deliberately does not reproduce the Defender portal. The portal already answers "how is
 * this tenant doing" better than we ever will, and an analyst has it. What no portal answers is
 * "which machines, across all my clients, have their protection off or something running on
 * them" - and that is the question an MSP actually has, so it is the only one this page tries to
 * answer.
 *
 * The counters read what they measure and nothing more: machines Lighthouse reported. A machine
 * that stopped reporting is an absence here, never a green row, which is why the tenant table
 * shows how many devices each client reported rather than only what is wrong.
 */
const Page = () => {
  const tenant = useSettings().currentTenant

  const fleetRequest = ApiGetCall({
    url: `/api/PSITListFleetHealth?tenantFilter=${tenant}`,
    queryKey: `PSITFleetHealth-${tenant}`,
    waiting: Boolean(tenant),
  })

  // On failure the endpoint answers with a message in Results rather than a list: rows must stay
  // an array whatever comes back, or the page crashes exactly when something is already wrong.
  const failed = typeof fleetRequest.data?.Results === 'string'
  const rows = useMemo(
    () => (Array.isArray(fleetRequest.data?.Results) ? fleetRequest.data.Results : []),
    [fleetRequest.data]
  )
  const tenantRows = useMemo(
    () => (Array.isArray(fleetRequest.data?.Tenants) ? fleetRequest.data.Tenants : []),
    [fleetRequest.data]
  )
  const metadata = fleetRequest.data?.Metadata

  const attention = rows.filter((row) => row.NeedsAttention)
  const threatened = rows.filter((row) => row.ActiveThreatCount > 0)
  const protectionOff = rows.filter((row) => row.ProtectionInDefault)

  const summary = [
    {
      label: 'Machines rapportées',
      value: metadata?.TotalDevices ?? rows.length,
      tone: 'default',
      note: 'connues de Lighthouse',
    },
    {
      label: 'Protection en défaut',
      value: protectionOff.length,
      tone: protectionOff.length > 0 ? 'error' : 'success',
      note: 'temps réel ou antimalware désactivé',
    },
    {
      label: 'Menaces actives',
      value: threatened.length,
      tone: threatened.length > 0 ? 'error' : 'success',
      note: 'machines portant une menace non traitée',
    },
    {
      label: 'Tenants concernés',
      value: new Set(attention.map((row) => row.Tenant)).size,
      tone: attention.length > 0 ? 'warning' : 'success',
      note: 'clients avec au moins une machine à regarder',
    },
  ]

  return (
    <>
      <CippHead title="Santé du parc" />
      <Container maxWidth={false} sx={{ py: 2 }}>
        <Stack spacing={2}>
          <Stack direction="row" spacing={2} alignItems="center">
            <Typography variant="h5">Santé du parc</Typography>
            <Button
              size="small"
              variant="outlined"
              onClick={() => fleetRequest.refetch()}
              startIcon={
                <SvgIcon fontSize="small">
                  <Sync />
                </SvgIcon>
              }
            >
              Actualiser
            </Button>
          </Stack>

          {failed && (
            <Alert severity="error">
              {fleetRequest.data.Results} — les compteurs ci-dessous ne veulent rien dire tant que
              la lecture échoue.
            </Alert>
          )}

          {fleetRequest.isFetching && rows.length === 0 && !failed && (
            <Skeleton variant="rounded" height={120} />
          )}

          {!failed && (
            <Grid container spacing={2}>
              {summary.map((card) => (
                <Grid key={card.label} size={{ xs: 12, sm: 6, md: 3 }}>
                  <Card variant="outlined">
                    <CardContent>
                      <Typography variant="body2" color="text.secondary">
                        {card.label}
                      </Typography>
                      <Typography
                        variant="h4"
                        color={
                          card.tone === 'error'
                            ? 'error.main'
                            : card.tone === 'warning'
                              ? 'warning.main'
                              : card.tone === 'success'
                                ? 'success.main'
                                : 'text.primary'
                        }
                      >
                        {card.value}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {card.note}
                      </Typography>
                    </CardContent>
                  </Card>
                </Grid>
              ))}
            </Grid>
          )}

          {!failed && tenantRows.length > 0 && (
            <Card variant="outlined">
              <CardContent>
                <Typography variant="subtitle2" gutterBottom>
                  Par client
                </Typography>
                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                  {tenantRows.map((row) => (
                    <Chip
                      key={row.Tenant}
                      size="small"
                      color={row.NeedsAttention > 0 ? 'error' : 'default'}
                      label={`${row.Tenant} — ${row.NeedsAttention}/${row.DevicesReported}`}
                    />
                  ))}
                </Stack>
                <Typography variant="caption" color="text.secondary">
                  Machines à regarder sur machines rapportées. Un client dont le nombre rapporté
                  chute a des machines qui ne remontent plus : c’est une absence, pas une bonne
                  nouvelle.
                </Typography>
              </CardContent>
            </Card>
          )}

          <CippDataTable
            title="Machines"
            data={rows}
            isFetching={fleetRequest.isFetching}
            simple={false}
            simpleColumns={[
              'Tenant',
              'DeviceName',
              'ProtectionInDefault',
              'ActiveThreatCount',
              'ActiveThreats',
              'ManagedDeviceHealthState',
              'AttentionRequired',
              'OsVersion',
              'LastSyncDateTime',
            ]}
            filters={[
              {
                filterName: 'À regarder',
                value: [{ id: 'NeedsAttention', value: 'true' }],
                type: 'column',
              },
              {
                filterName: 'Protection en défaut',
                value: [{ id: 'ProtectionInDefault', value: 'true' }],
                type: 'column',
              },
            ]}
          />

          <Typography variant="caption" color="text.secondary">
            Source : agrégat Lighthouse des tenants gérés. Le portail Defender reste la référence
            pour l’analyse d’une machine ; cette page répond à la question qu’aucun portail ne pose,
            celle qui traverse les clients.{' '}
            <Link href="/security/soc">Retour à la file d’attente</Link>
          </Typography>
        </Stack>
      </Container>
    </>
  )
}

Page.getLayout = (page) => (
  <DashboardLayout>
    <TabbedLayout tabOptions={tabOptions}>{page}</TabbedLayout>
  </DashboardLayout>
)

export default Page
