import { Layout as DashboardLayout } from '../../../layouts/index.js'
import { TabbedLayout } from '../../../layouts/TabbedLayout.jsx'
import { CippTablePage } from '../../../components/CippComponents/CippTablePage.jsx'
import { useSettings } from '../../../hooks/use-settings'
import { PlaylistAdd } from '@mui/icons-material'
import { PSIT_SOC_SEVERITIES, PSIT_SOC_TYPES } from '../../../utils/psit-soc-types'
import tabOptions from './tabOptions.json'

/**
 * Defender XDR incidents, one click away from becoming a SOC case. Same data source as the
 * upstream incidents page (Graph security/incidents, cached for AllTenants); the only addition
 * is the Adopt action. Adoption is idempotent server-side: two analysts adopting the same
 * incident get the same case, and the queue shows it once.
 */
const Page = () => {
  const tenant = useSettings().currentTenant
  const queueQueryKey = `PSITSocCases-${tenant}`

  const actions = [
    {
      label: 'Adopt into SOC triage',
      type: 'POST',
      icon: <PlaylistAdd />,
      url: '/api/PSITExecSocCase',
      data: {
        tenantFilter: 'Tenant',
        ExternalRef: 'Id',
        Title: 'DisplayName',
        Source: '!xdr',
      },
      fields: [
        {
          type: 'autoComplete',
          name: 'TypeId',
          label: 'Alert type',
          multiple: false,
          creatable: false,
          options: PSIT_SOC_TYPES.filter((entry) => entry.source === 'xdr').map((entry) => ({
            value: entry.id,
            label: `${entry.id} - ${entry.label}`,
          })),
          validators: { required: 'The alert type is required' },
        },
        {
          type: 'autoComplete',
          name: 'Severity',
          label: 'Severity (optional)',
          multiple: false,
          creatable: false,
          options: PSIT_SOC_SEVERITIES.map((severity) => ({ value: severity, label: severity })),
        },
      ],
      confirmText:
        'Adopt this incident as a SOC case? If a case already exists for this incident, it is reused rather than duplicated.',
      relatedQueryKeys: [queueQueryKey],
    },
  ]

  const offCanvas = {
    extendedInfoFields: [
      'Created',
      'Updated',
      'Tenant',
      'Id',
      'DisplayName',
      'Status',
      'Severity',
      'AssignedTo',
      'Classification',
      'Determination',
      'IncidentUrl',
    ],
    actions: actions,
  }

  const simpleColumns = ['Created', 'Tenant', 'Severity', 'Status', 'DisplayName', 'Id']

  return (
    <CippTablePage
      title="Adopt Defender incidents"
      apiUrl="/api/ExecIncidentsList"
      apiDataKey="Results"
      actions={actions}
      offCanvas={offCanvas}
      simpleColumns={simpleColumns}
    />
  )
}

Page.getLayout = (page) => (
  <DashboardLayout>
    <TabbedLayout tabOptions={tabOptions}>{page}</TabbedLayout>
  </DashboardLayout>
)

export default Page
