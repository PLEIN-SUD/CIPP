// @vitest-environment node
import {
  PSIT_FIXTURE_CHECK,
  PSIT_UPSTREAM_FILES,
  archiveBaselines,
  baselineStamp,
  uncommittedUpstreamFiles,
} from '../../scripts/psit-report-lint.mjs'

// The guard on --init-baseline. What it prevents: taking a baseline from a working tree that still
// holds uncommitted work, which would record our own PSIT blocks as "the upstream version" and turn
// the divergence check green on a state nobody reviewed.

// This repository is a public fork. A real address in a fixture is published, indexed, and stays
// reachable in the history of the commit that added it, so the ban is mechanical rather than a
// convention: it went wrong once, on the fork owner's own address, across ten files.
describe('PSIT_FIXTURE_CHECK', () => {
  const { writeFileSync, mkdtempSync } = require('node:fs')
  const { join } = require('node:path')
  const { tmpdir } = require('node:os')

  const withFixture = (content) => {
    const dir = mkdtempSync(join(tmpdir(), 'psit-fixture-'))
    const file = join(dir, 'psit-sample.test.js')
    writeFileSync(file, content, 'utf8')
    return file
  }

  it("refuses the fork owner's own domain, wherever it sits", () => {
    const problems = PSIT_FIXTURE_CHECK([
      withFixture("const a = 'someone@pleinsudit.com'" + String.fromCharCode(10)),
    ])
    expect(problems.map((problem) => problem.rule)).toContain('no-personal-data')
  })

  it('refuses it inside a regular expression too, where a plain search misses it', () => {
    // How two of them survived the first pass: escaped dots in a screen.getByText(/.../) matcher.
    const problems = PSIT_FIXTURE_CHECK([
      withFixture(`expect(x).toMatch(/s\\.miro@pleinsudit\\.com/)`),
    ])
    expect(problems.length).toBeGreaterThan(0)
  })

  it('refuses an address on a real TLD, even an invented one', () => {
    const problems = PSIT_FIXTURE_CHECK([withFixture("Name: 'classement@classement.net'")])
    expect(problems.map((problem) => problem.rule)).toContain('no-real-domain')
  })

  it('accepts the reserved domains and the documentation ones', () => {
    const problems = PSIT_FIXTURE_CHECK([
      withFixture(
        [
          "const a = 'p.martin@contoso.test'",
          "const b = 'analyste@example.test'",
          "const c = 'buyer@client.test'",
          "const d = 'attacker@evil.test'",
          "const e = 'adele@contoso.com'",
        ].join(String.fromCharCode(10))
      ),
    ])
    expect(problems).toEqual([])
  })
})

describe('uncommittedUpstreamFiles', () => {
  const files = ['src/components/CippPdf/ReportDocument.jsx', 'src/layouts/top-nav.js']

  it('says nothing when the tree is clean for those files', () => {
    expect(uncommittedUpstreamFiles(files, () => '')).toEqual([])
  })

  it('names a modified file, whatever the status letter', () => {
    const status = [
      ' M src/components/CippPdf/ReportDocument.jsx',
      'A  src/layouts/top-nav.js',
    ].join('\n')
    expect(uncommittedUpstreamFiles(files, () => status)).toEqual([
      'src/components/CippPdf/ReportDocument.jsx',
      'src/layouts/top-nav.js',
    ])
  })

  it('ignores a path outside the watched set', () => {
    const status = ' M src/components/psit/PsitBecReportFr.jsx'
    expect(uncommittedUpstreamFiles(files, () => status)).toEqual([])
  })

  it('watches every declared upstream file, tests included', () => {
    expect(PSIT_UPSTREAM_FILES.length).toBe(9)
    expect(PSIT_UPSTREAM_FILES).toContain('src/components/CippPdf/reportPdfPrimitives.jsx')
    // An upstream TEST double is upstream code too: it went unmarked and undeclared for a while,
    // and the guard could not see it, because it only catches files that carry markers.
    expect(PSIT_UPSTREAM_FILES).toContain('tests/components/ExecutiveReportButton.test.jsx')
    // The navigation config carries the SOC Triage entry since the SOC dashboard (2026-08-24).
    expect(PSIT_UPSTREAM_FILES).toContain('src/layouts/config.js')
  })
})

describe('archiveBaselines', () => {
  const files = ['src/components/CippPdf/ReportDocument.jsx', 'src/layouts/top-nav.js']

  const fakeIo = (present) => {
    const copies = []
    const made = []
    return {
      io: {
        existsSync: (path) => present.some((name) => path.includes(name)),
        mkdirSync: (path) => made.push(path),
        copyFileSync: (from, to) => copies.push([from, to]),
      },
      copies,
      made,
    }
  }

  it('copies each existing baseline under a dated directory before it is replaced', () => {
    const { io, copies, made } = fakeIo(['ReportDocument', 'top-nav'])
    const { dir, archived } = archiveBaselines(files, '20260821T090000', io)

    expect(dir).toContain('/history/20260821T090000')
    expect(archived).toHaveLength(2)
    expect(copies[0][0]).toContain('upstream-baseline/src__components__CippPdf__ReportDocument.jsx')
    expect(copies[0][1]).toContain('history/20260821T090000/src__components__CippPdf__ReportDocument.jsx')
    expect(made.length).toBeGreaterThan(0)
  })

  it('skips a file that has no baseline yet, rather than failing the refresh', () => {
    const { io, copies } = fakeIo(['top-nav'])
    const { archived } = archiveBaselines(files, '20260821T090000', io)

    expect(archived).toHaveLength(1)
    expect(copies).toHaveLength(1)
    expect(copies[0][0]).toContain('top-nav')
  })

  it('creates nothing when there is nothing to archive', () => {
    const { io, made, copies } = fakeIo([])
    const { archived } = archiveBaselines(files, '20260821T090000', io)

    expect(archived).toEqual([])
    expect(made).toEqual([])
    expect(copies).toEqual([])
  })
})

describe('baselineStamp', () => {
  it('is readable in a directory listing, and sorts', () => {
    expect(baselineStamp(new Date('2026-08-21T09:07:31Z'))).toBe('20260821090731')
    const early = baselineStamp(new Date('2026-08-21T08:00:00Z'))
    const late = baselineStamp(new Date('2026-08-21T09:00:00Z'))
    expect(early < late).toBe(true)
  })
})
