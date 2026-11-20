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

## Custom pages

Create `setup/routes.ts` in a deck, theme, or addon. The setup runs in Bun
and receives the custom routes registered by earlier extensions.

```ts
import { defineRoutesSetup } from 'ts-presentation'

export default defineRoutesSetup(routes => [
  ...routes,
  {
    path: '/handbook/guide',
    component: new URL('../pages/Guide.stx', import.meta.url),
    title: 'Guide',
  },
])
```

The page template can read `deck.title`, `deck.base`, `route.path`, and
`frontmatter`. STX client scripts and scoped styles work in custom pages.
Link to the page with `[Guide](/handbook/guide/)`. The dev server serves
the route, and a static build writes `handbook/guide/index.html`. Both
honor `--base` and use ordinary browser navigation between the deck and
the custom page. Use fixed paths with lowercase segments and hyphens.

## Context menu

Right-click the slide or press Shift+F10 with the slide focused. Use the
arrow keys to move through actions, Enter or Space to run one, and Escape
to close the menu and return focus. Shift+right-click opens the browser menu.

Add `setup/context-menu.ts` to a deck, theme, or addon. Setups run in the
browser in theme, addon, then deck order each time the menu opens.

```ts
import { defineContextMenuSetup } from 'ts-presentation'

export default defineContextMenuSetup((items, { navigation, isPresenter }) => [
  ...items.filter(item => item === 'separator' || item.name !== 'fullscreen'),
  'separator',
  {
    name: 'go-to-summary',
    label: 'Go to summary',
    disabled: isPresenter,
    action: () => navigation.go('summary'),
  },
])
```

Use text for `label` and the optional `icon`. Set `small: true` to show
only the icon while keeping the label available to assistive technology.
Use `show: false` to hide an action. The setup context also provides
`target` and `isFullscreen`.

`contextMenu: false` disables the menu. Set it to `dev` or `build` to
limit it to one mode. Inputs and editable text keep their browser menu.
Add `data-presentation-context-menu="ignore"` to preserve it on a region.

## STX components

Save `Callout.stx` to `components/` or a subdirectory in the deck,
theme, or addon. The deck wins, followed by the last configured addon
that provides the component, then the theme. Use `<Callout>` or a
multiword kebab-case tag such as `<status-badge>`.

```html
<template>
  <aside class="callout">
    <strong>{{ props.heading }}</strong>
    <slot />
    <footer><slot name="footer">Questions welcome</slot></footer>
  </aside>
</template>
```

```md
<Callout heading="Agenda" v-click>

- Review **the main changes**.
- Leave time for questions.

<template #footer>See the *speaker notes* for details.</template>

</Callout>
```

A named slot can expose values to Markdown text and native HTML attributes.
A component with `<slot name="row" :label="props.heading" />` can accept the
following slot.

```md
<template #row="{ label }">

**{{ label }}**

<span :aria-label="label" title="Selected row {{ label }}">Details</span>

</template>
```

Use a destructured binding as above or an object binding such as
`<template v-slot:row="row">` with `{{ row.label }}`. Use `:attribute` or
`v-bind:attribute` for native bindings such as `:disabled="count === 0"`.
Use interpolation in quoted attributes to combine slot values with text.
Text and attribute values are escaped. Bindings update when their STX signals
change. Inline and fenced code keep their literal braces.

Use plain attributes for text, bare attributes for booleans, and
`:prop` bindings for JSON values, quoted strings, or paths such as
`:heading="frontmatter.topic"`. A component template can also read
`frontmatter` and `slideNumber`. Use a single root when applying
`v-click` or `v-drag` directly to a component.

Add a `<script client>` block for client-side STX primitives such as
`state` and `defineProps`, or `<style scoped>` for component styles.
The dev server observes the component directory. Static markup updates
in place. Changes to a slide with client-side STX reload the player so
its setup scripts run again. The starter's `components/Counter.stx`
shows the client API.

A ported single-file component can use `<template>`, `<script setup lang="ts">`,
`<style scoped>`, and Vue-style bindings such as `v-bind:aria-label`,
`v-on:click`, and `v-show` in its `.stx` file. STX makes `ref`,
`computed`, and `defineProps` available to the setup script. Remove Vue
runtime imports when using the currently pinned STX version.
