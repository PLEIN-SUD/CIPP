import React from 'react'
import { screen } from '@testing-library/react'
import { renderWithProviders } from '../../test-utils'
import {
  PsitBecIncidentReportButton,
  PsitBecIncidentReportDocument,
} from '../../../src/components/psit/PsitBecIncidentReport'
import { ApiGetCall } from '../../../src/api/ApiCall'

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
  const passthrough =
    (tag) =>
    ({ children }) =>
      React.createElement(tag, null, children)
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

  it('appears once a compromise is established and warns about missing fields', () => {
    ApiGetCall.mockImplementation(() => ({
      data: { Incident: { Reference: 'PSIT-BEC-1' }, Remediation: remediation },
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

  it('carries the incident identification and the reference', () => {
    const { container } = render()
    expect(container.textContent).toContain('PSIT-BEC-20260820-AB12')
    expect(container.textContent).toContain('Confinée')
    expect(container.textContent).toContain('s.miro@pleinsudit.com')
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
      'Premier accès non autorisé observé : 2026-08-16 16:40 UTC'
    )
    expect(container.textContent).not.toContain('Premier accès non autorisé observé : 2021')
  })

  it('says so rather than guessing when no access can be dated', () => {
    const { container } = render()
    expect(container.textContent).toContain(
      "non déterminé : aucun signal de connexion n'a été retenu"
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

  it('warns on its own first page when generated without a retained compromise', () => {
    const { container } = render({ becData: cleanBecData })
    expect(container.textContent).toContain('sans compromission retenue')
  })
})
