import { describe, expect, it } from 'vitest'
import {
  psitSocExtsocInquiry,
  psitSocExtsocResponse,
  psitSocResponseVariants,
} from '../../src/utils/psit-soc-response'

// The reader's shape: Qualification nested, as PSITListSocCases returns it.
const baseCase = {
  CaseId: 'PSIT-SOC-20260831-AAAA',
  Tenant: 'client.test',
  TypeId: 2,
  TicketRef: 'T20260831.0012',
  Qualification: {
    Verdict: 'benign-true-positive',
    Justification: 'VPN personnel sur le mobile du titulaire, désinstallation demandée',
  },
}

describe('psitSocExtsocResponse', () => {
  it('a treated benign true positive asks to KEEP the detection', () => {
    // The whole point of the fourth verdict: a plain FP would teach the emitter to stop
    // flagging the pattern.
    const text = psitSocExtsocResponse(baseCase, 'benign-true-positive-treated')

    expect(text).toMatch(/pas de compromission/)
    expect(text).toMatch(/continuer à signaler ce motif/)
    expect(text).not.toMatch(/faux positif/i)
  })

  it('an authorized benign true positive asks for a scoped tuning, never a global one', () => {
    const text = psitSocExtsocResponse(baseCase, 'benign-true-positive-authorized')

    expect(text).toMatch(/ajuster la détection pour ce périmètre précis/)
    expect(text).toMatch(/sans la désactiver globalement/)
  })

  it('a false positive asks the emitter to fix the detection', () => {
    const text = psitSocExtsocResponse({
      ...baseCase,
      Qualification: { Verdict: 'false-positive', Justification: 'corrélation erronée' },
    })

    expect(text).toMatch(/Faux positif/)
    expect(text).toMatch(/réglage de cette détection/)
  })

  it('an undetermined dossier says the question stands instead of picking a side', () => {
    const text = psitSocExtsocResponse({
      ...baseCase,
      Qualification: { Verdict: 'undetermined', Justification: '' },
    })

    expect(text).toMatch(/ne permettent ni de/)
    expect(text).toMatch(/reste ouvert/)
  })

  it('carries the dossier reference, the ticket and the justification', () => {
    const text = psitSocExtsocResponse(baseCase)

    expect(text).toMatch(/PSIT-SOC-20260831-AAAA/)
    expect(text).toMatch(/T20260831\.0012/)
    expect(text).toMatch(/VPN personnel sur le mobile/)
  })

  it('refuses to answer for an unqualified dossier', () => {
    // A reply that concludes nothing teaches the emitter nothing: the inquiry exists for that.
    expect(psitSocExtsocResponse({ ...baseCase, Qualification: null })).toBeNull()
  })
})

describe('psitSocResponseVariants', () => {
  it('offers the two benign variants, because the same verdict calls for opposite requests', () => {
    const variants = psitSocResponseVariants(baseCase)
    expect(variants.map((choice) => choice.key)).toEqual([
      'benign-true-positive-treated',
      'benign-true-positive-authorized',
    ])
  })

  it('offers one variant for the other verdicts, none without a verdict', () => {
    expect(
      psitSocResponseVariants({ ...baseCase, Qualification: { Verdict: 'true-positive' } })
    ).toHaveLength(1)
    expect(psitSocResponseVariants({ ...baseCase, Qualification: null })).toEqual([])
  })
})

describe('psitSocExtsocInquiry', () => {
  it('drafts the request and says the dossier is on hold on our side', () => {
    const text = psitSocExtsocInquiry(baseCase, 'la liste des adresses source complète')

    expect(text).toMatch(/précisions suivantes/)
    expect(text).toMatch(/- la liste des adresses source complète/)
    expect(text).toMatch(/mis en attente de votre retour/)
  })

  it('leaves an explicit placeholder rather than an empty bullet', () => {
    expect(psitSocExtsocInquiry(baseCase)).toMatch(/préciser ici la donnée attendue/)
  })
})
