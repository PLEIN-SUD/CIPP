import { useWatch } from 'react-hook-form'
import CippFormComponent from '../../CippComponents/CippFormComponent'
import { useSettings } from '../../../hooks/use-settings'

// The entity pickers a SOC case needs, built on the same API-fed autocomplete as the upstream
// selectors (CippFormUserSelector is the model).
//
// Why they exist: an analyst opening a consent case knows the application by its name, never by
// its appId, and asking for the identifier turns "pick the app" into "go find the GUID first".
// The same holds for a machine. What the alert gives is a name; what the case needs is an
// identifier; resolving one into the other is the tool's job, not the analyst's.

/** The tenant the form is aimed at: the one picked in the drawer, or the one the page is on. */
const useSelectedTenant = (formControl) => {
  const selected = useWatch({ control: formControl.control, name: 'tenantFilter' })
  const currentTenant = useSettings().currentTenant
  return selected?.value ?? currentTenant
}

/**
 * Service principals of the tenant, labelled by display name and publisher so two applications
 * with similar names stay distinguishable. The value is the appId, which is what the case and the
 * revocation both work from.
 */
export const PsitSocAppSelector = ({ formControl, name, label, ...other }) => {
  const tenant = useSelectedTenant(formControl)

  return (
    <CippFormComponent
      name={name}
      label={label}
      type="autoComplete"
      formControl={formControl}
      multiple={false}
      creatable={false}
      api={{
        tenantFilter: tenant,
        url: '/api/ListGraphRequest',
        dataKey: 'Results',
        labelField: (option) =>
          option.publisherName
            ? `${option.displayName} (${option.publisherName})`
            : `${option.displayName}`,
        valueField: 'appId',
        // Carried alongside the value so the case can record the name the analyst actually saw,
        // not only the identifier.
        addedField: { appDisplayName: 'displayName', servicePrincipalId: 'id' },
        queryKey: `PSITSocApps-${tenant}`,
        data: {
          Endpoint: 'servicePrincipals',
          manualPagination: true,
          $select: 'id,appId,displayName,publisherName',
          $count: true,
          $orderby: 'displayName',
          $top: 999,
        },
      }}
      {...other}
    />
  )
}

/**
 * Intune managed devices, labelled by name and primary user: on a fleet where a dozen machines
 * are called PC-04x, the user is what tells them apart. The value is the managed device id, which
 * every device action takes.
 */
export const PsitSocDeviceSelector = ({ formControl, name, label, ...other }) => {
  const tenant = useSelectedTenant(formControl)

  return (
    <CippFormComponent
      name={name}
      label={label}
      type="autoComplete"
      formControl={formControl}
      multiple={false}
      creatable={false}
      api={{
        tenantFilter: tenant,
        url: '/api/ListGraphRequest',
        dataKey: 'Results',
        labelField: (option) =>
          option.userPrincipalName
            ? `${option.deviceName} (${option.userPrincipalName})`
            : `${option.deviceName}`,
        valueField: 'id',
        addedField: { deviceDisplayName: 'deviceName', azureADDeviceId: 'azureADDeviceId' },
        queryKey: `PSITSocDevices-${tenant}`,
        data: {
          Endpoint: 'deviceManagement/managedDevices',
          manualPagination: true,
          $select: 'id,deviceName,userPrincipalName,azureADDeviceId',
          $count: true,
          $orderby: 'deviceName',
          $top: 999,
        },
      }}
      {...other}
    />
  )
}
