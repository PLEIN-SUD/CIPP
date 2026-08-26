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
import { PsitSocWipBanner } from '../../../components/psit/soc/PsitSocWipBanner'
import { ApiGetCall } from '../../../api/ApiCall'
import { CippHead } from '../../../components/CippComponents/CippHead'
import { CippDataTable } from '../../../components/CippTable/CippDataTable.js'
import { useSettings } from '../../../hooks/use-settings'

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

  // Succeeded, and returned nothing. Distinct from a failure and equally distinct from good
  // news: a tenant that is not onboarded in Lighthouse produces exactly the same four zeros as a
  // fleet where every machine is protected.
  const empty = !failed && rows.length === 0 && tenantRows.length === 0

  const signatureOverdue = rows.filter((row) => row.SignatureUpdateOverdue)
  const protectionOff = rows.filter((row) => row.ProtectionInDefault)

  // A single client is read live. The whole fleet is read from the last daily snapshot, because
  // forty live Graph calls behind a page load is not a page load. Which one it is has to be on
  // screen: a snapshot presented as the present is a wrong answer, not a slow one.
  const live = metadata?.Live !== false
  const asOf = metadata?.AsOf

  const summary = [
    {
      label: 'Machines rapportées',
      value: metadata?.TotalDevices ?? rows.length,
      tone: 'default',
      note: 'connues d’Intune',
    },
    {
      label: 'Protection en défaut',
      value: metadata?.ProtectionInDefault ?? protectionOff.length,
      tone: empty ? 'default' : (metadata?.ProtectionInDefault ?? protectionOff.length) > 0 ? 'error' : 'success',
      note: 'temps réel ou antimalware désactivé',
    },
    {
      label: 'Signatures obsolètes',
      value: metadata?.SignatureOverdue ?? signatureOverdue.length,
      tone: empty ? 'default' : (metadata?.SignatureOverdue ?? signatureOverdue.length) > 0 ? 'warning' : 'success',
      note: 'antivirus actif mais définitions en retard',
    },
    {
      label: 'Tenants concernés',
      value: tenantRows.filter((row) => row.NeedsAttention > 0).length,
      tone: empty ? 'default' : tenantRows.some((row) => row.NeedsAttention > 0) ? 'warning' : 'success',
      note: 'clients avec au moins une machine à regarder',
    },
  ]

  return (
    <>
      <CippHead title="Santé du parc" />
      <Container maxWidth={false} sx={{ py: 2 }}>
        <Stack spacing={2}>
          <PsitSocWipBanner />
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
              {failureText} Aucun compteur n’est affiché : des chiffres calculés sur une lecture
              qui a échoué se liraient comme un parc en bonne santé.
            </Alert>
          )}

          {empty && !fleetRequest.isFetching && (
            <Alert severity="warning">
              La lecture a abouti et n’a rapporté aucune machine. Un client sans appareil inscrit
              dans Intune renvoie les mêmes zéros qu’un parc entièrement protégé : vérifier
              l’inscription des postes avant de lire ces compteurs comme un bon résultat.
            </Alert>
          )}

          {!failed && !live && (
            <Alert severity="info">
              Vue multi-clients : relevé quotidien du {asOf || 'dernier passage'}, pas l’état de
              l’instant. Sélectionner un client dans le bandeau pour une lecture en direct.
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
            title={live ? 'Machines' : 'Machines à regarder'}
            data={rows}
            isFetching={fleetRequest.isFetching && !failed}
            simple={false}
            simpleColumns={[
              'Tenant',
              'DeviceName',
              'ProtectionInDefault',
              'SignatureUpdateOverdue',
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
            Source : appareils gérés Intune et leur état de protection Windows. Pour l’analyse
            détaillée d’une machine, passer par le portail Defender.{' '}
            <Link href="/security/soc/queue">Retour à la file d’attente</Link>
          </Typography>
        </Stack>
      </Container>
    </>
  )
}

Page.getLayout = (page) => <DashboardLayout>{page}</DashboardLayout>

export default Page
