import { buildSignInSessions, getAnalysisWindow, groupSignInsByIp } from './psit-bec-signals'
import { psitAsArray } from './psit-as-array'

/**
 * Geometry for the horizontal chronology strip.
 *
 * Pure arithmetic, no react-pdf, no DOM: the strip primitive only draws what this returns. That
 * split is what makes the hard part - projecting timestamps onto an axis, splitting tracks, capping
 * them - testable without rendering a PDF, and it is the hard part.
 *
 * Two inputs, on purpose. Sessions come from `buildSignInSessions`, which groups successful sign-ins
 * per address; the failure marks need the raw events, which sessions drop by definition. Nothing
 * here re-derives a session: one definition of a session in the codebase, used by the sentence and
 * by the segment that draws it, or the report contradicts itself.
 */

/** Above this, the least active addresses share one track. Four tracks is what 60 points hold. */
export const MAX_TRACKS = 4

/**
 * A segment thinner than this is invisible on paper; a single sign-in still has to be seen.
 *
 * Worth knowing what it costs: on a seven-day window drawn 400 points wide, one point is about
 * twenty-five minutes, so every session shorter than roughly fifty minutes comes out at this same
 * minimum. The strip is therefore precise about WHEN and coarse about HOW LONG, and
 * `minSegmentMinutes` returns the exact threshold so the note can state it instead of implying a
 * resolution the drawing does not have.
 */
export const MIN_SEGMENT_WIDTH = 2

// `new Date(null)` is the epoch, not an invalid date, and `new Date(undefined)` is NaN: without the
// falsy guard, a missing window start put the axis at 1970 and asked for twenty thousand ticks.
const msOf = (value) => {
  if (!value) return null
  const time = new Date(value).getTime()
  return Number.isFinite(time) ? time : null
}

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * One tick per day at midnight UTC, from the first midnight inside the window.
 *
 * Days, not hours: the window is a handful of days, and an hourly axis on 400 points is a grey bar.
 * `dense` says the ticks would collide, which is the caller's cue to label every other one.
 */
export const axisTicks = (startUtc, endUtc, width) => {
  const start = msOf(startUtc)
  const end = msOf(endUtc)
  if (start === null || end === null || end <= start) return []

  const firstMidnight = Math.ceil(start / DAY_MS) * DAY_MS
  const ticks = []
  for (let stamp = firstMidnight; stamp <= end; stamp += DAY_MS) {
    ticks.push({
      utc: new Date(stamp).toISOString().slice(0, 19) + 'Z',
      x: ((stamp - start) / (end - start)) * width,
    })
  }
  // Below roughly 24 points a tick label collides with its neighbour.
  const dense = ticks.length > 1 && width / (ticks.length - 1) < 24
  return ticks.map((tick) => ({ ...tick, dense }))
}

/** True when the window does not sit inside a single calendar year, so ticks need the year. */
export const straddlesYears = (startUtc, endUtc) =>
  String(startUtc).slice(0, 4) !== String(endUtc).slice(0, 4)

/**
 * Sessions grouped into tracks, one per address, capped at MAX_TRACKS.
 *
 * Track order follows `groupSignInsByIp`, which already sorts foreign-and-successful first then by
 * volume: the address an analyst reads first is the top track, and the tail is what gets folded.
 * Folding keeps the sessions - they are drawn on a shared track - it does not drop them.
 */
export const buildTracks = (sessions, order, max = MAX_TRACKS) => {
  const byIp = new Map()
  for (const session of sessions) {
    if (!byIp.has(session.ip)) byIp.set(session.ip, [])
    byIp.get(session.ip).push(session)
  }

  // Addresses in reading order, then any the order did not mention, so nothing is silently lost.
  const ranked = [
    ...order.filter((ip) => byIp.has(ip)),
    ...[...byIp.keys()].filter((ip) => !order.includes(ip)),
  ]

  if (ranked.length <= max) {
    return {
      tracks: ranked.map((ip) => ({ ip, folded: false, sessions: byIp.get(ip) })),
      foldedAddresses: 0,
      shownAddresses: ranked.length,
      totalAddresses: ranked.length,
    }
  }

  // One track is spent on the fold, so max - 1 addresses keep their own.
  const kept = ranked.slice(0, max - 1)
  const folded = ranked.slice(max - 1)
  return {
    tracks: [
      ...kept.map((ip) => ({ ip, folded: false, sessions: byIp.get(ip) })),
      { ip: null, folded: true, sessions: folded.flatMap((ip) => byIp.get(ip)) },
    ],
    foldedAddresses: folded.length,
    shownAddresses: max - 1,
    totalAddresses: ranked.length,
  }
}

