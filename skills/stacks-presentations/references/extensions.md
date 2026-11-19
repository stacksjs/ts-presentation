# Themes and addons

Select a built-in theme with `theme: default`, `paper`, or `serif`.
A deck can also select a theme module and an ordered addon list.

```yaml
theme: ./themes/lecture.ts
addons:
  - ./addons/slide-status.ts
```

Use a relative file, a directory with `index.ts`, a name under `themes/`
or `addons/`, or an installed compatible package. Theme and addon modules
run at build time, so use modules from the deck project or trusted packages.

```ts
import { defineTheme } from 'ts-presentation'

export default defineTheme({
  name: 'lecture',
  styleFile: './lecture.css',
  layouts: {
    compare: ({ html, slots }) =>
      `<div class="compare"><div>${html}</div><div>${slots.right ?? ''}</div></div>`,
  },
})
```

Select the layout with `layout: compare`. Add a `::right::` block to supply
the second column. Named slots are Markdown and are optional.

For an STX layout, save `layouts/compare.stx` in the deck, theme, or addon
directory. Use `{!! content !!}` for the default slot and `{!! slots.right !!}`
for the named slot. STX directives can read `frontmatter` and `slots`.
Layouts in the deck directory take precedence. Extension modules can also
register layouts with `defineStxLayout(new URL('./layouts/compare.stx', import.meta.url))`.

Addons use `defineAddon`. A module can supply styles, layout renderers,
slide transforms, a fenced-code renderer, a browser module, and
`globalTop` or `globalBottom` HTML. A client module receives
`presentation:slide` with `slide`, `click`, and `title` in the event detail.
Deck CSS loads after theme and addon CSS. A module can mount assets at
`./extensions/<name>/` using its `assets` property.

Refresh the deck to pick up CSS or client module edits. Restart the dev
server after editing a theme or addon's server module.

Use this API to port Vue themes and addons a deck actually needs.
Keep the theme and addon module interface independent of the deck's data.
