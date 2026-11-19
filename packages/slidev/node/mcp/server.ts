import type { SlideInfo } from '../../../types/src/types.ts'
import type { EditingDeck } from './operations.ts'
import { applySlidePatch, insertSlide, moveSlide, removeSlide, resolveSlide } from './operations.ts'

export interface SlidevMcpNav {
  getState: () => { page: number, clicks: number }
  go: (page: number, clicks: number) => void
}

export interface SlidevMcpContext {
  version: string
  entry: string
  getData: () => EditingDeck | Promise<EditingDeck>
  getServerUrl?: () => string | undefined
  nav?: SlidevMcpNav
}

type Args = Record<string, unknown>
type Field = { type: 'integer', minimum: number } | { type: 'string' | 'object' }
type Tool = {
  name: string
  description: string
  inputSchema: { type: 'object', properties: Record<string, Field>, required: string[], additionalProperties: false }
  annotations?: { readOnlyHint?: boolean, destructiveHint?: boolean, idempotentHint?: boolean }
  call: (data: EditingDeck, args: Args) => unknown | Promise<unknown>
}
type RequestId = string | number | null
export interface RpcReply {
  jsonrpc: '2.0'
  id: RequestId
  result?: unknown
  error?: { code: number, message: string }
}
export type McpHandler = (message: unknown) => Promise<RpcReply | undefined>

const latest = '2025-11-25'
const versions = new Set([latest, '2025-06-18', '2025-03-26', '2024-11-05'])
const no: Field = { type: 'integer', minimum: 1 }
const md: Field = { type: 'string' }
const yaml: Field = { type: 'object' }

function mapping(value: unknown): value is Args {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function tool(name: string, description: string, properties: Record<string, Field>, required: string[], call: Tool['call'], annotations?: Tool['annotations']): Tool {
  return { name: `slidev-${name}`, description, inputSchema: { type: 'object', properties, required, additionalProperties: false }, annotations, call }
}

function summary(slide: SlideInfo): Args {
  return {
    no: slide.index + 1, title: slide.title ?? null, layout: slide.frontmatter.layout,
    file: slide.source.filepath, hasNote: Boolean(slide.source.note),
    importedBySrcDirective: slide.importChain?.length ? true : undefined,
  }
}

function valid(tool: Tool, args: Args): boolean {
  const { properties, required } = tool.inputSchema
  return required.every(key => Object.hasOwn(args, key)) && Object.entries(args).every(([key, value]) => {
    if (!Object.hasOwn(properties, key)) return false
    const field = properties[key]
    if (field.type === 'integer') return Number.isSafeInteger(value) && Number(value) >= field.minimum
    return field.type === 'string' ? typeof value === 'string' : mapping(value)
  })
}

function content(value: unknown, isError = false): { content: { type: 'text', text: string }[], isError?: boolean } {
  return { content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }], ...(isError && { isError }) }
}

export function rpcError(id: RequestId, code: number, message: string): RpcReply {
  return { jsonrpc: '2.0', id, error: { code, message } }
}

