export const htmlTag: RegExp = /<(\/?)([a-z][\w:-]*)(?=[\s/>])((?:[^>"']|"[^"]*"|'[^']*')*)>/gi
export const htmlTags: RegExp = new RegExp(`<!--[\\s\\S]*?(?:-->|$)|${htmlTag.source}`, 'gi')
export const rawText: ReadonlySet<string> = new Set(['style', 'script', 'textarea', 'title', 'xmp', 'iframe', 'noembed', 'noframes', 'noscript', 'pre', 'code'])
