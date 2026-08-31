// The reconstructed timeline: every telemetry source the dossier already holds, on one axis.
//
// Reconstructing used to mean four screens and a notepad: sign-ins in one panel, audit downloads
// in another, consents in a third, the journal in a fourth, each sorted its own way. This merges
// what the evidence hook already fetched - it costs no extra call - into one chronological list,
// so "what happened, in what order" is read instead of reassembled.
//
// Two disciplines:
// - volume is summarised, never dumped: 370 download records are two markers and a count, a
//   hundred sign-ins keep only their successes (failures are noise here; the identity panel
//   details them);
// - journal entries sort on OccurredUtc when the analyst declared one: an action done at 10:00
//   and logged at 14:00 belongs at 10:00.

const parse = (value) => {
  const stamp = Date.parse(value)
  return Number.isNaN(stamp) ? null : stamp
}

const event = (whenUtc, kind, label, detail = '') => ({ whenUtc, kind, label, detail })

export const PSIT_TIMELINE_KINDS = {
  alert: 'Alerte',
  journal: 'Journal',
  signin: 'Connexion',
  download: 'Téléchargements',
  consent: 'Consentement',
}

const MAX_SIGNINS = 50

export const psitSocTimeline = (socCase, evidence) => {
  const events = []

  if (socCase?.CreatedUtc) {
    events.push(
      event(socCase.CreatedUtc, 'alert', 'Dossier créé', String(socCase?.Title ?? ''))
    )
  }

  for (const entry of socCase?.ActionLog ?? []) {
    const when = entry?.OccurredUtc || entry?.Utc
    if (!when) continue
    const who = entry?.Analyst ? ` — ${entry.Analyst}` : ''
    events.push(
      event(when, 'journal', String(entry?.Action ?? ''), `${String(entry?.Detail ?? '')}${who}`)
    )
  }

  const signIns = Array.isArray(evidence?.user?.signIns) ? evidence.user.signIns : []
  const successes = signIns
    .filter((row) => {
      const status = row?.status?.errorCode ?? row?.Status ?? 0
      return status === 0 || status === 'Success'
    })
    .slice(0, MAX_SIGNINS)
  for (const row of successes) {
    const when = row?.createdDateTime ?? row?.CreatedDateTime ?? row?.Date
    if (!when) continue
    const ip = row?.ipAddress ?? row?.IPAddress ?? ''
    const app = row?.appDisplayName ?? row?.Application ?? ''
    const country = row?.location?.countryOrRegion ?? ''
    events.push(
      event(when, 'signin', `Connexion réussie${ip ? ` depuis ${ip}` : ''}`, [country, app].filter(Boolean).join(' — '))
    )
  }

  const files = Array.isArray(evidence?.download?.files) ? evidence.download.files : []
  const stamps = files.map((file) => parse(file?.WhenUtc)).filter((stamp) => stamp !== null).sort((a, b) => a - b)
  if (stamps.length > 0) {
    events.push(
      event(new Date(stamps[0]).toISOString(), 'download', 'Premier téléchargement relevé', `${files.length} fichiers au total sur la fenêtre`)
    )
    if (stamps.length > 1) {
      events.push(event(new Date(stamps[stamps.length - 1]).toISOString(), 'download', 'Dernier téléchargement relevé', ''))
    }
  }

  for (const consent of evidence?.app?.consentAudit ?? []) {
    if (!consent?.whenUtc) continue
    events.push(
      event(consent.whenUtc, 'consent', `Consentement par ${consent?.who ?? 'inconnu'}`, consent?.ip ? `depuis ${consent.ip}` : '')
    )
  }

  return events
    .filter((entry) => parse(entry.whenUtc) !== null)
    .sort((a, b) => parse(a.whenUtc) - parse(b.whenUtc))
}
