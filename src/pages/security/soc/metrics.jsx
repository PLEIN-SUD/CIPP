import { useMemo, useState } from 'react'
import Link from 'next/link'
import {
  Alert,
  Box,
  Card,
  CardContent,
  CardHeader,
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
  Tooltip,
  Typography,
} from '@mui/material'
import { Grid } from '@mui/system'
import { useTheme } from '@mui/material/styles'
import { Inbox, GppBad, FactCheck, Timer } from '@mui/icons-material'
import { Layout as DashboardLayout } from '../../../layouts/index.js'
import { ApiGetCall } from '../../../api/ApiCall'
import { CippHead } from '../../../components/CippComponents/CippHead'
import { CippInfoBar } from '../../../components/CippCards/CippInfoBar'
import { Chart } from '../../../components/chart'
import { PsitSocMonthlyReportButton } from '../../../components/psit/PsitSocMonthlyReportFr'
import {
  psitFillMonths,
  psitFillWeeks,
  psitMetricsDeltas,
  psitMetricsFpRate,
  psitMetricsVerdictLabel,
  psitMinutesLabel,
  psitMonthBounds,
  psitMonthLabel,
  psitReadSocMetrics,
  psitRecentMonths,
  psitWeekLabels,
} from '../../../utils/psit-soc-metrics'
import { psitSocTypeLabel } from '../../../utils/psit-soc-queue'

const PERIODS = [
  { months: 3, label: '3 derniers mois' },
  { months: 6, label: '6 derniers mois' },
  { months: 12, label: '12 derniers mois' },
]

/** The first day of the month N-1 months back: a period of '3 mois' includes the current one. */
const periodStartUtc = (months, from = new Date()) =>
  new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() - (months - 1), 1)).toISOString()

/** '+3', '−2', '=' — a delta a tile can wear. */
const signed = (value) => (value > 0 ? `+${value}` : value < 0 ? `−${Math.abs(value)}` : '=')

const DELTA_COLOUR = { good: 'success.main', bad: 'error.main', neutral: 'text.secondary' }

// One hue per meaning, repeated nowhere on the page: red only ever says 'vrai positif',
// green 'faux positif' (a benign outcome for the client), blue 'VP bénin', amber 'indéterminé',
// grey 'à qualifier'. The trend reuses the same red and green.
const VERDICT_COLOURS = {
  truePositive: '#C4453A',
  falsePositive: '#2E7D4F',
  benign: '#2F6DA8',
  undetermined: '#C87F1F',
}
// Qualitative row for the type chart: colours there only separate bars, so none may repeat.
const TYPE_PALETTE = ['#2F6DA8', '#C87F1F', '#7A4FA3', '#2E7D4F', '#C4453A', '#1F8A8A', '#8A6D3B', '#5B6B7A']

/** The small line under a KPI value: where it sits against the previous window. */
const DeltaCaption = ({ entry, unit = '' }) => {
  if (entry.delta === null) {
    return (
      <Typography component="span" variant="caption" color="text.secondary" display="block">
        pas de période de comparaison
      </Typography>
    )
  }
  return (
    <Typography
      component="span"
      variant="caption"
      display="block"
      sx={{ color: DELTA_COLOUR[entry.tone] }}
    >
      {`${signed(entry.delta)}${unit} vs période précédente`}
    </Typography>
  )
}

/**
 * The steering screen, as widgets: is the service holding, which way is it moving, and where
 * does the noise come from.
 *
 * Everything here is an aggregate the API computed; the page says it in French and draws it.
 * Three honesty rules survive the redesign: dossiers awaiting a verdict stay a visible number,
 * a rate over nothing shows N/D (not 0 %), and the KPI deltas compare against the previous
 * window of equal length - a tile without its direction is just a number. The monthly client
 * report is generated from here, from the same endpoint asked about one tenant and one month.
 */
