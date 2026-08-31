import { psitSocTypeById } from './psit-soc-types'

/**
 * The one thing a case view should say before anything else: what to do next.
 *
 * Everything needed to answer it was already on the case, spread across the status, the guide
 * progress and the verdict. An analyst could work it out by reading three panels; this reads them
 * for him. It is a statement of where the case stands, not a rule he must obey: nothing here
 * blocks an action, and a case can be qualified before its guide is finished, which is why a
 * verdict already recorded is never answered with "go back to step three".
 *
 * A pure function, so the sequence is tested rather than trusted to render correctly.
 */

const STEP = (id, title, detail, tone) => ({ id, title, detail, tone })

/** The first guide step still pending, or null when the guide is done or absent. */
const firstPendingStep = (socCase) => {
  const steps = psitSocTypeById(socCase?.TypeId)?.guide ?? []
  const progress = socCase?.GuideProgress ?? {}
  return (
    steps.find((step) => {
      const state = progress?.[step.id]?.State ?? progress?.[step.id]
      return state !== 'done' && state !== 'skipped'
    }) ?? null
  )
}

export const psitSocNextStep = (socCase) => {
  if (!socCase) return null

  const status = socCase.Status
  const verdict = socCase.Qualification?.Verdict

  if (status === 'closed') {
    const who = socCase.ClosedBy ? ` par ${socCase.ClosedBy}` : ''
    const when = socCase.ClosedUtc ? ` le ${socCase.ClosedUtc}` : ''
    return STEP('closed', 'Dossier clos', `Clos${when}${who}. Rouvrir si le fil repart.`, 'done')
  }

  if (status === 'on-hold') {
    return STEP(
      'hold',
      'En attente d’un retour',
      'Le dossier attend une réponse (SOC externe, client). Reprendre dès qu’elle arrive : bouton « Reprendre » dans l’en-tête.',
      'action'
    )
  }

  if (status === 'new') {
    return STEP(
      'take',
      'Prendre le dossier en charge',
      'Personne n’est encore dessus. Le passer en investigation le signale aux autres.',
      'action'
    )
  }

  // A verdict already recorded is respected, whatever the guide says. An analyst who has decided
  // is not sent back to a checklist.
  if (verdict === 'true-positive') {
    if (status !== 'contained') {
      return STEP(
        'contain',
        'Confiner, puis marquer le confinement',
        'Les actions sont dans les panneaux de contexte, à côté des preuves qui les justifient.',
        'critical'
      )
    }
    return STEP(
      'close',
      'Clore le dossier',
      'La menace est arrêtée. Reste ce qui ferme le dossier : rapport, rappel client, mot de passe changé devant l’utilisateur.',
      'action'
    )
  }

  // Unclear is a holding state, not a shrug: the banner pushes toward what resolves it, and the
  // server will demand a justification if the case closes anyway.
  if (verdict === 'undetermined') {
    return STEP(
      'resolve',
      'Chercher la donnée manquante, ou escalader',
      'Élargir la fenêtre d’audit, rappeler le titulaire, ou escalader le dossier. La clôture sur indéterminé exigera une justification.',
      'action'
    )
  }

  if (verdict) {
    return STEP(
      'close',
      'Clore le dossier',
      verdict === 'benign-true-positive'
        ? 'Signalement fondé, comportement traité : reste la réponse au SOC externe (garder la détection) et les restaurations éventuelles.'
        : 'Rien à confiner sur un faux positif.',
      'action'
    )
  }

  const pending = firstPendingStep(socCase)
  if (pending) {
    return STEP('guide', `Étape suivante : ${pending.label}`, 'Guide d’investigation du type.', 'action')
  }

  return STEP(
    'qualify',
    'Qualifier le dossier',
    'Vrai positif, VP bénin, faux positif ou indéterminé, avec la justification qui devra tenir dans six mois.',
    'action'
  )
}
