import React from 'react'
import { screen } from '@testing-library/react'
import { renderWithProviders } from '../../test-utils'
import {
  PsitSocAppReportButton,
  PsitSocAppReportFrDocument,
} from '../../../src/components/psit/PsitSocAppReportFr'

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

const principal = {
  appId: 'app-guid',
  id: 'sp-guid',
  displayName: 'To-do Checklist',
  publisherName: 'Éditeur tiers',
  createdDateTime: '2026-08-20T08:00:00Z',
  accountEnabled: false,
}

const socCase = {
  CaseId: 'PSIT-SOC-20260828-985D',
  Tenant: 'client.test',
  ExternalRef: 'T20260828.0009',
  Verdict: 'false-positive',
  Justification: 'Déploiement assumé par le dirigeant, révocation demandée par le client',
  Entities: { appId: 'app-guid' },
  ActionLog: [
    { Utc: '2026-08-28T09:00:00Z', Action: 'ingested', Detail: 'Alerte reçue', By: 'webhook' },
    { Utc: '2026-08-28T14:00:00Z', Action: 'revoked', Detail: 'Consentement révoqué', By: 'analyste' },
  ],
}

const render = (props = {}) =>
  renderWithProviders(
    <PsitSocAppReportFrDocument
      socCase={socCase}
      principal={principal}
      consents={[{ kind: 'admin', who: "Toute l'organisation (consentement administrateur)" }]}
      auditEvents={[
        { who: 'dirigeant@client.test', ip: '203.0.113.9', whenUtc: '2026-08-20T08:02:00Z' },
      ]}
      scopes={{ granted: ['Tasks.ReadWrite', 'offline_access'], risky: [] }}
      brandingSettings={{}}
      variables={{}}
      {...props}
    />
  )

describe('PsitSocAppReportFrDocument', () => {
  it('opens on the outcome, not on the evidence', () => {
    render()
    expect(screen.getByText(/investigation conclut à une application légitime/)).toBeInTheDocument()
    expect(screen.getByText(/à la demande du client/i)).toBeInTheDocument()
  })

  it('separates the qualification from the decision that followed it', () => {
    // The distinction the field case turns on: the alert was not an intrusion, and the
    // revocation was the client's own call. Both are facts, neither cancels the other.
    render()
    expect(screen.getByText(/qualifié faux positif/)).toBeInTheDocument()
    expect(screen.getByText(/ne signalait pas une intrusion/)).toBeInTheDocument()
  })

  it('states an unverified publisher rather than leaving the field blank', () => {
    render()
    expect(screen.getByText(/éditeur non vérifié par Microsoft/)).toBeInTheDocument()
  })

  it('says what an empty audit log does and does not prove', () => {
    render({ auditEvents: [] })
    expect(screen.getByText(/ne prouve pas qu'aucun consentement n'a eu lieu/)).toBeInTheDocument()
  })

  it('explains that no active consent is the expected state after a revocation', () => {
    render({ consents: [] })
    expect(screen.getByText(/l'état attendu/)).toBeInTheDocument()
  })

  it('carries the journal of what was actually done', () => {
    render()
    expect(screen.getByText(/Consentement révoqué/)).toBeInTheDocument()
  })
})

describe('PsitSocAppReportButton', () => {
  it('refuses to produce a client document while the dossier concludes nothing', () => {
    renderWithProviders(
      <PsitSocAppReportButton socCase={{ ...socCase, Verdict: undefined }} principal={principal} />
    )
    expect(screen.getByRole('button', { name: /Rapport application/ })).toBeDisabled()
  })

  it('offers the report once the dossier is qualified', () => {
    renderWithProviders(<PsitSocAppReportButton socCase={socCase} principal={principal} />)
    expect(screen.getByRole('button', { name: /Rapport application/ })).toBeEnabled()
  })

  it('renders nothing at all outside a dossier', () => {
    const { container } = renderWithProviders(
      <PsitSocAppReportButton socCase={{ Tenant: 'client.test' }} principal={principal} />
    )
    expect(container).toBeEmptyDOMElement()
  })
})
