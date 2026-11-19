// Adapted from Slidev v53.1.0's test/parser.test.ts (MIT). See licenses/Slidev-MIT.txt.
import { describe, expect, test } from 'bun:test'
import { join } from 'node:path'
import { createDeckRenderer } from '../packages/slidev/node/runtime/loader.ts'
import { extractImagesUsage, parseDeck, parseDeckAsync } from '../packages/slidev/node/runtime/index.ts'

const fixtures = join(import.meta.dir, 'fixtures', 'slidev-markdown')

describe('extractImagesUsage', () => {
  test('extracts from frontmatter image key', () => {
    const images = extractImagesUsage('', { image: '/path/to/image.png' })
    expect(images).toEqual(['/path/to/image.png'])
  })

  test('extracts from frontmatter backgroundImage key', () => {
    const images = extractImagesUsage('', { backgroundImage: 'https://example.com/bg.jpg' })
    expect(images).toEqual(['https://example.com/bg.jpg'])
  })

  test('extracts from frontmatter background key with image extension', () => {
    const images = extractImagesUsage('', { background: '/assets/bg.webp' })
    expect(images).toEqual(['/assets/bg.webp'])
  })

  test('extracts from frontmatter background key with URL', () => {
    const images = extractImagesUsage('', { background: 'https://example.com/image.png' })
    expect(images).toEqual(['https://example.com/image.png'])
  })

  test('ignores frontmatter background key without image extension or URL', () => {
    const images = extractImagesUsage('', { background: 'gradient-to-r' })
    expect(images).toEqual([])
  })

  test('ignores data URLs in frontmatter', () => {
    const images = extractImagesUsage('', { image: 'data:image/png;base64,abc123' })
    expect(images).toEqual([])
  })

  test('extracts markdown image syntax', () => {
    const content = '![alt text](/images/photo.jpg)'
    const images = extractImagesUsage(content, {})
    expect(images).toEqual(['/images/photo.jpg'])
  })

  test('extracts multiple markdown images', () => {
    const content = `
![first](/img1.png)
Some text
![second](https://example.com/img2.jpg)
![third](./relative/path.svg)
    `
    const images = extractImagesUsage(content, {})
    expect(images).toEqual(['/img1.png', 'https://example.com/img2.jpg', './relative/path.svg'])
  })

  test('ignores the optional title in markdown images', () => {
    const content = `![alt](/images/photo.jpg "A photo")
![alt](/images/other.png 'Another')`
    const images = extractImagesUsage(content, {})
    expect(images).toEqual(['/images/photo.jpg', '/images/other.png'])
  })

  test('unwraps angle-bracketed markdown image destinations', () => {
    const content = '![alt](</images/my photo.jpg>)'
    const images = extractImagesUsage(content, {})
    expect(images).toEqual(['/images/my photo.jpg'])
  })

  test('ignores data URLs in markdown images', () => {
    const content = '![inline](data:image/png;base64,abc123)'
    const images = extractImagesUsage(content, {})
    expect(images).toEqual([])
  })

  test('extracts Vue component src prop', () => {
    const content = '<img src="/assets/logo.png" />'
    const images = extractImagesUsage(content, {})
    expect(images).toEqual(['/assets/logo.png'])
  })

  test('extracts Vue component image prop', () => {
    const content = '<MyImage image="/path/to/image.jpg" />'
    const images = extractImagesUsage(content, {})
    expect(images).toEqual(['/path/to/image.jpg'])
  })

  test('ignores Vue props without image extensions', () => {
    const content = '<div src="/some/path" />'
    const images = extractImagesUsage(content, {})
    expect(images).toEqual([])
  })

  test('ignores Vue props with template expressions', () => {
    const content = '<img src="{{imagePath}}.png" />'
    const images = extractImagesUsage(content, {})
    expect(images).toEqual([])
  })

  test('extracts Vue bound props with string literals', () => {
    const content = `<img :src="'/static/image.png'" />`
    const images = extractImagesUsage(content, {})
    expect(images).toEqual(['/static/image.png'])
  })

  test('extracts CSS url()', () => {
    const content = `
<div style="background: url(/bg/image.png)">
<style>
.class { background-image: url('/another/image.jpg'); }
</style>
    `
    const images = extractImagesUsage(content, {})
    expect(images).toEqual(['/bg/image.png', '/another/image.jpg'])
  })

  test('ignores CSS url() without image extensions', () => {
    const content = `<div style="background: url(/fonts/font.woff2)">`
    const images = extractImagesUsage(content, {})
    expect(images).toEqual([])
  })

  test('strips code blocks to avoid false positives', () => {
    const content = `
Some content
![real image](/real.png)

\`\`\`markdown
![fake image](/fake.png)
<img src="/also-fake.jpg" />
\`\`\`

![another real](/real2.jpg)
    `
    const images = extractImagesUsage(content, {})
    expect(images).toEqual(['/real.png', '/real2.jpg'])
  })

  test('handles multiple sources combined', () => {
    const content = `
# Title
![markdown](/md.png)
<img src="/vue.jpg" />
<div style="background: url(/css.webp)">
    `
    const frontmatter = {
      image: '/frontmatter.png',
      background: 'https://example.com/bg.svg',
    }
    const images = extractImagesUsage(content, frontmatter)
    expect(images).toContain('/frontmatter.png')
    expect(images).toContain('https://example.com/bg.svg')
    expect(images).toContain('/md.png')
    expect(images).toContain('/vue.jpg')
    expect(images).toContain('/css.webp')
    expect(images).toHaveLength(5)
  })

  test('deduplicates identical URLs', () => {
    const content = `
![img](/same.png)
![img2](/same.png)
<img src="/same.png" />
    `
    const images = extractImagesUsage(content, {})
    expect(images).toEqual(['/same.png'])
  })

  test('trims whitespace from extracted URLs', () => {
    const content = '![img]( /path/with/spaces.png )'
    const images = extractImagesUsage(content, {})
    expect(images).toEqual(['/path/with/spaces.png'])
  })

  test('handles various image extensions', () => {
    const content = `
![png](/img.png)
![jpg](/img.jpg)
![jpeg](/img.jpeg)
![gif](/img.gif)
![svg](/img.svg)
![webp](/img.webp)
![avif](/img.avif)
![ico](/img.ico)
![bmp](/img.bmp)
![tiff](/img.tiff)
    `
    const images = extractImagesUsage(content, {})
    expect(images).toHaveLength(10)
  })

  test('handles case-insensitive image extensions', () => {
    const content = `
<img src="/image.PNG" />
<img src="/image.JpG" />
<img src="/image.WEBP" />
    `
    const images = extractImagesUsage(content, {})
    expect(images).toEqual(['/image.PNG', '/image.JpG', '/image.WEBP'])
  })
})


