// @vitest-environment node
import {
  PSIT_UPSTREAM_FILES,
  archiveBaselines,
  baselineStamp,
  uncommittedUpstreamFiles,
} from '../../scripts/psit-report-lint.mjs'

// The guard on --init-baseline. What it prevents: taking a baseline from a working tree that still
// holds uncommitted work, which would record our own PSIT blocks as "the upstream version" and turn
// the divergence check green on a state nobody reviewed.

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
    expect(PSIT_UPSTREAM_FILES.length).toBe(7)
    expect(PSIT_UPSTREAM_FILES).toContain('src/components/CippPdf/reportPdfPrimitives.jsx')
    // An upstream TEST double is upstream code too: it went unmarked and undeclared for a while,
    // and the guard could not see it, because it only catches files that carry markers.
    expect(PSIT_UPSTREAM_FILES).toContain('tests/components/ExecutiveReportButton.test.jsx')
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
