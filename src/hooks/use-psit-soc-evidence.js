import { ApiGetCall } from '../api/ApiCall'
import { readConsentAudit } from '../utils/psit-soc-consent'

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
  const principal = ApiGetCall({
    url: `/api/ListGraphRequest?tenantFilter=${tenant}&Endpoint=servicePrincipals&$filter=appId eq '${appId}'&$select=id,appId,displayName,publisherName,verifiedPublisher,createdDateTime,accountEnabled`,
    queryKey: `PSITSocSp-${tenant}-${appId}`,
    waiting: Boolean(tenant && appId),
  })
  const principalRow = principal.data?.Results?.[0] ?? principal.data?.[0]

  // The same grant rows the panel reads: two sources for the same fact would drift, and the
  // guide's one-line answer must never disagree with the detail below it.
  const grants = ApiGetCall({
    url: `/api/ListGraphRequest?tenantFilter=${tenant}&Endpoint=oauth2PermissionGrants&$filter=clientId eq '${principalRow?.id}'`,
    queryKey: `PSITSocGrants-${tenant}-${principalRow?.id}`,
    waiting: Boolean(tenant && principalRow?.id),
  })
  const consentAudit = ApiGetCall({
    url: `/api/ListGraphRequest?tenantFilter=${tenant}&Endpoint=auditLogs/directoryAudits&$filter=activityDisplayName eq 'Consent to application'&$top=100`,
    queryKey: `PSITSocConsentAudit-${tenant}`,
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

  const grantRows = Array.isArray(grants.data?.Results) ? grants.data.Results : []

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
      scope: grants.isSuccess ? grantRows.map((row) => row?.scope).join(' ') : undefined,
      principal: principalRow,
      catalogue: catalogue.isSuccess ? catalogue.data : undefined,
      consentAudit: consentAudit.isSuccess
        ? readConsentAudit(
            Array.isArray(consentAudit.data?.Results) ? consentAudit.data.Results : [],
            { servicePrincipalId: principalRow?.id, appDisplayName: principalRow?.displayName }
          )
        : undefined,
    },
    device: {
      device: deviceData,
      defenderState: Array.isArray(defender.data)
        ? defender.data[0]?.windowsProtectionState
        : defender.data?.windowsProtectionState,
    },
  }
}