describe('Slidev Markdown splitting', () => {
  test.each([
    ['plain', '\na\n\n---\n\nb\n\n---\nlayout: z\n---\nc\n----\nd\n----\ne\n\n---\n\nf\n\n'],
    ['labeled', '\na\n\n---\n\nb\n\n---section2\nlayout: z\n---\nc\n----   section 3\nd\n---- section-4\ne\n\n---\n\nf\n\n'],
  ])('splits %s separators and keeps the following frontmatter', (_, markdown) => {
    const { slides } = parseDeck(markdown)
    expect(slides.map(slide => slide.content)).toEqual([... 'abcdef'])
    expect(slides[2].frontmatter).toEqual({ layout: 'z' })
    expect(slides[3].frontmatter).toEqual({})
  })

  test('derives headings and levels outside nested fences and HTML comments', () => {
    const { slides } = parseDeck([
      '````bash', '# Ignore a shell comment', '```', '# Still code', '````',
      '<!--', '# Hidden heading', '-->', '## Getting started', '', '---',
      '', '~~~bash', '# Only a code comment', '~~~',
    ].join('\n'))
    expect(slides[0].title).toBe('Getting started')
    expect(slides[0].level).toBe(2)
    expect(slides[1].title).toBe('Slide 2')
    expect(slides[1].level).toBeUndefined()
  })

  test('ignores a leading UTF-8 BOM and recognizes first-slide metadata', () => {
    const deck = parseDeck('\uFEFF---\r\ntheme: seriph\r\ntitle: Hello\r\n---\r\n\r\n# Slide 1\r\n\r\n---\r\n\r\n# Slide 2\r\n')
    expect(deck.slides.map(slide => slide.content)).toEqual(['# Slide 1', '# Slide 2'])
    expect(deck.headmatter).toEqual({ theme: 'seriph', title: 'Hello' })
    expect(deck.slides[0].frontmatter).toEqual(deck.headmatter)
  })

  test('ignores separators inside comments and finds notes before labeled separators', () => {
    const { slides } = parseDeck([
      '---', 'src: ./pages/one.md', '---', '',
      '<!--', '---', 'src: ./pages/two.md', '---', '-->', '',
      '---section', 'src: ./pages/three.md', '---',
    ].join('\n'))
    expect(slides.map(slide => slide.frontmatter?.src)).toEqual(['./pages/one.md', './pages/three.md'])
    expect(slides[0].notes).toContain('./pages/two.md')
    expect(slides[0].content).toBe('')
  })

  test('detects a separator when a comment opener follows its dashes', () => {
    const { slides } = parseDeck('a\n\n----<!--\nhidden\n-->\n\nb\n')
    expect(slides.map(slide => slide.content)).toEqual(['a', 'hidden\n-->\n\nb'])
  })

  test('uses only an initial YAML fence as slide metadata when dashes supplied none', async () => {
    const deck = parseDeck(await Bun.file(join(fixtures, 'frontmatter.md')).text())
    expect(deck.slides.map(slide => slide.layout)).toEqual(['cover', 'center', 'default', 'text', 'default', 'from yaml', 'cover', 'default'])
    expect(deck.slides[0].frontmatter?.fonts).toEqual({ sans: 'Roboto, Lato', serif: 'Mate SC', mono: 'Fira Code' })
    expect(deck.slides[3].content).toBe('<!-- This is not note -->\nHey')
    expect(deck.slides[3].notes).toBe('This is note')
    expect(deck.slides[4].content).toContain('Also part of the code block')
    expect(deck.slides[5].content).toBe('Content 1')
    expect(deck.slides[6].content).toContain('layout: should not from yaml 1')
    expect(deck.slides[7].content).toContain('layout: should not from yaml 2')
  })

  test('retains literal comment examples in fences and extracts inline trailing notes', () => {
    const { slides } = parseDeck('```html\n<!-- literal -->\n```\n\nText <!-- presenter only -->')
    expect(slides[0].content).toContain('<!-- literal -->')
    expect(slides[0].content.endsWith('Text')).toBe(true)
    expect(slides[0].notes).toBe('presenter only')
  })

  test('parses the minimal and Comark fixtures without changing their Markdown', async () => {
    const minimal = parseDeck(await Bun.file(join(fixtures, 'minimal.md')).text())
    expect(minimal.slides.map(slide => slide.title)).toEqual(['H1', 'Hello', 'Slide 3'])
    const comark = parseDeck(await Bun.file(join(fixtures, 'mdc.md')).text())
    expect(comark.headmatter).toEqual({ comark: true })
    expect(comark.slides[0].content).toContain(':arrow{x1=1 y1=1 x2=2 y2=2}')
  })

  test('does not count code blocks or comments in image usage metadata', () => {
    const deck = parseDeck('~~~html\n<img src="/code.png">\n~~~\n\n<!-- ![comment](/hidden.svg) -->\n\n![real](</my images/draft.png> "A draft")')
    expect(deck.slides[0].images).toEqual(['/my images/draft.png'])
  })
})

