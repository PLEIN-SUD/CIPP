import { useState } from 'react'
import { Button, CircularProgress, Stack, Tooltip, Typography } from '@mui/material'
import { CloudDownload } from '@mui/icons-material'
import { ApiGetCall } from '../../api/ApiCall'

// Downloads the collection archived when a case was closed.
//
// Fetched on click, never on render: the payload is hundreds of kilobytes and a page listing three
// closed cases would pull all three for nothing. The listing endpoint returns metadata only, this
// one asks for a single reference - and it is refetched explicitly rather than enabled, so the
// download happens in the handler instead of as a side effect of rendering.

export const PsitBecArchivedEvidenceButton = ({
  tenantFilter,
  userId,
  userPrincipalName,
  reference,
}) => {
  const [status, setStatus] = useState(null)

  const archiveRequest = ApiGetCall({
    url: `/api/PSITListBecArchive?tenantFilter=${tenantFilter}&userId=${userId}&reference=${reference}`,
    queryKey: `PSITBecArchive-${tenantFilter}-${userId}-${reference}`,
    waiting: false,
  })

  const handleDownload = async () => {
    setStatus(null)
    const result = await archiveRequest.refetch()
    // Handed back verbatim, so what lands on disk is byte-for-byte what the reports were built
    // from.
    const collection = result?.data?.Collection
    if (!collection) {
      setStatus('Aucune collecte archivée pour ce dossier.')
      return
    }
    const blob = new Blob([collection], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `Preuves_${reference}_${userPrincipalName || userId}.json`
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <Stack direction="row" spacing={1} alignItems="center">
      <Tooltip title="Preuves JSON : télécharger la collecte archivée à la clôture de ce dossier">
        <span>
          <Button
            size="small"
            startIcon={
              archiveRequest.isFetching ? <CircularProgress size={16} /> : <CloudDownload />
            }
            disabled={archiveRequest.isFetching}
            onClick={handleDownload}
          >
            Preuves JSON
          </Button>
        </span>
      </Tooltip>
      {status && (
        <Typography variant="body2" color="text.secondary">
          {status}
        </Typography>
      )}
    </Stack>
  )
}
