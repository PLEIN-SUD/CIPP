import React from 'react'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '../../test-utils'
import {
  PsitBecReportFrButton,
  PsitBecReportFrDocument,
} from '../../../src/components/psit/PsitBecReportFr'

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
// the French wording and the structure, never the rendered PDF - accents and page breaks still need
// one visual check on a generated file.
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
  displayName: 'Jean Dupont',
  userPrincipalName: 'jean.dupont@contoso.test',
}

const becData = {
  ExtractedAt: '2026-08-01T09:00:00Z',
  ExtractResult: 'Successfully extracted logs from auditlog',
  NewRules: [{ Name: 'Facturation', MoveToFolder: 'RSS Subscriptions', DeleteMessage: true }],
  InboxRuleChanges: [],
  NewUsers: [],
  AddedApps: [],
  MaliciousSPs: [],
  MailboxPermissionChanges: [],
  MFADevices: [],
  ChangedPasswords: [],
  SentMessages: [],
  TrustedSenders: [],
  BlockedSenders: [],
  SafelistChanges: [],
  SharingChanges: [],
  IntuneDevices: [],
  SuspectUserSignIns: [],
  LocationAnalysis: { UsageLocation: 'FR', SignInCountries: [] },
}

describe('PsitBecReportFrButton', () => {
  it('renders nothing until the BEC data is ready', () => {
    const { container } = renderWithProviders(
      <PsitBecReportFrButton userData={userData} becData={{ Waiting: true }} tenantName="contoso.test" />
    )
    expect(container).toBeEmptyDOMElement()
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
    expect(screen.getByText('Aperçu du rapport BEC (français)')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Fermer' })).toBeInTheDocument()
  })
})

describe('PsitBecReportFrDocument', () => {
  it('renders the report content in French', () => {
    renderWithProviders(
      <PsitBecReportFrDocument
        userData={userData}
        becData={becData}
        brandingSettings={{}}
        tenantName="contoso.test"
        variables={{}}
      />
    )

    expect(screen.getByText(/Synthèse/)).toBeInTheDocument()
    expect(screen.getByText(/Vérification 1 : règles de boîte de réception/)).toBeInTheDocument()
    expect(screen.getByText(/Vérification 11 : liens de partage/)).toBeInTheDocument()
    expect(screen.getByText(/Actions immédiates/)).toBeInTheDocument()
  })

  it('keeps the same page and section count as the English report', () => {
    // Parity is the point of this document: eight pages, mirroring
    // BECRemediationReportButton.js page for page. If upstream adds a page, this fails and the
    // French edition gets updated instead of silently drifting.
    const { container } = renderWithProviders(
      <PsitBecReportFrDocument
        userData={userData}
        becData={becData}
        brandingSettings={{}}
        tenantName="contoso.test"
        variables={{}}
      />
    )
    expect(container.textContent).toContain('Conformité et documentation')
    expect(container.textContent).toContain('Comprendre la compromission de messagerie')
    expect(container.textContent).toContain('Listes, appareils et localisations')
    expect(container.textContent).toContain('Vérifications complémentaires')
  })

  it('pluralises French titles rather than using the English "(s)" form', () => {
    renderWithProviders(
      <PsitBecReportFrDocument
        userData={userData}
        becData={{ ...becData, NewRules: [{ Name: 'A' }, { Name: 'B' }] }}
        brandingSettings={{}}
        tenantName="contoso.test"
        variables={{}}
      />
    )
    expect(screen.getByText(/2 règles de boîte détectées/)).toBeInTheDocument()
  })
})

describe('PsitBecReportFrDocument verdict', () => {
  // The verdict itself is unit-tested in tests/utils/psit-bec-signals.test.js; here we only check
  // that the document prints it rather than a mechanical risk level.
  const quotaRule = { Name: 'fieldglass', MoveToFolder: 'CAP - DEMANDES' }

  it('prints "À qualifier" and the open question when nothing has been determined', () => {
    renderWithProviders(
      <PsitBecReportFrDocument
        userData={userData}
        becData={{ ...becData, NewRules: [quotaRule] }}
        brandingSettings={{}}
        tenantName="contoso.test"
        variables={{}}
        triage={[]}
      />
    )

    // Several nodes carry it on purpose: the verdict box, the stat row and the audit recap.
    expect(screen.getAllByText(/À qualifier/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Questions ouvertes/).length).toBeGreaterThan(0)
    expect(screen.queryByText(/Évaluation du risque/)).not.toBeInTheDocument()
  })

  it('prints the determination, its author and its date once recorded', () => {
    const { container } = renderWithProviders(
      <PsitBecReportFrDocument
        userData={userData}
        becData={{ ...becData, NewRules: [quotaRule] }}
        brandingSettings={{}}
        tenantName="contoso.test"
        variables={{}}
        triage={[
          {
            SignalId: 'rule-filing:fieldglass',
            Verdict: 'expected',
            Analyst: 's.miro@pleinsudit.com',
            DecidedUtc: '2026-08-20T12:00:00Z',
            Justification: 'Règle de classement fournisseur confirmée par le service achats',
          },
        ]}
      />
    )

    expect(container.textContent).toContain('s.miro@pleinsudit.com')
    expect(container.textContent).toContain('2026-08-20 12:00 UTC')
    expect(container.textContent).toContain('service achats')
    expect(container.textContent).toContain('Aucun signal retenu')
  })

  it('renders the UTC chronology page', () => {
    const { container } = renderWithProviders(
      <PsitBecReportFrDocument
        userData={userData}
        becData={becData}
        brandingSettings={{}}
        tenantName="contoso.test"
        variables={{}}
        triage={[]}
      />
    )

    expect(container.textContent).toContain('Chronologie')
    expect(container.textContent).toContain('Tous les horodatages en UTC')
  })
})
