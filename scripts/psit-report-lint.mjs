#!/usr/bin/env node
/**
 * PSIT report lint: the editorial rules of the reports, checked on the source rather than on a
 * generated PDF.
 *
 * Two checks, and the second is the one that protects the fork:
 *
 *   1. Prose rules on the string literals of the report modules. AST, not a regex over the file:
 *      a grep flags `toQualify.filter((s) => …)` as a parenthesised plural and the rule table of
 *      psit-report-prose as a banned lexicon, and a lint with false positives gets disabled.
 *   2. Divergence on upstream files. Every diff hunk against the upstream reference must sit inside
 *      a PSIT-CUSTOM-BEGIN / PSIT-CUSTOM-END pair. This is what makes it impossible to reintroduce
 *      the prettier reformatting that once turned a 14-line fix into a 285-line diff, and what
 *      keeps the next upstream sync reviewable.
 *
 * Usage: node scripts/psit-report-lint.mjs [--no-divergence]
 *        node scripts/psit-report-lint.mjs --init-baseline   (after an upstream sync)
 */

import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { parse } from '@babel/parser'

// Report-rendering modules: what a client reads comes from here.
const PROSE_FILES = [
  'src/components/psit/PsitBecIncidentReport.jsx',
  'src/components/psit/PsitBecReportFr.jsx',
  'src/components/psit/PsitBecAssessmentSection.jsx',
  'src/components/psit/PsitTimelineStrip.jsx',
  'src/components/psit/PsitTlpBand.jsx',
  'src/components/psit/PsitBecCollectionStatus.jsx',
  'src/components/psit/PsitBecDecisionPanel.jsx',
  'src/components/psit/PsitBecIncidentPanel.jsx',
  'src/components/psit/PsitBecTriagePanel.jsx',
  'src/utils/psit-bec-signals.js',
  'src/utils/psit-bec-incident.js',
  'src/utils/psit-bec-iocs.js',
  'src/utils/psit-bec-breach.js',
  'src/utils/psit-country-names.js',
  'src/utils/psit-bec-collection.js',
  'src/utils/psit-report-timeline.js',
]

// The prose module holds the banned lexicon itself, so its own rule table would fail every rule.
const PROSE_EXCLUDED = ['src/utils/psit-report-prose.js']

// Upstream files carrying PSIT blocks. Kept explicit, and the limit of the mechanism is worth
// stating: `undeclared-upstream-file` only catches a file that CARRIES MARKERS without being listed.
// An upstream file edited with no markers at all stays invisible - which is how the change to
// ExecutiveReportButton.test.jsx went unnoticed until a hand audit before a push. Marking every
// in-place edit is therefore not a style rule, it is what makes this check work.
const UPSTREAM_FILES = [
  'src/components/CippPdf/reportPdfPrimitives.jsx',
  'src/components/CippPdf/ReportDocument.jsx',
  'src/pages/identity/administration/users/user/bec.jsx',
  'src/utils/format-alert-item.js',
  'src/components/BECRemediationReportButton.js',
  'src/layouts/top-nav.js',
  'tests/components/ExecutiveReportButton.test.jsx',
  'src/layouts/config.js',
]

// Strings that legitimately contain what a rule bans, with the reason. Versioned beside the script,
// as agreed: an exception nobody can read is an exception nobody can review.
const ALLOWED = [
  {
    text: 'TLP:CLEAR',
    why: 'FIRST marking, the colon is part of the value',
  },
  { text: 'TLP:GREEN', why: 'FIRST marking' },
  { text: 'TLP:AMBER', why: 'FIRST marking' },
  { text: 'TLP:AMBER+STRICT', why: 'FIRST marking' },
  { text: 'TLP:RED', why: 'FIRST marking' },
  {
    text: 'https://',
    why: 'URL',
  },
]

// Names that legitimately follow a colon.
const PROPER_NOUNS = [
  'Entra',
  'Exchange',
  'Microsoft',
  'Purview',
  'Autotask',
  'Plein',
  'Sud',
  'Windows',
  'Outlook',
  'OneDrive',
  'SharePoint',
  'Teams',
]

// CP1252, which is what react-pdf's standard fonts can encode: ASCII, Latin-1 above U+00A0, and
// the punctuation block Windows put in 0x80-0x9F. Written out because the interesting part is what
// is NOT here: arrows, thin spaces, anything typographic beyond this set.
const CP1252 = new Set([
  ...Array.from({ length: 0x5f }, (unused, index) => 0x20 + index), // 0x20-0x7E
  9,
  10,
  13,
  ...Array.from({ length: 0x60 }, (unused, index) => 0xa0 + index), // 0xA0-0xFF
  0x20ac, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160,
  0x2039, 0x0152, 0x017d, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014,
  0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0x017e, 0x0178,
])

