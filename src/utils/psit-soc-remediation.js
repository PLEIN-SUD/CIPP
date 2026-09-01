// The one remediation gesture a dossier's entity calls for, shared by the two places that fire
// it: the emergency containment (before any verdict) and the confirmed-TP shortcut (right after
// the verdict). One definition, so the payload, the journal action and the human-readable detail
// can never drift apart between the two.

/**
 * What remediating THIS dossier means: CIPP's Remediate User for an account, MDE isolation for
 * a machine, nothing when the dossier names neither. `journalDetail(prefix)` builds the journal
 * line; the prefix says under which doctrine the gesture was fired ('Mesure conservatoire avant
 * verdict' or 'Remédiation immédiate sur vrai positif confirmé').
 */
export const psitSocRemediationPlan = (socCase) => {
  const tenant = socCase?.Tenant
  const upn = socCase?.Entities?.upn
  const userId = socCase?.Entities?.userId
  const aadDeviceId = socCase?.Entities?.azureADDeviceId

  if (upn) {
    return {
      available: true,
      kind: 'user',
      target: upn,
      actionLabel: 'Exécuter les six gestes',
      description:
        'Remédiation CIPP complète du compte : mot de passe réinitialisé, connexion bloquée, sessions révoquées, méthodes MFA retirées, règles de boîte désactivées, partage OneDrive désactivé. Le titulaire perd l’accès immédiatement.',
      payload: {
        url: '/api/execBecRemediate',
        data: { tenantFilter: tenant, userId, username: upn },
      },
      journalAction: 'remediate-user',
      journalDetail: (prefix) =>
        `${prefix} : remédiation CIPP exécutée pour ${upn} (connexion bloquée, mot de passe réinitialisé, sessions révoquées, méthodes MFA retirées, règles de boîte désactivées, partage OneDrive désactivé)`,
    }
  }
  if (aadDeviceId) {
    return {
      available: true,
      kind: 'device',
      target: socCase?.Entities?.deviceName || aadDeviceId,
      actionLabel: 'Isoler le poste',
      description:
        'Isolation réseau via Defender : la machine est coupée de tout le réseau, seule la console MDE reste jointe. L’état du poste est capturé au dossier avant la coupure.',
      payload: {
        url: '/api/PSITExecMdeIsolation',
        data: {
          tenantFilter: tenant,
          AzureADDeviceId: aadDeviceId,
          Comment: `Dossier SOC ${socCase?.CaseId ?? ''}`,
          CaseId: socCase?.CaseId,
        },
      },
      journalAction: 'mde-isolate',
      journalDetail: (prefix) => `${prefix} : poste isolé du réseau (MDE)`,
    }
  }
  return { available: false }
}
