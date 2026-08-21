import { Circle, G, Line, Rect, Svg, Text as SvgText, View } from '@react-pdf/renderer'
import { cardinal, dateAxis, dateProse, truncationNote } from '../../utils/psit-report-prose'
import { buildTimelineStrip } from '../../utils/psit-report-timeline'

/**
 * The chronology as a horizontal strip: one track per source address, one segment per session.
 *
 * What the table beside it cannot show. The table has one row per address, so it flattens a week
 * into a single first-seen and last-seen pair; the strip keeps the shape of the activity - a quiet
 * window, then a burst, then two addresses overlapping - which is the part an analyst reads at a
 * glance and a client asks about.
 *
 * Drawn with react-pdf's own Svg primitives. No chart library, no DOM, no async: the same tree
 * renders in the browser preview and through renderToBuffer in Node, which is the only way the
 * demonstration PDFs mean anything.
 *
 * All geometry comes from psit-report-timeline; this file places what it is given and writes the
 * labels. Keeping the arithmetic out of here is what lets a midnight crossing or a folded track be
 * tested without rendering a page.
 */

// The report's attention colour, already used for a table cell that needs looking at. Grey for the
// rest: two greys and a bordeaux stay apart in greyscale, a blue and a grey do not.
const UNEXPECTED = '#9B2C2C'
const ORDINARY = '#B8BEC6'
const AXIS = '#8A94A0'
const INK = '#2D3748'
const FAILURE = '#6B7280'

const WIDTH = 400
const TRACK_HEIGHT = 11
const TRACK_GAP = 3
const SEGMENT_HEIGHT = 7
const LABEL_WIDTH = 96
const AXIS_HEIGHT = 12
const FAILURE_BAND = 8

export const PsitTimelineStrip = ({ becData, unexpectedIps = [] }) => {
  const strip = buildTimelineStrip(becData, { width: WIDTH, unexpectedIps })
  // No session on the window: no strip, no empty frame. The table alone says what there is.
  if (!strip) return null

  const trackCount = strip.tracks.length
  const bodyHeight = trackCount * (TRACK_HEIGHT + TRACK_GAP)
  const hasFailures = strip.failures.length > 0
  const height = AXIS_HEIGHT + bodyHeight + (hasFailures ? FAILURE_BAND : 0) + 4

  const trackY = (index) => AXIS_HEIGHT + index * (TRACK_HEIGHT + TRACK_GAP)

  return (
    <View wrap={false}>
      <Svg width={LABEL_WIDTH + WIDTH + 8} height={height}>
        {/* Graduations first, so a segment is never hidden behind a rule. */}
        <G>
          {strip.ticks.map((tick, index) => (
            <G key={`tick-${index}`}>
              <Line
                x1={LABEL_WIDTH + tick.x}
                y1={AXIS_HEIGHT - 3}
                x2={LABEL_WIDTH + tick.x}
                y2={AXIS_HEIGHT + bodyHeight}
                stroke={AXIS}
                strokeWidth={0.4}
                strokeDasharray="1 2"
              />
              {/* A dense window labels every other tick: past roughly a fortnight the labels
                  overlap, and two dates printed on top of each other are worse than one. */}
              {!tick.dense || index % 2 === 0 ? (
                <SvgText
                  x={LABEL_WIDTH + tick.x}
                  y={7}
                  fill={INK}
                  style={{ fontSize: 5.5 }}
                  textAnchor="middle"
                >
                  {dateAxis(tick.utc, { withYear: strip.withYear })}
                </SvgText>
              ) : null}
            </G>
          ))}
        </G>

        {strip.tracks.map((track, index) => {
          const y = trackY(index)
          return (
            <G key={`track-${index}`}>
              <SvgText x={0} y={y + TRACK_HEIGHT - 3} fill={INK} style={{ fontSize: 5.5 }}>
                {track.folded
                  ? 'autres adresses'
                  : `${track.ip}${track.country ? ` (${track.country})` : ''}`}
              </SvgText>
              {/* The track's own baseline: an address with a single session still reads as a track
                  rather than as a stray mark. */}
              <Line
                x1={LABEL_WIDTH}
                y1={y + TRACK_HEIGHT / 2}
                x2={LABEL_WIDTH + WIDTH}
                y2={y + TRACK_HEIGHT / 2}
                stroke={AXIS}
                strokeWidth={0.3}
              />
              {track.segments.map((segment, segmentIndex) => (
                <G key={`seg-${index}-${segmentIndex}`}>
                  <Rect
                    x={LABEL_WIDTH + segment.x}
                    y={y + (TRACK_HEIGHT - SEGMENT_HEIGHT) / 2}
                    width={segment.width}
                    height={SEGMENT_HEIGHT}
                    fill={track.unexpected ? UNEXPECTED : ORDINARY}
                  />
                  {/* A session cut by the edge of the window carries a mark there: the axis stops,
                      the session did not, and a bar flush to the border would say otherwise. */}
                  {segment.clippedStart ? (
                    <Line
                      x1={LABEL_WIDTH}
                      y1={y + 1}
                      x2={LABEL_WIDTH}
                      y2={y + TRACK_HEIGHT - 1}
                      stroke={INK}
                      strokeWidth={1.2}
                    />
                  ) : null}
                  {segment.clippedEnd ? (
                    <Line
                      x1={LABEL_WIDTH + WIDTH}
                      y1={y + 1}
                      x2={LABEL_WIDTH + WIDTH}
                      y2={y + TRACK_HEIGHT - 1}
                      stroke={INK}
                      strokeWidth={1.2}
                    />
                  ) : null}
                  {/* The count of sign-ins, when the segment is wide enough to carry it. Intensity
                      is never height: at seven points a varying bar is unreadable. */}
                  {segment.width >= 14 && segment.count > 1 ? (
                    <SvgText
                      x={LABEL_WIDTH + segment.x + segment.width / 2}
                      y={y - 1}
                      fill={INK}
                      style={{ fontSize: 5 }}
                      textAnchor="middle"
                    >
                      {String(segment.count)}
                    </SvgText>
                  ) : null}
                </G>
              ))}
            </G>
          )
        })}

        {/* Failed attempts, as marks under the tracks. A burst before the first successful session
            is the signature of a spray, and that is all this band claims: no count, no scale. */}
        {hasFailures
          ? strip.failures.map((failure, index) => (
              <Circle
                key={`fail-${index}`}
                cx={LABEL_WIDTH + failure.x}
                cy={AXIS_HEIGHT + bodyHeight + FAILURE_BAND / 2}
                r={0.9}
                fill={FAILURE}
              />
            ))
          : null}
      </Svg>
    </View>
  )
}

