import { useEffect, useState } from 'react'
import { ApiGetCall } from '../api/ApiCall'

/**
 * The BEC collection, as a hook: queue the run, poll until it lands, and re-run on demand.
 *
 * The collection is an orchestrated job - ExecBECCheck queues it and answers with a GUID, then
 * the same endpoint is polled until the cached result stops saying Waiting - and every subtlety
 * below was paid for once on the upstream page:
 *
 * - polling every 10 seconds rather than on a timer that could pile up requests;
 * - the `restart` guard, which keeps a refresh from being cancelled: between clicking refresh and
 *   the overwrite call resolving, the polling cache still holds the previous run, which would
 *   otherwise read as "done" and stop the loading state;
 * - the 500 ms before re-running, which lets the re-render register Overwrite on the initial
 *   call's parameters, and the poll issued only after the initial call resolves, since the
 *   backend resets the cache row to Waiting before it answers.
 *
 * Extracted here so the SOC investigation page runs the same collection as the upstream user
 * page, with the same behaviour, instead of a second copy that would drift from it.
 */
export const usePsitBecCollection = ({ userId, tenantFilter, userPrincipalName }) => {
  const [isLoading, setIsLoading] = useState(true)
  const [restart, setRestart] = useState(false)

  const ready = Boolean(userId && tenantFilter && userPrincipalName)

  const initialCall = ApiGetCall({
    url: '/api/execBECCheck',
    data: {
      userId: userId,
      tenantFilter: tenantFilter,
      username: userPrincipalName,
      ...(restart && { Overwrite: true }),
    },
    queryKey: `execBECCheck-initial-${userId}-${tenantFilter}-${userPrincipalName}`,
    waiting: ready,
  })

  const pollingCall = ApiGetCall({
    url: '/api/execBECCheck',
    data: {
      GUID: initialCall.data?.GUID,
      tenantFilter: tenantFilter,
    },
    queryKey: `execBECCheck-polling-${initialCall.data?.GUID}`,
    waiting: false,
  })

  useEffect(() => {
    if (initialCall.data?.GUID) {
      setIsLoading(true)
      if (!pollingCall.data || pollingCall.data?.Waiting) {
        setTimeout(() => {
          pollingCall.refetch()
        }, 10000)
      }
    }

    if (!restart && pollingCall.isSuccess && pollingCall.data && !pollingCall.data?.Waiting) {
      setIsLoading(false)
    }
    // The query objects are new references on every render, so depending on them schedules a
    // poll on every render: that is the loop this page was fixed for. Keyed on dataUpdatedAt
    // instead, which changes only when a poll actually lands.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pollingCall.dataUpdatedAt, initialCall])

  const restartCollection = () => {
    setRestart(true)
    setIsLoading(true)
    setTimeout(() => {
      initialCall.refetch().finally(() => {
        // one-shot: without this every later refetch would force a fresh run
        setRestart(false)
        pollingCall.refetch()
      })
    }, 500)
  }

  return {
    becData: pollingCall.data,
    isFetching: initialCall.isLoading || pollingCall.isLoading || isLoading,
    restartCollection,
  }
}
