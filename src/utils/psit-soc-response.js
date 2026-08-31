import { psitSocTypeLabel } from './psit-soc-queue'

/**
 * The reply to the external SOC, written from what the dossier already established.
 *
 * The alert mail always ends on the same question ("pouvez-vous confirmer qu'il s'agit d'une
 * activité légitime ?") and the answer used to be retyped in the ticket from memory, in words
 * that taught the external SOC the wrong lesson: a plain "faux positif" on a founded detection
 * trains it to stop flagging the pattern. Each verdict therefore has its own template, and the
 * benign true positive has two, because the same verdict calls for two opposite requests:
 * an authorized behaviour asks for tuning, a treated behaviour asks to KEEP the detection.
 *
 * Like the time entry: a draft, editable before copy, and it never states what the dossier has
 * not qualified.
 */

const dossierHeader = (socCase) => {
  const lines = [
    `Objet : ${psitSocTypeLabel(socCase?.TypeId)} — dossier ${socCase?.CaseId ?? 'N/D'}${
      socCase?.TicketRef ? ` (ticket ${socCase.TicketRef})` : ''
    }`,
    '',
  ]
  return lines
}

const justificationLines = (socCase) => {
  const justification = String(socCase?.Qualification?.Justification ?? '').trim()
  return justification ? ['', `Éléments retenus : ${justification}`] : []
}

const TEMPLATES = {
  'true-positive': (socCase) => [
    ...dossierHeader(socCase),
    'Nous confirmons une activité malveillante : la compromission est retenue.',
    'Les mesures de confinement ont été exécutées et sont tracées au dossier ; un rapport',
    "d'investigation est en cours de remise au client.",
    ...justificationLines(socCase),
    '',
    'Votre signalement était fondé. Merci de maintenir cette détection active.',
  ],
  'benign-true-positive-treated': (socCase) => [
    ...dossierHeader(socCase),
    "Activité du titulaire du compte confirmée : il n'y a pas de compromission.",
    'En revanche le comportement signalé est réel et non conforme à nos usages : il a été',
    'traité avec le client (détail au dossier).',
    ...justificationLines(socCase),
    '',
    'Votre détection a fonctionné comme attendu : merci de continuer à signaler ce motif,',
    'il reste pertinent pour nous.',
  ],
  'benign-true-positive-authorized': (socCase) => [
    ...dossierHeader(socCase),
    "Activité légitime confirmée : le comportement signalé est réel, autorisé et attendu",
    'dans le contexte de ce client.',
    ...justificationLines(socCase),
    '',
    'Vous pouvez ajuster la détection pour ce périmètre précis (compte ou motif ci-dessus),',
    'sans la désactiver globalement.',
  ],
  'false-positive': (socCase) => [
    ...dossierHeader(socCase),
    "Faux positif : l'activité signalée ne correspond pas au comportement détecté",
    '(corrélation ou lecture erronée, détail au dossier).',
    ...justificationLines(socCase),
    '',
    'Merci de regarder le réglage de cette détection pour éviter la récurrence.',
  ],
  undetermined: (socCase) => [
    ...dossierHeader(socCase),
    'Investigation non tranchée à ce stade : les éléments réunis ne permettent ni de',
    "confirmer une activité légitime, ni d'établir une compromission.",
    ...justificationLines(socCase),
    '',
    'Le dossier reste ouvert de notre côté ; nous revenons vers vous dès que la question',
    'est tranchée.',
  ],
}

/**
 * A request for details, for a dossier that cannot advance without the emitter's data. Written
 * to be pasted in the ticket; putting the dossier on hold is a separate, explicit gesture.
 */
export const psitSocExtsocInquiry = (socCase, question = '') => {
  if (!socCase?.CaseId) return null
  const asked = String(question ?? '').trim()
  return [
    ...dossierHeader(socCase),
    "Pour avancer sur ce signalement, nous avons besoin des précisions suivantes :",
    asked ? `- ${asked}` : '- (préciser ici la donnée attendue : journaux source, portée exacte, horodatages…)',
    '',
    'Le dossier est mis en attente de votre retour de notre côté.',
  ].join('\n')
}

/** The variant choices the block offers for a given verdict (null = verdict not qualified). */
export const psitSocResponseVariants = (socCase) => {
  const verdict = socCase?.Qualification?.Verdict
  if (!verdict) return []
  if (verdict === 'benign-true-positive') {
    return [
      {
        key: 'benign-true-positive-treated',
        label: 'Comportement réel, traité : garder la détection',
      },
      {
        key: 'benign-true-positive-authorized',
        label: 'Comportement autorisé et attendu : ajuster la détection',
      },
    ]
  }
  return [{ key: verdict, label: 'Réponse selon le verdict' }]
}

export const psitSocExtsocResponse = (socCase, variantKey) => {
  if (!socCase?.CaseId) return null
  const verdict = socCase?.Qualification?.Verdict
  if (!verdict) return null
  const key = variantKey ?? (verdict === 'benign-true-positive' ? 'benign-true-positive-treated' : verdict)
  const template = TEMPLATES[key]
  if (!template) return null
  return template(socCase).join('\n')
}
