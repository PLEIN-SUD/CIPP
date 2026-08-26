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
 * Every machine the tenant's two managers know, from the merged PSIT list: Intune enrolls,
 * Defender onboards, and reading Intune alone made MDE-only machines unselectable, and therefore
 * uninvestigable, from this portal. The label carries who manages the machine because that
 * decides what works on it: Intune readings need Intune, isolation needs Defender.
 *
 * The value is the device name, the one field every row has. The identifiers each world needs
 * travel as added fields. Creatable, as the last resort for a machine neither world knows: the
 * case is then a work record, investigated outside the portal.
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
      creatable={true}
      api={{
        tenantFilter: tenant,
        url: '/api/PSITListSocDevices',
        dataKey: 'Results',
        labelField: (option) =>
          `${option.DeviceName} — ${option.ManagedBy}${
            option.UserPrincipalName ? ` (${option.UserPrincipalName})` : ''
          }`,
        valueField: 'DeviceName',
        addedField: {
          intuneId: 'IntuneId',
          azureADDeviceId: 'AzureADDeviceId',
          managedBy: 'ManagedBy',
        },
        queryKey: `PSITSocDevices-${tenant}`,
        data: {},
      }}
      {...other}
    />
  )
}
