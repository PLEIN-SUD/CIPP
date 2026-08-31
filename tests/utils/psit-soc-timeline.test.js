import { describe, expect, it } from 'vitest'
import { psitSocTimeline } from '../../src/utils/psit-soc-timeline'

const socCase = {
  CaseId: 'PSIT-SOC-1',
  Title: 'Deux pays en dix minutes',
  CreatedUtc: '2026-08-31T09:56:00Z',
  ActionLog: [
    // Logged after lunch, happened at 10:28: the timeline places the gesture, not the typing.
    {
      Action: 'remediate-user',
      Detail: 'Remédiation CIPP',
      Analyst: 'a@partner.test',
      Utc: '2026-08-31T14:02:00Z',
      OccurredUtc: '2026-08-31T10:28:00Z',
    },
  ],
}

const evidence = {
  user: {
    signIns: [
      {
        createdDateTime: '2026-08-31T09:27:45Z',
        ipAddress: '185.107.56.158',
        appDisplayName: 'Office 365 Exchange Online',
        status: { errorCode: 0 },
        location: { countryOrRegion: 'NL' },
      },
      // A failure: noise on a timeline, the identity panel details it.
      {
        createdDateTime: '2026-08-31T09:23:13Z',
        ipAddress: '185.107.56.158',
        status: { errorCode: 70043 },
      },
    ],
  },
  download: {
    files: [
      { WhenUtc: '2026-08-28T15:20:00Z', Name: 'a.xlsx' },
      { WhenUtc: '2026-08-28T15:50:00Z', Name: 'b.xlsx' },
      { WhenUtc: '2026-08-28T15:24:00Z', Name: 'c.xlsx' },
    ],
  },
  app: {
    consentAudit: [{ whenUtc: '2026-08-20T08:02:00Z', who: 'dirigeant@client.test', ip: '203.0.113.9' }],
  },
}

describe('psitSocTimeline', () => {
  it('merges every source on one axis, sorted by when it happened', () => {
    const events = psitSocTimeline(socCase, evidence)
    const kinds = events.map((entry) => entry.kind)

    expect(kinds[0]).toBe('consent')
    expect(events.map((entry) => entry.whenUtc)).toEqual(
      [...events.map((entry) => entry.whenUtc)].sort((a, b) => Date.parse(a) - Date.parse(b))
    )
  })

  it('places a journal entry at the hour the gesture happened, not the hour it was typed', () => {
    const events = psitSocTimeline(socCase, evidence)
    const remediation = events.find((entry) => entry.label === 'remediate-user')
    expect(remediation.whenUtc).toBe('2026-08-31T10:28:00Z')
  })

  it('summarises volume instead of dumping it: two download markers, successes only', () => {
    const events = psitSocTimeline(socCase, evidence)

    expect(events.filter((entry) => entry.kind === 'download')).toHaveLength(2)
    const first = events.find((entry) => entry.label === 'Premier téléchargement relevé')
    expect(first.whenUtc).toBe('2026-08-28T15:20:00.000Z')
    expect(first.detail).toMatch(/3 fichiers/)
    // The failed sign-in never appears.
    expect(events.filter((entry) => entry.kind === 'signin')).toHaveLength(1)
  })

  it('renders an empty dossier as an empty axis, never throws', () => {
    expect(psitSocTimeline({}, {})).toEqual([])
    expect(psitSocTimeline(undefined, undefined)).toEqual([])
  })
})
