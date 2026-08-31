import { cardinal, counted } from './psit-report-prose'
import { psitDownloadClientKind, psitDownloadOperationLabel } from './psit-soc-download'

/**
 * The model behind the mass-download investigation report: which outcome the dossier landed on,
 * and where its numbers come from.
 *
 * The reader is the client, and most often a non-technical one. So the model never hands the
 * document a raw field: every number arrives already agreed in French, every technical fact
 * arrives as the sentence a layperson can read. The document renders; this file decides.
 *
 * Two rules carried over from the other reports, because they were learned the hard way there:
 * three verdicts exist (an undetermined dossier must never produce a document asserting the
 * activity was legitimate), and the numbers name their source. The audit search this report
 * quotes expires with the tenant's journal; the dossier keeps a copy of its summary, and when the
 * live search no longer answers, the report uses the copy and says so.
 */
export const DOWNLOAD_CONCLUSION = {
  EXFILTRATION: 'exfiltration',
  BENIGN: 'benign',
  LEGITIMATE: 'legitimate',
  UNDETERMINED: 'undetermined',
  UNQUALIFIED: 'unqualified',
}

const CONCLUSIONS = {
  [DOWNLOAD_CONCLUSION.EXFILTRATION]:
    "Les téléchargements signalés ont été qualifiés vrai positif : ils ne correspondent pas à une activité normale du titulaire du compte, et sont traités comme une sortie de données. Les actions menées et les faits relevés figurent dans ce document.",
  [DOWNLOAD_CONCLUSION.BENIGN]:
    "Le signalement était fondé et l'investigation écarte la sortie de données : les téléchargements sont réels et sont le fait du titulaire du compte, mais le comportement constaté ne correspondait pas aux usages attendus. Il a été traité, comme décrit dans ce document. Le signalement de ce motif reste pertinent.",
  [DOWNLOAD_CONCLUSION.LEGITIMATE]:
    "L'investigation conclut à une activité légitime : les téléchargements signalés correspondent à un usage assumé du titulaire du compte, confirmé pendant l'investigation. Aucune sortie de données n'est retenue.",
  [DOWNLOAD_CONCLUSION.UNDETERMINED]:
    "L'investigation n'a pas permis de trancher : les éléments réunis n'établissent ni que ces téléchargements relèvent d'un usage normal, ni qu'ils constituent une sortie de données. Les faits relevés figurent dans ce document, et la surveillance du compte est maintenue.",
  [DOWNLOAD_CONCLUSION.UNQUALIFIED]:
    "Le dossier n'est pas qualifié : ce document décrit les faits collectés et ne conclut pas.",
}

/** What the alert's family means, said once for a reader who does not live in these consoles. */
export const DOWNLOAD_CONTEXT_SENTENCE =
  "Une alerte a signalé un volume inhabituel de fichiers téléchargés depuis les espaces de fichiers de l'entreprise (SharePoint et OneDrive) par un même compte. Ce volume est un signal, pas une conclusion : la même quantité de fichiers peut décrire une sauvegarde assumée, la synchronisation normale d'un poste, ou une sortie de données. L'investigation départage ces lectures."

const CLIENT_SENTENCES = {
  sync: "Les téléchargements sont l’œuvre d'un logiciel de synchronisation (OneDrive) : un poste copiait automatiquement des dossiers qu'il suivait déjà, ce qui produit de gros volumes sans geste manuel du titulaire.",
  browser:
    "Les téléchargements ont été faits depuis un navigateur, fichier par fichier : chacun correspond à un geste manuel de la personne connectée au compte.",
  mixed:
    "Les téléchargements mêlent deux origines : une partie vient d'un logiciel de synchronisation (OneDrive), une partie a été faite manuellement depuis un navigateur.",
}

const minutesSentence = (first, last) => {
  if (!first || !last) return null
  const from = new Date(first).getTime()
  const to = new Date(last).getTime()
  if (Number.isNaN(from) || Number.isNaN(to) || to < from) return null
  const minutes = Math.round((to - from) / 60000)
  if (minutes < 1) return 'en moins d’une minute'
  if (minutes < 120) return `en ${counted(minutes, 'minute')}`
  const hours = Math.round(minutes / 60)
  return `sur environ ${hours} heures`
}