const RULES = [
  {
    id: 'no-parenthesised-plural',
    test: (value) => /\(s\)/.test(value),
    why: 'parenthesised plural: use cardinal() or counted() from psit-report-prose',
  },
  {
    // react-pdf's standard fonts encode to WinAnsi, so a character outside CP1252 does not fail
    // loudly and does not fall back: it prints a DIFFERENT character. U+2192 prints an apostrophe,
    // U+202F prints a slash. Everything CP1252 covers is fine, typographic apostrophe, bullet,
    // ellipsis and dashes included - the em dash is banned by `no-dash` for register, not for
    // encoding. Measured in tests/render/psit-pdf-glyphs.test.jsx.
    id: 'cp1252-only',
    test: (value) => [...value].some((char) => !CP1252.has(char.codePointAt(0))),
    why: 'character outside CP1252: react-pdf prints a different glyph for it, silently',
  },
  {
    id: 'no-dash',
    test: (value) => /[—–]/.test(value),
    why: 'em or en dash: use a colon, parentheses or a comma',
  },
  {
    id: 'no-page-of',
    test: (value) => /Page \{?\w*\}? ?of/.test(value) || /Page \$\{[^}]+\} of/.test(value),
    why: 'page label: "Page x sur y" in a French report',
  },
  {
    id: 'no-continued',
    test: (value) => /\bContinued\b/.test(value),
    why: 'continuation label: "(suite)" in a French report',
  },
  {
    id: 'no-internal-reference',
    test: (value) => /PSIT-BEC-(?!\{|\$)/.test(value) && !/PSIT-BEC-\*/.test(value),
    why: 'internal identifier in a rendered string: the report carries the Autotask ticket',
  },
  {
    id: 'no-banned-lexicon',
    test: (value) =>
      /\bspams?\b/i.test(value) ||
      /\bmassif(?:s|ve|ves)?\b/i.test(value) ||
      /(?<![\p{L}-])utilisateurs?(?![\p{L}])/iu.test(value),
    why: 'banned lexicon: "spam", "massif", or "utilisateur" alone (write "le titulaire du compte" or "l\'acteur de la session")',
  },
  {
    id: 'no-uncontained-value',
    test: (value) => /\bnon confiné\b/.test(value),
    why: '"non confiné": write "aucune action enregistrée"',
  },
  {
    id: 'single-colon-per-sentence',
    // Prose only: two colons in one sentence is the "Label : Valeur : Explication" chain.
    test: (value) => isProse(value) && (value.match(/ : /g) || []).length > 1,
    why: 'two colons in one sentence: split it, or use parentheses',
  },
  {
    id: 'no-capital-after-colon',
    // A proper noun or an acronym may follow a colon; the rule targets a sentence restarting with
    // a capital, which is the "Label : Valeur" chain.
    test: (value) =>
      isProse(value) &&
      /[a-zéèêàùç] : ([A-ZÉÈÀ][a-zéèêàùç]+)/.test(value) &&
      !PROPER_NOUNS.some((noun) => value.includes(` : ${noun}`)),
    why: 'capital after a mid-sentence colon',
  },
]

// A literal is prose when it reads like a sentence: several words and some lower case. A label, a
// key, a class name or an interpolation fragment is not, and the colon rules would fire on them.
function isProse(value) {
  const words = value.trim().split(/\s+/)
  return words.length >= 6 && /[a-zéèêàùç]{3}/.test(value)
}

const TITLE_RULE = {
  id: 'noun-phrase-subtitle',
  test: (value) => /^\s*(Ce qui|Ce que|Qui a)\b/.test(value),
  why: 'a section subtitle is a noun phrase: no "Ce qui", "Ce que", "Qui a"',
}

function stringLiteralsOf(source) {
  const ast = parse(source, {
    sourceType: 'module',
    plugins: ['jsx'],
    errorRecovery: false,
  })
  const found = []

  const visit = (node, path) => {
    if (!node || typeof node !== 'object') return
    if (Array.isArray(node)) {
      for (const child of node) visit(child, path)
      return
    }
    if (node.type === 'StringLiteral') {
      found.push({ value: node.value, line: node.loc?.start.line })
    } else if (node.type === 'TemplateElement') {
      found.push({ value: node.value.cooked ?? node.value.raw, line: node.loc?.start.line })
    } else if (node.type === 'JSXText') {
      // Rendered text between tags, whitespace collapsed the way react-pdf lays it out.
      const text = node.value.replace(/\s+/g, ' ').trim()
      if (text) found.push({ value: text, line: node.loc?.start.line })
    }
    for (const key of Object.keys(node)) {
      if (key === 'loc' || key === 'leadingComments' || key === 'trailingComments') continue
      visit(node[key], path)
    }
  }

  visit(ast.program, [])
  return found
}

