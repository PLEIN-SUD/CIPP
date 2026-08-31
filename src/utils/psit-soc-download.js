// What the audit log answers about a mass-download alert.
//
// The alert says "370 fichiers" and a name. Everything an analyst then needs — which files, from
// which sites, over how many minutes, from which addresses, through a browser or a sync client —
// lives in the unified audit log and nowhere else the portal can reach. This module reads the
// endpoint's answer and turns it into the few sentences the panel and the guide actually show.
//
// Two rules it never breaks, both learned the hard way elsewhere in this section:
// - a search that has not finished is said to be running, never rendered as an empty list. An
//   empty list reads as "this account downloaded nothing", which is the opposite of what is
//   known;
// - a count is never shown without the window it counts over. "370 fichiers" means nothing until
//   the reader knows whether that is over twenty minutes or over a week.

export const PSIT_DOWNLOAD_TYPE_ID = 20

/** The windows a relaunch can widen to, from the alert's own hour backwards. */
export const PSIT_DOWNLOAD_WINDOWS = [
  { hours: 12, label: '12 h avant l’alerte' },
  { hours: 48, label: '48 h avant l’alerte' },
  { hours: 168, label: '7 jours avant l’alerte' },
]

/**
 * Does this dossier deserve the download panel? Its type says so, or it already carries a search —
 * a dossier retyped after the fact must not lose the evidence it gathered under its old type.
 */
export const psitSocIsDownloadCase = (socCase) =>
  socCase?.TypeId === PSIT_DOWNLOAD_TYPE_ID || Boolean(socCase?.Evidence?.download?.searchId)

const asArray = (value) => (Array.isArray(value) ? value : [])

/**
 * The audit operations in the analyst's language. 'FileAccessed' matters most: a page of accessed
 * files is not a download, and the two must never blur into one count.
 */
export const PSIT_DOWNLOAD_OPERATION_LABELS = {
  FileDownloaded: 'Téléchargé',
  FileSyncDownloadedFull: 'Synchronisé (OneDrive)',
  FileAccessed: 'Consulté',
}

export const psitDownloadOperationLabel = (operation) =>
  PSIT_DOWNLOAD_OPERATION_LABELS[operation] ?? String(operation || '')

/** The operations present in a file list, counted, biggest first: what the filter chips show. */
export const psitDownloadOperations = (files) => {
  const counts = new Map()
  for (const file of asArray(files)) {
    const operation = file?.Operation || ''
    if (!operation) continue
    counts.set(operation, (counts.get(operation) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([operation, count]) => ({ operation, count, label: psitDownloadOperationLabel(operation) }))
    .sort((a, b) => b.count - a.count)
}

/**
 * The endpoint's answer, normalised.
 *
 * `started` false means no search has ever been launched for this dossier — distinct from a
 * search that ran and found nothing, which is `started` true with an empty file list. The panel
 * says something different in each case, so they must not collapse into one another here.
 */
export const psitReadDownloadAudit = (data) => {
  const summary = data?.Summary ?? null
  const window = data?.Window ?? null
  return {
    started: data?.Started === true,
    running: data?.Running === true,
    status: data?.Status ?? null,
    searchId: data?.SearchId ?? null,
    files: asArray(data?.Records),
    warnings: asArray(data?.Warnings),
    window: window
      ? {
          user: window.User ?? null,
          startUtc: window.StartUtc ?? null,
          endUtc: window.EndUtc ?? null,
          launchedUtc: window.LaunchedUtc ?? null,
          launchedBy: window.LaunchedBy ?? null,
        }
      : null,
    summary: summary
      ? {
          fileCount: Number(summary.FileCount ?? 0),
          siteCount: Number(summary.SiteCount ?? 0),
          sites: asArray(summary.Sites),
          extensions: asArray(summary.Extensions).map((entry) => ({
            extension: entry?.Extension ?? '',
            count: Number(entry?.Count ?? 0),
          })),
          firstUtc: summary.FirstUtc || null,
          lastUtc: summary.LastUtc || null,
          addresses: asArray(summary.Addresses),
          addressCount: Number(summary.AddressCount ?? 0),
          agents: asArray(summary.Agents),
          operations: asArray(summary.Operations).map((entry) => ({
            operation: entry?.Operation ?? '',
            count: Number(entry?.Count ?? 0),
          })),
        }
      : null,
  }
}

const frDateTime = (value) => {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return date.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })
}

