import React from 'react'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '../../test-utils'
import {
  PsitBecReportFrButton,
  PsitBecReportFrDocument,
} from '../../../src/components/psit/PsitBecReportFr'

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

// jsdom cannot run the real pdf renderer; passthrough stubs let the document tree be asserted as
// plain DOM, which is how the upstream report tests do it. The trade-off is explicit: this proves
// the wording and the structure, never the rendered PDF.
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
    G: () => null,
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

const becData = {
  ExtractedAt: '2026-08-20T10:38:00Z',
  ExtractResult: 'Successfully extracted logs from auditlog',
  NewRules: [{ Name: 'classement', MoveToFolder: 'DOSSIERS' }],
  InboxRuleChanges: [],
  NewUsers: [],
  AddedApps: [],
  MaliciousSPs: [],
  MailboxPermissionChanges: [],
  // Registered years before the window: belongs to context, not to the chronology.
  MFADevices: [{ displayName: 'POSTE-EXEMPLE', createdDateTime: '2021-03-12T20:03:00Z' }],
  ChangedPasswords: [{ userPrincipalName: 'a.durand@contoso.test' }],
  SentMessages: [
    {
      Subject: 'Réponse automatique : absence',
      RecipientAddress: 'agnes@partner.test',
      FromIP: '2603:10a6:803:81::32',
      Received: '2026-08-20T10:13:07Z',
      ForeignLocation: true,
    },
    {
      Subject: 'Re: réunion projet',
      RecipientAddress: 'colleague@contoso.test',
      FromIP: '198.51.100.7',
      Received: '2026-08-20T10:07:48Z',
    },
    {
      Subject: 'Fwd: consultation',
      RecipientAddress: 'buyer@client.test',
      FromIP: '198.51.100.7',
      Received: '2026-08-20T10:03:08Z',
    },
  ],
  SentMessageAnalysis: {
    TotalMessages: 177,
    TotalRecipients: 241,
    Bursts: [],
    RepeatedSubjects: [],
  },
  TrustedSenders: Array.from({ length: 51 }, (_, index) => `trusted${index}@vendor.test`),
  BlockedSenders: Array.from({ length: 227 }, (_, index) => `spam${index}@spam.test`),
  SafelistChanges: [],
  SharingChanges: [],
  IntuneDevices: [],
  SuspectUserSignIns: [
    {
      CreatedDateTime: '2026-08-20T06:49:00Z',
      IPAddress: '203.0.113.42',
      Country: 'IT',
      City: 'Vérone',
      Status: 'Success',
      AppDisplayName: 'Microsoft Graph',
      ForeignLocation: true,
    },
    {
      CreatedDateTime: '2026-08-20T06:54:00Z',
      IPAddress: '203.0.113.42',
      Country: 'IT',
      City: 'Vérone',
      Status: 'Success',
      AppDisplayName: 'Office365 Shell WCSS-Server',
      ForeignLocation: true,
    },
    {
      CreatedDateTime: '2026-08-17T02:00:00Z',
      IPAddress: '203.0.113.7',
      Country: 'CN',
      Status: 'Failed',
      ForeignLocation: true,
    },
  ],
  LocationAnalysis: { UsageLocation: 'FR', SignInCountries: [] },
}

const render = (overrides = {}) =>
  renderWithProviders(
    <PsitBecReportFrDocument
      userData={userData}
      becData={becData}
      brandingSettings={{}}
      tenantName="contoso.test"
      variables={{}}
      triage={[]}
      {...overrides}
    />
  )