function allowed(value) {
  return ALLOWED.some((entry) => value.includes(entry.text))
}

function checkProse(files) {
  const problems = []
  for (const file of files) {
    if (PROSE_EXCLUDED.includes(file)) continue
    let source
    try {
      source = readFileSync(file, 'utf8')
    } catch {
      problems.push({ file, line: 0, rule: 'missing-file', why: 'listed but not readable' })
      continue
    }
    for (const literal of stringLiteralsOf(source)) {
      const value = literal.value
      if (!value || value.length < 3) continue
      if (allowed(value)) continue
      for (const rule of RULES) {
        if (rule.test(value)) {
          problems.push({ file, line: literal.line, rule: rule.id, why: rule.why, value })
        }
      }
      if (TITLE_RULE.test(value)) {
        problems.push({ file, line: literal.line, rule: TITLE_RULE.id, why: TITLE_RULE.why, value })
      }
    }
  }
  return problems
}

// Newline by code point: a backslash escape does not survive every editing path.
const firstLine = (text) => String(text || '').split(String.fromCharCode(10))[0]

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
}

/**
 * Divergence on the upstream files this fork modifies.
 *
 * Against a recorded baseline, not against an upstream branch tip. Two attempts failed first, and
 * for the same reason: upstream/main and upstream/dev have diverged from each other, so a tip diff
 * reports upstream's own delta as ours. The baseline is the content of each declared file as it was
 * before any PSIT block was added to it, found by walking that file's history for the newest blob
 * with no marker in it. It is written once, committed, and refreshed deliberately at each upstream
 * sync, which is exactly when a human should be looking at these blocks anyway.
 *
 * The check itself: every line that differs from the baseline must sit inside a
 * PSIT-CUSTOM-BEGIN / PSIT-CUSTOM-END pair. That is what makes prettier reformatting impossible to
 * reintroduce quietly.
 */
const BASELINE_DIR = 'psit/upstream-baseline'

const baselinePath = (file) => `${BASELINE_DIR}/${file.replace(/[\\/]/g, '__')}`

function markerRanges(source) {
  const ranges = []
  let openedAt = null
  source.split(String.fromCharCode(10)).forEach((line, index) => {
    if (line.includes('PSIT-CUSTOM-BEGIN')) openedAt = index + 1
    if (line.includes('PSIT-CUSTOM-END') && openedAt !== null) {
      ranges.push([openedAt, index + 1])
      openedAt = null
    }
  })
  return { ranges, unclosed: openedAt }
}

/**
 * Refuses to reinitialise a baseline while the working tree still holds uncommitted work on the
 * files concerned.
 *
 * Without this, `--init-baseline` records the current file - PSIT blocks and all - as "the upstream
 * version", and the divergence check goes green on a state nobody reviewed. The baseline has to be
 * taken from committed history, so the tree must be clean for those paths first.
 */
export const uncommittedUpstreamFiles = (files, runGit = git) => {
  const status = runGit(['status', '--porcelain', '--', ...files])
  return status
    .split(String.fromCharCode(10))
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/^\S+\s+/, '').trim())
    .filter((path) => files.includes(path))
}

/**
 * Keeps the baseline being replaced, under a dated directory, so a refresh can be read back and
 * reverted. A baseline overwritten in place loses the only record of what upstream looked like when
 * the blocks were written.
 */
export const archiveBaselines = (files, stamp, io = { existsSync, mkdirSync, copyFileSync }) => {
  const dir = `${BASELINE_DIR}/history/${stamp}`
  const archived = []
  for (const file of files) {
    const from = baselinePath(file)
    if (!io.existsSync(from)) continue
    io.mkdirSync(dir, { recursive: true })
    const to = `${dir}/${file.replace(/[\\/]/g, '__')}`
    io.copyFileSync(from, to)
    archived.push(to)
  }
  return { dir, archived }
}

/** A stamp a human can read in a directory listing, and sort. */
export const baselineStamp = (now = new Date()) =>
  now.toISOString().slice(0, 19).replace(/[:T]/g, '').replace(/-/g, '')

