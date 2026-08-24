import { useState } from 'react'
import { Button, Divider } from '@mui/material'
import { Grid } from '@mui/system'
import { useForm, useFormState, useWatch } from 'react-hook-form'
import { PlaylistAdd } from '@mui/icons-material'
import { CippOffCanvas } from '../../CippComponents/CippOffCanvas'
import CippFormComponent from '../../CippComponents/CippFormComponent'
import { CippFormTenantSelector } from '../../CippComponents/CippFormTenantSelector'
import { CippApiResults } from '../../CippComponents/CippApiResults'
import { ApiPostCall } from '../../../api/ApiCall'
import {
  PSIT_SOC_SEVERITIES,
  PSIT_SOC_TYPE_OPTIONS,
  psitSocTypeById,
} from '../../../utils/psit-soc-types'

const defaultValues = {
  tenantFilter: null,
  type: null,
  title: '',
  severity: null,
  externalRef: '',
  ticketRef: '',
  upn: '',
}

/**
 * Quick entry of a SOC case: the path an alert takes when it arrives as an external SOC
 * notification rather than through the Defender feed. The analyst pastes the reference, picks the type and the
 * tenant, and the case exists - the investigation happens on the case, not in the drawer.
 *
 * The severity field is left empty on purpose and falls back to the type's default at submit:
 * the notification's own P-level wins when the analyst types it, the catalogue's default applies
 * otherwise, and either way the case says which severity it carries.
 */
export const PsitSocCaseDrawer = ({ buttonText = 'New case', relatedQueryKeys = [] }) => {
  const [drawerVisible, setDrawerVisible] = useState(false)
  const formControl = useForm({ mode: 'onChange', defaultValues })
  const { isValid } = useFormState({ control: formControl.control })
  const selectedType = useWatch({ control: formControl.control, name: 'type' })
  const catalogueEntry = psitSocTypeById(selectedType?.value)

  const createCase = ApiPostCall({ relatedQueryKeys })

  const handleSubmit = formControl.handleSubmit((values) => {
    const entry = psitSocTypeById(values.type?.value)
    const entities = values.upn ? { upn: values.upn.trim() } : null
    createCase.mutate({
      url: '/api/PSITExecSocCase',
      data: {
        tenantFilter: values.tenantFilter?.value,
        Source: entry?.source ?? 'manual',
        TypeId: values.type?.value,
        Title: values.title.trim(),
        Severity: values.severity?.value ?? entry?.severity,
        ExternalRef: values.externalRef.trim(),
        TicketRef: values.ticketRef.trim(),
        ...(entities ? { Entities: entities } : {}),
      },
    })
  })

  const handleCloseDrawer = () => {
    setDrawerVisible(false)
    formControl.reset(defaultValues)
  }

  return (
    <>
      <Button variant="contained" onClick={() => setDrawerVisible(true)} startIcon={<PlaylistAdd />}>
        {buttonText}
      </Button>

      <CippOffCanvas
        title="New SOC case"
        visible={drawerVisible}
        onClose={handleCloseDrawer}
        size="md"
        footer={
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-start' }}>
            <Button
              variant="contained"
              color="primary"
              onClick={handleSubmit}
              disabled={createCase.isPending || !isValid}
            >
              {createCase.isPending
                ? 'Creating...'
                : createCase.isSuccess
                  ? 'Create another'
                  : 'Create case'}
            </Button>
            <Button variant="outlined" onClick={handleCloseDrawer}>
              Close
            </Button>
          </div>
        }
      >
        <Grid container spacing={2}>
          <Grid size={{ xs: 12 }}>
            <CippFormTenantSelector
              formControl={formControl}
              label="Tenant"
              name="tenantFilter"
              type="single"
              allTenants={false}
              validators={{ required: 'A tenant is required' }}
            />
          </Grid>

          <Divider sx={{ my: 1, width: '100%' }} />

          <Grid size={{ xs: 12 }}>
            <CippFormComponent
              type="autoComplete"
              name="type"
              label="Alert type"
              formControl={formControl}
              multiple={false}
              creatable={false}
              options={PSIT_SOC_TYPE_OPTIONS}
              validators={{ required: 'The alert type is required' }}
            />
          </Grid>

          <Grid size={{ xs: 12 }}>
            <CippFormComponent
              type="textField"
              name="title"
              label="Title"
              formControl={formControl}
              validators={{ required: 'A title is required' }}
              helperText="What the notification says, in one line"
            />
          </Grid>

          <Grid size={{ md: 6, xs: 12 }}>
            <CippFormComponent
              type="autoComplete"
              name="severity"
              label={`Severity${catalogueEntry ? ` (default ${catalogueEntry.severity})` : ''}`}
              formControl={formControl}
              multiple={false}
              creatable={false}
              options={PSIT_SOC_SEVERITIES.map((severity) => ({
                value: severity,
                label: severity,
              }))}
            />
          </Grid>

          <Grid size={{ md: 6, xs: 12 }}>
            <CippFormComponent
              type="textField"
              name="externalRef"
              label="External reference"
              formControl={formControl}
              helperText="The alert number stated by the source"
            />
          </Grid>

          <Grid size={{ md: 6, xs: 12 }}>
            <CippFormComponent
              type="textField"
              name="ticketRef"
              label="Ticket reference"
              formControl={formControl}
            />
          </Grid>

          <Grid size={{ md: 6, xs: 12 }}>
            <CippFormComponent
              type="textField"
              name="upn"
              label="Affected user (UPN)"
              formControl={formControl}
            />
          </Grid>

          <Grid size={{ xs: 12 }}>
            <CippApiResults apiObject={createCase} />
          </Grid>
        </Grid>
      </CippOffCanvas>
    </>
  )
}
