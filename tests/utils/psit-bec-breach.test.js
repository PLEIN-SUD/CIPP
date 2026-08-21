import {
  BREACH_STATE,
  breachDataClasses,
  breachSentence,
  breachSuggestsPasswordReset,
  readBreachExposure,
} from '../../src/utils/psit-bec-breach'

// The four states, and why they are four.
//
// "Not referenced in public breaches" and "we could not check" are different facts. Printed as the
// same sentence, the second becomes a false statement in a document a client may hand to an insurer.
// A dossier collected before this feature existed has no block at all, which is a third thing again
// and must not read as a clean result.

const UPN = 'p.martin@contoso.test'

const snapshot = (overrides = {}) => ({
  BreachExposure: {
    Status: 'ok',
    CheckedUtc: '2026-08-20T10:32:00Z',
    Source: 'Have I Been Pwned (api/v3/breachedaccount)',
    Addresses: [UPN],
    Breaches: [],
    ...overrides,
  },
})

const breach = (name, date, classes = ['Email addresses'], password = false) => ({
  Name: name,
  BreachDate: date,
  DataClasses: classes,
  Password: password,
})

describe('readBreachExposure', () => {
  it('reads an exposure with passwords, oldest breach first', () => {
    const exposure = readBreachExposure(
      snapshot({
        Breaches: [
          breach('Forum', '2021-03-15'),
          breach('Adobe', '2013-10-04', ['Passwords'], true),
          breach('Dropbox', '2012-07-01', ['Passwords'], true),
        ],
      })
    )

    expect(exposure.state).toBe(BREACH_STATE.EXPOSED_PASSWORDS)
    expect(exposure.count).toBe(3)
    expect(exposure.passwordCount).toBe(2)
    expect(exposure.yearMin).toBe(2012)
    expect(exposure.yearMax).toBe(2021)
    expect(exposure.breaches.map((entry) => entry.name)).toEqual(['Dropbox', 'Adobe', 'Forum'])
  })

  it('separates an exposure with no password class', () => {
    const exposure = readBreachExposure(
      snapshot({ Breaches: [breach('Forum', '2021-03-15', ['Usernames'])] })
    )

    expect(exposure.state).toBe(BREACH_STATE.EXPOSED)
    expect(exposure.passwordCount).toBe(0)
  })

  it('reads a check that found nothing as a result, not as a failure', () => {
    const exposure = readBreachExposure(snapshot({ Breaches: [] }))

    expect(exposure.state).toBe(BREACH_STATE.CLEAR)
    expect(exposure.checkedUtc).toBe('2026-08-20T10:32:00Z')
    expect(exposure.reason).toBeNull()
  })

  it('reads each failure of the service as unchecked, with its own reason', () => {
    for (const [status, fragment] of [
      ['not-configured', 'configuré'],
      ['rate-limited', 'quota'],
      ['error', 'indisponible'],
    ]) {
      const exposure = readBreachExposure(snapshot({ Status: status, Breaches: [] }))

      expect(exposure.state).toBe(BREACH_STATE.UNCHECKED)
      expect(exposure.reason).toContain(fragment)
    }
  })

  it('treats a dossier collected before the feature as unchecked, never as clear', () => {
    // The distinction that matters most in this file: an absent block is not a clean result.
    for (const data of [{}, { BreachExposure: null }, { BreachExposure: 'nonsense' }, undefined]) {
      const exposure = readBreachExposure(data)

      expect(exposure.state).toBe(BREACH_STATE.UNCHECKED)
      expect(exposure.reason).toContain('antérieure')
    }
  })

  it('never carries a password value out of the snapshot, only the flag', () => {
    const exposure = readBreachExposure(
      snapshot({
        Breaches: [{ ...breach('Adobe', '2013-10-04', ['Passwords'], true), password: 'hunter2' }],
      })
    )

    expect(JSON.stringify(exposure)).not.toContain('hunter2')
    expect(exposure.breaches[0].password).toBe(true)
  })

  it('survives a single breach flattened out of its array by the worker', () => {
    // The PowerShell worker unwraps one-element collections; psitAsArray puts it back.
    const exposure = readBreachExposure(
      snapshot({ Breaches: breach('Adobe', '2013-10-04', ['Passwords'], true) })
    )

    expect(exposure.count).toBe(1)
    expect(exposure.state).toBe(BREACH_STATE.EXPOSED_PASSWORDS)
  })

  it('keeps an undated breach and takes the year range from the others', () => {
    const exposure = readBreachExposure(
      snapshot({ Breaches: [breach('Undated', null), breach('Dated', '2015-06-01')] })
    )

    expect(exposure.count).toBe(2)
    expect(exposure.yearMin).toBe(2015)
    expect(exposure.yearMax).toBe(2015)
  })

  it('leaves the range empty when nothing is dated', () => {
    const exposure = readBreachExposure(snapshot({ Breaches: [breach('Undated', null)] }))

    expect(exposure.yearMin).toBeNull()
    expect(exposure.yearMax).toBeNull()
  })

  it('drops a nameless breach rather than printing a blank row', () => {
    const exposure = readBreachExposure(
      snapshot({ Breaches: [breach('', '2015-01-01'), breach('Real', '2015-01-01')] })
    )

    expect(exposure.count).toBe(1)
    expect(exposure.breaches[0].name).toBe('Real')
  })
})

