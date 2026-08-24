import { ApiGetCall } from '../api/ApiCall'

/**
 * The case's evidence, gathered once for the guide and the panels.
 *
 * Every query below reuses the exact queryKey and url of the panel that already fetches it, so
 * React Query serves both from one request: the guide showing an answer costs nothing beyond what
 * the panel below it already paid. Change a key here without changing it there and the page
 * silently doubles its calls, which is the one thing to watch when touching this file.
 *
 * Only what the case's entities justify is fetched: a mail case asks Graph nothing about devices.
 */
export const usePsitSocEvidence = (socCase) => {
  const tenant = socCase?.Tenant
  const entities = socCase?.Entities ?? {}
  const { upn, userId, appId, deviceId, deviceName } = entities

  // --- identity ------------------------------------------------------------------------------
  const userLookup = ApiGetCall({
    url: `/api/ListUsers?tenantFilter=${tenant}&graphFilter=userPrincipalName eq '${upn}'`,
    queryKey: `PSITSocUser-${tenant}-${upn}`,
    waiting: Boolean(tenant && upn && !userId),
  })
  const resolvedUser = Array.isArray(userLookup.data) ? userLookup.data[0] : userLookup.data
  const effectiveUserId = userId || resolvedUser?.id

  const signIns = ApiGetCall({
    url: `/api/ListUserSigninLogs?tenantFilter=${tenant}&UserID=${effectiveUserId}&top=100`,
    queryKey: `PSITSocSignins-${tenant}-${effectiveUserId}`,
    waiting: Boolean(tenant && effectiveUserId),
  })
  const rules = ApiGetCall({
    url: `/api/ListUserMailboxRules?tenantFilter=${tenant}&UserID=${effectiveUserId}&userEmail=${upn}`,
    queryKey: `PSITSocRules-${tenant}-${effectiveUserId}`,
    waiting: Boolean(tenant && effectiveUserId),
  })

  // --- application ---------------------------------------------------------------------------
  const grants = ApiGetCall({
    url: `/api/ListOAuthApps?tenantFilter=${tenant}`,
    queryKey: `PSITSocOAuth-${tenant}`,
    waiting: Boolean(tenant && appId),
  })
  const principal = ApiGetCall({
    url: `/api/ListGraphRequest?tenantFilter=${tenant}&Endpoint=servicePrincipals&$filter=appId eq '${appId}'&$select=id,appId,displayName,publisherName,verifiedPublisher,createdDateTime,accountEnabled`,
    queryKey: `PSITSocSp-${tenant}-${appId}`,
    waiting: Boolean(tenant && appId),
  })
  // The catalogue ships with CIPP and never changes between two cases: keyed globally so it is
  // fetched once per session rather than once per case.
  const catalogue = ApiGetCall({
    url: '/api/PSITListMaliciousApps',
    queryKey: 'PSITMaliciousApps',
    waiting: Boolean(appId),
  })

  // --- device --------------------------------------------------------------------------------
  const device = ApiGetCall({
    url: deviceId
      ? `/api/ListDeviceDetails?tenantFilter=${tenant}&DeviceID=${deviceId}`
      : `/api/ListDeviceDetails?tenantFilter=${tenant}&DeviceName=${deviceName}`,
    queryKey: `PSITSocDevice-${tenant}-${deviceId || deviceName}`,
    waiting: Boolean(tenant && (deviceId || deviceName)),
  })
  const deviceData = Array.isArray(device.data) ? device.data[0] : device.data
  const defender = ApiGetCall({
    url: `/api/ListDefenderState?tenantFilter=${tenant}&DeviceID=${deviceData?.id}`,
    queryKey: `PSITSocDefender-${tenant}-${deviceData?.id}`,
    waiting: Boolean(tenant && deviceData?.id),
  })

  const appGrants = (Array.isArray(grants.data) ? grants.data : []).filter(
    (grant) => String(grant?.ApplicationID ?? '').toLowerCase() === String(appId ?? '').toLowerCase()
  )

  return {
    user: {
      // undefined rather than [] while the call is in flight: "not fetched" and "fetched empty"
      // must not resolve to the same answer under a guide step.
      signIns: signIns.isSuccess ? signIns.data : undefined,
      rules: rules.isSuccess ? rules.data : undefined,
      usageLocation: resolvedUser?.usageLocation ?? null,
      userId: effectiveUserId,
    },
    app: {
      appId: appId ?? null,
      scope: grants.isSuccess ? appGrants.map((grant) => grant?.Scope).join(' ') : undefined,
      principal: principal.data?.Results?.[0] ?? principal.data?.[0],
      catalogue: catalogue.isSuccess ? catalogue.data : undefined,
    },
    device: {
      device: deviceData,
      defenderState: Array.isArray(defender.data)
        ? defender.data[0]?.windowsProtectionState
        : defender.data?.windowsProtectionState,
    },
  }
}
