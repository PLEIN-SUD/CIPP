import { useMemo } from 'react'
import { Alert, Chip, Container, Stack, Typography } from '@mui/material'
import { Layout as DashboardLayout } from '../../../layouts/index.js'
import { PsitSocWipBanner } from '../../../components/psit/soc/PsitSocWipBanner'
import { CippHead } from '../../../components/CippComponents/CippHead'
import { CippDataTable } from '../../../components/CippTable/CippDataTable.js'
import { ApiGetCall } from '../../../api/ApiCall'
import { useSettings } from '../../../hooks/use-settings'
import {
  psitSocAge,
  psitSocGuideProgress,
  psitSocQueueOrder,
  psitSocQueueSummary,
  psitSocTypeLabel,
} from '../../../utils/psit-soc-queue'
import { PlayArrow, Done, Block, GppGood, LockOpen, SwapHoriz } from '@mui/icons-material'
import { MagnifyingGlassIcon } from '@heroicons/react/24/outline'
import { PsitSocCaseDrawer } from '../../../components/psit/soc/PsitSocCaseDrawer'
import { PsitSocImportDrawer } from '../../../components/psit/soc/PsitSocImportDrawer'

/**
 * The SOC triage queue: one row per case, whatever the source (external SOC notification typed
 * in, Defender XDR or MDO incident adopted). The queue is where the analyst picks work; the
 * investigation itself happens on the case view.
 *
 * Every action here writes the case record only. The actions that touch the customer tenant
 * (revoke sessions, remove a rule) live on the case view next to the evidence that justifies
 * them, never on a list where the wrong row is one click away.
 *
 * It is also the screen an analyst opens first and returns to between cases, so it answers "what
 * do I do now" before he reads a row: the counts, and the untouched case that has waited longest,
 * named rather than counted. The rows are then ordered the way they are worth working, open cases
 * first, most severe first, oldest first. Finished cases sink rather than disappear, because
 * yesterday's closure has to stay findable and a list that quietly drops rows is not trusted.
 */
