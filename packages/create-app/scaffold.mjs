import { copyFile, constants, mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'

export async function scaffold({ command, defaultDirectory, template, files }) {
  const args = process.argv.slice(2)
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`Usage: ${command} [directory]`)
    return
  }
  if (args.length > 1 || args.some(argument => argument.startsWith('-')))
    throw new Error(`Usage: ${command} [directory]`)

  const directory = resolve(args[0] ?? defaultDirectory)
  await mkdir(directory, { recursive: true })
  if ((await readdir(directory)).length)
    throw new Error(`Target directory must be empty: ${directory}`)

  const name = basename(directory).toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '')
  const manifest = JSON.parse(await readFile(join(template, 'package.json'), 'utf8'))
  manifest.name = name || defaultDirectory

  for (const file of files) {
    const target = join(directory, file === '_gitignore' ? '.gitignore' : file)
    await mkdir(dirname(target), { recursive: true })
    await copyFile(join(template, file), target, constants.COPYFILE_EXCL)
  }
  await writeFile(join(directory, 'package.json'), JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' })
  console.log(`Created ${directory}\nRun bun install, then bun run dev in that directory.`)
}
