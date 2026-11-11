# Literary Universe for Obsidian

Write your [Literary Universe](https://literaryuniverse.com) stories in Obsidian.
The plugin brings your chapters into your vault as Markdown notes and sends the
chapters you edit back to Literary Universe as drafts. Publishing stays on
Literary Universe.

## Installation

The plugin is not in Obsidian's community plugin list yet. Until it is, install
it from this repository:

- **With BRAT:** install the [BRAT](https://github.com/TfTHacker/obsidian42-brat)
  plugin, choose *Add beta plugin* and enter
  `LiteraryUniverse/obsidian-literary-universe-plugin`.
- **By hand:** download `main.js` and `manifest.json` from the
  [latest release](https://github.com/LiteraryUniverse/obsidian-literary-universe-plugin/releases)
  into `<your vault>/.obsidian/plugins/literary-universe/`, then turn the plugin
  on under *Settings → Community plugins*.

It needs Obsidian 1.11.4 or later, on desktop or mobile.

## Setup

1. In the plugin's settings, choose **Sign in**. Your browser opens Literary
   Universe and asks you to let the plugin read and edit your stories.
2. Allow it. The browser sends you back to Obsidian, and the settings show who
   you're signed in as. This works the same on a phone.
3. Run **Literary Universe: Sync stories** from the command palette, or click
   the sync icon in the ribbon.

The plugin never sees your password. It keeps its sign-in in Obsidian's
keychain, not in your vault, so it isn't synced or committed with your notes.
A sign-in lasts 90 days, then the plugin asks you to sign in again. To end
its access, choose **Sign out**, or disconnect it on Literary Universe under
*Settings → Integrations*.

More help: [Obsidian plugin](https://literaryuniverse.com/feedback/help/article/obsidian-plugin)
in the Literary Universe help center.

## How sync works

Each sync first pulls, then pushes.

- **Pull:** every story in your workshop, including ones shared with you, becomes a folder under *Literary Universe*
  (change the folder in the settings), with one note per chapter:
  `Literary Universe/My Story/01 The Beginning.md`. Chapters that haven't changed
  since the last sync are not downloaded again.
- **Push:** notes whose text you changed are saved to Literary Universe as the
  chapter's draft. Readers don't see the change until you publish it there.
- **Your notes are never overwritten.** If a chapter changed on Literary
  Universe and in your note, your note stays as it is and the Literary Universe
  text is saved next to it as `01 The Beginning (Literary Universe).md`. Merge
  what you want to keep into your note, delete the copy, and sync again. The
  note is not pushed while the copy exists.

The plugin tracks each chapter with `lu_*` fields in the note's frontmatter.
Leave them as they are. You can rename and move notes within the folder.

Saves are checked against the chapter's version, so a sync never replaces work
someone else saved on Literary Universe in the meantime. If the connection
drops after a save, the next sync sees that the chapter already matches your
note and carries on without a conflict.

### Current limits

- Only the original language of each chapter is synced, not translations.
- Titles, chapter order, new chapters and encyclopedia entries are edited on
  Literary Universe.
- Some editor features have no Markdown form: ruby text, text alignment,
  initial letters, emoji, embedded videos and work cards, and screenplay
  formatting. Chapters that use them are pulled, but saving them from Obsidian
  is refused, so make those edits on Literary Universe.

## Development

```sh
npm ci
npm run dev     # rebuilds main.js on change
npm run build   # type check and production build
npm test        # sync rules
npm run lint
```

To try a build, copy `main.js` and `manifest.json` into a test vault's
`.obsidian/plugins/literary-universe/` folder. The plugin talks to the
authoring API through [`@literary-universe/sdk`](https://github.com/LiteraryUniverse/sdk-typescript),
using Obsidian's `requestUrl` because the API doesn't send CORS headers. Point
*Server* in the settings at a local deployment to test against it.

Sign-in is OAuth with PKCE. The plugin registers itself with the server's
dynamic client registration, once per sign-in. The OAuth server only redirects
to HTTPS, and Obsidian on a phone can't listen on loopback, so the redirect is
the server's `/api/obsidian/callback?vault=<vault name>`. That page sends the
browser on to `obsidian://literary-universe` with only the OAuth result. The
plugin checks `state` and `iss` before exchanging the code. Access tokens are
refreshed five minutes before they expire, and refresh tokens rotate. If a
refresh response is lost, the old refresh token is spent and the server ends
the grant, so the plugin asks to sign in again; notes are not affected.

### Releasing

Update `version` in `package.json`, then run `npm version <x.y.z>` to bump
`manifest.json` and `versions.json`. Push a tag that matches the version
exactly (no `v` prefix), and attach `main.js` and `manifest.json` from
`npm run build` to a GitHub release for that tag.

## License

MIT
