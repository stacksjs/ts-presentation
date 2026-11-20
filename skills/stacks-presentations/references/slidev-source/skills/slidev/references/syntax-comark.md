---
name: comark
description: Comark Syntax support
---

# Comark Syntax

Enhanced Markdown with component and style syntax.

## Enable

```md
---
comark: true
---
```

## Inline Styles

```md
This is a [red text]{style="color:red"}
```

## Inline Components

Define custom components in `components/` as `.stx` files. For example, `InlineComponent.stx` can be used as:

```md
:inline-component{prop="value"}
```

## Image Attributes

```md
![](/image.png){width=500px lazy}
```

## Block Components

```md
::block-component{prop="value"}
The **default** slot content
::
```

Put typed YAML props at the start of a block. Use `---` delimiters or a `yaml [props]` code fence. Inside a slot, `:prop="props.name"` reads the parent component's props.

```md
::block-component
---
label: Ready
count: 3
---
Status :inline-component{:prop="props.label"}
::
```

## Use Cases

- Add inline styles without HTML
- Use STX components inline
- Add attributes to images
- Create complex component layouts

Based on Comark Syntax.
