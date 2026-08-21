import { buildSignInSessions } from '../../src/utils/psit-bec-signals'

// Session grouping, on its own, because it feeds two things at once: the chronology sentences of
// the incident report and the horizontal strip that draws the same sessions as segments. A wrong
// grouping is not a cosmetic defect there - it makes the report state that access was instantaneous
// when it lasted twenty minutes.
//
// The defect this file exists for: grouping used to extend a session only when it was the last one
// created, so two addresses active in alternation split into one zero-length session per event.

const GAP_MINUTES = 30

/** A successful sign-in at `minutes` past 06:00 UTC on 20 August 2026. */
const at = (minutes, ip, overrides = {}) => ({
  CreatedDateTime: new Date(Date.UTC(2026, 7, 20, 6, minutes)).toISOString(),
  IPAddress: ip,
  Status: 'Success',
  Country: 'IT',
  City: 'Verone',
  AppDisplayName: 'Microsoft Graph',
  ForeignLocation: true,
  ...overrides,
})

/** "ip start-end xN", compact enough to assert a whole grouping in one line. */
const shape = (sessions) =>
  sessions.map((s) => `${s.ip} ${s.startUtc.slice(11, 16)}-${s.endUtc.slice(11, 16)} x${s.count}`)

describe('buildSignInSessions', () => {
  it('groups one address into a single window', () => {
    expect(shape(buildSignInSessions([at(0, 'A'), at(10, 'A'), at(20, 'A')]))).toEqual([
      'A 06:00-06:20 x3',
    ])
  })

  it('keeps two interleaved addresses whole, whatever the arrival order', () => {
    // Six events, two addresses, strict alternation. Before the fix: six sessions of one event,
    // each of zero length. This is the ordinary shape of a compromise while the account holder is
    // still working, so it is the case that matters most.
    const interleaved = [at(0, 'A'), at(2, 'B'), at(10, 'A'), at(12, 'B'), at(20, 'A'), at(22, 'B')]

    expect(shape(buildSignInSessions(interleaved))).toEqual([
      'A 06:00-06:20 x3',
      'B 06:02-06:22 x3',
    ])
  })

  it('does not depend on the order the events are passed in', () => {
    const forwards = [at(0, 'A'), at(2, 'B'), at(10, 'A'), at(12, 'B')]
    const shuffled = [at(12, 'B'), at(0, 'A'), at(10, 'A'), at(2, 'B')]

    expect(shape(buildSignInSessions(shuffled))).toEqual(shape(buildSignInSessions(forwards)))
  })

  it('holds a partial overlap as two full windows, not four fragments', () => {
    // A starts first and ends last; B lives inside it. Neither may be cut by the other.
    const overlapping = [at(0, 'A'), at(5, 'B'), at(25, 'A'), at(30, 'B'), at(50, 'A')]

    expect(shape(buildSignInSessions(overlapping))).toEqual([
      'A 06:00-06:50 x3',
      'B 06:05-06:30 x2',
    ])
  })

  it('continues the session on a gap exactly equal to the threshold', () => {
    // The boundary is inclusive, which is a choice and not an accident: a sign-in landing exactly
    // thirty minutes later is the renewal of a token, not a new session.
    expect(shape(buildSignInSessions([at(0, 'A'), at(GAP_MINUTES, 'A')]))).toEqual([
      'A 06:00-06:30 x2',
    ])
  })

  it('splits one minute past the threshold', () => {
    expect(shape(buildSignInSessions([at(0, 'A'), at(GAP_MINUTES + 1, 'A')]))).toEqual([
      'A 06:00-06:00 x1',
      'A 06:31-06:31 x1',
    ])
  })

  it('renders an isolated event as a session of its own, of zero length', () => {
    // Zero length is a fact here, not a defect: one sign-in and nothing else. The strip draws it at
    // a minimum readable width and says so in its note.
    const [session] = buildSignInSessions([at(0, 'A')])

    expect(session.startUtc).toBe(session.endUtc)
    expect(session.count).toBe(1)
  })

  it('carries the address metadata of the first event of the session', () => {
    const [session] = buildSignInSessions([
      at(0, 'A', { City: 'Verone', AppDisplayName: 'Microsoft Graph' }),
      at(10, 'A', { City: 'Milan', AppDisplayName: 'Outlook' }),
    ])

    expect(session.country).toBe('IT')
    expect(session.cities).toEqual(['Verone', 'Milan'])
    expect(session.apps).toEqual(['Microsoft Graph', 'Outlook'])
  })

  it('ignores failures: a session is successful access, by definition', () => {
    const withFailures = [
      at(0, 'A', { Status: 'Failure' }),
      at(1, 'A', { Status: 'Failure' }),
      at(2, 'A'),
    ]

    expect(shape(buildSignInSessions(withFailures))).toEqual(['A 06:02-06:02 x1'])
  })

  it('groups sign-ins with no address under one label rather than dropping them', () => {
    const anonymous = [at(0, undefined), at(10, undefined)]

    expect(shape(buildSignInSessions(anonymous))).toEqual(['inconnue 06:00-06:10 x2'])
  })

  it('returns nothing for no events', () => {
    expect(buildSignInSessions([])).toEqual([])
    expect(buildSignInSessions()).toEqual([])
  })
})