const Page = () => {
  const theme = useTheme()
  const [months, setMonths] = useState(6)

  const startUtc = useMemo(() => periodStartUtc(months), [months])
  const previousStartUtc = useMemo(() => periodStartUtc(months * 2), [months])
  const metricsRequest = ApiGetCall({
    url: `/api/PSITListSocMetrics?tenantFilter=AllTenants&StartUtc=${encodeURIComponent(startUtc)}`,
    queryKey: `PSITSocMetrics-all-${months}`,
    waiting: true,
  })
  // The same window, one period earlier: what the KPI deltas compare against.
  const previousRequest = ApiGetCall({
    url: `/api/PSITListSocMetrics?tenantFilter=AllTenants&StartUtc=${encodeURIComponent(
      previousStartUtc
    )}&EndUtc=${encodeURIComponent(startUtc)}`,
    queryKey: `PSITSocMetrics-prev-${months}`,
    waiting: true,
  })
  const metrics = useMemo(() => psitReadSocMetrics(metricsRequest.data), [metricsRequest.data])
  const previous = useMemo(() => psitReadSocMetrics(previousRequest.data), [previousRequest.data])
  const deltas = useMemo(() => psitMetricsDeltas(metrics, previous), [metrics, previous])
  const fpRate = useMemo(() => psitMetricsFpRate(metrics), [metrics])

  const failed = typeof metricsRequest.data?.Results === 'string' || metricsRequest.isError
  const failureText =
    typeof metricsRequest.data?.Results === 'string'
      ? metricsRequest.data.Results
      : (metricsRequest.error?.response?.data?.Results ??
        metricsRequest.error?.message ??
        'La lecture a échoué.')

  // --- trend: weekly points on the short window, monthly on the long ones ----------------------
  const trend = useMemo(() => {
    if (!metrics) return null
    const weekly = months === 3 && metrics.byWeek.length > 0
    // Filled over the whole window: a single busy month is a point, and a point without
    // neighbours draws no line - the markers and the zero months around it make it readable.
    const rows = weekly
      ? psitFillWeeks(metrics.byWeek, metrics.window)
      : psitFillMonths(metrics.byMonth, metrics.window)
    if (rows.length === 0) return null
    return {
      granularity: weekly ? 'semaine' : 'mois',
      labels: weekly ? psitWeekLabels(rows) : rows.map((row) => psitMonthLabel(row.month)),
      counts: rows.map((row) => row.count),
      truePositives: rows.map((row) => row.truePositives),
      falsePositives: rows.map((row) => row.falsePositives),
    }
  }, [metrics, months])

  const trendOptions = useMemo(
    () => ({
      chart: { background: 'transparent', toolbar: { show: false }, zoom: { enabled: false } },
      colors: [
        theme.palette.mode === 'dark' ? '#8FA3B8' : '#5B6B7A',
        VERDICT_COLOURS.truePositive,
        VERDICT_COLOURS.falsePositive,
      ],
      dataLabels: { enabled: false },
      stroke: { curve: 'smooth', width: 2 },
      markers: { size: 3, strokeWidth: 0, hover: { size: 5 } },
      fill: { type: 'solid', opacity: [0.12, 0.16, 0.1] },
      legend: { show: true, position: 'top', horizontalAlign: 'left' },
      grid: { borderColor: theme.palette.divider, strokeDashArray: 3 },
      xaxis: { categories: trend?.labels ?? [], labels: { rotate: 0 } },
      yaxis: { labels: { formatter: (value) => `${Math.round(value)}` }, forceNiceScale: true },
      theme: { mode: theme.palette.mode },
      tooltip: { shared: true, intersect: false },
    }),
    [theme, trend]
  )

  // --- verdict donut: one colour per meaning, the waiting bucket in grey ------------------------
  const verdictOrder = ['false-positive', 'benign-true-positive', 'true-positive', 'undetermined', 'none']
  const verdictCounts = verdictOrder.map(
    (verdict) => metrics?.byVerdict?.find((entry) => entry.verdict === verdict)?.count ?? 0
  )
  const donutOptions = useMemo(
    () => ({
      chart: { background: 'transparent' },
      labels: verdictOrder.map(psitMetricsVerdictLabel),
      colors: [
        VERDICT_COLOURS.falsePositive,
        VERDICT_COLOURS.benign,
        VERDICT_COLOURS.truePositive,
        VERDICT_COLOURS.undetermined,
        theme.palette.mode === 'dark' ? theme.palette.grey[600] : theme.palette.grey[400],
      ],
      dataLabels: { enabled: false },
      legend: { show: true, position: 'bottom' },
      stroke: { width: 1 },
      plotOptions: {
        pie: {
          expandOnClick: false,
          donut: { labels: { show: true, total: { show: true, label: 'Dossiers' } } },
        },
      },
      theme: { mode: theme.palette.mode },
    }),
    // verdictOrder is a constant of this component: only the theme changes the options.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [theme]
  )

  const typeBars = useMemo(() => (metrics?.byType ?? []).slice(0, 8), [metrics])
  const typeLabels = useMemo(
    () =>
      typeBars.map((entry) => (entry.typeId === null ? 'Sans type' : psitSocTypeLabel(entry.typeId))),
    [typeBars]
  )
  const typeBarOptions = useMemo(
    () => ({
      chart: { background: 'transparent', toolbar: { show: false } },
      colors: TYPE_PALETTE,
      plotOptions: { bar: { distributed: true, columnWidth: '55%', borderRadius: 2 } },
      dataLabels: { enabled: false },
      legend: { show: false },
      grid: { borderColor: theme.palette.divider, strokeDashArray: 3 },
      // The list under the chart names the bars; axis labels at this density collide.
      xaxis: { categories: typeLabels, labels: { show: false }, axisTicks: { show: false } },
      yaxis: { labels: { formatter: (value) => `${Math.round(value)}` }, forceNiceScale: true },
      theme: { mode: theme.palette.mode },
    }),
    [theme, typeLabels]
  )

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

  const infoBar = metrics
    ? [
        {
          icon: <Inbox />,
          name: 'Dossiers reçus',
          data: (
            <>
              {metrics.caseCount}
              <DeltaCaption entry={deltas.cases} />
            </>
          ),
          toolTip: `Dossiers créés sur la période, tous clients confondus ; ${metrics.openCount} encore ouverts`,
        },
        {
          icon: <GppBad />,
          name: 'Vrais positifs',
          color: deltas.truePositives.tone === 'bad' ? 'error' : 'primary',
          data: (
            <>
              {deltas.truePositives.value ?? 0}
              <DeltaCaption entry={deltas.truePositives} />
            </>
          ),
          toolTip: 'Incidents réels confirmés sur la période',
        },
        {
          icon: <FactCheck />,
          name: 'Taux de faux positifs',
          data: (
            <>
              {fpRate.ratePercent === null ? 'N/D' : `${fpRate.ratePercent} %`}
              <DeltaCaption entry={deltas.fpRatePercent} unit=" pts" />
            </>
          ),
          toolTip:
            fpRate.ratePercent === null
              ? 'Aucun dossier qualifié sur la période : taux non calculable'
              : `Faux positifs sur les ${fpRate.qualified} dossiers qualifiés de la période`,
        },
        {
          icon: <Timer />,
          name: 'Prise en charge médiane',
          data: (
            <>
              {psitMinutesLabel(metrics.delays.takeMedianMinutes)}
              <DeltaCaption entry={deltas.takeMedianMinutes} unit=" min" />
            </>
          ),
          toolTip: `Création → prise en charge, médiane sur ${metrics.delays.takeCount} dossiers mesurés`,
        },
      ]
    : []

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
                Volumes, verdicts, tendances et délais sur l’ensemble des dossiers, tous clients
                confondus.
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
              <CippInfoBar isFetching={false} data={infoBar} />

              <Grid container spacing={3}>
                <Grid size={{ xs: 12, lg: 8 }}>
                  <Card variant="outlined">
                    <CardHeader
                      title="Tendance"
                      subheader={
                        trend
                          ? `Dossiers reçus, vrais positifs et faux positifs, par ${trend.granularity} (date de création)`
                          : 'Dossiers reçus, vrais positifs et faux positifs'
                      }
                    />
                    <CardContent>
                      {trend ? (
                        <Chart
                          type="area"
                          height={280}
                          options={trendOptions}
                          series={[
                            { name: 'Reçus', data: trend.counts },
                            { name: 'Vrais positifs', data: trend.truePositives },
                            { name: 'Faux positifs', data: trend.falsePositives },
                          ]}
                        />
                      ) : (
                        <Typography variant="body2" color="text.secondary">
                          Aucun dossier sur la période.
                        </Typography>
                      )}
                    </CardContent>
                  </Card>
                </Grid>

                <Grid size={{ xs: 12, lg: 4 }}>
                  <Card variant="outlined">
                    <CardHeader title="Verdicts" subheader="Dossiers de la période, par verdict" />
                    <CardContent>
                      {metrics.caseCount > 0 ? (
                        <Chart
                          type="donut"
                          height={280}
                          options={donutOptions}
                          series={verdictCounts}
                        />
                      ) : (
                        <Typography variant="body2" color="text.secondary">
                          Aucun dossier sur la période.
                        </Typography>
                      )}
                    </CardContent>
                  </Card>
                </Grid>

                <Grid size={{ xs: 12, lg: 5 }}>
                  <Card variant="outlined">
                    <CardHeader title="Par type de signalement" />
                    <CardContent>
                      {typeBars.length > 0 ? (
                        <>
                          <Chart
                            height={240}
                            options={typeBarOptions}
                            series={[{ name: 'Dossiers', data: typeBars.map((entry) => entry.count) }]}
                            type="bar"
                          />
                          <Stack spacing={1} sx={{ mt: 1 }}>
                            {typeBars.map((entry, index) => (
                              <Stack
                                key={entry.typeId ?? 'none'}
                                direction="row"
                                alignItems="center"
                                spacing={1}
                              >
                                <Box
                                  sx={{
                                    width: 10,
                                    height: 10,
                                    borderRadius: '50%',
                                    backgroundColor: TYPE_PALETTE[index % TYPE_PALETTE.length],
                                  }}
                                />
                                <Typography variant="body2" sx={{ flexGrow: 1 }}>
                                  {typeLabels[index]}
                                </Typography>
                                <Typography variant="body2" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                                  {entry.count}
                                </Typography>
                              </Stack>
                            ))}
                          </Stack>
                        </>
                      ) : (
                        <Typography variant="body2" color="text.secondary">
                          Aucun dossier sur la période.
                        </Typography>
                      )}
                    </CardContent>
                  </Card>
                </Grid>

                <Grid size={{ xs: 12, lg: 7 }}>
                  <Card variant="outlined">
                    <CardHeader
                      title="Qualification par type"
                      subheader="Taux de faux positifs calculé sur les seuls dossiers qualifiés ; « à qualifier » = pas encore de verdict."
                    />
                    <CardContent>
                      <Table size="small">
                        <TableHead>
                          <TableRow>
                            <TableCell>Type</TableCell>
                            <TableCell align="right">Dossiers</TableCell>
                            <TableCell align="right">Vrais positifs</TableCell>
                            <TableCell align="right">VP bénins</TableCell>
                            <TableCell align="right">Faux positifs</TableCell>
                            <TableCell align="right">À qualifier</TableCell>
                            <TableCell align="right">Taux de FP</TableCell>
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
                                {entry.fpRatePercent === null ? (
                                  <Tooltip title="Aucun dossier qualifié dans cette catégorie : taux non calculable">
                                    <span>N/D</span>
                                  </Tooltip>
                                ) : (
                                  `${entry.fpRatePercent} %`
                                )}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                </Grid>

                <Grid size={{ xs: 12, lg: 4 }}>
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
                    </CardContent>
                  </Card>
                </Grid>

                <Grid size={{ xs: 12, lg: 8 }}>
                  <Card variant="outlined">
                    <CardHeader title="Par client" />
                    <CardContent>
                      <Table size="small">
                        <TableHead>
                          <TableRow>
                            <TableCell>Client</TableCell>
                            <TableCell align="right">Dossiers</TableCell>
                            <TableCell align="right">Ouverts</TableCell>
                            <TableCell align="right">Vrais positifs</TableCell>
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
            Tendances établies sur la date de création des dossiers ; comparaisons avec la
            période précédente de même durée.{' '}
            <Link href="/security/soc/queue">Retour à la file d’attente</Link>
          </Typography>
        </Stack>
      </Container>
    </>
  )
}

Page.getLayout = (page) => <DashboardLayout>{page}</DashboardLayout>

export default Page
