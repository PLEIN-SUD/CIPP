import vectors from '../fixtures/psit-outbound-classification-vectors.json'
import { classifySentMessages } from '../../src/utils/psit-bec-signals'

// The front side of a contract satisfied by two implementations: this one, and
// Get-PSITBecOutboundClassification.ps1 in the CIPP-API repo, which runs at collection time. The
// front's copy exists only for collections made before the API-side classification, and the two
// would drift silently without a shared set of vectors.
//
// The fixture is duplicated in CIPP-API/Tests/PSIT/. Nothing enforces that across repositories:
// change one, change the other.

describe(`outbound classification contract (${vectors._contract})`, () => {
  const userData = { userPrincipalName: vectors.senderAddress }

  // One message per case, classified in a single pass, so the counters are checked too.
  const becData = {
    SentMessages: vectors.cases.map((testCase) => ({
      Subject: testCase.subject,
      RecipientAddress: testCase.recipientAddress,
      FromIP: testCase.fromIp,
    })),
    SentMessageAnalysis: { TotalRecipients: vectors.cases.length },
  }
  const result = classifySentMessages(becData, userData)

  it.each(vectors.cases.map((testCase, index) => [testCase.name, index]))(
    'classifies %s as the contract requires',
    (_name, index) => {
      const row = result.rows[index]
      const expected = vectors.cases[index].expected

      expect(row.systemGenerated).toBe(expected.systemGenerated)
      expect(row.serviceIp).toBe(expected.serviceIp)
      expect(row.internal).toBe(expected.internal)
    }
  )

  it('derives the human external subset from the same rules', () => {
    const expectedHumanExternal = vectors.cases.filter(
      (testCase) => !testCase.expected.systemGenerated && !testCase.expected.internal
    ).length

    expect(result.counts.humanExternal).toBe(expectedHumanExternal)
    expect(result.counts.collected).toBe(vectors.cases.length)
    expect(result.counts.systemGenerated).toBe(
      vectors.cases.filter((testCase) => testCase.expected.systemGenerated).length
    )
    expect(result.counts.serviceIp).toBe(
      vectors.cases.filter((testCase) => testCase.expected.serviceIp).length
    )
  })

  it('prefers the flags the API attached over its own derivation', () => {
    // Once the collection carries the classification, the front must not second-guess it: one
    // source of truth per collection, and the report says which one it used.
    const flagged = classifySentMessages(
      {
        SentMessages: [
          {
            Subject: 'Re: CV Alexandre',
            RecipientAddress: 'contact@client.test',
            FromIP: '198.51.100.7',
            SystemGenerated: true,
            ServiceIp: true,
            Internal: true,
          },
        ],
      },
      userData
    )

    expect(flagged.rows[0].systemGenerated).toBe(true)
    expect(flagged.rows[0].serviceIp).toBe(true)
    expect(flagged.rows[0].internal).toBe(true)
    expect(flagged.derivedLocally).toBe(false)
  })
})
