import { countryName, inCountry, isKnownCountry } from '../../src/utils/psit-country-names'

// The defect this file exists for: the incident report printed "(IT)" to clients. A two-letter code
// is the encoding of the information, not the information.

describe('countryName', () => {
  it('names the countries the reports actually meet', () => {
    expect(countryName('IT')).toBe('Italie')
    expect(countryName('FR')).toBe('France')
    expect(countryName('CN')).toBe('Chine')
    expect(countryName('US')).toBe('États-Unis')
    expect(countryName('GB')).toBe('Royaume-Uni')
  })

  it('accepts a lowercase or padded code, since collections are not tidy', () => {
    expect(countryName('it')).toBe('Italie')
    expect(countryName(' IT ')).toBe('Italie')
  })

  it('gives the code back when the table does not know it', () => {
    // Better than a placeholder: a code can be looked up, "pays inconnu" cannot.
    expect(countryName('QQ')).toBe('QQ')
  })

  it('says so when there is no code at all', () => {
    expect(countryName(null)).toBe('pays non déterminé')
    expect(countryName('')).toBe('pays non déterminé')
    expect(countryName(undefined)).toBe('pays non déterminé')
  })

  it('treats the placeholders a geo lookup returns as an absence', () => {
    expect(countryName('XX')).toBe('pays non déterminé')
    expect(countryName('Unknown')).toBe('pays non déterminé')
  })

  it('appends the code only when asked, for the technical report', () => {
    expect(countryName('IT', { withCode: true })).toBe('Italie (IT)')
    // An unknown code is already the code: no point printing it twice.
    expect(countryName('QQ', { withCode: true })).toBe('QQ')
  })

  it('takes a caller-chosen fallback', () => {
    expect(countryName(null, { fallback: 'non renseigné' })).toBe('non renseigné')
  })
})

describe('isKnownCountry', () => {
  it('separates a real code from a placeholder', () => {
    expect(isKnownCountry('IT')).toBe(true)
    expect(isKnownCountry('QQ')).toBe(false)
    expect(isKnownCountry(null)).toBe(false)
  })
})

describe('inCountry', () => {
  it('uses the preposition the country takes', () => {
    // "en Canada" is the kind of phrase that makes a report read as machine output.
    expect(inCountry('IT')).toBe('en Italie')
    expect(inCountry('FR')).toBe('en France')
    expect(inCountry('CA')).toBe('au Canada')
    expect(inCountry('US')).toBe('aux États-Unis')
    expect(inCountry('NL')).toBe('aux Pays-Bas')
    expect(inCountry('PT')).toBe('au Portugal')
    expect(inCountry('MC')).toBe('à Monaco')
  })

  it('defaults to "en", which is right for the two largest groups', () => {
    expect(inCountry('DE')).toBe('en Allemagne')
    expect(inCountry('IR')).toBe('en Iran')
  })

  it('does not pretend an unknown code is a place name', () => {
    expect(inCountry('QQ')).toBe('dans le pays QQ')
  })

  it('says so when there is no country', () => {
    expect(inCountry(null)).toBe('dans un pays non déterminé')
    expect(inCountry('XX')).toBe('dans un pays non déterminé')
  })
})
