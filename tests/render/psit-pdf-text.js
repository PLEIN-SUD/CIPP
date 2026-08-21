import { inflateSync } from 'node:zlib'

// WinAnsi's 0x80-0x9F block, which is where Latin-1 has control characters and CP1252 has the
// punctuation French prose actually uses. Decoding these bytes as latin1 - which this file did at
// first - turns every typographic apostrophe into an invisible U+0092 and makes an assertion on
// "l'exterieur" fail while the PDF is perfectly correct. That cost an afternoon.
const WINANSI_HIGH = {
  0x80: '€', 0x82: '‚', 0x83: 'ƒ', 0x84: '„', 0x85: '…',
  0x86: '†', 0x87: '‡', 0x88: 'ˆ', 0x89: '‰', 0x8a: 'Š',
  0x8b: '‹', 0x8c: 'Œ', 0x8e: 'Ž', 0x91: '‘', 0x92: '’',
  0x93: '“', 0x94: '”', 0x95: '•', 0x96: '–', 0x97: '—',
  0x98: '˜', 0x99: '™', 0x9a: 'š', 0x9b: '›', 0x9c: 'œ',
  0x9e: 'ž', 0x9f: 'Ÿ',
}

/** WinAnsi bytes to the string they stand for. */
const winansi = (bytes) =>
  [...bytes].map((byte) => WINANSI_HIGH[byte] ?? String.fromCharCode(byte)).join('')

/**
 * The text of a PDF, read from its content streams.
 *
 * There is no pdfjs in this project and pulling one in for a test lint would be a poor trade.
 * Inflating the Flate streams and reading the text-showing operators is enough for substring
 * assertions.
 *
 * react-pdf writes each glyph as its own hex string with its own kerning:
 *   [<32> -55.5 <31> -55.5 <20>] TJ
 * The reports use standard Helvetica, so those bytes are WinAnsi codes.
 */
export const pdfText = (buffer) => {
  const raw = buffer.toString('latin1')
  const streams = []
  const streamPattern = /stream\r?\n/g
  let match
  while ((match = streamPattern.exec(raw)) !== null) {
    const start = match.index + match[0].length
    const end = raw.indexOf('endstream', start)
    if (end < 0) continue
    try {
      streams.push(inflateSync(Buffer.from(raw.slice(start, end), 'latin1')).toString('latin1'))
    } catch {
      // Not a Flate content stream: a font programme or an image.
    }
  }

  const content = streams.join('\n')
  const chunks = []

  for (const array of content.matchAll(/\[([^\]]*)\]\s*TJ/g)) {
    let line = ''
    for (const piece of array[1].matchAll(/<([0-9A-Fa-f]+)>|\(((?:\\.|[^()\\])*)\)/g)) {
      if (piece[1]) {
        line += winansi(Buffer.from(piece[1], 'hex'))
      } else if (piece[2] !== undefined) {
        line += winansi(Buffer.from(piece[2].replace(/\\([()\\])/g, '$1'), 'latin1'))
      }
    }
    if (line) chunks.push(line)
  }
  for (const single of content.matchAll(/<([0-9A-Fa-f]+)>\s*Tj/g)) {
    chunks.push(winansi(Buffer.from(single[1], 'hex')))
  }
  for (const single of content.matchAll(/\(((?:\\.|[^()\\])*)\)\s*Tj/g)) {
    chunks.push(winansi(Buffer.from(single[1].replace(/\\([()\\])/g, '$1'), 'latin1')))
  }

  return chunks.join(' ')
}
