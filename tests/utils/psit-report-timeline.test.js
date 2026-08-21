import {
  MAX_TRACKS,
  MIN_SEGMENT_WIDTH,
  axisTicks,
  buildTimelineStrip,
  buildTracks,
  straddlesYears,
} from '../../src/utils/psit-report-timeline'

// Geometry only. Nothing here renders, which is the point: the projection, the track split and the
// minimum widths are where a strip goes wrong, and none of it needs a PDF to be checked.

const WIDTH = 400

/** A successful sign-in, `minutes` past 06:00 UTC on 20 August 2026. */
const at = (minutes, ip, overrides = {}) => ({
  CreatedDateTime: new Date(Date.UTC(2026, 7, 20, 6, minutes)).toISOString(),
  IPAddress: ip,
  Country: 'IT',
  City: 'Verone',
  Status: 'Success',
  AppDisplayName: 'Microsoft Graph',
  ForeignLocation: true,
  ...overrides,
})

/** A collection extracted on 20 August at 10:32, over a window of `days`. */
const collection = (signIns, days = 7) => ({
  ExtractedAt: '2026-08-20T10:32:00Z',
  AnalysisWindowDays: days,
  SuspectUserSignIns: signIns,
})

describe('axisTicks', () => {
  it('puts one tick per midnight inside the window', () => {
    const ticks = axisTicks('2026-08-13T10:32:00Z', '2026-08-20T10:32:00Z', WIDTH)

    expect(ticks).toHaveLength(7)
    expect(ticks[0].utc).toBe('2026-08-14T00:00:00Z')
    expect(ticks[6].utc).toBe('2026-08-20T00:00:00Z')
  })

  it('places them proportionally, and the last one before the right edge', () => {
    const ticks = axisTicks('2026-08-13T00:00:00Z', '2026-08-20T00:00:00Z', WIDTH)

    // Eight midnights over seven days: both edges are midnights here.
    expect(ticks[0].x).toBeCloseTo(0, 5)
    expect(ticks[ticks.length - 1].x).toBeCloseTo(WIDTH, 5)
    expect(ticks[1].x).toBeCloseTo(WIDTH / 7, 5)
  })

  it('flags a window whose ticks would collide', () => {
    const roomy = axisTicks('2026-08-18T00:00:00Z', '2026-08-20T00:00:00Z', WIDTH)
    const cramped = axisTicks('2026-06-01T00:00:00Z', '2026-08-20T00:00:00Z', WIDTH)

    expect(roomy.every((tick) => tick.dense === false)).toBe(true)
    expect(cramped.every((tick) => tick.dense === true)).toBe(true)
  })

  it('handles a window of a single day', () => {
    const ticks = axisTicks('2026-08-19T12:00:00Z', '2026-08-20T12:00:00Z', WIDTH)

    expect(ticks).toHaveLength(1)
    expect(ticks[0].utc).toBe('2026-08-20T00:00:00Z')
    expect(ticks[0].x).toBeCloseTo(WIDTH / 2, 5)
  })

  it('returns nothing for a window that is empty or inverted', () => {
    expect(axisTicks('2026-08-20T00:00:00Z', '2026-08-20T00:00:00Z', WIDTH)).toEqual([])
    expect(axisTicks('2026-08-20T00:00:00Z', '2026-08-13T00:00:00Z', WIDTH)).toEqual([])
    expect(axisTicks(null, '2026-08-20T00:00:00Z', WIDTH)).toEqual([])
  })
})

describe('straddlesYears', () => {
  it('is true only when the window crosses a new year', () => {
    expect(straddlesYears('2025-12-28T00:00:00Z', '2026-01-04T00:00:00Z')).toBe(true)
    expect(straddlesYears('2026-08-13T00:00:00Z', '2026-08-20T00:00:00Z')).toBe(false)
  })
})

