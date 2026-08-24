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
export const PsitSocCaseDrawer = ({ buttonText = 'Nouveau cas', relatedQueryKeys = [] }) => {
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
        title="Nouveau cas SOC"
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
                ? 'Création...'
                : createCase.isSuccess
                  ? 'Créer un autre'
                  : 'Créer le cas'}
            </Button>
            <Button variant="outlined" onClick={handleCloseDrawer}>
              Fermer
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
              validators={{ required: 'Le tenant est requis' }}
            />
          </Grid>

          <Divider sx={{ my: 1, width: '100%' }} />

          <Grid size={{ xs: 12 }}>
            <CippFormComponent
              type="autoComplete"
              name="type"
              label="Type d’alerte"
              formControl={formControl}
              multiple={false}
              creatable={false}
              options={PSIT_SOC_TYPE_OPTIONS}
              validators={{ required: 'Le type d’alerte est requis' }}
            />
          </Grid>

          <Grid size={{ xs: 12 }}>
            <CippFormComponent
              type="textField"
              name="title"
              label="Titre"
              formControl={formControl}
              validators={{ required: 'Le titre est requis' }}
              helperText="Ce que dit la notification, en une ligne"
            />
          </Grid>

          <Grid size={{ md: 6, xs: 12 }}>
            <CippFormComponent
              type="autoComplete"
              name="severity"
              label={`Criticité${catalogueEntry ? ` (défaut ${catalogueEntry.severity})` : ''}`}
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
              label="Référence externe"
              formControl={formControl}
              helperText="Le numéro d’alerte indiqué par la source"
            />
          </Grid>

          <Grid size={{ md: 6, xs: 12 }}>
            <CippFormComponent
              type="textField"
              name="ticketRef"
              label="Référence ticket"
              formControl={formControl}
            />
          </Grid>

          <Grid size={{ md: 6, xs: 12 }}>
            <CippFormComponent
              type="textField"
              name="upn"
              label="Utilisateur concerné (UPN)"
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
