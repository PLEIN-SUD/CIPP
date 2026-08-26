import { useState } from 'react'
import { Button, Divider } from '@mui/material'
import { Grid } from '@mui/system'
import { useForm, useFormState, useWatch } from 'react-hook-form'
import { PlaylistAdd } from '@mui/icons-material'
import { CippOffCanvas } from '../../CippComponents/CippOffCanvas'
import CippFormComponent from '../../CippComponents/CippFormComponent'
import { CippFormTenantSelector } from '../../CippComponents/CippFormTenantSelector'
import { CippFormUserSelector } from '../../CippComponents/CippFormUserSelector'
import { CippApiResults } from '../../CippComponents/CippApiResults'
import { ApiPostCall } from '../../../api/ApiCall'
import { PsitSocAppSelector, PsitSocDeviceSelector } from './PsitSocEntitySelectors'
import {
  PSIT_SOC_SEVERITIES,
  PSIT_SOC_TYPE_OPTIONS,
  psitSocTypeById,
  psitSocTypeEntities,
} from '../../../utils/psit-soc-types'

const defaultValues = {
  tenantFilter: null,
  type: null,
  title: '',
  severity: null,
  externalRef: '',
  ticketRef: '',
  user: null,
  app: null,
  device: null,
  networkMessageId: '',
}

/**
 * Quick entry of a SOC case: the path an alert takes when it arrives as an external SOC
 * notification rather than through the Defender feed. The analyst pastes the reference, picks the
 * type and the tenant, and the case exists - the investigation happens on the case, not in the
 * drawer.
 *
 * The entity fields follow the type, from the catalogue: a consent case asks for an application
 * picked from the tenant, a machine case for a machine, an identity case for a user. Asking for
 * an identifier the analyst would have to go and look up first is how a triage tool becomes a
 * second job.
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
  const wantedEntities = psitSocTypeEntities(selectedType?.value)

  const createCase = ApiPostCall({ relatedQueryKeys })

  const handleSubmit = formControl.handleSubmit((values) => {
    const entry = psitSocTypeById(values.type?.value)
    const kinds = psitSocTypeEntities(values.type?.value)

    // Only the entities this type actually investigates are recorded: a leftover value from a
    // type the analyst changed their mind about would send the case view looking for evidence
    // that has nothing to do with it.
    const entities = {}
    if (kinds.includes('user') && values.user?.value) {
      entities.userId = values.user.value
      entities.upn = values.user.addedFields?.userPrincipalName ?? values.user.label
    }
    if (kinds.includes('app') && values.app?.value) {
      entities.appId = values.app.value
      entities.appDisplayName = values.app.addedFields?.appDisplayName ?? values.app.label
    }
    if (kinds.includes('device') && values.device?.value) {
      // The selector's value is the device name since the merged list took over: an MDE-only
      // machine has no Intune id to be worth being keyed by. Each world's identifier travels
      // when it exists; a typed name carries none, and the case is then a work record.
      entities.deviceName = values.device.value
      if (values.device.addedFields?.intuneId) entities.deviceId = values.device.addedFields.intuneId
      if (values.device.addedFields?.azureADDeviceId) {
        entities.azureADDeviceId = values.device.addedFields.azureADDeviceId
      }
      if (values.device.addedFields?.managedBy) entities.managedBy = values.device.addedFields.managedBy
    }
    if (kinds.includes('mail') && values.networkMessageId) {
      entities.networkMessageId = values.networkMessageId.trim()
    }

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
        ...(Object.keys(entities).length > 0 ? { Entities: entities } : {}),
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

          {/* The entity pickers appear once the type says what the case is about, which is also
              what tells the analyst what this type investigates. */}
          {wantedEntities.includes('user') && (
            <Grid size={{ xs: 12 }}>
              <CippFormUserSelector
                formControl={formControl}
                name="user"
                label="Utilisateur concerné"
                multiple={false}
                select="id,userPrincipalName,displayName"
                addedField={{ userPrincipalName: 'userPrincipalName' }}
              />
            </Grid>
          )}
          {wantedEntities.includes('app') && (
            <Grid size={{ xs: 12 }}>
              <PsitSocAppSelector
                formControl={formControl}
                name="app"
                label="Application concernée"
              />
            </Grid>
          )}
          {wantedEntities.includes('device') && (
            <Grid size={{ xs: 12 }}>
              <PsitSocDeviceSelector
                formControl={formControl}
                name="device"
                label="Machine concernée"
              />
            </Grid>
          )}
          {wantedEntities.includes('mail') && (
            <Grid size={{ xs: 12 }}>
              <CippFormComponent
                type="textField"
                name="networkMessageId"
                label="Identifiant de message"
                formControl={formControl}
                helperText="networkMessageId, tel que l’alerte le donne"
              />
            </Grid>
          )}

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

          <Grid size={{ xs: 12 }}>
            <CippApiResults apiObject={createCase} />
          </Grid>
        </Grid>
      </CippOffCanvas>
    </>
  )
}
