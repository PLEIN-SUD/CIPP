import {
  BANNED_LEXICON,
  NOT_COLLECTED,
  agree,
  andMore,
  elideDe,
  listWithNote,
  truncationNote,
  cardinal,
  counted,
  dateProse,
  dateTable,
  dayProse,
  enumerate,
  lexiconWarnings,
  nbsp,
  phrase,
  phraseValues,
  sentence,
} from '../../src/utils/psit-report-prose'

describe('cardinal', () => {
  it('never prints (s)', () => {
    expect(cardinal(0, 'connexion')).toBe('aucune connexion')
    expect(cardinal(1, 'connexion')).toBe('1 connexion')
    expect(cardinal(14, 'connexion')).toBe('14 connexions')
  })

  it('agrees the negation with the gender', () => {
    expect(cardinal(0, 'signal')).toBe('aucun signal')
    expect(cardinal(0, 'voieExfiltration')).toBe("aucune voie d'exfiltration")
  })

  it('pluralises the irregulars from the table, not by rule', () => {
    expect(cardinal(3, 'signal')).toBe('3 signaux')
    // Invariable: a rule adding an s would print "3 tierss".
    expect(cardinal(3, 'tiers')).toBe('3 tiers')
    expect(cardinal(1, 'tiers')).toBe('1 tiers')
    expect(cardinal(2, 'voieExfiltration')).toBe("2 voies d'exfiltration")
  })

  it('refuses a missing count instead of printing it as a finding', () => {
    // "aucun message" is an affirmative statement; an ungathered count is a collection failure.
    // Conflating them writes a false finding into a document that can be produced as evidence.
    expect(() => cardinal(undefined, 'message')).toThrow(/missing count/)
    expect(() => cardinal(null, 'message')).toThrow(/missing count/)
    expect(() => cardinal('', 'message')).toThrow(/missing count/)
    expect(() => cardinal(NaN, 'message')).toThrow(/not a count/)
    expect(() => cardinal('trois', 'message')).toThrow(/not a count/)
  })

  it('renders an ungathered count only when the caller says so explicitly', () => {
    expect(cardinal(NOT_COLLECTED, 'message')).toBe('non déterminé')
    expect(counted(NOT_COLLECTED, 'message')).toBe('non déterminé')
    expect(sentence(NOT_COLLECTED, 'voieExfiltration', 'relevé')).toBe(
      "voie d'exfiltration : non déterminé"
    )
  })

  it('still treats a real zero as a finding, and a negative as zero', () => {
    expect(cardinal(0, 'message')).toBe('aucun message')
    expect(cardinal(-2, 'message')).toBe('aucun message')
  })

  it('keeps the figure for a table cell', () => {
    expect(counted(0, 'message')).toBe('0 message')
    expect(counted(5, 'message')).toBe('5 messages')
  })

  it('fails loudly on an unknown noun instead of inventing a plural', () => {
    expect(() => cardinal(2, 'chose')).toThrow(/unknown noun/)
  })
})

describe('sentence', () => {
  it('agrees the participle and the auxiliary with the cardinality', () => {
    expect(sentence(0, 'voieExfiltration', 'relevé')).toBe(
      "aucune voie d'exfiltration n'a été relevée"
    )
    expect(sentence(1, 'voieExfiltration', 'relevé')).toBe("1 voie d'exfiltration a été relevée")
    expect(sentence(3, 'voieExfiltration', 'relevé')).toBe(
      "3 voies d'exfiltration ont été relevées"
    )
  })

  it('agrees with a masculine noun too', () => {
    expect(sentence(0, 'signal', 'retenu')).toBe("aucun signal n'a été retenu")
    expect(sentence(1, 'signal', 'retenu')).toBe('1 signal a été retenu')
    expect(sentence(4, 'signal', 'retenu')).toBe('4 signaux ont été retenus')
  })

  it('handles the invariable noun without breaking the participle', () => {
    expect(sentence(2, 'tiers', 'prévenu')).toBe('2 tiers ont été prévenus')
  })
})

