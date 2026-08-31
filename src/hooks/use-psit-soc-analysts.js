import { useMemo } from 'react'
import { ApiGetCall } from '../api/ApiCall'

/**
 * The analyst roster, shaped for pickers: one place for the option labels and the degraded-mode
 * warnings, shared by the queue's reassignment and the dossier's escalation (it used to live
 * inside the queue page, unreachable from anywhere else).
 */
export const usePsitSocAnalysts = () => {
  const request = ApiGetCall({
    url: '/api/PSITListSocAnalysts',
    queryKey: 'PSITSocAnalysts',
    staleTime: 5 * 60 * 1000,
  })

  const analysts = useMemo(
    () => (Array.isArray(request.data?.Analysts) ? request.data.Analysts : []),
    [request.data]
  )

  const options = useMemo(
    () =>
      analysts.map((analyst) => ({
        label: analyst.displayName
          ? `${analyst.displayName} (${analyst.userPrincipalName})`
          : analyst.userPrincipalName,
        value: analyst.userPrincipalName,
      })),
    [analysts]
  )

  return {
    request,
    analysts,
    options,
    warnings: Array.isArray(request.data?.Warnings) ? request.data.Warnings : [],
  }
}
