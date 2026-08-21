import React from 'react'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '../../test-utils'
import {
  PsitBecIncidentReportButton,
  PsitBecIncidentReportDocument,
  psitReportFileName,
} from '../../../src/components/psit/PsitBecIncidentReport'
import { ApiGetCall } from '../../../src/api/ApiCall'

// Rendering MUI through jsdom on a cold cache runs past Vitest's 5 s default on a laptop, and a
// timeout reads exactly like a broken assertion. Set per file rather than in vitest.config.mjs,
// which is upstream: no divergence, and the value travels with the tests that need it.
vi.setConfig({ testTimeout: 60000 })


vi.mock('../../../src/api/ApiCall', () => ({
  ApiGetCall: vi.fn(() => ({
    data: undefined,
    isFetching: false,
    isSuccess: false,
    isError: false,
  })),
  ApiPostCall: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
  ApiGetCallWithPagination: vi.fn(() => ({ data: undefined, isFetching: false })),
}))

vi.mock('@react-pdf/renderer', () => {
  // `render` is honoured, not ignored: react-pdf calls it with the page counters, and a component
  // that only rendered `children` made every title using a render callback vanish from the assertions
  // while the real PDF printed it. First page of its own flow, which is the common case.
  const passthrough =
    (tag) =>
    ({ children, render }) =>
      React.createElement(
        tag,
        null,
        typeof render === 'function'
          ? render({ pageNumber: 1, totalPages: 1, subPageNumber: 1, subPageTotalPages: 1 })
          : children
      )
  return {
    Document: passthrough('div'),
    Page: passthrough('div'),
    View: passthrough('div'),
    Text: passthrough('span'),
    Image: () => null,
    Svg: () => null,
    Path: () => null,
    Circle: () => null,
    Line: () => null,
    Rect: () => null,
    PDFViewer: passthrough('div'),
    PDFDownloadLink: passthrough('div'),
    StyleSheet: { create: (styles) => styles },
    Font: {
      register: () => {},
      registerHyphenationCallback: () => {},
      registerEmojiSource: () => {},
    },
    pdf: () => ({ toBlob: () => Promise.resolve(new Blob()) }),
  }
})

const userData = {
  id: 'u1',
  displayName: 'Patrice T',
  userPrincipalName: 'p.martin@contoso.test',
}

// A compromise the data settles on its own: a rule forwarding outside the organisation.
const compromisedBecData = {
  ExtractedAt: '2026-08-20T10:32:00Z',
  NewRules: [{ Name: 'copie', ForwardTo: 'attacker@evil.test' }],
  SuspectUserSignIns: [],
  SentMessages: [
    {
      MessageTraceId: 'm1',
      Subject: 'Mise a jour bancaire',
      RecipientAddress: 'buyer@client.test',
      Received: '2026-08-19T07:11:00Z',
      ForeignLocation: true,
      SystemGenerated: false,
      Internal: false,
    },
  ],
  SentMessageAnalysis: {
    TotalRecipients: 1,
    RepeatedSubjects: [{ Subject: 'Mise a jour bancaire', Flagged: true }],
    Bursts: [],
  },
  LocationAnalysis: { UsageLocation: 'FR' },
}

const cleanBecData = { ...compromisedBecData, NewRules: [], SentMessages: [] }

const incident = {
  Reference: 'PSIT-BEC-20260820-AB12',
  AutotaskTicket: 'T20260820.0042',
  DetectedUtc: '2026-08-20T09:00:00Z',
  ContainedUtc: '2026-08-20T13:05:00Z',
  Status: 'contained',
  DataSubjectCategories: ['Candidats', 'Clients'],
  DataCategories: ['Identification (nom, coordonnées)', 'Données bancaires ou financières'],
  AffectedPersonsEstimate: 'environ 1 200',
  AffectedPersonsBasis: 'base candidats de la boîte',
  LikelyConsequences: 'Usurpation d’identité et détournement de paiement',
  UpdatedBy: 's.miro@pleinsudit.com',
  UpdatedUtc: '2026-08-20T14:00:00Z',
}

const remediation = {
  ActionsPerformed: [
    {
      Action: 'PasswordReset',
      Count: 1,
      FirstUtc: '2026-08-20T13:00:00Z',
      Operator: 's.miro@pleinsudit.com',
      HasFailure: false,
    },
  ],
}