describe('Slidev preparser hooks', () => {
  test('replaces text throughout the source and creates custom separators in order', async () => {
    const deck = await parseDeckAsync('---\nga: bu\n---\na @@v@@\n\nSEPARATOR\n\nb\n@@v@@\n\n@@v@@ = @@v@@\n', [
      { transformRawLines: lines => { lines.splice(0, lines.length, ...lines.map(line => line.replaceAll('@@v@@', 'thing'))) } },
      { async transformRawLines(lines) { lines[lines.indexOf('SEPARATOR')] = '---' } },
    ])
    expect(deck.slides.map(slide => slide.content)).toEqual(['a thing', 'b\nthing\n\nthing = thing'])
  })

  test('allows raw-line hooks to generate frontmatter-only slides', async () => {
    const deck = await parseDeckAsync('@cov 1.jpg\n@cov 2.jpg\n# 2\n---\n\n# 3\n@cov 4.jpg\n', [
      { transformRawLines(lines) {
        const expanded = lines.flatMap(line => line.startsWith('@cov ')
          ? ['---', 'layout: cover', 'background: ' + line.slice(5), '---', '']
          : [line])
        lines.splice(0, lines.length, ...expanded)
      } },
    ])
    expect(deck.slides.map(slide => slide.content)).toEqual(['', '# 2', '# 3', ''])
    expect(deck.slides[0].frontmatter).toEqual({ layout: 'cover', background: '1.jpg' })
    expect(deck.slides[1].frontmatter).toEqual({ layout: 'cover', background: '2.jpg' })
    expect(deck.slides[3].frontmatter).toEqual({ layout: 'cover', background: '4.jpg' })
  })

  test('runs each extension in its original order and exposes mutations to later hooks', async () => {
    const deck = await parseDeckAsync('a..A\na.a.A.A\n.a.A.\n\n<!-- talk -->', [
      {
        transformRawLines(lines) {
          for (const [index, line] of lines.entries()) lines[index] = line.replaceAll('A', 'B').replaceAll('a', 'A')
        },
        async transformSlide(content, matter) {
          matter.title = 'Named by a hook'
          return content
        },
        async transformNote(note, matter) { return matter.title + ' ' + note },
      },
      {
        transformRawLines(lines) {
          for (const [index, line] of lines.entries()) lines[index] = line.replaceAll('A', 'C')
        },
        transformSlide(content, matter) {
          expect(matter.title).toBe('Named by a hook')
          return content
        },
        transformNote(note) { return note?.toUpperCase() },
      },
    ])
    expect(deck.title).toBe('Named by a hook')
    expect(deck.slides[0].content).toBe('C..B\nC.C.B.B\n.C.B.')
    expect(deck.slides[0].notes).toBe('NAMED BY A HOOK TCLK')
  })

  const cases = Array.from({ length: 64 }, (_, mask) =>
    Array.from({ length: 6 }, (_, index) => Boolean(mask & (1 << index))) as [boolean, boolean, boolean, boolean, boolean, boolean])

  test.each(cases)('wraps slide content with before=%s, YAML=%s, after=%s, prepend=%s, append=%s, attributes=%s', async (before, yaml, after, prepend, append, attributes) => {
    const markdown = [
      ...(before ? ['.', '', '---'] : yaml ? ['---'] : []),
      ...(yaml ? ['m: M', 'n: N', '---'] : []),
      '', 'ccc', '@a', '@b', 'ddd', '',
      ...(after ? ['', '---', '', '..'] : []),
    ].join('\n')
    const deck = await parseDeckAsync(markdown, [{
      transformSlide(content, frontmatter) {
        if (!content.includes('@a')) return
        if (attributes) Object.assign(frontmatter, { adda: 'add', addb: 'add' })
        return [
          ...(prepend ? ['<a>', '<b>'] : []),
          ...content.split('\n').filter(line => !line.startsWith('@')),
          ...(append ? ['</b>', '</a>'] : []),
        ].join('\n')
      },
    }])
    const expected = [...(prepend ? ['<a>', '<b>'] : []), 'ccc', 'ddd', ...(append ? ['</b>', '</a>'] : [])].join('\n')
    expect(deck.slides.map(slide => slide.content)).toEqual([...(before ? ['.'] : []), expected, ...(after ? ['..'] : [])])
    expect(deck.slides[before ? 1 : 0].frontmatter).toEqual({
      ...(yaml ? { m: 'M', n: 'N' } : {}),
      ...(attributes ? { adda: 'add', addb: 'add' } : {}),
    })
  })
})

describe('Slidev source imports', () => {
  test('expands relative and root-relative imports with nested files', async () => {
    const html = await createDeckRenderer(join(fixtures, 'multi-entries.md'))()
    const titles = [...html.matchAll(/<article[^>]*aria-label="([^"]+)"/g)].map(match => match[1])
    expect(titles).toEqual(['Page 1', 'Page 2', 'Page 3', 'Page 4', 'Page 1', 'Page 2', 'Page 3', 'Page 4', 'Inline Page'])
    expect(html).toContain('<title>Page 1</title>')
  })

  test.each([
    ['circular/a.md', 'Circular slide source'],
    ['out-of-range/entry.md', 'Slide selection is outside'],
    ['escaping/root/entry.md', 'Slide source must stay inside the deck directory'],
  ])('reports an invalid source from %s', async (file, message) => {
    await expect(createDeckRenderer(join(fixtures, file))()).rejects.toThrow(message)
  })
})