describe('buildTracks', () => {
  const session = (ip, minutes) => ({ ip, startUtc: `2026-08-20T06:${minutes}:00Z`, count: 1 })

  it('gives each address its own track, in reading order', () => {
    const { tracks, totalAddresses } = buildTracks(
      [session('B', '00'), session('A', '10'), session('A', '20')],
      ['A', 'B']
    )

    expect(tracks.map((track) => track.ip)).toEqual(['A', 'B'])
    expect(tracks[0].sessions).toHaveLength(2)
    expect(totalAddresses).toBe(2)
  })

  it('folds the least-read addresses onto one shared track past the cap', () => {
    const sessions = ['A', 'B', 'C', 'D', 'E', 'F'].map((ip) => session(ip, '00'))
    const { tracks, foldedAddresses, shownAddresses, totalAddresses } = buildTracks(sessions, [
      'A',
      'B',
      'C',
      'D',
      'E',
      'F',
    ])

    expect(tracks).toHaveLength(MAX_TRACKS)
    expect(tracks.slice(0, 3).map((track) => track.ip)).toEqual(['A', 'B', 'C'])
    expect(tracks[3].folded).toBe(true)
    expect(tracks[3].ip).toBeNull()
    // The fold keeps the sessions, it does not drop them.
    expect(tracks[3].sessions).toHaveLength(3)
    expect(foldedAddresses).toBe(3)
    expect(shownAddresses).toBe(3)
    expect(totalAddresses).toBe(6)
  })

  it('keeps an address the reading order never mentioned', () => {
    const { tracks } = buildTracks([session('A', '00'), session('Z', '10')], ['A'])

    expect(tracks.map((track) => track.ip)).toEqual(['A', 'Z'])
  })
})

