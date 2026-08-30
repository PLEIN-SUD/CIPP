import { useEffect } from 'react'
import { Image, Text, View } from '@react-pdf/renderer'
import { ApiGetCall } from '../../../api/ApiCall'
import { Section, Paragraph, Note } from '../../CippPdf'
import { psitContributorRole } from '../../../utils/psit-report-contributors'

/**
 * The people who worked on a dossier, named in the report with their face and their job.
 *
 * A report signed by whoever holds the record misnames the work: an investigation is several
 * people, and the one who closed it is rarely the only one who looked. The list is read from the
 * journal, so it says what happened rather than what was declared.
 *
 * Photos and job titles come from Entra, through the two calls the portal already makes for its
 * own avatars, so a face shown here is the same face shown in the queue.
 */

/**
 * One photo, fetched by its own component.
 *
 * react-pdf renders through its own reconciler, outside the React tree, so a document cannot
 * fetch anything: everything it draws has to be in hand before it is built. And a list of
 * unknown length cannot call a hook per item without breaking the rules of hooks. One tiny
 * component per person solves both - it renders nothing, it fetches its own photo, and it hands
 * it up. The query key is the portal's own, so a colleague's photo already on screen costs
 * nothing here.
 */
const PhotoLoader = ({ upn, onLoaded }) => {
  const photo = ApiGetCall({
    url: '/api/ListUserPhoto',
    data: { UserID: upn },
    queryKey: `userPhoto-${upn}`,
    waiting: Boolean(upn),
    staleTime: Infinity,
    responseType: 'blob',
    convertToDataUrl: true,
  })

  // A data URL, or nothing. The value is compared by identity downstream, so anything that is
  // not a string is a new reference on every render: the effect fires, state changes, the render
  // repeats, and the page loops until it runs out of memory. Asking for what this actually
  // wants - a data URL - closes that door and rejects a blob that never converted.
  const dataUrl =
    typeof photo.data === 'string' && photo.data.startsWith('data:') ? photo.data : null

  useEffect(() => {
    if (dataUrl && !photo.isError) onLoaded(upn, dataUrl)
  }, [dataUrl, photo.isError, upn, onLoaded])

  return null
}

/** Renders nothing on screen: it exists to put the photos in hand before the document is built. */
export const PsitReportPhotoLoaders = ({ contributors = [], onLoaded }) => (
  <>
    {contributors.map((contributor) => (
      <PhotoLoader key={contributor.upn} upn={contributor.upn} onLoaded={onLoaded} />
    ))}
  </>
)

// An address gives its local part and nothing else: bob@partner.test is B, not BP.
const initialsOf = (name) =>
  String(name ?? '')
    .split('@')[0]
    .split(/[\s._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')

const frDay = (iso) => {
  const parsed = Date.parse(iso)
  if (!iso || Number.isNaN(parsed)) return null
  return new Date(parsed).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

/** The span a person worked over, or nothing: one gesture is a date, not a period. */
const span = (contributor) => {
  const first = frDay(contributor?.firstUtc)
  const last = frDay(contributor?.lastUtc)
  if (!first) return ''
  return last && last !== first ? `du ${first} au ${last}` : `le ${first}`
}

/**
 * The PDF section. Directory is a map of address to data URI; a missing photo draws the initials
 * rather than a hole, and a missing job title prints nothing rather than a guess.
 */
export const PsitReportContributors = ({ contributors = [], photos = {}, names = {} }) => {
  if (contributors.length === 0) {
    return (
      <Section title="Intervenants">
        <Note>
          Aucun intervenant nommé : ce dossier ne porte aucune action journalisée par une personne.
        </Note>
      </Section>
    )
  }

  return (
    <Section title="Intervenants">
      <Paragraph>
        {contributors.length > 1
          ? `${contributors.length} personnes sont intervenues sur ce dossier. Les gestes indiqués sont ceux qui figurent au journal.`
          : 'Une personne est intervenue sur ce dossier. Les gestes indiqués sont ceux qui figurent au journal.'}
      </Paragraph>
      <View>
        {contributors.map((contributor) => {
          const identity = names[contributor.upn?.toLowerCase()] ?? {}
          const shown = identity.displayName || contributor.upn
          const photo = photos[contributor.upn?.toLowerCase()]
          const role = psitContributorRole(contributor)
          const period = span(contributor)
          return (
            <View
              key={contributor.upn}
              style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}
              wrap={false}
            >
              {photo ? (
                <Image src={photo} style={{ width: 34, height: 34, borderRadius: 17 }} />
              ) : (
                <View
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 17,
                    backgroundColor: '#E4E7EB',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text style={{ fontSize: 11, color: '#4A5568' }}>{initialsOf(shown)}</Text>
                </View>
              )}
              <View style={{ marginLeft: 10, flexGrow: 1 }}>
                <Text style={{ fontSize: 10, fontWeight: 'bold' }}>{shown}</Text>
                {identity.jobTitle ? (
                  <Text style={{ fontSize: 9, color: '#4A5568' }}>{identity.jobTitle}</Text>
                ) : null}
                {role || period ? (
                  <Text style={{ fontSize: 9, color: '#4A5568' }}>
                    {role && period ? `${role} (${period})` : role || period}
                  </Text>
                ) : null}
              </View>
            </View>
          )
        })}
      </View>
    </Section>
  )
}
