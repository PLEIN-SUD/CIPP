import { Layout as DashboardLayout } from '../../../../layouts/index.js'
import CippFormComponent from '../../../../components/CippComponents/CippFormComponent'
import { PsitSocInvestigatePage } from '../../../../components/psit/soc/PsitSocInvestigatePage'
import { PsitSocMailContext } from '../../../../components/psit/soc/PsitSocMailContext'

/**
 * Directed consultation of a delivered message: sender, verdict, and where each copy sits. No
 * picker exists for messages - the identifier comes from the alert or from Threat Explorer - so
 * the entry is the identifier itself, pasted.
 */
const Page = () => (
  <PsitSocInvestigatePage
    title="Investigation message"
    intro="Coller l’identifiant réseau du message (networkMessageId, un GUID, fourni par l’alerte ou Threat Explorer). L’heure de réception resserre la fenêtre de recherche Defender."
    hasTarget={(query) => Boolean(query.tenantFilter && query.networkMessageId)}
    buildQuery={(q) => {
      if (!q?.tenantFilter || !q?.networkMessageId) return null
      return {
        entities: { networkMessageId: q.networkMessageId, receivedUtc: q.receivedUtc },
        params: {
          tenantFilter: q.tenantFilter,
          networkMessageId: q.networkMessageId,
          ...(q.receivedUtc ? { receivedUtc: q.receivedUtc } : {}),
        },
      }
    }}
    pickerFields={(formControl) => (
      <>
        <CippFormComponent
          type="textField"
          formControl={formControl}
          name="networkMessageId"
          label="Identifiant réseau du message"
        />
        <CippFormComponent
          type="textField"
          formControl={formControl}
          name="receivedUtc"
          label="Heure de réception (optionnelle, ex. 2026-08-26T09:00:00Z)"
        />
      </>
    )}
    renderPanel={(pseudoCase) => <PsitSocMailContext socCase={pseudoCase} />}
    buildCase={(query) => ({
      Source: 'manual',
      // Type 18 is the catalogue's delivered-mail entry (incomplete ZAP), which is what a
      // delivered message worth a case is.
      TypeId: 18,
      Title: `Message : ${query.networkMessageId}`,
      Entities: { networkMessageId: query.networkMessageId, receivedUtc: query.receivedUtc },
      ExternalRef: `INV:MSG:${query.tenantFilter}:${query.networkMessageId}`,
      LogAction: {
        Action: 'investigation-import',
        Detail: `Dossier ouvert depuis l'investigation du message ${query.networkMessageId}.`,
      },
    })}
  />
)

Page.getLayout = (page) => <DashboardLayout>{page}</DashboardLayout>

export default Page
