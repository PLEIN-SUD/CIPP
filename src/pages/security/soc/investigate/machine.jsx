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
    intro="Choisir la machine à examiner. Son état de protection et sa dernière remontée s’affichent sans créer de cas."
    hasTarget={(query) => Boolean(query.tenantFilter && query.deviceId)}
    buildQuery={(q) => {
      if (!q?.tenantFilter || !q?.deviceId) return null
      return {
        entities: { deviceId: q.deviceId, deviceName: q.deviceDisplayName },
        params: {
          tenantFilter: q.tenantFilter,
          deviceId: q.deviceId,
          ...(q.deviceDisplayName ? { deviceDisplayName: q.deviceDisplayName } : {}),
        },
      }
    }}
    pickerFields={(formControl) => (
      <PsitSocDeviceSelector formControl={formControl} name="deviceId" label="Machine" />
    )}
    renderPanel={(pseudoCase) => <PsitSocDeviceContext socCase={pseudoCase} />}
    buildCase={(query) => ({
      Source: 'manual',
      // Type 9 is the catalogue's unmitigated-endpoint-threat entry, the closest to a machine
      // worth a case. Corrected on the case if it came in another way.
      TypeId: 9,
      Title: `Machine : ${query.deviceDisplayName || query.deviceId}`,
      Entities: { deviceId: query.deviceId, deviceName: query.deviceDisplayName },
      ExternalRef: `INV:DEV:${query.tenantFilter}:${query.deviceId}`,
      LogAction: {
        Action: 'investigation-import',
        Detail: `Cas ouvert depuis l'investigation de la machine ${query.deviceDisplayName || query.deviceId}.`,
      },
    })}
  />
)

Page.getLayout = (page) => <DashboardLayout>{page}</DashboardLayout>

export default Page
