const reportPath = process.argv[2]
if (!reportPath) throw new Error('Pass the path to a Bun JUnit report')

const inventory = await Bun.file(new URL('../skills/stacks-presentations/references/slidev-tests.md', import.meta.url)).text()
const ports = new Map([...inventory.matchAll(/^\| `((?:packages|test|cypress)\/[^\x60]+)` \| (.+) \|$/gm)].map(([, suite, entries]) =>
  [suite, [...entries.matchAll(/`([^\x60]+\.test\.ts)`/g)].map(([, path]) => path)],
))
if (ports.size !== 41 || [...ports.values()].some(paths => !paths.length))
  throw new Error('The Slidev v53.1.0 inventory must map all 41 original suites')

const completed = new Set<string>()
let totals: { tests: number, failures: number, skipped: number } | undefined
const report = await Bun.file(reportPath).text()
new HTMLRewriter()
  .on('testsuites', {
    element(element) {
      totals = {
        tests: Number(element.getAttribute('tests') ?? NaN),
        failures: Number(element.getAttribute('failures') ?? NaN),
        skipped: Number(element.getAttribute('skipped') ?? NaN),
      }
    },
  })
  .on('testsuites > testsuite', {
    element(element) {
      const file = element.getAttribute('file')
      if (file && Number(element.getAttribute('tests')) > 0) completed.add(file)
    },
  })
  .transform(report)

if (!totals || !Number.isSafeInteger(totals.tests) || totals.tests < 1 || totals.failures !== 0 || totals.skipped !== 0)
  throw new Error(`Expected a complete Bun test run with zero failures and skips. Reported: ${JSON.stringify(totals)}`)

const missing = [...ports].flatMap(([suite, paths]) => paths.filter(path => !completed.has(path)).map(path => `${suite}: ${path}`))
if (missing.length)
  throw new Error(`Slidev test ports missing from the Bun report:\n${missing.join('\n')}`)

console.log(`Verified all ${ports.size} Slidev suites across ${new Set([...ports.values()].flat()).size} Bun test files. ${totals.tests} tests passed with zero skips.`)