/**
 * A session projected onto the axis.
 *
 * `clippedStart` / `clippedEnd` mark a session running past an edge of the window. That happens: the
 * window is computed from the collection's own extraction stamp, and a session can begin before it.
 * Drawing it to the edge without a mark would state a start time that is only where the axis stops.
 */
const projectSession = (session, start, span, width) => {
  const from = msOf(session.startUtc)
  const to = msOf(session.endUtc)
  if (from === null || to === null) return null

  const clippedStart = from < start
  const clippedEnd = to > start + span
  const left = Math.min(Math.max(from, start), start + span)
  const right = Math.min(Math.max(to, start), start + span)

  const x = ((left - start) / span) * width
  const rawWidth = ((right - left) / span) * width
  return {
    ip: session.ip,
    country: session.country,
    count: session.count,
    startUtc: session.startUtc,
    endUtc: session.endUtc,
    x,
    // A zero-length session is a real fact - one sign-in and nothing after it - so it is drawn at a
    // minimum width rather than not drawn. The note says so, because a 2-point mark and a 2-point
    // session are indistinguishable on paper.
    width: Math.max(rawWidth, MIN_SEGMENT_WIDTH),
    widened: rawWidth < MIN_SEGMENT_WIDTH,
    clippedStart,
    clippedEnd,
  }
}

/**
 * Everything the strip needs, or null when there is nothing to draw.
 *
 * Returning null rather than an empty frame is deliberate: a strip with no segment says "we looked
 * and found nothing" in a language nobody reads, and takes 60 points to do it. The caller renders
 * the table alone.
 */
export const buildTimelineStrip = (becData, { width = 400, unexpectedIps = [] } = {}) => {
  const window = getAnalysisWindow(becData)
  const start = msOf(window.startUtc)
  const end = msOf(window.endUtc)
  if (start === null || end === null || end <= start) return null

  const events = psitAsArray(becData?.SuspectUserSignIns)
  const sessions = buildSignInSessions(events)
  if (sessions.length === 0) return null

  const order = groupSignInsByIp(events).map((group) => group.ip)
  const { tracks, foldedAddresses, shownAddresses, totalAddresses } = buildTracks(sessions, order)

  const span = end - start
  const unexpected = new Set(unexpectedIps)

  const projected = tracks.map((track) => ({
    ip: track.ip,
    folded: track.folded,
    // A folded track mixes addresses, so it carries no single verdict: grey, and the note says the
    // qualification bears on the address.
    unexpected: track.folded ? false : unexpected.has(track.ip),
    country: track.sessions.find((session) => session.country)?.country || null,
    segments: track.sessions
      .map((session) => projectSession(session, start, span, width))
      .filter(Boolean),
  }))

  return {
    window,
    ticks: axisTicks(window.startUtc, window.endUtc, width),
    withYear: straddlesYears(window.startUtc, window.endUtc),
    tracks: projected,
    foldedAddresses,
    shownAddresses,
    totalAddresses,
    sessionCount: sessions.length,
    // Failures are collected, and a burst of them before the first successful session is the
    // signature of a spray. Marks only: no count, no scale, no second axis.
    failures: events
      .filter((event) => event?.Status !== 'Success' && msOf(event?.CreatedDateTime) !== null)
      .map((event) => msOf(event.CreatedDateTime))
      .filter((stamp) => stamp >= start && stamp <= end)
      .map((stamp) => ({ x: ((stamp - start) / span) * width }))
      .sort((a, b) => a.x - b.x),
    // The duration below which two segments are indistinguishable, in whole minutes.
    minSegmentMinutes: Math.round((MIN_SEGMENT_WIDTH / width) * (span / 60000)),
    anyWidened: projected.some((track) => track.segments.some((segment) => segment.widened)),
    anyClipped: projected.some((track) =>
      track.segments.some((segment) => segment.clippedStart || segment.clippedEnd)
    ),
  }
}
