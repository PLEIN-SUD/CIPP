import { adaptGraphSignIn, adaptGraphSignIns, readSignInGroup } from '../../src/utils/psit-soc-signin-adapter'
import { groupSignInsByIp } from '../../src/utils/psit-bec-signals'

// The adapter is the seam between the live Graph sign-in log and the BEC grouping logic. If it
// drifts, the SOC panel colours the wrong rows, so the shape it produces is pinned here, and the
// end-to-end path (raw Graph -> adapter -> groupSignInsByIp) is exercised against a known case.

describe('adaptGraphSignIn', () => {
  it('flattens status, location and reads errorCode 0 as success', () => {
    const adapted = adaptGraphSignIn({
      createdDateTime: '2026-08-24T06:49:00Z',
      ipAddress: '195.65.131.222',
      status: { errorCode: 0 },
      location: { countryOrRegion: 'CH', city: 'Bretigny' },
      appDisplayName: 'Microsoft Graph',
      clientAppUsed: 'Browser',
    })

    expect(adapted.CreatedDateTime).toBe('2026-08-24T06:49:00Z')
    expect(adapted.IPAddress).toBe('195.65.131.222')
    expect(adapted.Country).toBe('CH')
    expect(adapted.City).toBe('Bretigny')
    expect(adapted.Status).toBe('Success')
    expect(adapted.AppDisplayName).toBe('Microsoft Graph')
  })

  it('reads any non-zero errorCode as a failed attempt', () => {
    expect(adaptGraphSignIn({ status: { errorCode: 50126 } }).Status).toBe('Failed')
  })
})

describe('adaptGraphSignIns', () => {
  it('flags an entry as foreign when its country differs from the usage location', () => {
    const [swiss, french] = adaptGraphSignIns(
      [
        { ipAddress: '1.1.1.1', status: { errorCode: 0 }, location: { countryOrRegion: 'CH' } },
        { ipAddress: '2.2.2.2', status: { errorCode: 0 }, location: { countryOrRegion: 'FR' } },
      ],
      'FR'
    )

    expect(swiss.ForeignLocation).toBe(true)
    expect(french.ForeignLocation).toBe(false)
  })

  it('does not flag anything foreign when the usage location is unknown', () => {
    const [entry] = adaptGraphSignIns([{ status: { errorCode: 0 }, location: { countryOrRegion: 'CH' } }], null)
    expect(entry.ForeignLocation).toBe(false)
  })
})

describe('the adapter feeds groupSignInsByIp correctly', () => {
  it('groups a real-shaped log and ranks the foreign success first', () => {
    const raw = [
      { ipAddress: '195.65.131.222', createdDateTime: '2026-08-24T09:02:00Z', status: { errorCode: 0 }, location: { countryOrRegion: 'CH', city: 'Bretigny' }, appDisplayName: 'Microsoft Graph' },
      { ipAddress: '90.1.1.1', createdDateTime: '2026-08-24T08:00:00Z', status: { errorCode: 0 }, location: { countryOrRegion: 'FR', city: 'Paris' }, appDisplayName: 'Outlook' },
      { ipAddress: '5.5.5.5', createdDateTime: '2026-08-24T02:00:00Z', status: { errorCode: 50126 }, location: { countryOrRegion: 'CN' } },
    ]
    const groups = groupSignInsByIp(adaptGraphSignIns(raw, 'FR'))

    expect(groups[0].ip).toBe('195.65.131.222')
    expect(groups[0].foreign).toBe(true)
    expect(groups[0].successes).toBe(1)
    const spray = groups.find((group) => group.ip === '5.5.5.5')
    expect(spray.failures).toBe(1)
    expect(spray.successes).toBe(0)
  })
})

describe('readSignInGroup', () => {
  it('reads a foreign successful address as compromise, a local one as expected', () => {
    expect(readSignInGroup({ foreign: true, successes: 2, failures: 0, apps: [] }).foreignSuccess).toBe(true)
    expect(readSignInGroup({ foreign: false, successes: 3, failures: 0, apps: [] }).onlySuccessfulLocal).toBe(true)
  })

  it('flags a success that follows a burst of failures (spray that got in)', () => {
    expect(readSignInGroup({ foreign: false, successes: 1, failures: 6, apps: [] }).successAfterFailures).toBe(true)
  })

  it('flags a legacy client, which cannot be protected by MFA', () => {
    expect(readSignInGroup({ successes: 1, failures: 0, apps: ['IMAP4'] }).usesLegacyClient).toBe(true)
    expect(readSignInGroup({ successes: 1, failures: 0, apps: ['Microsoft Graph'] }).usesLegacyClient).toBe(false)
  })
})
