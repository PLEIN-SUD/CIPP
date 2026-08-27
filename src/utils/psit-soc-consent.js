import { readAppScopes } from './psit-soc-app-scopes'

/**
 * The consents behind an application, and the audit trail that proves them.
 *
 * "6 consentements enregistrés" answered the wrong question: an analyst deciding on an OAuth
 * alert needs who consented, to what, and when - and the guide step "retrouver le consentement
 * dans l'audit" sent him to the Entra portal for it. These readings keep him on the case.
 *
 * Pure functions over the Graph rows, because every judgement here - what counts as off-hours,
 * which consent matches the application - is worth a test rather than a hope.
 */

/**
 * Off business hours, Paris time: weekend, or before 08:00, or from 19:00. Returns null rather
 * than false when the date cannot be read: "we could not tell" and "during hours" are different
 * answers under a step that asks specifically about HNO.
 */
export const psitSocOffHours = (iso) => {
  if (!iso) return null
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null

  const parts = new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Europe/Paris',
    hour: 'numeric',
    hourCycle: 'h23',
    weekday: 'short',
  }).formatToParts(date)
  const hour = Number(parts.find((part) => part.type === 'hour')?.value)
  const weekday = parts.find((part) => part.type === 'weekday')?.value ?? ''

  if (!Number.isFinite(hour)) return null
  if (/^(sam|dim)/i.test(weekday)) return true
  return hour < 8 || hour >= 19
}

/**
 * One row per consent: who it covers, and what that consent alone grants. Grants come from
 * oauth2PermissionGrants filtered on the service principal; users resolve the principal ids the
 * user consents carry.
 */
export const readConsentGrants = (grants = [], users = []) => {
  const byId = new Map(users.filter(Boolean).map((user) => [String(user.id), user]))

  return grants.filter(Boolean).map((grant) => {
    const admin = grant.consentType === 'AllPrincipals'
    const user = byId.get(String(grant.principalId))
    const scopes = readAppScopes(String(grant.scope ?? ''))
    return {
      kind: admin ? 'admin' : 'user',
      // An unresolved principal keeps its id on display: an anonymous consent row answers
      // nothing, and the id is at least searchable.
      who: admin
        ? 'Toute l’organisation (consentement administrateur)'
        : (user?.userPrincipalName ?? user?.displayName ?? String(grant.principalId ?? 'principal inconnu')),
      scopes: scopes.granted,
      risky: scopes.risky,
      hasPersistence: scopes.hasPersistence,
    }
  })
}

/**
 * The audit events that record a consent to this application: who, from where, when, and whether
 * that instant reads as off-hours. Matched on the service principal id or the display name,
 * because directoryAudits cannot be filtered server-side on the target.
 */
export const readConsentAudit = (rows = [], { servicePrincipalId, appDisplayName } = {}) => {
  const spId = String(servicePrincipalId ?? '').toLowerCase()
  const name = String(appDisplayName ?? '').toLowerCase()

  return rows
    .filter(Boolean)
    .filter((row) =>
      (Array.isArray(row.targetResources) ? row.targetResources : []).some((target) => {
        const id = String(target?.id ?? '').toLowerCase()
        const display = String(target?.displayName ?? '').toLowerCase()
        return (spId && id === spId) || (name && display === name)
      })
    )
    .map((row) => ({
      who:
        row.initiatedBy?.user?.userPrincipalName ??
        row.initiatedBy?.app?.displayName ??
        'acteur inconnu',
      ip: row.initiatedBy?.user?.ipAddress ?? null,
      whenUtc: String(row.activityDateTime ?? ''),
      result: String(row.result ?? ''),
      offHours: psitSocOffHours(row.activityDateTime),
    }))
    .sort((a, b) => (a.whenUtc < b.whenUtc ? 1 : -1))
}
