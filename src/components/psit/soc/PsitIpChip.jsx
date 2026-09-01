import { Chip, Tooltip } from '@mui/material'
import { Security } from '@mui/icons-material'

/**
 * The AbuseIPDB score of one address, worn as a chip next to the address itself.
 *
 * Renders nothing while the reputation is unknown (no key configured, lookup pending, address
 * filtered): an absent chip is an absence, never a score of zero. The number is the abuse
 * confidence score (0-100); the hover carries the rest - reports, usage, ISP, and the date of
 * the reading, because a reputation is only ever true at its date.
 */
export const PsitIpChip = ({ ip, reputation }) => {
  if (!reputation || !ip) return null

  const score = Number(reputation.Score ?? 0)
  const reports = Number(reputation.Reports ?? 0)
  const colour = score >= 75 ? 'error' : score >= 25 ? 'warning' : score >= 1 ? 'success' : 'default'
  const readAt = reputation.CheckedUtc
    ? new Date(reputation.CheckedUtc).toLocaleString('fr-FR', {
        dateStyle: 'short',
        timeStyle: 'short',
        timeZone: 'UTC',
      })
    : 'date inconnue'

  const details = [
    `AbuseIPDB : score ${score}/100 (${reports} ${reports > 1 ? 'signalements' : 'signalement'})`,
    reputation.UsageType ? `usage ${reputation.UsageType}` : null,
    reputation.Isp ? `FAI ${reputation.Isp}` : null,
    reputation.Country ? `pays ${reputation.Country}` : null,
    reputation.IsTor ? 'nœud Tor' : null,
    `relevé le ${readAt} UTC${reputation.Stale ? ' (service injoignable depuis : relevé conservé)' : ''}`,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <Tooltip describeChild title={details}>
      <Chip
        size="small"
        icon={<Security />}
        color={colour}
        variant={score === 0 ? 'outlined' : 'filled'}
        label={reputation.IsTor ? `${score} · Tor` : String(score)}
        sx={{ ml: 0.5 }}
      />
    </Tooltip>
  )
}
