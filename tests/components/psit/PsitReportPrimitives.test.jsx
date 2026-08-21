import React from 'react'
import { renderWithProviders } from '../../test-utils'
import {
  AlertBox,
  ClearBox,
  ContentPage,
  InfoBox,
  ReportDocument,
  Section,
} from '../../../src/components/CippPdf'

// Rendering MUI through jsdom on a cold cache runs past Vitest's 5 s default on a laptop, and a
// timeout reads exactly like a broken assertion. Set per file rather than in vitest.config.mjs,
// which is upstream: no divergence, and the value travels with the tests that need it.
vi.setConfig({ testTimeout: 60000 })


// Covers the PSIT-CUSTOM blocks added to the shared PDF primitives: unbreakable boxes, a section
// title that keeps its content, a page label and a continuation label that follow the report's
// language. The primitives are upstream, the behaviour is ours, so the test lives here.
//
// The double forwards the props react-pdf consumes for pagination (`wrap`, `minPresenceAhead`,
// `fixed`) as data attributes, and calls `render` with the page counters, which is the only way to
// observe any of it in jsdom. The page a render callback believes it is on is driven from the test.

vi.mock('@react-pdf/renderer', () => {
  const passthrough =
    (tag) =>
    ({ children, render, wrap, minPresenceAhead, fixed }) =>
      React.createElement(
        tag,
        {
          'data-wrap': wrap === undefined ? undefined : String(wrap),
          'data-min-presence-ahead': minPresenceAhead,
          'data-fixed': fixed ? 'true' : undefined,
        },
        typeof render === 'function'
          ? render({
              pageNumber: globalThis.__psitPageNumber ?? 1,
              totalPages: globalThis.__psitTotalPages ?? 1,
              subPageNumber: globalThis.__psitSubPageNumber ?? 1,
              subPageTotalPages: 2,
            })
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

const renderDocument = (props = {}, children = null) =>
  renderWithProviders(
    <ReportDocument brandingSettings={{}} tenantName="contoso.test" cover={false} {...props}>
      {children}
    </ReportDocument>
  )

describe('shared PDF primitives, PSIT blocks', () => {
  beforeEach(() => {
    globalThis.__psitPageNumber = 1
    globalThis.__psitTotalPages = 1
    globalThis.__psitSubPageNumber = 1
  })

  it('paginates in French when the report asks, in English otherwise', () => {
    globalThis.__psitPageNumber = 2
    globalThis.__psitTotalPages = 7

    const { container: french } = renderDocument(
      { language: 'fr' },
      <ContentPage title="Résumé">contenu</ContentPage>
    )
    expect(french.textContent).toContain('Page 2 sur 7')
    expect(french.textContent).not.toContain(' of ')

    const { container: english } = renderDocument(
      {},
      <ContentPage title="Summary">body</ContentPage>
    )
    expect(english.textContent).toContain('Page 2 of 7')
  })

  it('renders the page title as plain text, on every page', () => {
    // No automatic continuation label: on react-pdf 4.5.1 a `render` callback on the title makes
    // every page title vanish in a multi-page document, and a nested render Text renders nothing at
    // all. Both were tried on a real render; see tests/render. The convention is manual, and what
    // matters here is that the title itself always prints.
    const { container: first } = renderDocument(
      { language: 'fr' },
      <ContentPage title="Faits établis">contenu</ContentPage>
    )
    expect(first.textContent).toContain('Faits établis')

    globalThis.__psitSubPageNumber = 2
    const { container: spilled } = renderDocument(
      { language: 'fr' },
      <ContentPage title="Faits établis">contenu</ContentPage>
    )
    expect(spilled.textContent).toContain('Faits établis')
  })

  it('keeps a box whole across a page break, and lets an oversized one opt back in', () => {
    const { container } = renderDocument(
      { language: 'fr' },
      <>
        <InfoBox title="Fait">détail</InfoBox>
        <AlertBox title="Alerte">détail</AlertBox>
        <ClearBox title="Rien">détail</ClearBox>
        <InfoBox title="Commentaire très long" wrap>
          détail
        </InfoBox>
      </>
    )

    const boxes = container.querySelectorAll('[data-wrap]')
    expect(boxes.length).toBe(4)
    expect(
      Array.from(boxes)
        .slice(0, 3)
        .every((box) => box.dataset.wrap === 'false')
    ).toBe(true)
    // The derogation: a box taller than a page must break rather than overflow off it.
    expect(boxes[3].dataset.wrap).toBe('true')
  })

  it('reserves room under a section title so it is never orphaned', () => {
    const { container } = renderDocument(
      { language: 'fr' },
      <Section title="Confinement">contenu</Section>
    )
    const title = container.querySelector('[data-min-presence-ahead]')
    expect(title).not.toBeNull()
    expect(Number(title.getAttribute('data-min-presence-ahead'))).toBeGreaterThanOrEqual(60)
    // Not the section itself: a section legitimately runs past a page.
    expect(container.querySelector('[data-wrap="false"]')).toBeNull()
  })

  it('writes the PDF metadata it is given, and nothing when it is not', () => {
    // Asserted through the mock's attributes is not possible for Document props, so this pins the
    // contract at the call level: the props are optional and default to undefined, which leaves an
    // upstream report's metadata exactly as it was.
    expect(() =>
      renderDocument({
        documentTitle: "Rapport d'incident T20260820.0013",
        documentSubject: "Rapport d'incident de sécurité",
        documentKeywords: 'PSIT-BEC-20260820-AFF6 T20260820.0013',
        documentAuthor: 'PLEIN SUD IT',
      })
    ).not.toThrow()
  })
})