/**
 * The note that makes the strip readable, and legible about what it is not.
 *
 * Separate from the drawing so the caller can put both inside one unbreakable box: a strip whose
 * note landed on the next page states a source it no longer carries.
 */
export const psitTimelineStripNote = (becData, { unexpectedIps = [] } = {}) => {
  const strip = buildTimelineStrip(becData, { width: WIDTH, unexpectedIps })
  if (!strip) return null

  const lines = [
    `Connexions interactives relevées dans les journaux Entra ID, sur la fenêtre analysée, du ${dateProse(
      strip.window.startUtc,
      { article: false }
    )} au ${dateProse(strip.window.endUtc, { article: false })}. Les connexions non interactives (jetons, IMAP, EWS) ne sont pas couvertes par cette collecte.`,
    // The point the design brief insisted on, and it is not a detail: the verdict is recorded
    // against the address, so every session of that address takes the colour, one qualification.
    "Une piste en bordeaux porte une adresse source qualifiée inattendue au sens des qualifications de la section « Constats et base probante ». La qualification porte sur l'adresse source, non sur chaque session prise séparément.",
    `Un segment couvre une session, c'est-à-dire des connexions successives depuis la même adresse séparées de moins de trente minutes. Une session plus courte que ${cardinal(
      strip.minSegmentMinutes,
      'minute'
    )} est dessinée à une largeur minimale lisible : à cette échelle, la position d'un segment est exacte, sa longueur ne l'est qu'au-delà de cette durée.`,
  ]

  if (strip.anyClipped) {
    lines.push(
      "Un trait vertical épais au bord de l'axe marque une session qui commence avant la fenêtre analysée ou se poursuit après elle. Son étendue réelle n'est pas connue de cette collecte."
    )
  }

  if (strip.foldedAddresses > 0) {
    lines.push(
      `${truncationNote(strip.shownAddresses, strip.totalAddresses)} Les adresses restantes partagent la piste « autres adresses », dans l'ordre de lecture du tableau ci-dessous.`
    )
  }

  if (strip.failures.length > 0) {
    lines.push(
      `La bande de points sous les pistes situe ${cardinal(
        strip.failures.length,
        'tentative'
      )} en échec sur le même axe. Aucune échelle de comptage n'y est portée.`
    )
  }

  return lines.join('\n')
}
