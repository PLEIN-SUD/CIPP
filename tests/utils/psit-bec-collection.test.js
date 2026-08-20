import { COLLECTION_STATUS, getCollectionStatus } from '../../src/utils/psit-bec-collection'

const NOW = '2026-08-20T12:00:00Z'

describe('getCollectionStatus', () => {
  it('recognises the cached error payload, which otherwise reads as an empty collection', () => {
    // This is exactly what the API returns for Status = 'Error': the message under a top-level
    // Results string, and nothing else.
    const status = getCollectionStatus(
      {
        Results: 'Could not connect to the tenant: AADSTS500011',
        Exception: { NormalizedError: 'AADSTS500011' },
        ExtractedAt: '2026-08-20T10:00:00Z',
      },
      { nowUtc: NOW }
    )

    expect(status.status).toBe(COLLECTION_STATUS.FAILED)
    expect(status.blocksReport).toBe(true)
    expect(status.message).toContain('AADSTS500011')
  })

  it('does not mistake a successful collection for a failure', () => {
    const status = getCollectionStatus(
      { ExtractedAt: '2026-08-20T10:00:00Z', SentMessages: [], NewRules: [] },
      { nowUtc: NOW }
    )

    expect(status.status).toBe(COLLECTION_STATUS.OK)
    expect(status.blocksReport).toBe(false)
    expect(status.ageDays).toBe(0)
  })

  it('reports a run still in flight separately from a failure', () => {
    const status = getCollectionStatus({ Waiting: true }, { nowUtc: NOW })
    expect(status.status).toBe(COLLECTION_STATUS.RUNNING)
    expect(status.blocksReport).toBe(true)
  })

  it('treats a collection with no extraction timestamp as unusable', () => {
    const status = getCollectionStatus({ SentMessages: [] }, { nowUtc: NOW })
    expect(status.status).toBe(COLLECTION_STATUS.MISSING)
    expect(status.blocksReport).toBe(true)
  })

  it('warns on an old collection without refusing it: it is still evidence of its own window', () => {
    const status = getCollectionStatus({ ExtractedAt: '2026-07-01T10:00:00Z' }, { nowUtc: NOW })

    expect(status.status).toBe(COLLECTION_STATUS.STALE)
    expect(status.blocksReport).toBe(false)
    expect(status.ageDays).toBe(50)
    expect(status.message).toContain('50 jours')
  })

  it('treats nothing at all as missing rather than throwing', () => {
    expect(getCollectionStatus(undefined).status).toBe(COLLECTION_STATUS.MISSING)
    expect(getCollectionStatus({}).status).toBe(COLLECTION_STATUS.MISSING)
  })
})
