#!/usr/bin/env bash
set -euo pipefail

archive="$(cd "$(dirname "$1")" && pwd)/$(basename "$1")"
smoke=$(mktemp -d "${RUNNER_TEMP:-${TMPDIR:-/tmp}}/presentation-package.XXXXXX")
trap 'rm -rf "$smoke"' EXIT
cd "$smoke"
printf '{"private":true,"type":"module"}\n' > package.json
bun add --no-cache "$archive"
if grep -Eq '"(prompts|@types/dom-speech-recognition|data-uri-to-buffer|bun-plugin-stx)"' bun.lock; then
  printf 'The standalone lockfile includes a removed dependency\n' >&2
  exit 1
fi
mkdir components
cat > components/Standalone.stx <<'EOF'
<template>
  <p v-if="props.visible" data-smoke="stx-visible">Standalone {{ props.name }}</p>
  <p v-else data-smoke="stx-hidden">Hidden branch</p>
</template>
EOF
cat > slides.md <<'EOF'
# Standalone chart build

<Standalone name="component" :visible="true" />

~~~mermaid
gantt
  todayMarker off
  Draft :draft, 2030-01-01, 2d
  Ship :milestone, after draft, 0d
~~~

~~~mermaid
gitGraph
  commit id: "Start"
  branch review
  commit id: "Review"
~~~

~~~mermaid
mindmap
  root((Project))
    review[Review]
~~~

~~~charts
type: treemap
nodes:
  - label: Review
    value: 2
~~~
EOF
bun run ts-presentation build slides.md --out dist
for kind in gantt gitgraph mindmap treemap; do
  if ! grep -Fq "data-diagram-kind=\"$kind\"" dist/index.html; then
    printf 'Missing %s from the packed deck build\n' "$kind" >&2
    exit 1
  fi
done
grep -Fq 'data-smoke="stx-visible">Standalone component</p>' dist/index.html
if grep -Fq 'data-smoke="stx-hidden"' dist/index.html; then
  printf 'The packed CLI rendered the hidden STX branch\n' >&2
  exit 1
fi
test ! -e node_modules/@ts-charts/hierarchy

bun run create-ts-presentation packed-deck
test -f packed-deck/.gitignore
test -f packed-deck/components/Counter.stx
bun run ts-presentation build packed-deck/slides.md --out scaffold-dist
bun run create-ts-presentation-theme packed-theme
test -f packed-theme/layouts/cover.stx
test -f packed-theme/styles/layout.css