const Page = () => {
  const tenant = useSettings().currentTenant
  const queryKey = `PSITSocCases-${tenant}`

  const casesRequest = ApiGetCall({
    url: `/api/PSITListSocCases?tenantFilter=${tenant}`,
    queryKey,
    waiting: Boolean(tenant),
  })
  // The endpoint answers with a bare array on success and { Results: '<message>' } on failure.
  // The first version of this read data.Results for both, which emptied the queue while the
  // cases sat untouched in the store: zero counts, no columns, no error - the worst kind of wrong.
  const failed = typeof casesRequest.data?.Results === 'string' || casesRequest.isError
  const cases = useMemo(
    () => (Array.isArray(casesRequest.data) ? casesRequest.data : []),
    [casesRequest.data]
  )
  // The derived readings are baked onto the rows rather than computed in a column accessor. It
  // is the pattern the rest of the portal uses, and it costs nothing to gain search, sort and
  // export on them: an analyst can look for "Voyage impossible" instead of remembering it is 2.
  const rows = useMemo(
    () =>
      psitSocQueueOrder(cases).map((row) => ({
        ...row,
        TypeLabel: psitSocTypeLabel(row?.TypeId),
        Guide: psitSocGuideProgress(row)?.label ?? '',
        Age: psitSocAge(row?.CreatedUtc)?.label ?? '',
      })),
    [cases]
  )
  const summary = useMemo(() => psitSocQueueSummary(cases), [cases])

  const actions = [
    {
      label: 'Ouvrir le cas',
      type: 'GET',
      icon: <MagnifyingGlassIcon />,
      link: '/security/soc/case?caseId=[CaseId]&tenantFilter=[Tenant]',
      multiPost: false,
    },
    {
      label: 'Prendre en charge',
      type: 'POST',
      icon: <PlayArrow />,
      url: '/api/PSITExecSocCase',
      data: {
        CaseId: 'CaseId',
        tenantFilter: 'Tenant',
        Status: '!investigating',
        // The server assigns the case to the caller. A name sent from here could be anyone's.
        TakeOwnership: '!true',
      },
      confirmText: 'Prendre ce cas et le passer en investigation ?',
      relatedQueryKeys: [queryKey],
    },
    {
      label: 'Réattribuer',
      type: 'POST',
      icon: <SwapHoriz />,
      url: '/api/PSITExecSocCase',
      data: { CaseId: 'CaseId', tenantFilter: 'Tenant' },
      fields: [
        {
          type: 'textField',
          name: 'AssignedTo',
          label: 'Analyste (vide pour rendre le cas à la file)',
        },
      ],
      confirmText: 'Réattribuer ce cas ?',
      relatedQueryKeys: [queryKey],
    },
    {
      label: 'Qualifier faux positif',
      type: 'POST',
      icon: <GppGood />,
      url: '/api/PSITExecSocCase',
      data: {
        CaseId: 'CaseId',
        tenantFilter: 'Tenant',
        Verdict: '!false-positive',
      },
      fields: [
        {
          type: 'textField',
          name: 'Justification',
          label: 'Justification (qui a confirmé, comment)',
          multiline: true,
          rows: 3,
          validators: { required: 'Un faux positif sans justification est une supposition' },
        },
      ],
      confirmText: 'Qualifier ce cas en faux positif ?',
      relatedQueryKeys: [queryKey],
    },
    {
      label: 'Qualifier vrai positif',
      type: 'POST',
      icon: <Block />,
      url: '/api/PSITExecSocCase',
      data: {
        CaseId: 'CaseId',
        tenantFilter: 'Tenant',
        Verdict: '!true-positive',
      },
      fields: [
        {
          type: 'textField',
          name: 'Justification',
          label: 'Justification (éléments retenus)',
          multiline: true,
          rows: 3,
        },
      ],
      confirmText: 'Qualifier ce cas en vrai positif ?',
      relatedQueryKeys: [queryKey],
    },
    {
      label: 'Marquer confiné',
      type: 'POST',
      icon: <Done />,
      url: '/api/PSITExecSocCase',
      data: {
        CaseId: 'CaseId',
        tenantFilter: 'Tenant',
        Status: '!contained',
      },
      confirmText: 'Marquer ce cas comme confiné ?',
      relatedQueryKeys: [queryKey],
    },
    {
      label: 'Clore le cas',
      type: 'POST',
      icon: <Done />,
      url: '/api/PSITExecSocCase',
      data: {
        CaseId: 'CaseId',
        tenantFilter: 'Tenant',
        Status: '!closed',
      },
      confirmText: 'Clore ce cas ? La clôture est horodatée à votre nom.',
      relatedQueryKeys: [queryKey],
    },
    {
      label: 'Rouvrir le cas',
      type: 'POST',
      icon: <LockOpen />,
      url: '/api/PSITExecSocCase',
      data: {
        CaseId: 'CaseId',
        tenantFilter: 'Tenant',
        Status: '!investigating',
      },
      confirmText: 'Rouvrir ce cas ? Les horodatages de clôture sont effacés et la réouverture est journalisée.',
      relatedQueryKeys: [queryKey],
    },
  ]

  const offCanvas = {
    extendedInfoFields: [
      'CaseId',
      'Tenant',
      'Source',
      'TypeId',
      'Severity',
      'Status',
      'AssignedTo',
      'Title',
      'ExternalRef',
      'TicketRef',
      'CreatedUtc',
      'CreatedBy',
      'UpdatedUtc',
      'UpdatedBy',
      'ClosedUtc',
      'ClosedBy',
    ],
    actions: actions,
  }

  const simpleColumns = [
    'Severity',
    'Status',
    'AssignedTo',
    'Tenant',
    'TypeLabel',
    'Title',
    'Guide',
    'Age',
    'ExternalRef',
  ]

  const filterList = [
    { filterName: 'Nouveaux', value: [{ id: 'Status', value: 'new' }], type: 'column' },
    {
      filterName: 'En investigation',
      value: [{ id: 'Status', value: 'investigating' }],
      type: 'column',
    },
    {
      filterName: 'Qualifiés vrais positifs',
      value: [{ id: 'Status', value: 'qualified-tp' }],
      type: 'column',
    },
    {
      filterName: 'Qualifiés faux positifs',
      value: [{ id: 'Status', value: 'qualified-fp' }],
      type: 'column',
    },
    { filterName: 'Confinés', value: [{ id: 'Status', value: 'contained' }], type: 'column' },
    { filterName: 'Clos', value: [{ id: 'Status', value: 'closed' }], type: 'column' },
  ]

  return (
    <>
      <CippHead title="Triage SOC" />
      <Container maxWidth={false} sx={{ py: 2 }}>
        <Stack spacing={2}>
          <PsitSocWipBanner />
          {failed && (
            <Alert severity="error">
              La file n’a pas pu être lue. Rien n’est affiché plutôt qu’une liste vide, qui se
              lirait comme « aucun cas en attente ».
            </Alert>
          )}

          {!failed && (
            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
              <Chip
                color={summary.counts.new > 0 ? 'error' : 'default'}
                label={`${summary.counts.new ?? 0} à prendre`}
              />
              <Chip
                color={summary.counts.investigating > 0 ? 'warning' : 'default'}
                label={`${summary.counts.investigating ?? 0} en cours`}
              />
              <Chip label={`${summary.counts.contained ?? 0} confinés`} />
              <Typography variant="body2" color="text.secondary">
                {summary.oldestUntaken
                  ? `Le plus ancien non pris : ${summary.oldestUntaken.row.CaseId}, il y a ${summary.oldestUntaken.age.label}.`
                  : 'Aucun cas en attente de prise en charge.'}
              </Typography>
            </Stack>
          )}

          <CippDataTable
            title="Triage SOC"
            data={failed ? [] : rows}
            isFetching={casesRequest.isFetching && !failed}
            cardButton={
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                <PsitSocCaseDrawer relatedQueryKeys={[queryKey]} />
                <PsitSocImportDrawer source="xdr" relatedQueryKeys={[queryKey]} />
                <PsitSocImportDrawer source="mdo" relatedQueryKeys={[queryKey]} />
              </Stack>
            }
            actions={actions}
            offCanvas={offCanvas}
            simpleColumns={simpleColumns}
            filters={filterList}
            simple={false}
          />
        </Stack>
      </Container>
    </>
  )
}

Page.getLayout = (page) => <DashboardLayout>{page}</DashboardLayout>

export default Page