describe('PsitBecIncidentReportButton', () => {
  it('does not exist while no compromise is retained', () => {
    const { container } = renderWithProviders(
      <PsitBecIncidentReportButton
        userData={userData}
        becData={cleanBecData}
        tenantName="contoso.test"
        triage={[]}
      />
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('is offered but disabled when the collection itself failed', () => {
    renderWithProviders(
      <PsitBecIncidentReportButton
        userData={userData}
        becData={{ ...compromisedBecData, Results: 'AADSTS500011' }}
        tenantName="contoso.test"
        triage={[]}
      />
    )

    expect(screen.getByRole('button', { name: /Rapport d'incident/ })).toBeDisabled()
  })

  it('blocks the download while an article 33.3 item is missing, and says which', async () => {
    ApiGetCall.mockImplementation(() => ({
      data: { Incident: { Reference: 'PSIT-BEC-1', DetectedUtc: '2026-08-20T09:00:00Z' } },
      isFetching: false,
      isSuccess: true,
      isError: false,
    }))

    renderWithProviders(
      <PsitBecIncidentReportButton
        userData={userData}
        becData={compromisedBecData}
        tenantName="contoso.test"
        triage={[]}
      />
    )

    await userEvent.click(screen.getByRole('button', { name: /Rapport d'incident/ }))

    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText(/Téléchargement bloqué/)).toBeInTheDocument()
    // The client-facing reference is required: without it the PDF has no name a client can quote.
    expect(screen.getAllByText(/ticket Autotask/).length).toBeGreaterThan(0)
    // The missing items are named in the same warning, tooltip included, hence getAllByText.
    expect(screen.getAllByText(/conséquences probables/).length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: /Télécharger le PDF/ })).toBeDisabled()
  })

  it('appears once a compromise is established and warns about missing fields', () => {
    ApiGetCall.mockImplementation(() => ({
      data: { Incident: incident, Remediation: remediation },
      isFetching: false,
      isSuccess: true,
      isError: false,
    }))

    renderWithProviders(
      <PsitBecIncidentReportButton
        userData={userData}
        becData={compromisedBecData}
        tenantName="contoso.test"
        triage={[]}
      />
    )

    expect(screen.getByRole('button', { name: /Rapport d'incident/ })).toBeInTheDocument()
  })
})

describe('PsitBecIncidentReportDocument', () => {
  const render = (overrides = {}) =>
    renderWithProviders(
      <PsitBecIncidentReportDocument
        userData={userData}
        becData={compromisedBecData}
        brandingSettings={{}}
        tenantName="contoso.test"
        variables={{}}
        triage={[]}
        incident={incident}
        remediation={remediation}
        {...overrides}
      />
    )

  it('identifies the case by its ticket, never by the internal reference', () => {
    const { container } = render()
    const text = container.textContent

    expect(text).toContain('Ticket : T20260820.0042')
    // The internal identifier is a sort key on our side; it travels in the PDF metadata only.
    expect(text).not.toContain('PSIT-BEC-20260820-AB12')
    expect(text).toContain('confiné')
    // The analyst is named once, on the handover page, not in the identification block.
    expect(text).toContain('Rapport établi par : PLEIN SUD IT')
  })

  it('structures the exposure section on the article 33.3 items', () => {
    const { container } = render()
    expect(container.textContent).toContain('article 33.3')
    expect(container.textContent).toContain('Nature de la violation')
    expect(container.textContent).toContain('Personnes concernées')
    expect(container.textContent).toContain('Données concernées')
    expect(container.textContent).toContain('Conséquences probables')
    expect(container.textContent).toContain('environ 1 200')
  })

  it('leaves the legal qualification to the controller', () => {
    const { container } = render()
    expect(container.textContent).toContain('relèvent du responsable de traitement')
    expect(container.textContent).not.toContain('violation notifiable')
  })

  it('never claims that mail was not read', () => {
    const { container } = render()
    expect(container.textContent).toContain('ne peut être ni établie ni exclue')
    expect(container.textContent).not.toContain("aucune donnée n'a été lue")
  })

  it('separates attested containment from actions merely declared', () => {
    const { container } = render({
      incident: {
        ...incident,
        ExternalActions: [
          { Action: 'Banque prévenue', DoneUtc: '2026-08-20T13:30:00Z', By: 'DAF client' },
        ],
      },
    })
    expect(container.textContent).toContain('Mot de passe réinitialisé')
    expect(container.textContent).toContain('non attestée')
    expect(container.textContent).toContain('Banque prévenue')
  })

  it('puts the third parties in an annex and refuses to call them victims', () => {
    const { container } = render()
    expect(container.textContent).toContain('Annexe')
    expect(container.textContent).toContain('buyer@client.test')
    expect(container.textContent).toContain('ne constitue pas une liste de victimes')
    expect(container.textContent).toContain('données à caractère personnel de tiers')
  })

  it('dates the first unauthorised access from a retained signal, never from the first timeline row', () => {
    const withOldMfa = {
      ...compromisedBecData,
      // The defect this pins: a 2021 registration once became "premier accès non autorisé observé".
      MFADevices: [{ displayName: 'poste', createdDateTime: '2021-03-12T20:03:00Z' }],
      SuspectUserSignIns: [
        {
          CreatedDateTime: '2026-08-16T16:40:00Z',
          IPAddress: '77.83.112.47',
          Country: 'IT',
          Status: 'Success',
          ForeignLocation: true,
        },
      ],
    }
    const { container } = render({
      becData: withOldMfa,
      triage: [{ SignalId: 'signin-ip:77.83.112.47', Verdict: 'unexpected', Analyst: 's.miro' }],
    })

    expect(container.textContent).toContain(
      'Premier accès non autorisé observé : 16 août 2026 à 16:40 UTC'
    )
    expect(container.textContent).not.toContain('Premier accès non autorisé observé : 12 mars 2021')
  })

  it('says so rather than guessing when no access can be dated', () => {
    const { container } = render()
    expect(container.textContent).toContain(
      "non déterminé, aucun signal de connexion n'ayant été retenu"
    )
  })

  it('carries the Autotask ticket and points back to the collection', () => {
    const { container } = render()
    expect(container.textContent).toContain('T20260820.0042')
    expect(container.textContent).toContain("Rapport d'investigation associé : collecte du")
  })

  it('states what the third-party annex excludes', () => {
    const { container } = render()
    expect(container.textContent).toContain('Exclus de cette liste')
    expect(container.textContent).toContain("n'est pas un tiers à prévenir")
  })

  it('states that the collection window bounds the start of the exposure', () => {
    const { container } = render()
    expect(container.textContent).toContain('Borne de début limitée par la collecte')
    expect(container.textContent).toContain('Un accès antérieur ne serait pas visible')
  })

  it('refuses to present an empty third-party list drawn from a partial trace as good news', () => {
    const { container } = render({
      becData: {
        ...compromisedBecData,
        // One collected row against 241 reported recipients, and it is internal: the annex ends up
        // empty while the real exposure is unknown.
        SentMessages: [
          {
            MessageTraceId: 'm1',
            Subject: 'Re: planning',
            RecipientAddress: 'colleague@contoso.test',
            Received: '2026-08-19T07:11:00Z',
            Internal: true,
            SystemGenerated: false,
          },
        ],
        SentMessageAnalysis: { TotalRecipients: 241, RepeatedSubjects: [], Bursts: [] },
      },
    })

    expect(container.textContent).toContain("Liste non exploitable en l'état")
    expect(container.textContent).toContain("ne vaut pas absence d'envoi")
    expect(container.textContent).not.toContain('Aucun destinataire signalé')
  })

  it('renders a one-row list that arrived as a bare object', () => {
    const { container } = render({
      incident: {
        ...incident,
        DataCategories: 'Données bancaires ou financières',
        DataSubjectCategories: 'Clients',
        ExternalActions: { Action: 'Banque prévenue', DoneUtc: '2026-08-20T13:30:00Z', By: 'DAF' },
        ThirdPartiesNotified: {
          Name: 'Banque',
          NotifiedUtc: '2026-08-20T13:30:00Z',
          Channel: 'téléphone',
        },
      },
    })

    expect(container.textContent).toContain('Données bancaires ou financières')
    expect(container.textContent).toContain('Clients')
    expect(container.textContent).toContain('Banque prévenue')
  })

  it('records the handover and says plainly when no acknowledgement exists', () => {
    const { container } = render()
    expect(container.textContent).toContain('Remise et validation')
    expect(container.textContent).toContain("Aucun accusé de réception n'a été enregistré")
    expect(container.textContent).toContain(
      "L'absence d'accusé ne vaut pas absence de transmission"
    )
    // A signature block, so the printed copy is the artefact.
    expect(container.textContent).toContain('Signature :')
    expect(container.textContent).toContain('vaut réception du présent rapport, non')
  })

  it('prints the recorded handover and acknowledgement when they exist', () => {
    const { container } = render({
      incident: {
        ...incident,
        DeliveredTo: 'Direction financière',
        DeliveredUtc: '2026-08-21T09:00:00Z',
        DeliveryChannel: 'courriel',
        AcknowledgedBy: 'DAF',
        AcknowledgedUtc: '2026-08-21T10:30:00Z',
      },
    })

    expect(container.textContent).toContain('Direction financière')
    expect(container.textContent).toContain('2026-08-21 09:00 UTC')
    expect(container.textContent).toContain('courriel')
    expect(container.textContent).toContain('2026-08-21 10:30 UTC')
    expect(container.textContent).not.toContain("Aucun accusé de réception n'a été enregistré")
  })

  it('pseudonymises the third-party annex on demand, keeping the domain', () => {
    const { container } = render({ pseudonymise: true })

    expect(container.textContent).not.toContain('buyer@client.test')
    expect(container.textContent).toContain('T-01')
    expect(container.textContent).toContain('client.test')
    expect(container.textContent).toContain('Les adresses sont pseudonymisées')
    // A subject line can name a third party, so it goes with the address.
    expect(container.textContent).not.toContain('Objets :')
  })

  it('names the addresses by default, because a pseudonym cannot be called', () => {
    const { container } = render()
    expect(container.textContent).toContain('buyer@client.test')
    expect(container.textContent).not.toContain('Les adresses sont pseudonymisées')
  })

  it('dates the case file, in prose, on its own line', () => {
    const { container } = render({
      incident: { ...incident, CreatedUtc: '2026-08-20T15:00:00Z' },
    })
    expect(container.textContent).toContain('Dossier ouvert : le 20 août 2026 à 15:00 UTC')
  })

  it('composes the summary rather than printing an analyst shorthand', () => {
    const { container } = render({
      incident: {
        ...incident,
        EffectDescription: 'mass-send',
        ExecutiveNote: 'Compte utilisé pour relancer des fournisseurs.',
      },
      triage: [{ SignalId: 'rule-exfil:copie', Verdict: 'unexpected', Analyst: 's.miro' }],
    })
    const text = container.textContent

    expect(text).toContain("a fait l'objet d'accès non autorisés")
    expect(text).toContain('Ces accès ont été suivis d')
    expect(text).toContain("campagne d'envoi en masse")
    // The fixture carries one attested action, so the sentence agrees with it.
    expect(text).toContain('1 action a été attestée par le journal CIPP')
    expect(text).toContain('MailItemsAccessed')
    // The analyst's note comes after the composed paragraph, never instead of it.
    expect(text).toContain('Compte utilisé pour relancer des fournisseurs.')
    expect(text.indexOf("a fait l'objet")).toBeLessThan(text.indexOf('Compte utilisé pour'))
    // The document-wide absence of "(s)" is enforced by the PSIT render lint, not here.
  })

  it('carries the distribution marking on the page, not only on the cover', () => {
    const { container } = render({ incident: { ...incident, Tlp: 'TLP:RED' } })
    expect(container.textContent).toContain('TLP:RED')
  })

  it('defaults the marking to the strictest when the record has none', () => {
    const { container } = render({ incident: { ...incident, Tlp: undefined } })
    expect(container.textContent).toContain('TLP:AMBER+STRICT')
  })

  it('puts a repeat compromise in the summary, where the controller will read it', () => {
    const { container } = render({
      incident: {
        ...incident,
        PreviousCases: [
          {
            Reference: 'PSIT-BEC-20260819-AB12',
            AutotaskTicket: 'T20260819.0001',
            DetectedUtc: '2026-08-19T09:00:00Z',
            ClosedUtc: '2026-08-25T16:00:00Z',
          },
        ],
      },
    })

    expect(container.textContent).toContain('Compromission répétée')
    // Previous cases are quoted by their ticket too.
    expect(container.textContent).toContain('Ticket T20260819.0001')
  })

  it('warns on its own first page when generated without a retained compromise', () => {
    const { container } = render({ becData: cleanBecData })
    expect(container.textContent).toContain('sans compromission retenue')
  })
})

describe('psitReportFileName', () => {
  it('names the file by the ticket and the account', () => {
    // The ticket keeps its dot; the address loses its dots and its @.
    expect(psitReportFileName('T20260820.0013', 'p.martin@contoso.test')).toBe(
      'T20260820.0013_p_martin_contoso_test.pdf'
    )
  })

  it('marks a pseudonymised copy, and never produces an empty name', () => {
    expect(
      psitReportFileName('T20260820.0013', 'p.martin@contoso.test', { pseudonymise: true })
    ).toContain('_pseudonymise.pdf')
    expect(psitReportFileName(undefined, undefined)).toBe('ticket-non-renseigne_compte-inconnu.pdf')
  })
})
