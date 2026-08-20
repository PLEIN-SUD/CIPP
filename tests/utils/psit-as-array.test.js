import { psitAsArray } from '../../src/utils/psit-as-array'

describe('psitAsArray', () => {
  it('wraps the bare object the worker sends for a one-row list', () => {
    // The exact payload that took the BEC page down: one notified third party, serialised as an
    // object because the Azure Functions PowerShell worker flattens single-element collections.
    const one = { Name: 'Banque', NotifiedUtc: '2026-08-20T13:30:00Z' }
    expect(psitAsArray(one)).toEqual([one])
  })

  it('leaves a real array alone, identity included', () => {
    const rows = [{ a: 1 }, { a: 2 }]
    expect(psitAsArray(rows)).toBe(rows)
  })

  it('treats nothing as an empty list rather than throwing', () => {
    expect(psitAsArray(undefined)).toEqual([])
    expect(psitAsArray(null)).toEqual([])
    expect(psitAsArray('')).toEqual([])
    expect(psitAsArray('   ')).toEqual([])
  })

  it('parses a list that survived one round trip too many', () => {
    expect(psitAsArray('[{"Action":"Banque prévenue"}]')).toEqual([{ Action: 'Banque prévenue' }])
    expect(psitAsArray('{"Action":"Banque prévenue"}')).toEqual([{ Action: 'Banque prévenue' }])
  })

  it('keeps a plain string as a single entry, which is what a category list holds', () => {
    expect(psitAsArray('Données bancaires ou financières')).toEqual([
      'Données bancaires ou financières',
    ])
    expect(psitAsArray('{not json')).toEqual(['{not json'])
  })
})