/** Writes the baselines. Run at the first setup, and after an upstream sync. */
function initBaselines() {
  const dirty = uncommittedUpstreamFiles(UPSTREAM_FILES)
  if (dirty.length > 0) {
    console.error(
      [
        'psit-report-lint: refus de réinitialiser la baseline.',
        '',
        "L'arbre de travail contient des modifications non committées sur des fichiers upstream",
        'surveillés :',
        ...dirty.map((file) => `  - ${file}`),
        '',
        'La baseline est prise dans l\'historique committé. Tant que ces fichiers ne sont pas',
        'committés, elle enregistrerait vos propres blocs comme « la version upstream », et le',
        'contrôle de divergence passerait au vert sur un état que personne n\'a relu.',
        '',
        'Committez ou remisez ces fichiers, puis relancez --init-baseline.',
      ].join(String.fromCharCode(10))
    )
    process.exitCode = 1
    return
  }

  const { dir, archived } = archiveBaselines(UPSTREAM_FILES, baselineStamp())
  if (archived.length > 0) {
    console.log(`ancienne baseline archivée dans ${dir} (${archived.length} fichier(s))`)
    console.log('pensez à committer cet archivage avec la nouvelle baseline')
  }

  for (const file of UPSTREAM_FILES) {
    const commits = git(['log', '--format=%H', '--', file])
      .split(String.fromCharCode(10))
      .map((line) => line.trim())
      .filter(Boolean)
    let written = false
    for (const commit of commits) {
      let blob
      try {
        blob = git(['show', `${commit}:${file}`])
      } catch {
        continue
      }
      if (blob.includes('PSIT-CUSTOM')) continue
      mkdirSync(BASELINE_DIR, { recursive: true })
      writeFileSync(baselinePath(file), blob)
      console.log(`baseline ${file} <- ${commit.slice(0, 9)}`)
      written = true
      break
    }
    if (!written) console.error(`no marker-free version found for ${file}`)
  }
}

// Fixtures and scripts under the PSIT prefix. This repository is a PUBLIC fork: a real address in
// a test fixture is published, indexed and searchable, and it stays reachable in the history of the
// commit that added it. Nothing here is a stand-in for judgement, but a promise is not a mechanism.
const PSIT_FIXTURE_GLOBS = ['tests/', 'scripts/psit-']

// Domains a fixture may legitimately use: the reserved TLDs of RFC 2606, plus the two Microsoft
// documentation domains upstream's own fixtures are full of.
const FIXTURE_DOMAINS = /\.(test|example|invalid|localhost)$|^(contoso|fabrikam)\.(com|test|onmicrosoft\.com)$|^example\.(com|net|org)$/

// Literal strings that must never appear in a fixture, whatever the shape around them.
const BANNED_IN_FIXTURES = [
  { pattern: /pleinsudit/i, why: "the fork owner's own domain: use a reserved domain" },
  { pattern: /\bs[.\\]*\s*miro\b/i, why: 'a real person: use a role name' },
]

/**
 * Personal and production data in PSIT fixtures.
 *
 * Scans the raw text rather than the AST: an address can sit in a regular expression, a comment or
 * a template literal, and all three are published just the same.
 */
// The file that tests the ban has to contain what is banned, exactly as the prose module holds the
// banned lexicon it enforces. Same exemption, same reason, stated once.
const FIXTURE_EXCLUDED = ['tests/utils/psit-report-lint-guard.test.js']

/** Tracked PSIT fixtures and scripts, from git rather than a glob walk. */
const psitFixtureFiles = () =>
  execFileSync('git', ['ls-files', '-z', ...PSIT_FIXTURE_GLOBS], { encoding: 'utf8' })
    .split('\0')
    .filter((file) => file && /psit/i.test(file) && !FIXTURE_EXCLUDED.includes(file))

const checkFixtures = (files) => {
  const problems = []
  for (const file of files) {
    let source
    try {
      source = readFileSync(file, 'utf8')
    } catch {
      continue
    }
    source.split(/\r?\n/).forEach((line, index) => {
      for (const { pattern, why } of BANNED_IN_FIXTURES) {
        if (pattern.test(line)) {
          problems.push({ file, line: index + 1, rule: 'no-personal-data', why, text: line.trim() })
        }
      }
      for (const address of line.match(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi) || []) {
        const domain = address.slice(address.indexOf('@') + 1).toLowerCase()
        if (!FIXTURE_DOMAINS.test(domain)) {
          problems.push({
            file,
            line: index + 1,
            rule: 'no-real-domain',
            why: `${domain} is not a reserved fixture domain (RFC 2606, or contoso/fabrikam)`,
            text: line.trim(),
          })
        }
      }
    })
  }
  return problems
}

