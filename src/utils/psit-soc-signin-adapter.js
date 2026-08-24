// The BEC collection and the live Graph sign-in log describe the same events with different
// field names: the BEC run has already flattened status and location, the raw
// auditLogs/signIns has not. groupSignInsByIp and buildSignInSessions (psit-bec-signals) speak
// the BEC shape, so the SOC user-context panel, which reads the live log, adapts to it here
// rather than forking the proven grouping logic.

/** Maps one raw Graph sign-in entry to the flattened shape the BEC signal helpers expect. */
export const adaptGraphSignIn = (entry) => {
  const status = entry?.status ?? {}
  // Graph reports success as errorCode 0; anything else is a failed attempt.
  const success = Number(status.errorCode ?? 0) === 0
  const location = entry?.location ?? {}
  return {
    CreatedDateTime: entry?.createdDateTime ?? null,
    IPAddress: entry?.ipAddress ?? null,
    Country: location.countryOrRegion ?? null,
    City: location.city ?? null,
    Status: success ? 'Success' : 'Failed',
    AppDisplayName: entry?.appDisplayName ?? null,
    // The signals code only needs the flag; the panel derives it from the usage location it
    // holds, since the raw log does not carry a "foreign" boolean.
    ForeignLocation: false,
    // Carried through for the FP/TP reading the panel does on top of the grouping.
    conditionalAccessStatus: entry?.conditionalAccessStatus ?? null,
    authenticationRequirement: entry?.authenticationRequirement ?? null,
    clientAppUsed: entry?.clientAppUsed ?? null,
    isInteractive: entry?.isInteractive ?? null,
  }
}

/**
 * Adapts a whole sign-in log and flags foreign entries against the account's usage location.
 * Foreign is decided here, once, so the panel and the grouping agree on it.
 */
export const adaptGraphSignIns = (entries = [], usageLocation = null) =>
  (Array.isArray(entries) ? entries : []).map((entry) => {
    const adapted = adaptGraphSignIn(entry)
    adapted.ForeignLocation = Boolean(
      usageLocation && adapted.Country && adapted.Country !== usageLocation
    )
    return adapted
  })

/**
 * The false-positive / true-positive reading of one grouped sign-in address, as a small set of
 * flags the panel colours. It never concludes: green means "reads as expected", red means "reads
 * as compromise", the analyst decides.
 */
export const readSignInGroup = (group) => {
  const legacyClients = /IMAP|POP|SMTP|MAPI|Exchange ActiveSync|Other clients/i
  const usesLegacy = (group.apps ?? []).some((app) => legacyClients.test(String(app)))
  return {
    // Green
    onlySuccessfulLocal: group.successes > 0 && !group.foreign,
    // Red
    foreignSuccess: group.foreign && group.successes > 0,
    successAfterFailures: group.successes > 0 && group.failures >= 5,
    usesLegacyClient: usesLegacy,
  }
}
