import { fileURLToPath } from 'node:url'

const template = new URL('./template/', import.meta.url)
for (const name of ['package.json', 'README.md', 'slides.md', '_gitignore']) {
  const source = new URL(name, template)
  if (!await Bun.file(source).exists())
    throw new Error('Missing starter file: ' + fileURLToPath(source))
}
