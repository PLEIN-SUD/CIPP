import { buildIocs } from '../../src/utils/psit-bec-iocs'

const userData = { userPrincipalName: 'p.martin@contoso.test' }

const becData = {
  ExtractedAt: '2026-08-20T10:00:00Z',
  SuspectUserSignIns: [
    {
      CreatedDateTime: '2026-08-20T06:49:00Z',
      IPAddress: '203.0.113.42',
      Country: 'IT',
      Status: 'Success',
      ForeignLocation: true,
    },
    {
      CreatedDateTime: '2026-08-20T06:54:00Z',
      IPAddress: '203.0.113.42',
      Country: 'IT',
      Status: 'Success',
      ForeignLocation: true,
    },
    {
      CreatedDateTime: '2026-08-17T02:00:00Z',
      IPAddress: '198.51.100.99',
      Country: 'CN',
      Status: 'Failed',
      ForeignLocation: true,
    },
  ],
  NewRules: [
    { Name: 'copie', ForwardTo: 'attacker@evil.test', RecentlyChanged: true },
    { Name: 'classement', MoveToFolder: 'DOSSIERS' },
  ],
  MaliciousSPs: [{ appId: 'a1b2', displayName: 'PerfectData Software', CatalogName: 'BEC' }],
  AddedApps: [{ appId: 'c3d4', displayName: 'eM Client', MaliciousMatch: true }],
  SentMessages: [
    {
      Subject: 'Facture',
      RecipientAddress: 'buyer@client.test',
      FromIP: '203.0.113.42',
      Received: '2026-08-20T07:00:00Z',
      SystemGenerated: false,
      Internal: false,
    },
    // Submitted by Exchange Online: must never end up on a blocklist.
    {
      Subject: 'Réponse automatique : absence',
      RecipientAddress: 'news@vendor.test',
      FromIP: '2603:10a6:803:81::32',
      Received: '2026-08-20T07:05:00Z',
    },
  ],
  SentMessageAnalysis: {
    TotalRecipients: 2,
    RepeatedSubjects: [{ Subject: 'Facture', Count: 12, Flagged: true }],
    Bursts: [{ WindowStart: '2026-08-20T07:00:00Z', TopSubject: 'Facture' }],
  },
}

describe('buildIocs', () => {
  const iocs = buildIocs(becData, userData)

  it('gathers sign-in source addresses, failures included, with what was seen', () => {
    const addresses = iocs.signInIps.map((entry) => entry.value)
    expect(addresses).toContain('203.0.113.42')
    expect(addresses).toContain('198.51.100.99')

    const spray = iocs.signInIps.find((entry) => entry.value === '198.51.100.99')
    expect(spray.detail).toContain('0 connexion réussie')
    expect(spray.detail).toContain('1 tentative en échec')
  })

  it("never lists Microsoft's own submission addresses, which would block the client's mail", () => {
    const sending = iocs.sendingIps.map((entry) => entry.value)
    expect(sending).toContain('203.0.113.42')
    expect(sending).not.toContain('2603:10a6:803:81::32')
  })

  it('extracts the forwarding target, which is the address that matters most', () => {
    expect(iocs.forwardTargets.map((entry) => entry.value)).toEqual(['attacker@evil.test'])
    expect(iocs.forwardTargets[0].detail).toContain('copie')
  })

  it('lists rule names with what each rule does', () => {
    const filing = iocs.ruleNames.find((entry) => entry.value === 'classement')
    expect(filing.detail).toContain('déplace vers DOSSIERS')
    const exfil = iocs.ruleNames.find((entry) => entry.value === 'copie')
    expect(exfil.detail).toContain('transfère vers l’extérieur')
  })

  it('keeps applications and flagged subjects, deduplicated', () => {
    expect(iocs.apps.map((entry) => entry.value).sort()).toEqual(['a1b2', 'c3d4'])
    // "Facture" is both a repeated subject and the headline of a burst: one entry, not two.
    expect(iocs.subjects.map((entry) => entry.value)).toEqual(['Facture'])
  })

  it('carries the origin of every indicator, and a total', () => {
    const all = [
      ...iocs.signInIps,
      ...iocs.sendingIps,
      ...iocs.forwardTargets,
      ...iocs.ruleNames,
      ...iocs.apps,
      ...iocs.subjects,
    ]
    expect(all.every((entry) => Boolean(entry.basis))).toBe(true)
    expect(iocs.total).toBe(all.length)
  })

  it('returns empty lists rather than throwing on an empty collection', () => {
    const empty = buildIocs({}, {})
    expect(empty.total).toBe(0)
    expect(empty.signInIps).toEqual([])
  })
})