/** "du 28/08/2026 03:27 au 28/08/2026 19:27", or null when the window is unknown. */
export const psitDownloadWindowLabel = (read) => {
  const from = frDateTime(read?.window?.startUtc)
  const to = frDateTime(read?.window?.endUtc)
  if (!from || !to) return null
  return `du ${from} au ${to}`
}

/** How long the downloads themselves spanned, in whole minutes, or null. */
export const psitDownloadSpanMinutes = (read) => {
  const first = read?.summary?.firstUtc
  const last = read?.summary?.lastUtc
  if (!first || !last) return null
  const from = new Date(first).getTime()
  const to = new Date(last).getTime()
  if (Number.isNaN(from) || Number.isNaN(to) || to < from) return null
  return Math.round((to - from) / 60000)
}

/**
 * Sync client or browser. A library the machine was already syncing and a person pulling files one
 * by one produce the same file count and mean opposite things, so the panel and the guide both
 * say which one the log shows.
 */
export const psitDownloadClientKind = (read) => {
  const agents = read?.summary?.agents ?? []
  if (agents.length === 0) return null
  const sync = agents.filter((agent) => /skydrivesync|odc |onedrive|filesync/i.test(String(agent)))
  if (sync.length === agents.length) return 'sync'
  if (sync.length === 0) return 'browser'
  return 'mixed'
}

const CLIENT_LABELS = {
  sync: 'client de synchronisation',
  browser: 'navigateur',
  mixed: 'navigateur et client de synchronisation',
}

export const psitDownloadClientLabel = (read) => CLIENT_LABELS[psitDownloadClientKind(read)] ?? null

/**
 * The one line the guide shows under "quels fichiers".
 *
 * Reports, never concludes: it counts and it dates, and leaves "hors norme ou pas" to the analyst
 * who knows the account. The tone follows the same convention as the other evidence keys —
 * 'unknown' whenever the answer has not arrived, which is not the same as an answer of zero.
 */
export const psitDownloadHeadline = (read) => {
  if (!read || !read.started) return { tone: 'unknown', text: 'recherche non lancée' }
  if (read.running) return { tone: 'unknown', text: 'recherche en cours dans le journal d’audit' }
  if (!read.summary) return { tone: 'unknown', text: 'résultats non lus' }

  const { fileCount, siteCount } = read.summary
  if (fileCount === 0) {
    return {
      tone: 'unknown',
      text: `aucun téléchargement trouvé ${psitDownloadWindowLabel(read) ?? 'sur la fenêtre cherchée'} (rétention du journal, ou fenêtre à élargir)`,
    }
  }

  const span = psitDownloadSpanMinutes(read)
  const parts = [`${fileCount} fichier(s) depuis ${siteCount} site(s)`]
  if (span !== null) parts.push(span === 0 ? 'en moins d’une minute' : `sur ${span} min`)
  const client = psitDownloadClientLabel(read)
  if (client) parts.push(`via ${client}`)
  return { tone: 'bad', text: parts.join(', ') }
}

/** The one line the guide shows under "d’où". Addresses, plainly counted. */
export const psitDownloadOriginLine = (read) => {
  if (!read || !read.started) return { tone: 'unknown', text: 'recherche non lancée' }
  if (read.running) return { tone: 'unknown', text: 'recherche en cours dans le journal d’audit' }
  const addresses = read.summary?.addresses ?? []
  if (addresses.length === 0) return { tone: 'unknown', text: 'aucune adresse dans les enregistrements' }
  if (addresses.length === 1) return { tone: 'good', text: `une seule adresse : ${addresses[0]}` }
  return {
    tone: 'bad',
    text: `${read.summary.addressCount} adresse(s), dont ${addresses.slice(0, 3).join(', ')}`,
  }
}

/**
 * The files, grouped by site: what a client is actually asking about when they ask what was taken.
 * Sorted by volume, because the site that lost two hundred files is the conversation.
 */
export const psitDownloadBySite = (read) => {
  const bySite = new Map()
  for (const file of read?.files ?? []) {
    const site = file?.Site || 'site non renseigné'
    if (!bySite.has(site)) bySite.set(site, { site, count: 0, names: [] })
    const entry = bySite.get(site)
    entry.count += 1
    if (entry.names.length < 5 && file?.Name) entry.names.push(file.Name)
  }
  return [...bySite.values()].sort((a, b) => b.count - a.count)
}