describe('PsitBecReportFrButton', () => {
  it('renders nothing until the BEC data is ready', () => {
    const { container } = renderWithProviders(
      <PsitBecReportFrButton
        userData={userData}
        becData={{ Waiting: true }}
        tenantName="contoso.test"
      />
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('refuses to produce a report from a cached collection failure', () => {
    renderWithProviders(
      <PsitBecReportFrButton
        userData={userData}
        becData={{ Results: 'AADSTS500011', ExtractedAt: '2026-08-20T10:00:00Z' }}
        tenantName="contoso.test"
      />
    )

    expect(screen.getByRole('button', { name: /Rapport FR/ })).toBeDisabled()
  })

  it('renders the French report button and opens the preview dialog', async () => {
    renderWithProviders(
      <PsitBecReportFrButton userData={userData} becData={becData} tenantName="contoso.test" />
    )

    // The MUI tooltip title becomes the accessible name, so it must contain the visible label
    // (WCAG 2.5.3). Asserting on /Rapport FR/ covers both.
    const button = screen.getByRole('button', { name: /Rapport FR/ })
    expect(button).toBeEnabled()
    expect(button).toHaveTextContent('Rapport FR')

    await userEvent.click(button)

    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText("Aperçu du rapport d'investigation")).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Fermer' })).toBeInTheDocument()
  })
})

describe('PsitBecReportFrDocument structure', () => {
  it('leads with the decision and pushes the eleven checks into an annex', () => {
    const { container } = render()
    const text = container.textContent

    expect(text).toContain("RAPPORT D'INVESTIGATION")
    expect(text).toContain('Décision')
    expect(text).toContain('Chronologie')
    expect(text).toContain('Faits et signaux')
    expect(text).toContain('Couverture et limites')
    expect(text).toContain('Annexe A : couverture des vérifications')
    expect(text).toContain('Annexe B')
    // The decision page comes before the annex, which is the whole point of the restructure.
    expect(text.indexOf('Décision')).toBeLessThan(text.indexOf('Annexe A'))
  })

  it('does not print the evidence twice: the decision page points at the findings', () => {
    const { container } = render({
      triage: [
        {
          SignalId: 'signin-ip:203.0.113.42',
          Verdict: 'unexpected',
          Analyst: 'analyste@example.test',
          DecidedUtc: '2026-08-20T13:02:00Z',
          Justification: "l'utilisateur n'est pas en Italie",
        },
      ],
    })
    const text = container.textContent

    expect(text).toContain('sont détaillés en section « Faits et signaux »')
    // The full form's own headings belong to the upstream English report, not to page 1 here.
    expect(text).not.toContain('Signaux établis par la donnée')
    expect(text).not.toContain('Qualifications enregistrées')
    // The analyst is not named in the body: the determination is carried by the firm, and the
    // nominative trail stays in the raw export.
    expect(text).not.toContain('analyste@example.test')
    expect(text).toContain("portée par l'analyste PLEIN SUD IT")
  })

  it('gives each open question the evidence needed to answer it', () => {
    const { container } = render()
    const text = container.textContent

    expect(text).toContain('À qualifier (')
    expect(text).toContain('Question :')
    expect(text).toContain('Source :')
  })

  it('does not act on an answer given before the window, and says so', () => {
    const { container } = render({
      triage: [
        {
          SignalId: 'signin-ip:203.0.113.42',
          Verdict: 'expected',
          Analyst: 'analyste@example.test',
          DecidedUtc: '2026-01-05T09:00:00Z',
          Justification: 'déplacement confirmé',
        },
      ],
    })
    const text = container.textContent

    expect(text).toContain('Qualifications antérieures à la fenêtre')
    expect(text).toContain("n'est pas appliquée à cette collecte")
    // And the signal is still a question rather than being filed as noise.
    expect(text).toContain('À qualifier')
  })

  it('reports a previous case on the same mailbox as a finding', () => {
    const { container } = render({
      incident: {
        Reference: 'PSIT-BEC-20261102-CD34',
        PreviousCases: [
          {
            Reference: 'PSIT-BEC-20260820-AB12',
            AutotaskTicket: 'T20260820.0042',
            DetectedUtc: '2026-08-20T09:00:00Z',
            ClosedUtc: '2026-08-25T16:00:00Z',
            ClosedBy: 'analyste@example.test',
          },
        ],
      },
    })
    const text = container.textContent

    expect(text).toContain('Antécédents sur cette boîte')
    // Quoted by ticket, never by the internal reference.
    expect(text).toContain('Ticket T20260820.0042')
    expect(text).not.toContain('PSIT-BEC-20260820-AB12')
    expect(text).toContain('Une compromission répétée de la même boîte est un constat en soi')
  })

  it('carries the Autotask ticket and the incident cross-reference', () => {
    const { container } = render({
      incident: {
        AutotaskTicket: 'T20260820.0042',
        Reference: 'PSIT-BEC-20260820-AFF6',
        Status: 'ongoing',
      },
    })

    expect(container.textContent).toContain('T20260820.0042')
    // The cross-reference names the same ticket: the internal identifier is metadata only.
    expect(container.textContent).not.toContain('PSIT-BEC-20260820-AFF6')
    expect(container.textContent).toContain('oui, même ticket')
    expect(container.textContent).toContain('en cours de traitement')
  })

  it('states no risk level and lists the open questions when nothing is qualified', () => {
    const { container } = render()
    expect(screen.getAllByText(/À qualifier/).length).toBeGreaterThan(0)
    expect(container.textContent).toContain('Questions ouvertes')
    expect(container.textContent).not.toContain('Évaluation du risque')
  })

  it('prints a retained fact with its determination', () => {
    const { container } = render({
      triage: [
        {
          SignalId: 'signin-ip:203.0.113.42',
          Verdict: 'unexpected',
          Analyst: 'analyste@example.test',
          DecidedUtc: '2026-08-20T13:02:00Z',
          Justification: "l'utilisateur n'est pas en Italie",
        },
      ],
    })

    expect(container.textContent).toContain('Retenus (1)')
    expect(container.textContent).toContain("portée par l'analyste PLEIN SUD IT")
    expect(container.textContent).toContain("l'utilisateur n'est pas en Italie")
  })
})

describe('PsitBecReportFrDocument corrections', () => {
  it('counts external human mail, not the raw total, behind the label that says so', () => {
    const { container } = render()
    // 3 collected rows: one automatic reply, one internal, one genuine external.
    expect(container.textContent).toContain('Messages externes envoyés')
    expect(container.textContent).toContain(
      "Dont destinataires externes, envoyés par le titulaire du compte : 1"
    )
    expect(container.textContent).toContain(
      'Dont générés par le service (réponses automatiques, non-remises) : 1'
    )
  })

  it('keeps events older than the window out of the chronology', () => {
    const { container } = render()
    const text = container.textContent

    expect(text).toContain('Hors fenêtre, pour contexte')
    // The 2021 registration is present as context, and only after that heading.
    expect(text.indexOf('Hors fenêtre')).toBeLessThan(text.indexOf('2021-03-12'))
  })

  it('aggregates consecutive sign-ins into a session instead of one line each', () => {
    const { container } = render()
    expect(container.textContent).toContain('Session depuis 203.0.113.42')
    expect(container.textContent).toContain('2 connexions')
  })

  it('does not reproduce the sender lists when nothing changed in the window', () => {
    const { container } = render()
    expect(container.textContent).toContain(
      "278 entrées des listes d'expéditeurs ne sont pas reproduites"
    )
    expect(container.textContent).not.toContain('spam12@spam.test')
  })

  it('separates the investigated user password change from tenant churn', () => {
    const { container } = render()
    // No change on the account itself, so the coverage row says so and names the tenant churn
    // instead of leaving the reader to read one as the other.
    expect(container.textContent).toContain("Aucun changement dans la fenêtre (1 sur d'autres")
  })

  it('reports all eleven checks as a coverage table instead of eleven sections', () => {
    const { container } = render()
    const text = container.textContent

    for (const control of [
      '1. Règles de boîte de réception',
      '2. Comptes créés dans le tenant',
      '3. Applications',
      '4. Permissions de boîte',
      '5. Courrier sortant',
      "6. Méthodes d'authentification",
      '7. Mot de passe du compte',
      '8. Expéditeurs approuvés et bloqués',
      '9. Appareils Intune',
      '10. Connexions par adresse source',
      '11. Liens de partage',
    ]) {
      expect(text).toContain(control)
    }

    // The checks that found nothing get a table row, not a green box on its own page.
    expect(text).not.toContain('Aucun compte créé pendant la fenêtre')
    expect(text).not.toContain('Aucune modification des permissions de boîte')
    expect(text).toContain('Aucune modification')
  })

  it('lists the indicators an analyst can reuse, Microsoft ranges excluded', () => {
    const { container } = render()
    const text = container.textContent

    expect(text).toContain('Annexe C : indicateurs observés')
    expect(text).toContain('203.0.113.42')
    // The automatic reply was submitted by Exchange Online: blocking that address would block the
    // client's own mail.
    expect(text).not.toContain('2603:10a6:803:81::32')
    expect(text).toContain("n'est pas un verdict")
  })
})
