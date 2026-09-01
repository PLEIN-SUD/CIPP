import { useMemo } from 'react'
import { ApiGetCall } from '../api/ApiCall'

// The AbuseIPDB reputation of the addresses a panel shows, in one batched read.
//
// The server owns the key, the 24-hour cache and the quota; this hook only decides WHAT is
// worth asking: public addresses, deduplicated, twenty at most. Private ranges are filtered
// here too - not for safety (the server filters again) but so a panel full of internal
// addresses does not fire a request that can only answer nothing.

const PRIVATE_OR_LOCAL =
  /^(10\.|127\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|fe80:|fc|fd|::1$)/i

/** The addresses worth asking about: non-empty, public, unique, capped, in a stable order. */
export const psitPublicIps = (ips) => {
  const seen = new Set()
  for (const ip of Array.isArray(ips) ? ips : []) {
    const value = String(ip ?? '').trim()
    if (!value || PRIVATE_OR_LOCAL.test(value)) continue
    seen.add(value)
  }
  return [...seen].sort().slice(0, 20)
}

/**
 * Returns { map, notes }: `map[ip]` is the reputation row (Score, Reports, Country, Isp,
 * UsageType, IsTor, CheckedUtc, Stale) or undefined while unknown. An address with no row stays
 * undefined - no chip - which is an absence, never a score of zero.
 */
export const usePsitIpReputation = (ips) => {
  const list = useMemo(() => psitPublicIps(ips), [ips])
  const key = list.join(',')

  const request = ApiGetCall({
    url: `/api/PSITListIpReputation?Ips=${encodeURIComponent(key)}`,
    queryKey: `PSITIpRep-${key}`,
    waiting: list.length > 0,
    // The server caches for a day; re-asking every focus would only burn round trips.
    staleTime: 30 * 60 * 1000,
  })

  const map = useMemo(() => {
    const byIp = {}
    for (const row of Array.isArray(request.data?.Results) ? request.data.Results : []) {
      if (row?.Ip) byIp[row.Ip] = row
    }
    return byIp
  }, [request.data])

  return {
    map,
    notes: Array.isArray(request.data?.Notes) ? request.data.Notes : [],
    isFetching: request.isFetching,
  }
}