describe('agree', () => {
  it('agrees a bare qualifier with the count', () => {
    // The defect this exists for: "5 correspondants externes distinct observé".
    expect(agree(1, 'correspondant', 'distinct', 'observé')).toBe('distinct observé')
    expect(agree(5, 'correspondant', 'distinct', 'observé')).toBe('distincts observés')
    expect(agree(0, 'correspondant', 'distinct', 'observé')).toBe('distinct observé')
  })

  it('agrees with a feminine noun', () => {
    expect(agree(1, 'ligneSuivi', 'collecté')).toBe('collectée')
    expect(agree(4, 'ligneSuivi', 'collecté')).toBe('collectées')
  })

  it('treats an ungathered count as singular rather than throwing mid-sentence', () => {
    expect(agree(NOT_COLLECTED, 'correspondant', 'observé')).toBe('observé')
  })

  it('refuses a missing count, like the rest of the module', () => {
    expect(() => agree(null, 'correspondant', 'observé')).toThrow(/missing count/)
  })
})

describe('elideDe', () => {
  it('elides in front of a vowel', () => {
    // The defect: "Ces acces ont ete suivis de une campagne d'envoi en masse".
    expect(elideDe("une campagne d'envoi en masse")).toBe("d'une campagne d'envoi en masse")
    expect(elideDe('un acces sans activite')).toBe("d'un acces sans activite")
  })

  it('keeps "de" in front of a consonant', () => {
    expect(elideDe('la mise en place du transfert')).toBe('de la mise en place du transfert')
  })

  it('collapses "de des" the way French does', () => {
    expect(elideDe('des envois dans des fils existants')).toBe(
      "d'envois dans des fils existants"
    )
  })

  it('handles a free-text field the analyst left empty', () => {
    expect(elideDe('')).toBe('de')
    expect(elideDe(null)).toBe('de')
  })
})

describe('truncationNote', () => {
  it('carries both numbers and where the rest is', () => {
    expect(truncationNote(8, 12)).toBe(
      "8 lignes sur 12 figurent ici ; la liste compl\u00e8te est dans l'export de donn\u00e9es du dossier."
    )
  })

  it('agrees the verb for a single kept line', () => {
    expect(truncationNote(1, 4)).toContain('1 ligne sur 4 figure ici')
  })

  it('says nothing when nothing was cut', () => {
    expect(truncationNote(8, 8)).toBeNull()
    expect(truncationNote(8, 3)).toBeNull()
  })
})

describe('andMore', () => {
  it('states the remainder for a cell', () => {
    expect(andMore(3, 7, 'objet')).toBe('et 4 objets de plus')
    expect(andMore(3, 4, 'application')).toBe('et 1 application de plus')
  })

  it('says nothing when the cell shows everything', () => {
    expect(andMore(3, 3, 'objet')).toBeNull()
  })
})

describe('listWithNote', () => {
  it('caps the list itself and counts what it cut', () => {
    const items = ['a', 'b', 'c', 'd', 'e']
    const out = listWithNote(items, 2, (value) => `ligne ${value}`)

    expect(out.split('\n')).toEqual([
      'ligne a',
      'ligne b',
      "2 lignes sur 5 figurent ici ; la liste compl\u00e8te est dans l'export de donn\u00e9es du dossier.",
    ])
  })

  it('adds no note when the list fits', () => {
    expect(listWithNote(['a'], 5, (value) => value)).toBe('a')
  })

  it('survives a missing list', () => {
    expect(listWithNote(undefined, 5, (value) => value)).toBe('')
  })
})

describe('dates', () => {
  it('writes running prose in UTC', () => {
    expect(dateProse('2026-08-17T16:08:12Z')).toBe('le 17 août 2026 à 16:08 UTC')
    expect(dateProse('2026-08-17T16:08:12Z', { article: false })).toBe('17 août 2026 à 16:08 UTC')
  })

  it('writes the first of the month as 1er', () => {
    expect(dateProse('2026-09-01T07:00:00Z')).toBe('le 1er septembre 2026 à 07:00 UTC')
    expect(dayProse('2026-09-01T07:00:00Z')).toBe('1er septembre 2026')
  })

  it('states UTC whatever the offset of the input', () => {
    // A browser in Paris must not shift the date by two hours: the report says UTC.
    expect(dateProse('2026-08-17T18:08:12+02:00')).toBe('le 17 août 2026 à 16:08 UTC')
  })

  it('writes table stamps without T or Z, seconds kept', () => {
    expect(dateTable('2026-08-17T16:08:12Z')).toBe('2026-08-17 16:08:12 UTC')
    // No ISO separator and no trailing Z; the T of "UTC" is obviously fine.
    expect(dateTable('2026-08-17T16:08:12Z')).not.toMatch(/\dT\d/)
    expect(dateTable('2026-08-17T16:08:12Z')).not.toMatch(/\dZ/)
  })

  it('falls back to words rather than to Invalid Date', () => {
    expect(dateProse(null)).toBe('date non renseignée')
    expect(dateProse('hier soir')).toBe('date non renseignée')
    expect(dateTable(undefined)).toBe('non renseigné')
    expect(dateTable('', { fallback: 'N/D' })).toBe('N/D')
  })
})

