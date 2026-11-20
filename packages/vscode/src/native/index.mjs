import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { createInterface } from 'node:readline'
import * as vscode from 'vscode'
import { registerAuthoring } from './editor.mjs'

const previews = new Map()

function findCli(file, extensionPath) {
  const fromDeck = createRequire(file)
  try {
    return fromDeck.resolve('ts-presentation/cli')
  }
  catch {
    const checkout = resolve(extensionPath, '../../src/cli.ts')
    if (existsSync(checkout)) return checkout
    throw new Error('Install ts-presentation in the deck project with Bun.')
  }
}

function startPreview(file, cli, output) {
  const child = spawn('bun', [cli, 'dev', file, '--port', '0'], { cwd: dirname(file), stdio: ['ignore', 'pipe', 'pipe'] })
  child.stderr.on('data', data => output.append(String(data)))
  const lines = createInterface({ input: child.stdout })
  const ready = new Promise((resolve, reject) => {
    lines.on('line', (line) => {
      output.appendLine(line)
      const match = /^Presentation running at (http:\/\/127\.0\.0\.1:\d+\/?)$/.exec(line)
      if (match) resolve(match[1])
    })
    child.once('error', reject)
    child.once('exit', code => reject(new Error(`The Bun preview stopped with exit code ${code ?? 'unknown'}.`)))
  })
  const preview = { child, ready }
  child.once('close', () => {
    lines.close()
    if (previews.get(file) === preview) previews.delete(file)
  })
  return preview
}

export function activate(context) {
  registerAuthoring(context)
  const output = vscode.window.createOutputChannel('ts-presentation')
  async function open(presenter) {
    const document = vscode.window.activeTextEditor?.document
    if (!document || document.uri.scheme !== 'file' || !document.fileName.toLowerCase().endsWith('.md')) {
      await vscode.window.showInformationMessage('Open a presentation Markdown file first.')
      return
    }
    const file = document.fileName
    try {
      let preview = previews.get(file)
      if (!preview) {
        preview = startPreview(file, findCli(file, context.extensionPath), output)
        previews.set(file, preview)
      }
      const url = new URL(presenter ? '/presenter' : '/', await preview.ready)
      await vscode.env.openExternal(vscode.Uri.parse(url.href))
    }
    catch (error) {
      output.appendLine(String(error))
      output.show(true)
      await vscode.window.showErrorMessage(`Could not open the presentation. ${error.message}`)
    }
  }

  context.subscriptions.push(
    output,
    vscode.commands.registerCommand('slidev.open-in-browser', () => open(false)),
    vscode.commands.registerCommand('ts-presentation.open-presenter', () => open(true)),
    vscode.commands.registerCommand('ts-presentation.stop-preview', deactivate),
  )
}

export function deactivate() {
  for (const { child } of previews.values()) child.kill()
  previews.clear()
}
