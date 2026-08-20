import React from 'react'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '../../test-utils'
import {
  PsitBecReportFrButton,
  PsitBecReportFrDocument,
  psitCalculateThreatLevel,
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

describe('psitCalculateThreatLevel', () => {
  // These weights and thresholds mirror calculateThreatLevel in
  // src/components/BECRemediationReportButton.js. Pinning them here makes an upstream change to the
  // scoring a visible test failure rather than two reports quietly disagreeing.
  const emptyStats = {
    newRules: 0,
    ruleChanges: 0,
    permissionChanges: 0,
    permissionChangesTargetingUser: 0,
    newApps: 0,
    newUsers: 0,
    safelistChanges: 0,
    maliciousApps: 0,
    foreignSuccessfulSignIns: 0,
    foreignActivity: 0,
    anonymousLinks: 0,
    massMailFlagged: false,
    recentMfaDevices: 0,
    recentIntuneDevices: 0,
  }

  it('reports a low level with no indicator', () => {
    expect(psitCalculateThreatLevel(emptyStats, {})).toMatchObject({ level: 'Low', label: 'faible' })
  })

  it('reaches medium at a score of four', () => {
    // newRules (3) + newApps (1) = 4
    const result = psitCalculateThreatLevel({ ...emptyStats, newRules: 1, newApps: 1 }, {})
    expect(result).toMatchObject({ level: 'Medium', label: 'moyen' })
  })

  it('reaches high at a score of seven', () => {
    // newRules (3) + ruleChanges (3) + permissionChanges (1) = 7
    const result = psitCalculateThreatLevel(
      { ...emptyStats, newRules: 1, ruleChanges: 1, permissionChanges: 1 },
      {}
    )
    expect(result).toMatchObject({ level: 'High', label: 'élevé' })
  })

  it('weights a known-malicious application as heavily as a rule moving mail to RSS', () => {
    const malicious = psitCalculateThreatLevel({ ...emptyStats, maliciousApps: 1 }, {})
    const rssRule = psitCalculateThreatLevel(emptyStats, {
      NewRules: [{ MoveToFolder: 'RSS Subscriptions' }],
    })
    expect(malicious.level).toBe('Medium')
    expect(rssRule.level).toBe('Medium')
  })

  it('counts a successful foreign sign-in and foreign activity separately', () => {
    // 3 + 3 = 6, one point short of High: two foreign indicators alone do not reach the top band.
    const foreignOnly = psitCalculateThreatLevel(
      { ...emptyStats, foreignSuccessfulSignIns: 1, foreignActivity: 2 },
      {}
    )
    expect(foreignOnly).toMatchObject({ level: 'Medium', label: 'moyen' })

    // Adding any third indicator crosses the threshold (+2 for a recent MFA registration).
    const withMfa = psitCalculateThreatLevel(
      { ...emptyStats, foreignSuccessfulSignIns: 1, foreignActivity: 2, recentMfaDevices: 1 },
      {}
    )
    expect(withMfa).toMatchObject({ level: 'High', label: 'élevé' })
  })
})
