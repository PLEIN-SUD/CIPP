// When a client report may leave the portal.
//
// A report is a transmission, not a working document: it must not exist as a PDF before the
// dossier can stand behind it. Two rules, from the doctrine 'un rapport ne part pas tant que
// tout n'est pas terminé':
// - no verdict, no report (a document that concludes nothing must not reach a client);
// - a true positive is not finished until it is contained (or the dossier closed): a report
//   sent mid-containment describes a fire while it burns, and the containment section would be
//   false by the time it is read.
// The preview stays available once qualified - reading is not transmitting - and the download
// is what gets journaled.

export const psitSocReportLock = (socCase) => {
  const verdict = socCase?.Qualification?.Verdict
  if (!verdict) {
    return { locked: true, reason: 'Qualifiez le dossier avant de produire un document client.' }
  }
  if (verdict === 'true-positive' && !['contained', 'closed'].includes(socCase?.Status)) {
    return {
      locked: true,
      reason:
        'Vrai positif non confiné : terminez le confinement (ou la clôture) avant de transmettre un rapport.',
    }
  }
  return { locked: false, reason: null }
}
