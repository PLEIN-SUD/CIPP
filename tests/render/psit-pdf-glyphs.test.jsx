// @vitest-environment node
import { createElement as h } from 'react'
import { Document, Page, Text, renderToBuffer } from '@react-pdf/renderer'
import { pdfText } from './psit-pdf-text'

// Which characters actually reach the paper, measured rather than assumed.
//
// react-pdf's standard fonts encode to WinAnsi (CP1252). Everything CP1252 covers arrives intact,
// including the punctuation that lives in the 0x80-0x9F block: the typographic apostrophe, the
// bullet, the ellipsis, the dashes, the oe ligature. That is worth a test because it is easy to
// believe otherwise - a text extractor that decodes those bytes as Latin-1 turns a correct
// apostrophe into an invisible U+0092, and the PDF gets blamed for the reader's bug.
//
// What genuinely breaks is a character OUTSIDE CP1252. It is not dropped and it does not raise:
// the encoder emits a byte that means something else, so the page prints a different character.
// U+2192 prints an apostrophe. U+202F, the narrow no-break space French typography actually calls
// for, prints a slash. Nothing warns.
//
// The lint rule `cp1252-only` bans that set in the report modules; this is the evidence behind it.

const probe = async (chars) => {
  const doc = h(
    Document,
    null,
    h(Page, { size: 'A4' }, ...chars.map(([, ch], i) => h(Text, { key: i }, `[${i}A${ch}B]`)))
  )
  const text = pdfText(await renderToBuffer(doc))
  return chars.map(([name, ch], i) => {
    // react-pdf writes per-glyph kerning, so the extractor can insert a space after the index.
    const match = text.match(new RegExp(`\\[${i}\\s*A(.*?)B\\]`))
    return { name, expected: ch, got: match ? match[1] : null }
  })
}

const INSIDE_CP1252 = [
  ["apostrophe droite U+0027", "'"],
  ['apostrophe typographique U+2019', '\u2019'],
  ['puce U+2022', '\u2022'],
  ['points de suspension U+2026', '\u2026'],
  ['demi-cadratin U+2013', '\u2013'],
  ['cadratin U+2014', '\u2014'],
  ['ligature oe U+0153', '\u0153'],
  ['point median U+00B7', '\u00b7'],
  ['guillemet U+00AB', '\u00ab'],
  ['e accent U+00E9', '\u00e9'],
  ['c cedille U+00E7', '\u00e7'],
  ['insecable U+00A0', '\u00a0'],
]

const TIMEOUT = 120000

describe('what survives the PDF encoding', () => {
  it(
    'keeps every CP1252 character the reports use, punctuation included',
    async () => {
      for (const row of await probe(INSIDE_CP1252)) {
        expect(row.got, row.name).toBe(row.expected)
      }
    },
    TIMEOUT
  )

  it(
    'prints a different character for a codepoint outside CP1252',
    async () => {
      const [arrow, thin] = await probe([
        ['fleche U+2192', '\u2192'],
        ['fine insecable U+202F', '\u202f'],
      ])

      // Not an error, not a blank, not a fallback box: another character entirely. An arrow in a
      // report would print an apostrophe and nobody would notice until a client asked.
      expect(arrow.got).not.toBe('\u2192')
      expect(arrow.got).toBe('\u2019')
      expect(thin.got).not.toBe('\u202f')
      expect(thin.got).toBe('/')
    },
    TIMEOUT
  )
})