describe('breachDataClasses', () => {
  it('merges and sorts the classes across breaches, without repeating one', () => {
    const exposure = readBreachExposure(
      snapshot({
        Breaches: [
          breach('A', '2013-01-01', ['Passwords', 'Email addresses']),
          breach('B', '2014-01-01', ['Email addresses', 'Usernames']),
        ],
      })
    )

    expect(breachDataClasses(exposure)).toEqual(['Email addresses', 'Passwords', 'Usernames'])
  })

  it('returns nothing when no breach declares a class', () => {
    const exposure = readBreachExposure(snapshot({ Breaches: [breach('Bare', '2018-01-01', [])] }))

    expect(breachDataClasses(exposure)).toEqual([])
  })
})

describe('breachSentence', () => {
  it('states the count, the range, the passwords, and the non-causality', () => {
    const exposure = readBreachExposure(
      snapshot({
        Breaches: [
          breach('Dropbox', '2012-07-01', ['Passwords'], true),
          breach('Adobe', '2013-10-04', ['Passwords', 'Email addresses'], true),
          breach('Forum', '2021-03-15', ['Email addresses']),
        ],
      })
    )
    const sentence = breachSentence(exposure, UPN)

    expect(sentence).toContain(`L'adresse ${UPN} figure dans 3 compromissions de données publiques`)
    expect(sentence).toContain('entre 2012 et 2021')
    expect(sentence).toContain('dont 2 compromissions de données publiques exposant des mots de passe')
    // The reserve the whole encart exists for: a risk factor, not a cause.
    expect(sentence).toContain("elle n'établit pas le vecteur d'accès initial de l'incident")
    expect(sentence).toContain('Catégories de données exposées : Email addresses et Passwords.')
    expect(sentence).toContain('Vérification effectuée le 20 août 2026 à 10:32 UTC via Have I Been Pwned')
  })

  it('drops the password clause when no breach exposed one', () => {
    const exposure = readBreachExposure(
      snapshot({ Breaches: [breach('Forum', '2021-03-15', ['Usernames'])] })
    )
    const sentence = breachSentence(exposure, UPN)

    expect(sentence).toContain('figure dans 1 compromission de données publiques')
    expect(sentence).not.toContain('exposant des mots de passe')
    expect(sentence).toContain("elle n'établit pas le vecteur d'accès initial")
  })

  it('says an absence of reference is not an absence of compromise', () => {
    const sentence = breachSentence(readBreachExposure(snapshot({ Breaches: [] })), UPN)

    expect(sentence).toContain("L'adresse ne figure pas dans les compromissions publiques référencées")
    expect(sentence).toContain("L'absence de référencement ne vaut pas absence de compromission")
    expect(sentence).toContain('Vérification effectuée le 20 août 2026')
  })

  it('gives the reason when the check did not happen, and claims no provenance', () => {
    const sentence = breachSentence(readBreachExposure({}), UPN)

    expect(sentence).toContain("La vérification d'exposition n'a pas pu être effectuée")
    expect(sentence).toContain('antérieure')
    // Nothing was checked, so there is no check to date or attribute.
    expect(sentence).not.toContain('Vérification effectuée le')
  })

  it('says which year is missing rather than printing undefined', () => {
    const exposure = readBreachExposure(
      snapshot({ Breaches: [breach('Undated', null, ['Passwords'], true)] })
    )
    const sentence = breachSentence(exposure, UPN)

    expect(sentence).not.toContain('undefined')
    expect(sentence).not.toContain('null')
    expect(sentence).toContain('année non déterminée')
  })
})

describe('breachSuggestsPasswordReset', () => {
  it('is true in the two exposed states and false in the other two', () => {
    const exposed = readBreachExposure(
      snapshot({ Breaches: [breach('Adobe', '2013-10-04', ['Passwords'], true)] })
    )
    const noPassword = readBreachExposure(
      snapshot({ Breaches: [breach('Forum', '2021-03-15', ['Usernames'])] })
    )

    expect(breachSuggestsPasswordReset(exposed)).toBe(true)
    expect(breachSuggestsPasswordReset(noPassword)).toBe(true)
    expect(breachSuggestsPasswordReset(readBreachExposure(snapshot({ Breaches: [] })))).toBe(false)
    expect(breachSuggestsPasswordReset(readBreachExposure({}))).toBe(false)
  })
})
