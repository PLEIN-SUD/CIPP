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
 * The name is resolved by the caller (the queue fetches the analyst list once for all rows);
 * this component only displays what it is given and never invents: no known name shows the
 * email, which is still the identity that assigned the case.
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

  if (!upn) return null
  const shown = displayName || upn

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