describe('buildTimelineStrip', () => {
  it('projects a session to its real position, and to a real width when it is long enough', () => {
    // Seven sign-ins twenty-five minutes apart: one session of 06:00 to 08:30, since each gap stays
    // under the threshold. Chaining matters - two events five hours apart are two sessions, not one
    // long one, and asserting a width on the wrong one is how this test failed first.
    const chained = [0, 25, 50, 75, 100, 125, 150].map((minutes) => at(minutes, 'A'))
    const strip = buildTimelineStrip(collection(chained), { width: WIDTH })
    const [segment] = strip.tracks[0].segments

    const span = 7 * 24 * 60
    expect(strip.tracks[0].segments).toHaveLength(1)
    expect(segment.x).toBeCloseTo(((span - 4 * 60 - 32) / span) * WIDTH, 3)
    expect(segment.width).toBeCloseTo((150 / span) * WIDTH, 3)
    expect(segment.widened).toBe(false)
    expect(segment.count).toBe(7)
  })

  it('says how coarse it is: below that duration, every segment looks the same', () => {
    // One point is about twenty-five minutes on this window, so a half-hour session is 1.2 points
    // and gets widened. That is a property of the drawing, not a defect, and the note states it.
    const strip = buildTimelineStrip(collection([at(0, 'A'), at(30, 'A')]), { width: WIDTH })
    const [segment] = strip.tracks[0].segments

    expect(segment.width).toBe(MIN_SEGMENT_WIDTH)
    expect(segment.widened).toBe(true)
    expect(strip.minSegmentMinutes).toBe(50)
  })

  it('gives a zero-length session a readable width and says it widened it', () => {
    const strip = buildTimelineStrip(collection([at(0, 'A')]), { width: WIDTH })
    const [segment] = strip.tracks[0].segments

    expect(segment.width).toBe(MIN_SEGMENT_WIDTH)
    expect(segment.widened).toBe(true)
    expect(strip.anyWidened).toBe(true)
  })

  it('draws two interleaved addresses as two tracks of one segment each', () => {
    // The case the whole strip exists for, and the case the session grouping used to shatter.
    const strip = buildTimelineStrip(
      collection([at(0, 'A'), at(2, 'B'), at(10, 'A'), at(12, 'B'), at(20, 'A'), at(22, 'B')]),
      { width: WIDTH }
    )

    expect(strip.tracks).toHaveLength(2)
    expect(strip.tracks.map((track) => track.segments.length)).toEqual([1, 1])
    expect(strip.sessionCount).toBe(2)
    // They overlap in time, which is exactly what stacked tracks are for.
    const [first, second] = strip.tracks.map((track) => track.segments[0])
    expect(first.x).toBeLessThan(second.x + second.width)
    expect(second.x).toBeLessThan(first.x + first.width)
  })

  it('crosses midnight UTC without splitting the segment', () => {
    const strip = buildTimelineStrip(
      collection([
        { ...at(0, 'A'), CreatedDateTime: '2026-08-19T23:50:00Z' },
        { ...at(0, 'A'), CreatedDateTime: '2026-08-20T00:10:00Z' },
      ]),
      { width: WIDTH }
    )

    expect(strip.tracks[0].segments).toHaveLength(1)
    expect(strip.tracks[0].segments[0].count).toBe(2)
  })

  it('clips a session that starts before the window and marks it', () => {
    const strip = buildTimelineStrip(
      collection([
        { ...at(0, 'A'), CreatedDateTime: '2026-08-01T06:00:00Z' },
        { ...at(0, 'A'), CreatedDateTime: '2026-08-01T06:10:00Z' },
        at(0, 'A'),
      ]),
      { width: WIDTH }
    )

    // The out-of-window session is clipped to the left edge rather than drawn outside the axis.
    const clipped = strip.tracks[0].segments.find((segment) => segment.clippedStart)
    expect(clipped).toBeTruthy()
    expect(clipped.x).toBe(0)
    expect(strip.anyClipped).toBe(true)
  })

  it('folds past four addresses and reports how many', () => {
    const many = ['A', 'B', 'C', 'D', 'E', 'F'].flatMap((ip, index) => [at(index * 2, ip)])
    const strip = buildTimelineStrip(collection(many), { width: WIDTH })

    expect(strip.tracks).toHaveLength(MAX_TRACKS)
    expect(strip.tracks[MAX_TRACKS - 1].folded).toBe(true)
    expect(strip.shownAddresses).toBe(3)
    expect(strip.totalAddresses).toBe(6)
    expect(strip.foldedAddresses).toBe(3)
  })

  it('marks a track as unexpected only when its own address is qualified', () => {
    const strip = buildTimelineStrip(collection([at(0, 'A'), at(2, 'B')]), {
      width: WIDTH,
      unexpectedIps: ['A'],
    })

    const byIp = Object.fromEntries(strip.tracks.map((track) => [track.ip, track.unexpected]))
    expect(byIp.A).toBe(true)
    expect(byIp.B).toBe(false)
  })

  it('never marks a folded track as unexpected, since it mixes addresses', () => {
    const many = ['A', 'B', 'C', 'D', 'E'].map((ip, index) => at(index * 2, ip))
    const strip = buildTimelineStrip(collection(many), { width: WIDTH, unexpectedIps: ['E'] })

    expect(strip.tracks[MAX_TRACKS - 1].folded).toBe(true)
    expect(strip.tracks[MAX_TRACKS - 1].unexpected).toBe(false)
  })

  it('keeps the whole collection window on the axis, not just the active range', () => {
    const strip = buildTimelineStrip(collection([at(0, 'A')]), { width: WIDTH })

    expect(strip.window.startUtc).toBe('2026-08-13T10:32:00Z')
    expect(strip.window.endUtc).toBe('2026-08-20T10:32:00Z')
    // The one session sits near the right edge: six days of the window are empty, and that shows.
    expect(strip.tracks[0].segments[0].x).toBeGreaterThan(WIDTH * 0.9)
  })

  it('projects failures as marks on the same axis', () => {
    const strip = buildTimelineStrip(
      collection([at(0, 'A'), at(5, 'A', { Status: 'Failure' }), at(6, 'A', { Status: 'Failure' })]),
      { width: WIDTH }
    )

    expect(strip.failures).toHaveLength(2)
    expect(strip.failures[0].x).toBeLessThan(strip.failures[1].x)
    // And they are not sessions.
    expect(strip.sessionCount).toBe(1)
  })

  it('drops a failure that falls outside the window', () => {
    const strip = buildTimelineStrip(
      collection([at(0, 'A'), { ...at(0, 'A'), Status: 'Failure', CreatedDateTime: '2026-07-01T06:00:00Z' }]),
      { width: WIDTH }
    )

    expect(strip.failures).toEqual([])
  })

  it('returns null when there is no session to draw', () => {
    expect(buildTimelineStrip(collection([]))).toBeNull()
    expect(buildTimelineStrip(collection([at(0, 'A', { Status: 'Failure' })]))).toBeNull()
    expect(buildTimelineStrip({})).toBeNull()
  })

  it('holds a window of a single day', () => {
    const strip = buildTimelineStrip(collection([at(0, 'A'), at(30, 'A')], 1), { width: WIDTH })

    expect(strip.window.startUtc).toBe('2026-08-19T10:32:00Z')
    expect(strip.ticks).toHaveLength(1)
    expect(strip.tracks[0].segments).toHaveLength(1)
  })
})
