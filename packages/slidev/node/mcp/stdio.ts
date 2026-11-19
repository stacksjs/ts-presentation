import { createInterface } from 'node:readline'
import { version } from '../../../../package.json'
import { loadEditingDeck } from './operations.ts'
import { createSlidevMcpServer, rpcError } from './server.ts'

export async function startMcpStdioServer(entry: string): Promise<void> {
  const handle = createSlidevMcpServer({ entry, version, getData: () => loadEditingDeck(entry) })
  const lines = createInterface({ input: process.stdin, crlfDelay: Infinity })
  for await (const line of lines) {
    if (!line.trim()) continue
    let request: unknown
    try { request = JSON.parse(line) }
    catch {
      process.stdout.write(JSON.stringify(rpcError(null, -32700, 'Parse error')) + '\n')
      continue
    }
    const response = await handle(request)
    if (response) process.stdout.write(JSON.stringify(response) + '\n')
  }
}
