import { useMemo, useState } from 'react'
import Link from 'next/link'
import {
  Alert,
  Card,
  CardContent,
  CardHeader,
  Chip,
  Container,
  MenuItem,
  Skeleton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material'
import { Grid } from '@mui/system'
import { Layout as DashboardLayout } from '../../../layouts/index.js'
import { ApiGetCall } from '../../../api/ApiCall'
import { CippHead } from '../../../components/CippComponents/CippHead'
import { PsitSocMonthlyReportButton } from '../../../components/psit/PsitSocMonthlyReportFr'
import {
  psitMetricsVerdictLabel,
  psitMinutesLabel,
  psitMonthBounds,
  psitMonthLabel,
  psitReadSocMetrics,
  psitRecentMonths,
} from '../../../utils/psit-soc-metrics'
import { psitSocTypeLabel } from '../../../utils/psit-soc-queue'

const PERIODS = [
  { months: 3, label: '3 derniers mois' },
  { months: 6, label: '6 derniers mois' },
  { months: 12, label: '12 derniers mois' },
]

/** The first day of the month N-1 months back: a period of '3 mois' includes the current one. */
const periodStartUtc = (months) => {
  const now = new Date()
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (months - 1), 1)).toISOString()
}

/**
 * The steering screen: is the service holding, and where does the noise come from.
 *
 * Everything on this page is an aggregate the API computed; the page only says it in French.
 * The one thing it never does is drop a dossier from a rate quietly: 'à qualifier' is a column,
 * and the FP rate says it is computed over qualified dossiers only. The monthly client report
 * is generated from here, from the same endpoint asked about exactly one tenant and one month.
 */