describe('nbsp', () => {
  it('binds the double punctuation to the word before it', () => {
    expect(nbsp('Référence : T1')).toBe('Référence : T1')
    expect(nbsp('un point ; deux')).toBe('un point ; deux')
  })

  it('binds the inside of the quotation marks', () => {
    expect(nbsp('la règle « classement »')).toBe('la règle « classement »')
  })

  it('leaves a time and a URL alone', () => {
    expect(nbsp('16:08:12')).toBe('16:08:12')
    expect(nbsp('https://exemple.test')).toBe('https://exemple.test')
  })

  it('is idempotent, so a string can pass through twice', () => {
    expect(nbsp(nbsp('Référence : T1'))).toBe('Référence : T1')
  })
})

describe('enumerate', () => {
  it('writes a list as a reader would say it', () => {
    expect(enumerate(['a'])).toBe('a')
    expect(enumerate(['a', 'b'])).toBe('a et b')
    expect(enumerate(['a', 'b', 'c'])).toBe('a, b et c')
    expect(enumerate(['a', 'b'], { conjunction: 'ou' })).toBe('a ou b')
  })

  it('drops the empty entries instead of printing a dangling comma', () => {
    expect(enumerate(['a', '', null, 'b'])).toBe('a et b')
    expect(enumerate([])).toBe('aucun')
  })
})

describe('phrase', () => {
  it('covers the four verdicts, box and body', () => {
    expect(phrase('verdict', 'compromised', 'box')).toBe('compromission retenue')
    expect(phrase('verdict', 'toQualify', 'box')).toBe('qualification en cours')
    expect(phrase('verdict', 'undetermined', 'box')).toBe('indéterminée')
    expect(phrase('verdict', 'clean', 'box')).toBe('faux positif retenu')
    expect(phraseValues('verdict')).toHaveLength(4)
  })

  it('never leaves a raw enumeration value to be printed', () => {
    // The defect this replaces: "Lecture des messages : not-provable".
    expect(phrase('mailRead', 'not-provable')).toContain('MailItemsAccessed')
    expect(phrase('mailRead', 'not-provable')).toContain('ne peut être ni établie ni exclue')
    expect(phrase('mailRead', 'not-provable', 'summary')).not.toMatch(/^[A-Z]/)
  })

  it('falls back to the body variant when a context has none', () => {
    expect(phrase('channel', 'courriel', 'box')).toBe('par courriel')
  })

  it('returns null on an unknown value so the caller can decide', () => {
    expect(phrase('channel', 'pigeon')).toBeNull()
    expect(phrase('inconnu', 'x')).toBeNull()
  })

  it('offers the four effect descriptions the summary needs', () => {
    expect(phraseValues('effect')).toEqual(['mass-send', 'thread-hijack', 'both', 'access-only'])
    expect(phrase('effect', 'both')).toContain("campagne d'envoi en masse")
  })
})

describe('lexiconWarnings', () => {
  it('catches what the analyst typed, which the lint cannot see', () => {
    expect(lexiconWarnings('Connexions malveillantes, envoi de spam massif')).toEqual(
      expect.arrayContaining([expect.stringContaining('spam'), expect.stringContaining('massif')])
    )
  })

  it('flags "utilisateur" alone but not the compound wording', () => {
    expect(lexiconWarnings("l'utilisateur était en Italie").length).toBeGreaterThan(0)
    expect(lexiconWarnings('le titulaire du compte était en Italie')).toEqual([])
  })

  it('flags an em dash pasted from a mail client', () => {
    expect(lexiconWarnings('confinement — en cours').length).toBeGreaterThan(0)
  })

  it('says nothing about a clean note', () => {
    expect(lexiconWarnings('Le titulaire du compte confirme être resté en France.')).toEqual([])
    expect(lexiconWarnings('')).toEqual([])
    expect(lexiconWarnings(null)).toEqual([])
  })

  it('carries a reason with every rule, so the panel can explain itself', () => {
    expect(BANNED_LEXICON.every((rule) => rule.why && rule.pattern)).toBe(true)
  })
})
