import { Layout as DashboardLayout } from '../../../../layouts/index.js'
import { PsitSocInvestigatePage } from '../../../../components/psit/soc/PsitSocInvestigatePage'
import { PsitSocAppSelector } from '../../../../components/psit/soc/PsitSocEntitySelectors'
import { PsitSocAppContext } from '../../../../components/psit/soc/PsitSocAppContext'

/**
 * Directed consultation of an application: scopes granted, publisher, first-seen date, presence
 * in the malicious catalogue. The evidence panel is the one the case view uses; the difference
 * is the door, since a strange consent is worth a look before any incident exists.
 */
const Page = () => (
  <PsitSocInvestigatePage
    title="Investigation application"
    intro="Choisir l’application à examiner. Les permissions accordées, l’éditeur et la présence au catalogue malveillant s’affichent sans créer de dossier."
    hasTarget={(query) => Boolean(query.tenantFilter && query.appId)}
    buildQuery={(q) => {
      if (!q?.tenantFilter || !q?.appId) return null
      return {
        entities: { appId: q.appId, appDisplayName: q.appDisplayName },
        params: {
          tenantFilter: q.tenantFilter,
          appId: q.appId,
          ...(q.appDisplayName ? { appDisplayName: q.appDisplayName } : {}),
        },
      }
    }}
    pickerFields={(formControl) => (
      <PsitSocAppSelector formControl={formControl} name="appId" label="Application" />
    )}
    renderPanel={(pseudoCase) => <PsitSocAppContext socCase={pseudoCase} />}
    buildCase={(query) => ({
      Source: 'manual',
      // Type 6 is the catalogue's OAuth consent entry, the closest to what an application
      // investigation establishes. Corrected on the case if it came in another way.
      TypeId: 6,
      Title: `Application : ${query.appDisplayName || query.appId}`,
      Entities: { appId: query.appId, appDisplayName: query.appDisplayName },
      ExternalRef: `INV:APP:${query.tenantFilter}:${query.appId}`,
      LogAction: {
        Action: 'investigation-import',
        Detail: `Dossier ouvert depuis l'investigation de l'application ${query.appDisplayName || query.appId}.`,
      },
    })}
  />
)

Page.getLayout = (page) => <DashboardLayout>{page}</DashboardLayout>

export default Page
