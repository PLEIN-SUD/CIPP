/**
 * The model behind the application investigation report: which of the four honest outcomes this
 * dossier landed on, and the sentence that states it.
 *
 * The four outcomes exist because reality has more than two: an alert on a third-party
 * application can be a real compromise (true positive), but the most common field case is an
 * application deployed knowingly by someone entitled to, and the client then chooses to keep it
 * or to revoke it anyway (hygiene, or a migration to something else). In Defender vocabulary the
 * latter is a benign true positive; in this portal's two-value qualification it is a false
 * positive whose journal carries the revocation. The report says which one happened instead of
 * forcing the reader to reconstruct it from a verdict and a log line.
 */
export const APP_CONCLUSION = {
  MALICIOUS: 'malicious',
  LEGIT_REVOKED: 'legit-revoked',
  LEGIT_KEPT: 'legit-kept',
  UNQUALIFIED: 'unqualified',
}

const CONCLUSIONS = {
  [APP_CONCLUSION.MALICIOUS]: (revoked) =>
    revoked
      ? "L'accès de cette application a été qualifié illégitime (vrai positif). Le consentement a été révoqué et le principal de service désactivé."
      : "L'accès de cette application a été qualifié illégitime (vrai positif). La révocation du consentement n'est pas encore constatée dans le tenant : elle reste à exécuter ou à vérifier.",
  [APP_CONCLUSION.LEGIT_REVOKED]: () =>
    "L'investigation conclut à une application légitime : le consentement a été accordé volontairement par une personne habilitée, qui l'a confirmé. À la demande du client, l'accès a néanmoins été révoqué, par mesure d'hygiène et dans l'attente d'une solution de remplacement.",
  [APP_CONCLUSION.LEGIT_KEPT]: () =>
    "L'investigation conclut à une application légitime : le consentement a été accordé volontairement par une personne habilitée. L'accès est maintenu ; les recommandations ci-dessous encadrent son maintien.",
  [APP_CONCLUSION.UNQUALIFIED]: () =>
    "Le dossier n'est pas qualifié : ce document décrit les faits collectés et ne conclut pas.",
}

export const buildAppReportModel = ({
  socCase,
  principal,
  consents = [],
  auditEvents = [],
  scopes,
} = {}) => {
  // Qualification.Verdict, not socCase.Verdict: the endpoint takes a flat Verdict parameter
  // when writing, and returns it nested when reading. This read the writer's shape and was
  // therefore never true, which kept the report button disabled on every dossier.
  const verdict = socCase?.Qualification?.Verdict
  // accountEnabled === false is the one state that proves a revocation; an absent principal or
  // an absent field proves nothing and must not be reported as one.
  const revoked = principal?.accountEnabled === false

  const kind = !verdict
    ? APP_CONCLUSION.UNQUALIFIED
    : verdict === 'true-positive'
      ? APP_CONCLUSION.MALICIOUS
      : revoked
        ? APP_CONCLUSION.LEGIT_REVOKED
        : APP_CONCLUSION.LEGIT_KEPT

  const adminConsents = consents.filter((consent) => consent?.kind === 'admin')
  const userConsents = consents.filter((consent) => consent?.kind === 'user')

  // Sorted on the same stamp the report displays: an action declared as having happened
  // earlier belongs earlier in the story, not where its write landed.
  const journal = [...(socCase?.ActionLog ?? [])].sort((a, b) =>
    String(a?.OccurredUtc || a?.Utc || '').localeCompare(String(b?.OccurredUtc || b?.Utc || ''))
  )

  return {
    kind,
    conclusion: CONCLUSIONS[kind](revoked),
    revoked,
    verdict: verdict ?? null,
    justification: String(socCase?.Qualification?.Justification ?? ''),
    adminConsents,
    userConsents,
    riskyScopes: scopes?.risky ?? [],
    grantedScopes: scopes?.granted ?? [],
    auditEvents,
    journal,
  }
}
