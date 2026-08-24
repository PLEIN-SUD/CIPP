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
      },
      confirmText: 'Prendre ce cas et le passer en investigation ?',
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
    <CippTablePage
      title="Triage SOC"
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
