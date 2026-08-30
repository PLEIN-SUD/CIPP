import React from 'react'
import { screen } from '@testing-library/react'
import { renderWithProviders } from '../../test-utils'
import { ApiGetCall } from '../../../src/api/ApiCall'
import {
  PsitReportContributors,
  PsitReportPhotoLoaders,
} from '../../../src/components/psit/soc/PsitReportContributors'
import { ReportProvider } from '../../../src/components/CippPdf/reportContext'
import { createReportTheme } from '../../../src/components/CippPdf/reportTheme'
import { createReportStyles } from '../../../src/components/CippPdf/reportPdfStyles'

vi.setConfig({ testTimeout: 60000 })

vi.mock('../../../src/api/ApiCall', () => ({
  ApiGetCall: vi.fn(() => ({ data: undefined, isFetching: false, isError: false })),
  ApiPostCall: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
  ApiGetCallWithPagination: vi.fn(() => ({ data: undefined, isFetching: false })),
}))

// jsdom cannot run the real pdf renderer; passthrough stubs let the document tree be asserted as
// plain DOM. The trade-off is explicit: this proves the wording, never the rendered PDF.
vi.mock('@react-pdf/renderer', () => {
  const passthrough =
    (tag) =>
    ({ children, render, src }) =>
      React.createElement(
        tag,
        src ? { 'data-src': src } : null,
        typeof render === 'function' ? render({ pageNumber: 1, totalPages: 1 }) : children
      )
  return {
    Document: passthrough('div'),
    Page: passthrough('div'),
    View: passthrough('div'),
    Text: passthrough('span'),
    Image: passthrough('img'),
    PDFViewer: passthrough('div'),
    PDFDownloadLink: passthrough('div'),
    StyleSheet: { create: (styles) => styles },
    Font: { register: () => {}, registerHyphenationCallback: () => {}, registerEmojiSource: () => {} },
    pdf: () => ({ toBlob: () => Promise.resolve(new Blob()) }),
  }
})

const theme = createReportTheme({})
const inReport = (node) =>
  renderWithProviders(
    <ReportProvider value={{ theme, styles: createReportStyles(theme), variables: {} }}>
      {node}
    </ReportProvider>
  )

const contributors = [
  {
    upn: 'alice@partner.test',
    actions: ['appel client', 'qualification'],
    firstUtc: '2026-08-28T10:00:00Z',
    lastUtc: '2026-08-28T17:00:00Z',
  },
  { upn: 'bob@partner.test', actions: ['révocation'], firstUtc: '2026-08-28T11:00:00Z', lastUtc: '2026-08-28T11:00:00Z' },
]

const names = {
  'alice@partner.test': { displayName: 'Alice Analyste', jobTitle: 'Technicienne sécurité' },
}

describe('PsitReportContributors', () => {
  it('names each person with their job title', () => {
    inReport(<PsitReportContributors contributors={contributors} names={names} />)
    expect(screen.getByText('Alice Analyste')).toBeInTheDocument()
    expect(screen.getByText('Technicienne sécurité')).toBeInTheDocument()
  })

  it('falls back to the address for someone the analyst list does not know', () => {
    inReport(<PsitReportContributors contributors={contributors} names={names} />)
    expect(screen.getByText('bob@partner.test')).toBeInTheDocument()
  })

  it('embeds the photo when one was loaded, and draws initials when none was', () => {
    const { container } = inReport(
      <PsitReportContributors
        contributors={contributors}
        names={names}
        photos={{ 'alice@partner.test': 'data:image/png;base64,AAA' }}
      />
    )
    expect(container.querySelector('img[data-src="data:image/png;base64,AAA"]')).toBeTruthy()
    // Bob has no photo: initials rather than a hole in a client document.
    expect(screen.getByText('B')).toBeInTheDocument()
  })

  it('says what each person did, and over which period', () => {
    inReport(<PsitReportContributors contributors={contributors} names={names} />)
    expect(screen.getByText(/appel client, qualification/)).toBeInTheDocument()
    expect(screen.getAllByText(/28 août 2026/).length).toBeGreaterThan(0)
  })

  it('says plainly that nobody is named rather than printing an empty block', () => {
    inReport(<PsitReportContributors contributors={[]} />)
    expect(screen.getByText(/Aucun intervenant nommé/)).toBeInTheDocument()
  })
})

describe('PsitReportPhotoLoaders', () => {
  // The loop this pins: the loader reported whatever the photo call returned, and the receiver
  // compared it by identity. A response that is not a string is a new reference on every render,
  // so the effect fired, state changed, the render repeated, and the page ran out of memory.
  it('reports a data URL once, and never reports anything else', () => {
    const onLoaded = vi.fn()
    ApiGetCall.mockImplementation(() => ({
      data: 'data:image/png;base64,AAA',
      isFetching: false,
      isError: false,
    }))

    inReport(
      <PsitReportPhotoLoaders contributors={[{ upn: 'alice@partner.test' }]} onLoaded={onLoaded} />
    )

    expect(onLoaded).toHaveBeenCalledTimes(1)
    expect(onLoaded).toHaveBeenCalledWith('alice@partner.test', 'data:image/png;base64,AAA')
  })

  it('reports nothing when the answer is not a data URL', () => {
    const onLoaded = vi.fn()
    // A blob that never converted, or an endpoint answering something else entirely.
    ApiGetCall.mockImplementation(() => ({ data: { blob: true }, isFetching: false, isError: false }))

    inReport(
      <PsitReportPhotoLoaders contributors={[{ upn: 'alice@partner.test' }]} onLoaded={onLoaded} />
    )

    expect(onLoaded).not.toHaveBeenCalled()
  })
})