export function createSlidevMcpServer(ctx: SlidevMcpContext): McpHandler {
  const readOnly = { readOnlyHint: true }
  const tools: Tool[] = [
    tool('get-info', 'Get the deck title, source files, slide count, and live position.', {}, [], data => {
      const url = ctx.getServerUrl?.()
      const position = ctx.nav?.getState()
      return {
        slidevVersion: ctx.version,
        entry: ctx.entry,
        title: data.headmatter.title ?? data.slides[0]?.title ?? null,
        theme: data.headmatter.theme ?? null,
        totalSlides: data.slides.length,
        markdownFiles: Object.keys(data.markdownFiles),
        ...(url && { server: { url, currentPage: position?.page || null, currentClicks: position?.page ? position.clicks : null } }),
      }
    }, readOnly),
    tool('list-slides', 'List the visible slides in presentation order.', {}, [], data => data.slides.map(summary), readOnly),
    tool('get-slide', 'Get the frontmatter, Markdown, and speaker notes of a visible slide.', { no }, ['no'], (data, args) => {
      const slide = resolveSlide(data, Number(args.no))
      return {
        ...summary(slide), frontmatter: slide.source.frontmatter, content: slide.source.content.trim(),
        note: slide.source.note ?? null, importedBy: slide.importChain?.map(source => `${source.filepath}#${source.index + 1}`),
      }
    }, readOnly),
    tool('update-slide', 'Edit content, notes, or selected frontmatter keys. A null value deletes a frontmatter key.', { no, content: md, note: md, frontmatter: yaml }, ['no'], async (data, args) => {
      const { no, content, note, frontmatter } = args as { no: number, content?: string, note?: string, frontmatter?: Args }
      if (content === undefined && note === undefined && frontmatter === undefined) throw new Error('Provide content, a note, or frontmatter to update')
      const { slide } = await applySlidePatch(data, no, { content, note, frontmatter })
      return `Updated slide ${no} in ${slide.source.filepath}.`
    }),
    tool('insert-slide', 'Insert a slide after the chosen slide in the same Markdown file.', { after: no, content: md, note: md, frontmatter: yaml }, ['after', 'content'], async (data, args) => {
      const { filepath } = await insertSlide(data, { after: Number(args.after), content: String(args.content), note: args.note as string | undefined, frontmatter: args.frontmatter as Args | undefined })
      return `Inserted a slide after slide ${args.after} in ${filepath}.`
    }),
    tool('remove-slide', 'Remove a slide from its Markdown source.', { no }, ['no'], async (data, args) => {
      const { filepath } = await removeSlide(data, Number(args.no))
      return `Removed slide ${args.no} from ${filepath}.`
    }, { destructiveHint: true }),
    tool('move-slide', 'Move a slide immediately before or after another slide in the same Markdown file.', { from: no, before: no, after: no }, ['from'], async (data, args) => {
      const { filepath } = await moveSlide(data, { from: Number(args.from), before: args.before as number | undefined, after: args.after as number | undefined })
      return `Moved slide ${args.from} in ${filepath}.`
    }),
  ]
  const nav = ctx.nav
  if (nav) {
    tools.push(tool('goto-slide', 'Navigate connected browsers to a slide and optional reveal step.', { no, clicks: { type: 'integer', minimum: 0 } }, ['no'], (data, args) => {
      const page = Number(args.no)
      resolveSlide(data, page)
      nav.go(page, Number(args.clicks ?? 0))
      return `Navigated to slide ${page}.`
    }, { idempotentHint: true }))
  }
  const definitions = tools.map(({ name, description, inputSchema, annotations }) => ({ name, description, inputSchema, annotations }))
  const byName = new Map(tools.map(item => [item.name, item]))

  return async (message) => {
    if (!mapping(message) || message.jsonrpc !== '2.0') return rpcError(null, -32600, 'Invalid request')
    if (typeof message.method !== 'string') {
      if ('result' in message || 'error' in message) return
      return rpcError(null, -32600, 'Invalid request')
    }
    const { id, method } = message
    if (id === undefined) return
    if (typeof id !== 'string' && typeof id !== 'number') return rpcError(null, -32600, 'Invalid request ID')
    const reply = (result: unknown): RpcReply => ({ jsonrpc: '2.0', id, result })
    const params = mapping(message.params) ? message.params : {}
    switch (method) {
      case 'initialize':
        return reply({
          protocolVersion: typeof params.protocolVersion === 'string' && versions.has(params.protocolVersion) ? params.protocolVersion : latest,
          serverInfo: { name: 'ts-presentation', version: ctx.version },
          capabilities: { tools: {} },
        })
      case 'ping': return reply({})
      case 'tools/list': return reply({ tools: definitions })
      case 'tools/call': {
        const item = typeof params.name === 'string' ? byName.get(params.name) : undefined
        if (!item) return rpcError(id, -32602, 'Unknown tool')
        const args = params.arguments ?? {}
        if (!mapping(args) || !valid(item, args)) return rpcError(id, -32602, 'Invalid tool arguments')
        try { return reply(content(await item.call(await ctx.getData(), args))) }
        catch (error) { return reply(content(error instanceof Error ? error.message : String(error), true)) }
      }
      default: return rpcError(id, -32601, 'Method not found')
    }
  }
}
