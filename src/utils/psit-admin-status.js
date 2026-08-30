/**
 * One reading of an account's administrative power, from either of the two shapes it arrives in.
 *
 * Live, the endpoint answers in PascalCase; filed on a dossier, the same facts are stored in
 * camelCase. A screen should not have to know which one it is holding, and a component that
 * guesses would show a standard account the day the other shape reaches it.
 *
 * 'Not an administrator' and 'we could not find out' are different answers and are kept apart all
 * the way to the badge: the first shows nothing, the second says the roles could not be read.
 * Collapsing them is how a screen ends up quietly clearing an admin.
 */
export const PSIT_ADMIN_LEVEL = {
  ADMIN: 'admin',
  ELIGIBLE: 'eligible',
  STANDARD: 'standard',
  UNKNOWN: 'unknown',
}

export const psitReadAdminStatus = (source) => {
  if (!source) return { level: PSIT_ADMIN_LEVEL.UNKNOWN, activeRoles: [], eligibleRoles: [], readUtc: '' }

  const isAdmin = source.IsAdmin ?? source.isAdmin ?? false
  const isEligible = source.IsEligible ?? source.isEligible ?? false
  const activeRoles = source.ActiveRoles ?? source.activeRoles ?? []
  const eligibleRoles = source.EligibleRoles ?? source.eligibleRoles ?? []
  // A stored reading was successful by construction: nothing is filed on a dossier unless the
  // roles were read. Only a live answer carries the flag.
  const activeRead = source.ActiveRead ?? source.activeRead ?? true

  const level = !activeRead
    ? PSIT_ADMIN_LEVEL.UNKNOWN
    : isAdmin
      ? PSIT_ADMIN_LEVEL.ADMIN
      : isEligible
        ? PSIT_ADMIN_LEVEL.ELIGIBLE
        : PSIT_ADMIN_LEVEL.STANDARD

  return {
    level,
    activeRoles: Array.isArray(activeRoles) ? activeRoles : [],
    eligibleRoles: Array.isArray(eligibleRoles) ? eligibleRoles : [],
    readUtc: String(source.ReadUtc ?? source.readUtc ?? ''),
  }
}

/** The sentence behind the badge: which roles, and how they are held. */
export const psitAdminRoleSummary = (status) => {
  const parts = []
  if (status?.activeRoles?.length) parts.push(`Rôles actifs : ${status.activeRoles.join(', ')}`)
  if (status?.eligibleRoles?.length) {
    parts.push(`Éligible (PIM) : ${status.eligibleRoles.join(', ')}`)
  }
  if (parts.length === 0 && status?.level === PSIT_ADMIN_LEVEL.UNKNOWN) {
    return 'Les rôles de ce compte n’ont pas pu être lus.'
  }
  return parts.join(' • ')
}

/**
 * The sentence a report prints beside the account, or nothing.
 *
 * Nothing for a standard account: a client document listing the absence of a role for every
 * person it names would bury the one case that matters. Nothing, too, when the roles could not
 * be read - a report states what it knows, and silence is not a claim.
 */
export const psitAdminSentence = (source) => {
  if (!source) return ''
  const read = psitReadAdminStatus(source)
  if (read.level === PSIT_ADMIN_LEVEL.ADMIN) {
    return `Ce compte est administrateur du tenant${
      read.activeRoles.length ? ` (${read.activeRoles.join(', ')})` : ''
    }.`
  }
  if (read.level === PSIT_ADMIN_LEVEL.ELIGIBLE) {
    return `Ce compte peut activer un rôle d’administration à la demande${
      read.eligibleRoles.length ? ` (${read.eligibleRoles.join(', ')})` : ''
    }.`
  }
  return ''
}