const Page = () => {
  const [months, setMonths] = useState(6)

  const startUtc = useMemo(() => periodStartUtc(months), [months])
  const metricsRequest = ApiGetCall({
    url: `/api/PSITListSocMetrics?tenantFilter=AllTenants&StartUtc=${encodeURIComponent(startUtc)}`,
    queryKey: `PSITSocMetrics-all-${months}`,
    waiting: true,
  })
  const metrics = useMemo(() => psitReadSocMetrics(metricsRequest.data), [metricsRequest.data])

  const failed = typeof metricsRequest.data?.Results === 'string' || metricsRequest.isError
  const failureText =
    typeof metricsRequest.data?.Results === 'string'
      ? metricsRequest.data.Results
      : (metricsRequest.error?.response?.data?.Results ??
        metricsRequest.error?.message ??
        'La lecture a échoué.')

  // --- monthly client report ------------------------------------------------------------------
  const tenantsRequest = ApiGetCall({
    url: '/api/ListTenants',
    queryKey: 'ListTenants-PsitMetrics',
    waiting: true,
  })
  const tenants = useMemo(
    () =>
      (Array.isArray(tenantsRequest.data) ? tenantsRequest.data : [])
        .map((tenant) => ({
          value: tenant?.defaultDomainName ?? '',
          label: tenant?.displayName || tenant?.defaultDomainName || '',
        }))
        .filter((tenant) => tenant.value)
        .sort((a, b) => a.label.localeCompare(b.label, 'fr')),
    [tenantsRequest.data]
  )
  const monthOptions = useMemo(() => psitRecentMonths(12), [])
  const [reportTenant, setReportTenant] = useState('')
  const [reportMonth, setReportMonth] = useState(monthOptions[0]?.month ?? '')
  const reportBounds = useMemo(() => psitMonthBounds(reportMonth), [reportMonth])
  const reportRequest = ApiGetCall({
    url: `/api/PSITListSocMetrics?tenantFilter=${encodeURIComponent(reportTenant)}&StartUtc=${encodeURIComponent(
      reportBounds?.startUtc ?? ''
    )}&EndUtc=${encodeURIComponent(reportBounds?.endUtc ?? '')}`,
    queryKey: `PSITSocMetrics-${reportTenant}-${reportMonth}`,
    waiting: Boolean(reportTenant && reportBounds),
  })
  const reportMetrics = useMemo(() => psitReadSocMetrics(reportRequest.data), [reportRequest.data])

  const loading = metricsRequest.isFetching && !metricsRequest.isFetched

  return (
    <>
      <CippHead title="Pilotage SOC" />
      <Container maxWidth="xl" sx={{ py: 3 }}>
        <Stack spacing={3}>
          <Stack
            direction="row"
            spacing={2}
            alignItems="center"
            justifyContent="space-between"
            flexWrap="wrap"
            useFlexGap
          >
            <div>
              <Typography variant="h4">Pilotage SOC</Typography>
              <Typography variant="body2" color="text.secondary">
                Volumes, verdicts et délais sur l’ensemble des dossiers, tous clients confondus.
              </Typography>
            </div>
            <TextField
              select
              size="small"
              label="Période"
              value={months}
              onChange={(event) => setMonths(Number(event.target.value))}
              sx={{ minWidth: 200 }}
            >
              {PERIODS.map((option) => (
                <MenuItem key={option.months} value={option.months}>
                  {option.label}
                </MenuItem>
              ))}
            </TextField>
          </Stack>

          {failed && <Alert severity="error">{failureText}</Alert>}
          {loading && <Skeleton variant="rounded" height={120} />}

          {metrics && !failed && (
            <>
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                <Chip color="primary" label={`${metrics.caseCount} dossiers`} />
                <Chip
                  color={metrics.openCount > 0 ? 'warning' : 'default'}
                  variant="outlined"
                  label={`${metrics.openCount} ouverts`}
                />
                {metrics.byVerdict.map((entry) => (
                  <Chip
                    key={entry.verdict}
                    variant="outlined"
                    label={`${psitMetricsVerdictLabel(entry.verdict)} : ${entry.count}`}
                  />
                ))}
              </Stack>

              <Grid container spacing={3}>
                <Grid size={{ xs: 12, md: 4 }}>
                  <Card variant="outlined">
                    <CardHeader title="Délais médians" />
                    <CardContent>
                      <Table size="small">
                        <TableBody>
                          <TableRow>
                            <TableCell>Prise en charge</TableCell>
                            <TableCell align="right">
                              {psitMinutesLabel(metrics.delays.takeMedianMinutes)}
                            </TableCell>
                            <TableCell align="right" sx={{ color: 'text.secondary' }}>
                              {`${metrics.delays.takeCount} mesurés`}
                            </TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell>Premier verdict</TableCell>
                            <TableCell align="right">
                              {psitMinutesLabel(metrics.delays.verdictMedianMinutes)}
                            </TableCell>
                            <TableCell align="right" sx={{ color: 'text.secondary' }}>
                              {`${metrics.delays.verdictCount} mesurés`}
                            </TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell>Clôture</TableCell>
                            <TableCell align="right">
                              {psitMinutesLabel(metrics.delays.closeMedianMinutes)}
                            </TableCell>
                            <TableCell align="right" sx={{ color: 'text.secondary' }}>
                              {`${metrics.delays.closeCount} mesurés`}
                            </TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                      <Typography variant="caption" color="text.secondary">
                        Médianes : le dossier typique, non gonflé par un dossier resté en attente.
                      </Typography>
                    </CardContent>
                  </Card>
                </Grid>

                <Grid size={{ xs: 12, md: 8 }}>
                  <Card variant="outlined">
                    <CardHeader
                      title="Par type de signalement"
                      subheader="Le taux sans objet est calculé sur les seuls dossiers qualifiés."
                    />
                    <CardContent>
                      <Table size="small">
                        <TableHead>
                          <TableRow>
                            <TableCell>Type</TableCell>
                            <TableCell align="right">Dossiers</TableCell>
                            <TableCell align="right">VP</TableCell>
                            <TableCell align="right">VP bénins</TableCell>
                            <TableCell align="right">FP</TableCell>
                            <TableCell align="right">À qualifier</TableCell>
                            <TableCell align="right">Taux FP</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {metrics.byType.map((entry) => (
                            <TableRow key={String(entry.typeId)}>
                              <TableCell>
                                {entry.typeId === null
                                  ? 'Sans type'
                                  : psitSocTypeLabel(entry.typeId)}
                              </TableCell>
                              <TableCell align="right">{entry.count}</TableCell>
                              <TableCell align="right">{entry.truePositives}</TableCell>
                              <TableCell align="right">{entry.benignTruePositives}</TableCell>
                              <TableCell align="right">{entry.falsePositives}</TableCell>
                              <TableCell align="right">{entry.count - entry.qualified}</TableCell>
                              <TableCell align="right">
                                {entry.fpRatePercent === null ? 'N/D' : `${entry.fpRatePercent} %`}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                </Grid>

                <Grid size={{ xs: 12, md: 6 }}>
                  <Card variant="outlined">
                    <CardHeader title="Par client" />
                    <CardContent>
                      <Table size="small">
                        <TableHead>
                          <TableRow>
                            <TableCell>Client</TableCell>
                            <TableCell align="right">Dossiers</TableCell>
                            <TableCell align="right">Ouverts</TableCell>
                            <TableCell align="right">Incidents réels</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {metrics.byTenant.map((entry) => (
                            <TableRow key={entry.tenant}>
                              <TableCell>{entry.tenant}</TableCell>
                              <TableCell align="right">{entry.count}</TableCell>
                              <TableCell align="right">{entry.open}</TableCell>
                              <TableCell align="right">{entry.truePositives}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                </Grid>

                <Grid size={{ xs: 12, md: 6 }}>
                  <Card variant="outlined">
                    <CardHeader title="Par mois" />
                    <CardContent>
                      <Table size="small">
                        <TableHead>
                          <TableRow>
                            <TableCell>Mois</TableCell>
                            <TableCell align="right">Dossiers</TableCell>
                            <TableCell align="right">Incidents réels</TableCell>
                            <TableCell align="right">Sans objet</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {metrics.byMonth.map((entry) => (
                            <TableRow key={entry.month}>
                              <TableCell>{psitMonthLabel(entry.month)}</TableCell>
                              <TableCell align="right">{entry.count}</TableCell>
                              <TableCell align="right">{entry.truePositives}</TableCell>
                              <TableCell align="right">{entry.falsePositives}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                </Grid>
              </Grid>
            </>
          )}

          <Card variant="outlined">
            <CardHeader
              title="Rapport mensuel client"
              subheader="Un client, un mois : le rapport d’activité à transmettre, y compris quand le mois a été calme."
            />
            <CardContent>
              <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap" useFlexGap>
                <TextField
                  select
                  size="small"
                  label="Client"
                  value={reportTenant}
                  onChange={(event) => setReportTenant(event.target.value)}
                  sx={{ minWidth: 280 }}
                >
                  {tenants.map((tenant) => (
                    <MenuItem key={tenant.value} value={tenant.value}>
                      {tenant.label}
                    </MenuItem>
                  ))}
                </TextField>
                <TextField
                  select
                  size="small"
                  label="Mois"
                  value={reportMonth}
                  onChange={(event) => setReportMonth(event.target.value)}
                  sx={{ minWidth: 200 }}
                >
                  {monthOptions.map((option) => (
                    <MenuItem key={option.month} value={option.month}>
                      {option.label}
                    </MenuItem>
                  ))}
                </TextField>
                <PsitSocMonthlyReportButton
                  tenant={reportTenant}
                  month={reportMonth}
                  metrics={reportMetrics}
                  disabled={reportRequest.isFetching}
                />
              </Stack>
            </CardContent>
          </Card>

          <Typography variant="caption" color="text.secondary">
            Source : les dossiers de la file, agrégés côté serveur.{' '}
            <Link href="/security/soc/queue">Retour à la file d’attente</Link>
          </Typography>
        </Stack>
      </Container>
    </>
  )
}

Page.getLayout = (page) => <DashboardLayout>{page}</DashboardLayout>

export default Page
