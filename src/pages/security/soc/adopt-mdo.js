import { Layout as DashboardLayout } from '../../../layouts/index.js'
import { TabbedLayout } from '../../../layouts/TabbedLayout.jsx'
import { CippTablePage } from '../../../components/CippComponents/CippTablePage.jsx'
import { useSettings } from '../../../hooks/use-settings'
import { PlaylistAdd } from '@mui/icons-material'
import { PSIT_SOC_SEVERITIES } from '../../../utils/psit-soc-types'
import tabOptions from './tabOptions.json'

/**
 * Defender for Office 365 alerts, one click away from becoming a type 18 SOC case (incomplete
 * ZAP: delivered mail not purged). Same data source as the upstream MDO alerts page; adoption is
 * idempotent server-side.
 *
 * Single-tenant rows come straight from Graph and carry no tenant property, so the mapping sends
 * the picker's tenant as a literal there and reads the row's tenant only for AllTenants.
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
        tenantFilter: tenant === 'AllTenants' ? 'tenant' : `!${tenant}`,
        ExternalRef: 'id',
        Title: 'title',
        Source: '!mdo',
        TypeId: '!18',
      },
      fields: [
        {
          type: 'autoComplete',
          name: 'Severity',
          label: 'Severity (optional, defaults to the catalogue P2)',
          multiple: false,
          creatable: false,
          options: PSIT_SOC_SEVERITIES.map((severity) => ({ value: severity, label: severity })),
        },
      ],
      confirmText:
        'Adopt this MDO alert as a type 18 SOC case? If a case already exists for this alert, it is reused rather than duplicated.',
      relatedQueryKeys: [queueQueryKey],
    },
  ]

  const offCanvas = {
    extendedInfoFields: [
      'createdDateTime',
      'status',
      'severity',
      'title',
      'category',
      'classification',
      'determination',
      'incidentWebUrl',
      'id',
    ],
    actions: actions,
  }

  const simpleColumns = ['createdDateTime', 'status', 'severity', 'title', 'category', 'id']

  return (
    <CippTablePage
      title="Adopt MDO alerts"
      apiUrl="/api/ExecMdoAlertsList"
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
