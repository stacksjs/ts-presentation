import * as vscode from 'vscode'
import { frontmatterCompletions, frontmatterHelp, readAuthoringDocument } from './authoring.ts'

const markdown = { language: 'markdown', scheme: 'file' }

export function registerAuthoring(context) {
  const documents = new WeakMap()
  function authoring(document) {
    const patterns = vscode.workspace.getConfiguration('ts-presentation', document.uri).get('include', ['**/slides.md'])
    if (!Array.isArray(patterns)) return
    const folder = vscode.workspace.getWorkspaceFolder(document.uri)
    const matches = patterns.some(pattern => typeof pattern === 'string' && pattern && vscode.languages.match({
      ...markdown,
      pattern: folder ? new vscode.RelativePattern(folder, pattern) : pattern,
    }, document))
    if (!matches) return
    const cached = documents.get(document)
    if (cached?.version === document.version) return cached.data
    const data = readAuthoringDocument(document.getText())
    documents.set(document, { data, version: document.version })
    return data
  }

  context.subscriptions.push(
    vscode.languages.registerDocumentSymbolProvider(markdown, {
      provideDocumentSymbols(document) {
        return authoring(document)?.slides.map(slide => new vscode.DocumentSymbol(
          `${slide.index + 1}. ${slide.title}`,
          '',
          vscode.SymbolKind.Module,
          new vscode.Range(document.lineAt(slide.start).range.start, document.lineAt(slide.end).range.end),
          document.lineAt(slide.selection).range,
        ))
      },
    }, { label: 'Presentation Slides' }),
    vscode.languages.registerFoldingRangeProvider(markdown, {
      provideFoldingRanges(document) {
        return authoring(document)?.slides.filter(slide => slide.end > slide.start)
          .map(slide => new vscode.FoldingRange(slide.start, slide.end, vscode.FoldingRangeKind.Region))
      },
    }),
    vscode.languages.registerCompletionItemProvider(markdown, {
      provideCompletionItems(document, position) {
        const parsed = authoring(document)
        if (!parsed) return
        return frontmatterCompletions(parsed, position.line, position.character).map(completion => {
          const item = new vscode.CompletionItem(completion.label,
            completion.isKey ? vscode.CompletionItemKind.Property : vscode.CompletionItemKind.Value)
          item.documentation = completion.description
          item.insertText = completion.insert
          item.range = new vscode.Range(position.line, completion.start, position.line, completion.end)
          return item
        })
      },
    }, ':'),
    vscode.languages.registerHoverProvider(markdown, {
      provideHover(document, position) {
        const parsed = authoring(document)
        const help = parsed && frontmatterHelp(parsed, position.line, position.character)
        if (help) return new vscode.Hover(help.description, new vscode.Range(position.line, 0, position.line, help.end))
      },
    }),
  )
}
