function baseUrl(value: string, base: string): string {
  const url = value.trim()
  const path = url.split(/[?#]/, 1)[0]
  return url.startsWith('/') && !url.startsWith('//') && !/[\\\u0000-\u0020]/u.test(path)
    && path !== base.slice(0, -1) && !path.startsWith(base) ? base.slice(0, -1) + url : value
}

const cssReferences = /\/\*[\s\S]*?\*\/|(@import\s+)(["'])([^"'\\\r\n]*)\2|\b(url\(\s*)(?:(["'])([^"'\\\r\n]*)\5|([^()\s"'\\]+))(\s*\))|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/gi

export function prefixCssUrls(css: string, base: string): string {
  if (base === '/') return css
  return css.replace(cssReferences, (match, directive: string | undefined, quote: string, imported: string, open: string | undefined, urlQuote: string | undefined, quoted: string | undefined, unquoted: string | undefined, close: string) => {
    if (directive) return directive + quote + baseUrl(imported, base) + quote
    if (open) return open + (urlQuote ?? '') + baseUrl(quoted ?? unquoted ?? '', base) + (urlQuote ?? '') + close
    return match
  })
}

function prefixSourceSet(srcset: string, base: string): string {
  // Read URL tokens before their descriptors. The first comma in a data URL is part of the URL.
  return srcset.replace(/(^\s*|,\s*)(\S+?)(?=\s|,(?:\s|$)|$)([^,]*(?=,|$))/g, (_, separator: string, url: string, descriptors: string) =>
    separator + baseUrl(url, base) + descriptors)
}

const urlAttributes = ['src', 'href', 'xlink:href', 'poster', 'background', 'data-src', 'data-video-print-poster']

export function prefixMarkupUrls(markup: string, base: string): string {
  if (base === '/' || !markup) return markup
  let css = ''
  return new HTMLRewriter().on('[src],[href],[xlink\\:href],[poster],[background],[data-src],[data-video-print-poster],[srcset],[style]', {
    element(element) {
      for (const attr of urlAttributes) {
        const value = element.getAttribute(attr)
        if (value === null) continue
        const prefixed = baseUrl(value, base)
        if (prefixed !== value) element.setAttribute(attr, prefixed)
      }
      const srcset = element.getAttribute('srcset')
      if (srcset) element.setAttribute('srcset', prefixSourceSet(srcset, base))
      const style = element.getAttribute('style')
      if (style) element.setAttribute('style', prefixCssUrls(style, base))
    },
  }).on('style', {
    text(chunk) {
      css += chunk.text
      if (chunk.lastInTextNode) {
        chunk.replace(prefixCssUrls(css, base), { html: true })
        css = ''
      }
      else chunk.remove()
    },
  }).transform(markup)
}
