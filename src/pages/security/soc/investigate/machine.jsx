import { Layout as DashboardLayout } from '../../../../layouts/index.js'
import { PsitSocInvestigatePage } from '../../../../components/psit/soc/PsitSocInvestigatePage'
import { PsitSocDeviceSelector } from '../../../../components/psit/soc/PsitSocEntitySelectors'
import { PsitSocDeviceContext } from '../../../../components/psit/soc/PsitSocDeviceContext'

/**
 * Directed consultation of a machine: protection state, compliance, last report, encryption.
 * Same panel as the case view, without the case: how long a machine has been silent is a
 * question that does not wait for an incident.
 */
const Page = () => (
  <PsitSocInvestigatePage
    title="Investigation machine"
    intro="Choisir la machine à examiner. Son état de protection et sa dernière remontée s’affichent sans créer de dossier."
    hasTarget={(query) => Boolean(query.tenantFilter && query.deviceName)}
    buildQuery={(q) => {
      if (!q?.tenantFilter || !q?.deviceName) return null
      return {
        entities: {
          deviceName: q.deviceName,
          deviceId: q.intuneId,
          azureADDeviceId: q.azureADDeviceId,
          managedBy: q.managedBy,
        },
        params: {
          tenantFilter: q.tenantFilter,
          deviceName: q.deviceName,
          ...(q.intuneId ? { intuneId: q.intuneId } : {}),
          ...(q.azureADDeviceId ? { azureADDeviceId: q.azureADDeviceId } : {}),
          ...(q.managedBy ? { managedBy: q.managedBy } : {}),
        },
      }
    }}
    pickerFields={(formControl) => (
      <PsitSocDeviceSelector formControl={formControl} name="deviceName" label="Machine (saisir un nom si elle n'est dans aucune liste)" />
    )}
    renderPanel={(pseudoCase) => <PsitSocDeviceContext socCase={pseudoCase} />}
    buildCase={(query) => ({
      Source: 'manual',
      // Type 9 is the catalogue's unmitigated-endpoint-threat entry, the closest to a machine
      // worth a case. Corrected on the case if it came in another way.
      TypeId: 9,
      Title: `Machine : ${query.deviceName}`,
      Entities: {
        deviceName: query.deviceName,
        deviceId: query.intuneId,
        azureADDeviceId: query.azureADDeviceId,
        managedBy: query.managedBy,
      },
      ExternalRef: `INV:DEV:${query.tenantFilter}:${query.deviceName}`,
      LogAction: {
        Action: 'investigation-import',
        Detail: `Dossier ouvert depuis l'investigation de la machine ${query.deviceName}.`,
      },
    })}
  />
)

Page.getLayout = (page) => <DashboardLayout>{page}</DashboardLayout>

export default Page
