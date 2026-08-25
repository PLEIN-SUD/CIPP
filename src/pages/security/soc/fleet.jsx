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
 * Defender protection across every managed tenant, in one screen: protection disabled, active
 * threats, and which clients are affected. Per-machine analysis stays in the Defender portal.
 *
 * The counters only count machines Lighthouse reported. A machine that stopped reporting is
 * missing from this data, not healthy in it, which is why the per-client chips show
 * to-look-at over reported rather than only what is wrong.
 */
const Page = () => {
  const tenant = useSettings().currentTenant

  const fleetRequest = ApiGetCall({
    url: `/api/PSITListFleetHealth?tenantFilter=${tenant}`,
    queryKey: `PSITFleetHealth-${tenant}`,
    waiting: Boolean(tenant),
  })

  // Recorded daily by the snapshot timer: the live aggregate has no history, so without this a
  // protection switched off three weeks ago and a fleet that went silent yesterday look alike.
  const historyRequest = ApiGetCall({
    url: `/api/PSITListFleetHistory?tenantFilter=${tenant}&days=30`,
    queryKey: `PSITFleetHistory-${tenant}`,
    waiting: Boolean(tenant),
  })
  const daily = useMemo(
    () => (Array.isArray(historyRequest.data?.Daily) ? historyRequest.data.Daily : []),
    [historyRequest.data]
  )

  // Two ways this can fail, and both must look like a failure rather than like an empty fleet:
  // the endpoint answering with a message in Results, and the call not landing at all (a 404 on
  // an endpoint the running API does not have yet, an auth error, a timeout).
  const failed = typeof fleetRequest.data?.Results === 'string' || fleetRequest.isError
  const failureText =
    typeof fleetRequest.data?.Results === 'string'
      ? fleetRequest.data.Results
      : (fleetRequest.error?.response?.data?.Results ??
        fleetRequest.error?.message ??
        'La lecture a échoué.')
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
              {failureText} — aucun compteur n’est affiché : des chiffres calculés sur une lecture
              qui a échoué se liraient comme un parc en bonne santé.
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

          {daily.length > 0 && (
            <Card variant="outlined">
              <CardContent>
                <Typography variant="subtitle2" gutterBottom>
                  Évolution ({daily.length} jour(s) enregistré(s) sur 30)
                </Typography>
                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                  {daily.map((day) => (
                    <Chip
                      key={day.Date}
                      size="small"
                      variant="outlined"
                      color={day.NeedsAttention > 0 ? 'error' : 'success'}
                      label={`${day.Date.slice(5)} — ${day.NeedsAttention}/${day.DevicesReported}`}
                    />
                  ))}
                </Stack>
                <Typography variant="caption" color="text.secondary">
                  Machines à regarder sur machines rapportées, par jour. Les jours absents sont des
                  jours sans relevé, pas des jours sans problème.
                </Typography>
              </CardContent>
            </Card>
          )}

          {daily.length === 0 && !failed && (
            <Typography variant="caption" color="text.secondary">
              Aucun relevé enregistré pour l’instant : la tendance apparaîtra après le premier
              passage de la tâche quotidienne.
            </Typography>
          )}

          <CippDataTable
            title="Machines"
            data={rows}
            isFetching={fleetRequest.isFetching && !failed}
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
            Source : agrégat Lighthouse des tenants gérés. Pour l’analyse détaillée d’une machine,
            passer par le portail Defender.{' '}
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
