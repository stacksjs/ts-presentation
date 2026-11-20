# ts-presentation for VS Code

Browse slide titles in VS Code's Outline, fold individual slides in the editor,
and use completion or hover help for top-level frontmatter. The Markdown
grammar highlights slide syntax and embedded languages. The Command Palette
provides **Open Audience View**, **Open Presenter View**, and **Stop Previews**.

## Run the extension from a checkout

From the repository root, build the extension and open a VS Code development
host with the extension loaded.

```sh
bun run --cwd packages/vscode build
code --extensionDevelopmentPath="$(pwd)/packages/vscode"
```

Open a deck in the development host. Authoring features apply to
`**/slides.md` by default. Add workspace-relative patterns to
`.vscode/settings.json` for decks with other names.

```json
{
  "ts-presentation.include": ["**/slides.md", "talks/**/*.md"]
}
```

Outline and frontmatter help work in the editor while a draft is incomplete.
To preview a deck, make Bun available to the VS Code process and install
`ts-presentation` in the deck project. When running the extension from this
checkout, the preview can also use the CLI in the checkout.

## Credits

Adapted from Slidev's MIT-licensed VS Code extension by Anthony Fu and the
Slidev contributors. See the [Slidev extension guide](https://sli.dev/features/vscode-extension)
for the original extension and its capabilities. The original MIT notice is
included in [LICENSE](LICENSE).