const readSummary = (source) => {
  if (!source) return null
  const fileCount = Number(source.fileCount ?? source.FileCount ?? 0)
  const siteCount = Number(source.siteCount ?? source.SiteCount ?? 0)
  const addresses = source.addresses ?? source.Addresses ?? []
  return {
    fileCount,
    siteCount,
    sites: source.sites ?? source.Sites ?? [],
    extensions: (source.extensions ?? source.Extensions ?? []).map((entry) => ({
      extension: entry?.extension ?? entry?.Extension ?? '',
      count: Number(entry?.count ?? entry?.Count ?? 0),
    })),
    firstUtc: source.firstUtc ?? source.FirstUtc ?? null,
    lastUtc: source.lastUtc ?? source.LastUtc ?? null,
    addresses,
    addressCount: Number(source.addressCount ?? source.AddressCount ?? addresses.length),
    agents: source.agents ?? source.Agents ?? [],
    operations: (source.operations ?? source.Operations ?? []).map((entry) => ({
      operation: entry?.operation ?? entry?.Operation ?? '',
      count: Number(entry?.count ?? entry?.Count ?? 0),
    })),
  }
}

/**
 * The action split, said in French: 'Téléchargé : 210, Consulté : 160'. It gets its own sentence
 * because a page of consulted files is not a download, and a non-technical reader must not have
 * to know the API's verbs to see that.
 */
const operationsProse = (operations) => {
  if (!Array.isArray(operations) || operations.length === 0) return null
  const parts = operations
    .filter((entry) => entry.operation && entry.count > 0)
    .map((entry) => `${psitDownloadOperationLabel(entry.operation).toLowerCase()} (${entry.count})`)
  if (parts.length === 0) return null
  return parts.join(', ')
}

/**
 * @param socCase the dossier (Qualification nested, journal under ActionLog, evidence filed
 *   under Evidence.download with the summary captured at the first successful read).
 * @param read the live search reading from psitReadDownloadAudit, when the panel has one.
 */
export const buildDownloadReportModel = ({ socCase, read } = {}) => {
  const verdict = socCase?.Qualification?.Verdict
  const kind = !verdict
    ? DOWNLOAD_CONCLUSION.UNQUALIFIED
    : verdict === 'true-positive'
      ? DOWNLOAD_CONCLUSION.EXFILTRATION
      : verdict === 'undetermined'
        ? DOWNLOAD_CONCLUSION.UNDETERMINED
        : verdict === 'benign-true-positive'
          ? DOWNLOAD_CONCLUSION.BENIGN
          : DOWNLOAD_CONCLUSION.LEGITIMATE

  const filed = socCase?.Evidence?.download ?? null

  // The live reading is right until the tenant's journal lets the search go; from then on the
  // copy captured on the dossier is the only description of what the search found.
  const liveSummary = read?.started && !read.running ? readSummary(read.summary) : null
  const filedSummary = readSummary(filed?.summary)
  const fromSnapshot = !liveSummary && Boolean(filedSummary)
  const summary = liveSummary ?? filedSummary

  // The file list exists only live: the dossier keeps the shape of the answer, not each record.
  const files = !fromSnapshot && Array.isArray(read?.files) ? read.files : []

  const clientKind = summary ? psitDownloadClientKind({ summary }) : null

  const journal = [...(socCase?.ActionLog ?? [])].sort((a, b) =>
    String(a?.OccurredUtc || a?.Utc || '').localeCompare(String(b?.OccurredUtc || b?.Utc || ''))
  )

  return {
    kind,
    conclusion: CONCLUSIONS[kind],
    verdict: verdict ?? null,
    justification: String(socCase?.Qualification?.Justification ?? ''),
    upn: String(filed?.user || socCase?.Entities?.upn || ''),
    window: filed
      ? {
          startUtc: String(filed.startUtc ?? ''),
          endUtc: String(filed.endUtc ?? ''),
          launchedUtc: String(filed.launchedUtc ?? ''),
          launchedBy: String(filed.launchedBy ?? ''),
          searchId: String(filed.searchId ?? ''),
          previousCount: Array.isArray(filed.previous) ? filed.previous.length : 0,
        }
      : null,
    summary,
    // Agreed French for the tiles and the lead sentence: the document never conjugates.
    counts: summary
      ? {
          files: cardinal(summary.fileCount, 'fichier'),
          sites: cardinal(summary.siteCount, 'site'),
          addresses: cardinal(summary.addressCount, 'adresse'),
          span: minutesSentence(summary.firstUtc, summary.lastUtc),
        }
      : null,
    clientSentence: clientKind ? CLIENT_SENTENCES[clientKind] : null,
    operationsLine: summary ? operationsProse(summary.operations) : null,
    // 'Consulté' in the log is an open, not a copy leaving the tenant. Said explicitly whenever
    // the split contains it, because it is the nuance a non-technical reader cannot supply.
    accessedCaveat:
      summary && summary.operations?.some((entry) => entry.operation === 'FileAccessed' && entry.count > 0)
        ? "Une partie des lignes correspond à des fichiers consultés, c'est-à-dire ouverts : une consultation n'emporte pas de copie du fichier hors de l'entreprise, contrairement à un téléchargement."
        : null,
    files,
    fromSnapshot,
    journal,
  }
}
