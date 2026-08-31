// The restore list: what a remediation took away from an account that turned out innocent.
//
// A containment run on a benign or false-positive dossier is not an error to hide - it is a
// conservatory measure, journaled as such - but it leaves the account without password, MFA,
// sign-in, OneDrive sharing or inbox rules. Nothing used to list what remained to give back:
// the analyst reconstructed it from memory, which is how a titulaire ends up locked out three
// days after being cleared.
//
// Each remediation action found in the journal contributes its restore items; journaling a
// restoration (Action 'restored', Detail = the item's exact sentence) is what marks it done, so
// the list reads from the same trail the fiche BEC attests.

const RESTORE_ITEMS_BY_ACTION = {
  'remediate-user': [
    { key: 'signin', sentence: 'Connexion réactivée (compte débloqué)' },
    { key: 'password', sentence: 'Nouveau mot de passe transmis au titulaire' },
    { key: 'mfa', sentence: 'Méthodes MFA ré-enrôlées par le titulaire' },
    { key: 'onedrive', sentence: 'Partage OneDrive rétabli' },
    { key: 'rules', sentence: 'Règles de boîte légitimes réactivées' },
  ],
  'block-signin': [{ key: 'signin', sentence: 'Connexion réactivée (compte débloqué)' }],
  'reset-password': [{ key: 'password', sentence: 'Nouveau mot de passe transmis au titulaire' }],
  'mde-isolate': [{ key: 'isolation', sentence: 'Isolation réseau levée' }],
  'mail-soft-delete': [{ key: 'mail', sentence: 'Message restauré (suppression réversible annulée)' }],
  'revoke-app-consent': [
    { key: 'app', sentence: 'Besoin applicatif recadré (circuit officiel ou solution de remplacement)' },
  ],
}

const RESTORING_VERDICTS = ['benign-true-positive', 'false-positive']

/**
 * The items to give back, deduplicated by key, each carrying done-ness read from the journal.
 * Empty when the verdict retains a compromise (nothing to give back to an attacker), when no
 * remediation was journaled, or when the dossier is not qualified yet.
 */
export const psitSocRestoreItems = (socCase) => {
  const verdict = socCase?.Qualification?.Verdict
  if (!RESTORING_VERDICTS.includes(verdict)) return []

  const journal = socCase?.ActionLog ?? []
  const items = new Map()
  for (const entry of journal) {
    const contributed = RESTORE_ITEMS_BY_ACTION[String(entry?.Action ?? '')]
    if (!contributed) continue
    for (const item of contributed) {
      if (!items.has(item.key)) items.set(item.key, item)
    }
  }
  // 'mde-unisolate' journaled by the device panel already IS the isolation restore.
  const restored = new Set(
    journal
      .filter((entry) => entry?.Action === 'restored' || entry?.Action === 'mde-unisolate')
      .map((entry) =>
        entry?.Action === 'mde-unisolate' ? 'Isolation réseau levée' : String(entry?.Detail ?? '')
      )
  )

  return [...items.values()].map((item) => ({
    ...item,
    done: restored.has(item.sentence),
  }))
}
