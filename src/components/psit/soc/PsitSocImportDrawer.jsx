import { useState } from 'react'
import { Box, Button } from '@mui/material'
import { PlaylistAdd } from '@mui/icons-material'
import { CippOffCanvas } from '../../CippComponents/CippOffCanvas'
import { CippDataTable } from '../../CippTable/CippDataTable'
import { useSettings } from '../../../hooks/use-settings'
import { PSIT_SOC_SEVERITIES, PSIT_SOC_TYPES } from '../../../utils/psit-soc-types'

/**
 * Importing a Defender incident or an MDO alert into the queue, from the queue.
 *
 * These were two full pages, which meant leaving the queue to feed it and a tab bar to hold them.
 * A case is picked up, worked and created in one place now: the import is a drawer over the
 * queue, on the pattern CippApiLogsDrawer already uses for a table inside an off-canvas.
 *
 * Adoption stays idempotent server-side: two analysts adopting the same incident get the same
 * case, and the queue shows it once.
 */
const SOURCES = {
  xdr: {
    button: 'Importer Defender',
    title: 'Incidents Defender',
    apiUrl: '/api/ExecIncidentsList',
    data: () => ({
      tenantFilter: 'Tenant',
      ExternalRef: 'Id',
      Title: 'DisplayName',
      Source: '!xdr',
    }),
    fields: [
      {
        type: 'autoComplete',
        name: 'TypeId',
        label: 'Type d’alerte',
        multiple: false,
        creatable: false,
        options: PSIT_SOC_TYPES.filter((entry) => entry.source === 'xdr').map((entry) => ({
          value: entry.id,
          label: `${entry.id} - ${entry.label}`,
        })),
        validators: { required: 'Le type d’alerte est requis' },
      },
      {
        type: 'autoComplete',
        name: 'Severity',
        label: 'Criticité (optionnelle)',
        multiple: false,
        creatable: false,
        options: PSIT_SOC_SEVERITIES.map((severity) => ({ value: severity, label: severity })),
      },
    ],
    confirmText:
      'Adopter cet incident comme dossier SOC ? Si un dossier existe déjà pour cet incident, il est réutilisé, pas dupliqué.',
    simpleColumns: ['Created', 'Tenant', 'Severity', 'Status', 'DisplayName', 'Id'],
    offCanvasFields: [
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
  },
  mdo: {
    button: 'Importer MDO',
    title: 'Alertes Defender for Office',
    apiUrl: '/api/ExecMdoAlertsList',
    // Type 18 is what an MDO alert is here (incomplete ZAP): fixed, not asked.
    data: (tenant) => ({
      // 'Tenant' is the column the alert row carries, not a literal: an unresolved name
      // falls back to itself, and 'tenant' filed dossiers under a client of that name.
      tenantFilter: tenant === 'AllTenants' ? 'Tenant' : `!${tenant}`,
      ExternalRef: 'id',
      Title: 'title',
      Source: '!mdo',
      TypeId: '!18',
    }),
    fields: [
      {
        type: 'autoComplete',
        name: 'Severity',
        label: 'Criticité (optionnelle, P2 du catalogue par défaut)',
        multiple: false,
        creatable: false,
        options: PSIT_SOC_SEVERITIES.map((severity) => ({ value: severity, label: severity })),
      },
    ],
    confirmText:
      'Adopter cette alerte MDO comme dossier SOC de type 18 ? Si un dossier existe déjà pour cette alerte, il est réutilisé, pas dupliqué.',
    simpleColumns: ['createdDateTime', 'status', 'severity', 'title', 'category', 'id'],
    offCanvasFields: [
      'createdDateTime',
      'lastUpdateDateTime',
      'id',
      'title',
      'status',
      'severity',
      'category',
      'description',
    ],
  },
}

export const PsitSocImportDrawer = ({ source, relatedQueryKeys = [] }) => {
  const [visible, setVisible] = useState(false)
  const tenant = useSettings().currentTenant
  const config = SOURCES[source]

  const actions = [
    {
      label: 'Adopter dans le triage SOC',
      type: 'POST',
      icon: <PlaylistAdd />,
      url: '/api/PSITExecSocCase',
      data: config.data(tenant),
      fields: config.fields,
      confirmText: config.confirmText,
      relatedQueryKeys,
    },
  ]

  return (
    <>
      <Button size="small" onClick={() => setVisible(true)} startIcon={<PlaylistAdd />}>
        {config.button}
      </Button>
      <CippOffCanvas
        title={config.title}
        visible={visible}
        onClose={() => setVisible(false)}
        size="xl"
      >
        <Box sx={{ mb: 2 }}>
          <CippDataTable
            title={config.title}
            hideTitle={true}
            noCard={true}
            api={{
              url: config.apiUrl,
              data: { tenantFilter: tenant },
              dataKey: 'Results',
            }}
            queryKey={`PSITSocImport-${source}-${tenant}`}
            simpleColumns={config.simpleColumns}
            actions={actions}
            offCanvas={{ extendedInfoFields: config.offCanvasFields, actions }}
            simple={false}
          />
        </Box>
      </CippOffCanvas>
    </>
  )
}
