import { useCallback, useMemo, useState } from 'react'
import { ApiGetCall } from '../api/ApiCall'
import { psitReportContributors } from '../utils/psit-report-contributors'

/**
 * Everything a report needs to name the people who worked on a dossier: who they are, what they
 * are called, what they do, and their photo.
 *
 * It lives in a hook because react-pdf builds its document outside the React tree - nothing there
 * can fetch - so the photos have to be in hand before the document is built. The caller renders
 * PsitReportPhotoLoaders with the returned onPhoto, and passes the rest to the document.
 *
 * Names and job titles come from the portal's analyst list, which is cached and shared with the
 * queue; a contributor the list does not know keeps their address, which is still who they are.
 */
export const usePsitReportContributors = ({ actionLog, triage, incident, socCase } = {}) => {
  const [photos, setPhotos] = useState({})

  const contributors = useMemo(
    () => psitReportContributors({ actionLog, triage, incident, socCase }),
    [actionLog, triage, incident, socCase]
  )

  const analysts = ApiGetCall({
    url: '/api/PSITListSocAnalysts',
    queryKey: 'PSITSocAnalysts',
    waiting: contributors.length > 0,
    staleTime: 5 * 60 * 1000,
  })

  const names = useMemo(() => {
    const map = {}
    for (const analyst of Array.isArray(analysts.data?.Analysts) ? analysts.data.Analysts : []) {
      if (analyst?.userPrincipalName) {
        map[analyst.userPrincipalName.toLowerCase()] = {
          displayName: analyst.displayName || '',
          jobTitle: analyst.jobTitle || '',
        }
      }
    }
    return map
  }, [analysts.data])

  // Keyed on the address in lower case, like every other lookup here: the journal and Entra do
  // not always agree on capitalisation, and a photo that fails to match is a photo missing from
  // a client document.
  const onPhoto = useCallback((upn, dataUrl) => {
    setPhotos((previous) =>
      previous[upn.toLowerCase()] === dataUrl
        ? previous
        : { ...previous, [upn.toLowerCase()]: dataUrl }
    )
  }, [])

  return { contributors, names, photos, onPhoto }
}
