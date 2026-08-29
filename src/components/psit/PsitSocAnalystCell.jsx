import { Avatar, Stack, Typography } from '@mui/material'
import { ApiGetCall } from '../../api/ApiCall'

/**
 * One analyst in a table cell: photo and name instead of a bare email address.
 *
 * The photo comes through the same endpoint and the same query key as the top banner's own
 * avatar, so for the signed-in analyst it is already in cache and costs nothing; for a
 * colleague it is fetched once and kept (staleTime Infinity - a profile photo does not churn).
 * No photo, or no answer, falls back to the initial, exactly like the banner does.
 *
 * The name is resolved here rather than passed in, because the table's cell renderer only ever
 * receives the cell's own value: a row whose cell held {upn, name} was recursed into two dotted
 * columns and the named column vanished. React Query dedupes the analyst list on its key, so
 * every row on screen shares one request. A caller that already holds the name may still pass it.
 *
 * Nothing is invented: an unresolved address is displayed as the address, which is still the
 * identity the dossier is assigned to.
 */
export const PsitSocAnalystCell = ({ upn, displayName }) => {
  const photo = ApiGetCall({
    url: '/api/ListUserPhoto',
    data: { UserID: upn },
    queryKey: `userPhoto-${upn}`,
    waiting: Boolean(upn),
    staleTime: Infinity,
    responseType: 'blob',
    convertToDataUrl: true,
  })

  const analysts = ApiGetCall({
    url: '/api/PSITListSocAnalysts',
    queryKey: 'PSITSocAnalysts',
    waiting: Boolean(upn) && !displayName,
    staleTime: 5 * 60 * 1000,
  })

  if (!upn) return null
  const resolved =
    displayName ||
    (Array.isArray(analysts.data?.Analysts) ? analysts.data.Analysts : []).find(
      (analyst) => analyst?.userPrincipalName?.toLowerCase() === String(upn).toLowerCase()
    )?.displayName
  const shown = resolved || upn

  return (
    <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: 0 }}>
      <Avatar
        sx={{ width: 24, height: 24, fontSize: 12 }}
        src={photo.data && !photo.isError ? photo.data : undefined}
      >
        {shown[0]?.toUpperCase() || ''}
      </Avatar>
      {/* The email stays one hover away when the name replaces it. */}
      <Typography variant="body2" title={upn} noWrap>
        {shown}
      </Typography>
    </Stack>
  )
}
