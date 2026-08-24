import { Layout as DashboardLayout } from '../../../layouts/index.js'
import { TabbedLayout } from '../../../layouts/TabbedLayout.jsx'
import { CippTablePage } from '../../../components/CippComponents/CippTablePage.jsx'
import { useSettings } from '../../../hooks/use-settings'
import { PlayArrow, Done, Block, GppGood, LockOpen } from '@mui/icons-material'
import { MagnifyingGlassIcon } from '@heroicons/react/24/outline'
import { PsitSocCaseDrawer } from '../../../components/psit/soc/PsitSocCaseDrawer'
import tabOptions from './tabOptions.json'

/**
 * The SOC triage queue: one row per case, whatever the source (external SOC notification typed
 * in, Defender XDR or MDO incident adopted). The queue is where the analyst picks work; the
 * investigation itself happens on the case view.
 *
 * Every action here writes the case record only. The actions that touch the customer tenant
 * (revoke sessions, remove a rule) live on the case view next to the evidence that justifies
 * them, never on a list where the wrong row is one click away.
 */
const Page = () => {
  const tenant = useSettings().currentTenant
  const queryKey = `PSITSocCases-${tenant}`

  const actions = [
    {
      label: 'Open case',
      type: 'GET',
      icon: <MagnifyingGlassIcon />,
      link: '/security/soc/case?caseId=[CaseId]&tenantFilter=[Tenant]',
      multiPost: false,
    },
    {
      label: 'Start investigating',
      type: 'POST',
      icon: <PlayArrow />,
      url: '/api/PSITExecSocCase',
      data: {
        CaseId: 'CaseId',
        tenantFilter: 'Tenant',
        Status: '!investigating',
      },
      confirmText: 'Take this case and mark it as under investigation?',
      relatedQueryKeys: [queryKey],
    },
    {
      label: 'Qualify as false positive',
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
          label: 'Justification (who confirmed, how)',
          multiline: true,
          rows: 3,
          validators: { required: 'A false positive without a justification is a guess' },
        },
      ],
      confirmText: 'Qualify this case as a false positive?',
      relatedQueryKeys: [queryKey],
    },
    {
      label: 'Qualify as true positive',
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
          label: 'Justification (evidence retained)',
          multiline: true,
          rows: 3,
        },
      ],
      confirmText: 'Qualify this case as a true positive?',
      relatedQueryKeys: [queryKey],
    },
    {
      label: 'Mark as contained',
      type: 'POST',
      icon: <Done />,
      url: '/api/PSITExecSocCase',
      data: {
        CaseId: 'CaseId',
        tenantFilter: 'Tenant',
        Status: '!contained',
      },
      confirmText: 'Mark this case as contained?',
      relatedQueryKeys: [queryKey],
    },
    {
      label: 'Close case',
      type: 'POST',
      icon: <Done />,
      url: '/api/PSITExecSocCase',
      data: {
        CaseId: 'CaseId',
        tenantFilter: 'Tenant',
        Status: '!closed',
      },
      confirmText: 'Close this case? The closure is stamped with your name.',
      relatedQueryKeys: [queryKey],
    },
    {
      label: 'Reopen case',
      type: 'POST',
      icon: <LockOpen />,
      url: '/api/PSITExecSocCase',
      data: {
        CaseId: 'CaseId',
        tenantFilter: 'Tenant',
        Status: '!investigating',
      },
      confirmText: 'Reopen this case? The closure stamps are cleared and the reopening is logged.',
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
    'UpdatedUtc',
    'Severity',
    'Status',
    'Tenant',
    'TypeId',
    'Title',
    'Source',
    'ExternalRef',
    'CaseId',
  ]

  const filterList = [
    { filterName: 'New', value: [{ id: 'Status', value: 'new' }], type: 'column' },
    {
      filterName: 'Investigating',
      value: [{ id: 'Status', value: 'investigating' }],
      type: 'column',
    },
    {
      filterName: 'Qualified true positive',
      value: [{ id: 'Status', value: 'qualified-tp' }],
      type: 'column',
    },
    {
      filterName: 'Qualified false positive',
      value: [{ id: 'Status', value: 'qualified-fp' }],
      type: 'column',
    },
    { filterName: 'Contained', value: [{ id: 'Status', value: 'contained' }], type: 'column' },
    { filterName: 'Closed', value: [{ id: 'Status', value: 'closed' }], type: 'column' },
  ]

  return (
    <CippTablePage
      title="SOC Triage"
      apiUrl="/api/PSITListSocCases"
      queryKey={queryKey}
      cardButton={<PsitSocCaseDrawer relatedQueryKeys={[queryKey]} />}
      actions={actions}
      offCanvas={offCanvas}
      simpleColumns={simpleColumns}
      filters={filterList}
    />
  )
}

Page.getLayout = (page) => (
  <DashboardLayout>
    <TabbedLayout tabOptions={tabOptions}>{page}</TabbedLayout>
  </DashboardLayout>
)

export default Page
