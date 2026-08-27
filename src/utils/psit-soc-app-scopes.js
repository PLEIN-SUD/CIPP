// Reading an OAuth consent by what it actually allows.
//
// The scopes are the discriminant an analyst acts on for a consent case (type 6): a read-only
// grant to a known business application and a Mail.ReadWrite + offline_access grant to an
// unverified publisher are the same event in the audit log and opposite conclusions. The
// known-malicious catalogue matching stays server-side, in the BEC collection: it is the API
// that holds the catalogue, and duplicating it here would create a second list to keep in sync.

/**
 * Scopes that make a consent a persistence mechanism rather than a convenience. Mailbox access
 * plus a refresh token is the consent-phishing pattern: it survives the password reset, which is
 * the whole point of the technique.
 */
const HIGH_RISK = [
  { pattern: /\bMail\.(ReadWrite|Send)/i, why: 'accès en écriture ou envoi sur la boîte' },
  { pattern: /\bMail\.Read\b/i, why: 'lecture de la boîte' },
  { pattern: /\bfull_access_as_app\b/i, why: 'accès total en tant qu’application' },
  { pattern: /\bEWS\.AccessAsUser/i, why: 'accès Exchange Web Services' },
  { pattern: /\bFiles\.ReadWrite\.All\b/i, why: 'écriture sur tous les fichiers' },
  { pattern: /\bDirectory\.ReadWrite/i, why: 'écriture dans l’annuaire' },
  { pattern: /\bMailboxSettings\.ReadWrite\b/i, why: 'modification des règles de boîte' },
]

/** Kept apart: it is not dangerous alone, it is what makes the rest survive a password reset. */
const PERSISTENCE = { pattern: /\boffline_access\b/i, why: 'jeton de rafraîchissement (survit au mot de passe)' }

/**
 * @param {string} scope Space or comma separated scope string, as ListOAuthApps returns it.
 * @returns {{granted: string[], risky: {scope: string, why: string}[], hasPersistence: boolean,
 *   readOnly: boolean}}
 */
export const readAppScopes = (scope) => {
  // Deduplicated: several consents repeat openid/profile/email, and 27 chips where 7 scopes
  // exist buries the one that matters under the wallpaper.
  const granted = [
    ...new Set(
      String(scope ?? '')
        .split(/[,\s]+/)
        .map((entry) => entry.trim())
        .filter(Boolean)
    ),
  ]

  const risky = []
  for (const entry of granted) {
    const match = HIGH_RISK.find((rule) => rule.pattern.test(entry))
    if (match) risky.push({ scope: entry, why: match.why })
  }

  return {
    granted,
    risky,
    hasPersistence: granted.some((entry) => PERSISTENCE.pattern.test(entry)),
    // Read-only is a real signal, but only when something was actually granted: an empty scope
    // list means "we could not read the grant", never "the app can do nothing".
    readOnly: granted.length > 0 && risky.length === 0,
  }
}
