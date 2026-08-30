import { Chip, Tooltip } from '@mui/material'
import { ApiGetCall } from '../../../api/ApiCall'
import {
  PSIT_ADMIN_LEVEL,
  psitAdminRoleSummary,
  psitReadAdminStatus,
} from '../../../utils/psit-admin-status'

/**
 * Whether this account holds administrative power, said in one word.
 *
 * A consent granted by an administrator binds the whole tenant; a compromise on one is not the
 * same incident. The portal knew and never said it, so the fact had to be looked up by hand, on
 * another screen, at the moment it mattered least.
 *
 * One badge, not a list of roles: roles accumulate, and four of them in a cell say less than one
 * word saying what they amount to. The roles themselves are one hover away.
 *
 * An account that can activate a role through PIM gets its own badge rather than none. It is not
 * an administrator right now, and it can be one before the analyst finishes reading the screen.
 *
 * Standard accounts show nothing - a badge on every row is a badge nobody sees. But an account
 * whose roles could not be read is not a standard account, and says so.
 */
export const PsitAdminBadge = ({ status, tenant, userId, caseId, size = 'small' }) => {
  // Either handed a reading, or asked to fetch one. The stored form comes from a dossier, where
  // the fact was filed when the account was investigated.
  const live = ApiGetCall({
    url: '/api/PSITListUserAdminStatus',
    data: { tenantFilter: tenant, UserId: userId, ...(caseId ? { CaseId: caseId } : {}) },
    queryKey: `PSITAdminStatus-${tenant}-${userId}`,
    waiting: Boolean(!status && tenant && userId),
    staleTime: 5 * 60 * 1000,
  })

  const source = status ?? live.data
  if (!source) return null

  const read = psitReadAdminStatus(source)
  if (read.level === PSIT_ADMIN_LEVEL.STANDARD) return null

  const label =
    read.level === PSIT_ADMIN_LEVEL.ADMIN
      ? 'Admin'
      : read.level === PSIT_ADMIN_LEVEL.ELIGIBLE
        ? 'Admin éligible'
        : 'Rôles non lus'
  const color =
    read.level === PSIT_ADMIN_LEVEL.ADMIN
      ? 'error'
      : read.level === PSIT_ADMIN_LEVEL.ELIGIBLE
        ? 'warning'
        : 'default'

  return (
    <Tooltip title={psitAdminRoleSummary(read)}>
      <Chip size={size} color={color} variant="outlined" label={label} />
    </Tooltip>
  )
}
