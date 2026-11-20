import slidevCases from './fixtures/slidev-cases.json'

const reportPath = process.argv[2]
if (!reportPath) throw new Error('Pass the path to a Bun JUnit report')

const inventory = await Bun.file(new URL('../skills/stacks-presentations/references/slidev-tests.md', import.meta.url)).text()
const ports = new Map([...inventory.matchAll(/^\| `((?:packages|test|cypress)\/[^\x60]+)` \| (.+) \|$/gm)].map(([, suite, entries]) =>
  [suite, [...entries.matchAll(/`([^\x60]+\.test\.ts)`/g)].map(([, path]) => path)],
))
if (ports.size !== 41 || [...ports.values()].some(paths => !paths.length))
  throw new Error('The Slidev v53.1.0 inventory must map all 41 original suites')

const cases: Record<string, (string | string[])[]> = slidevCases
if (Object.keys(cases).length !== ports.size || [...ports.keys()].some(suite => !cases[suite]?.length))
  throw new Error('Every Slidev suite must declare its original cases and their Bun ports')

const entities: Readonly<Record<string, string>> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'", '&#39;': "'", '&#x27;': "'" }
const completed = new Map<string, Map<string, number>>()
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
  .on('testcase', {
    element(element) {
      const file = element.getAttribute('file')
      const name = element.getAttribute('name')
      if (!file || !name || !(Number(element.getAttribute('assertions')) > 0)) return
      const title = name.replace(/&(?:amp|lt|gt|quot|apos|#39|#x27);/g, entity => entities[entity])
      let tests = completed.get(file)
      if (!tests) completed.set(file, tests = new Map())
      tests.set(title, (tests.get(title) ?? 0) + 1)
    },
  })
  .transform(report)

if (!totals || !Number.isSafeInteger(totals.tests) || totals.tests < 1 || totals.failures !== 0 || totals.skipped !== 0)
  throw new Error(`Expected a complete Bun test run with zero failures and skips. Reported: ${JSON.stringify(totals)}`)

const missing: string[] = []
let originalCount = 0
for (const [suite, files] of ports) {
  for (const file of files) {
    if (!completed.has(file)) missing.push(file)
  }
  const occurrences = new Map<string, number>()
  for (const entry of cases[suite]) {
    const [original, ...targets] = typeof entry === 'string' ? [entry, entry] : entry
    if (!original || !targets.length) throw new Error(`Invalid case entry for ${suite}`)
    originalCount++
    const minimum = (occurrences.get(original) ?? 0) + 1
    occurrences.set(original, minimum)
    for (const target of targets) {
      const count = files.reduce((total, file) => total + (completed.get(file)?.get(target) ?? 0), 0)
      if (count < minimum) missing.push(`${suite} > ${original} (Bun case: ${target}, expected ${minimum}, ran ${count})`)
    }
  }
}
if (originalCount !== 398) throw new Error('The Slidev v53.1.0 inventory must track all 398 baseline cases')
if (missing.length)
  throw new Error(`Slidev test ports missing from the Bun report:\n${missing.join('\n')}`)

console.log(`Verified ${originalCount} Slidev cases from all ${ports.size} suites across ${new Set([...ports.values()].flat()).size} Bun test files. ${totals.tests} tests passed with zero skips.`)