export const PSIT_FIXTURE_CHECK = checkFixtures

export const PSIT_UPSTREAM_FILES = UPSTREAM_FILES

function checkDivergence() {
  const problems = []

  for (const file of UPSTREAM_FILES) {
    let source
    try {
      source = readFileSync(file, 'utf8')
    } catch {
      problems.push({ file, line: 0, rule: 'declared-file-missing', why: 'declared but not readable' })
      continue
    }

    const { ranges, unclosed } = markerRanges(source)
    if (unclosed !== null) {
      problems.push({
        file,
        line: unclosed,
        rule: 'unclosed-marker',
        why: 'PSIT-CUSTOM-BEGIN without a matching END',
      })
    }

    let baseline
    try {
      baseline = readFileSync(baselinePath(file), 'utf8')
    } catch {
      problems.push({
        file,
        line: 0,
        rule: 'baseline-missing',
        why: `no baseline: run "node scripts/psit-report-lint.mjs --init-baseline"`,
      })
      continue
    }

    // Diff the two contents through git, so the hunk arithmetic is git's and not ours.
    let diff
    try {
      diff = git([
        'diff',
        '--no-index',
        '-U0',
        '--',
        baselinePath(file),
        file,
      ])
    } catch (error) {
      // git diff --no-index exits 1 when files differ, which is the normal case here.
      diff = error.stdout ? String(error.stdout) : ''
      if (!diff) {
        problems.push({
          file,
          line: 0,
          rule: 'divergence-unavailable',
          why: `cannot diff against the baseline: ${firstLine(error.message)}`,
        })
        continue
      }
    }

    let newLine = 0
    for (const line of diff.split(String.fromCharCode(10))) {
      const header = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/)
      if (header) {
        newLine = Number(header[1])
        continue
      }
      if (line.startsWith('+') && !line.startsWith('+++')) {
        const inside = ranges.some(([from, to]) => newLine >= from && newLine <= to)
        if (!inside && line.slice(1).trim().length > 0) {
          problems.push({
            file,
            line: newLine,
            rule: 'unmarked-divergence',
            why: 'line differs from the upstream baseline outside a PSIT-CUSTOM pair (reformatting?)',
            value: line.slice(1).trim().slice(0, 90),
          })
        }
        newLine += 1
      }
    }
  }

  // Undeclared files carrying markers: the declaration list is the review surface for the next
  // sync, and a file missing from it would be reviewed by nobody.
  let marked
  try {
    marked = git(['grep', '-l', 'PSIT-CUSTOM-BEGIN', '--', 'src'])
      .split(String.fromCharCode(10))
      .map((line) => line.trim())
      .filter(Boolean)
  } catch {
    marked = []
  }
  for (const file of marked) {
    if (UPSTREAM_FILES.includes(file)) continue
    if (/(^|[/])[Pp]sit|psit-/.test(file)) continue
    problems.push({
      file,
      line: 0,
      rule: 'undeclared-upstream-file',
      why: 'carries PSIT markers but is not in UPSTREAM_FILES: add it, and add its baseline',
    })
  }

  return problems
}

// Importable for its tests; the checks below run only when the script is the entry point.
const runningAsScript =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href

if (!runningAsScript) {
  // Nothing to do on import.
} else {
  main()
}

function main() {
  const args = process.argv.slice(2)
  const skipDivergence = args.includes('--no-divergence')

  if (args.includes('--init-baseline')) {
    initBaselines()
    process.exit(process.exitCode ?? 0)
  }

  const problems = [
    ...checkProse(PROSE_FILES),
    ...checkFixtures(psitFixtureFiles()),
    ...(skipDivergence ? [] : checkDivergence()),
  ]
  report(problems)
}

function report(problems) {

  if (problems.length === 0) {
    console.log(
      `psit-report-lint: ${PROSE_FILES.length} modules, prose, fixtures and divergence clean.`
    )
    process.exit(0)
  }

  const byFile = new Map()
  for (const problem of problems) {
    if (!byFile.has(problem.file)) byFile.set(problem.file, [])
    byFile.get(problem.file).push(problem)
  }
  for (const [file, list] of byFile) {
    console.error(`${String.fromCharCode(10)}${file}`)
    for (const problem of list) {
      console.error(`  ${problem.line}: [${problem.rule}] ${problem.why}`)
      if (problem.value) console.error(`      ${problem.value}`)
    }
  }
  console.error(`${String.fromCharCode(10)}psit-report-lint: ${problems.length} problem(s).`)
  process.exit(1)
}
