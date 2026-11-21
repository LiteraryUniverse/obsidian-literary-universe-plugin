# Literary Universe for Obsidian

Write your [Literary Universe](https://literaryuniverse.com) stories, and the
universes they are set in, in Obsidian. The plugin keeps a folder of Markdown
notes and Literary Universe in step in both directions: your chapters,
translations, story and universe details and encyclopedia entries become notes,
and the notes you edit go back as drafts. Nothing reaches readers until you
publish it with a command that asks you first.

## Installation

The plugin is not in Obsidian's community plugin list yet. Until it is, install
it from this repository:

- **With BRAT:** install the [BRAT](https://github.com/TfTHacker/obsidian42-brat)
  plugin, choose *Add beta plugin* and enter
  `LiteraryUniverse/obsidian-literary-universe-plugin`.
- **By hand:** download `main.js` and `manifest.json` from the
  [0.2.0 release](https://github.com/LiteraryUniverse/obsidian-literary-universe-plugin/releases/tag/0.2.0)
  into `<your vault>/.obsidian/plugins/literary-universe/`, then turn the plugin
  on under *Settings → Community plugins*.

It needs Obsidian 1.11.4 or later, on desktop or mobile.

## Setup

1. In the plugin's settings, choose **Sign in**. Your browser opens Literary
   Universe and asks you to let the plugin read and edit your stories,
   universes and comics, translate universes and publish chapters.
2. Allow it. The browser sends you back to Obsidian, and the settings show who
   you're signed in as. This works the same on a phone.
3. Run **Literary Universe: Sync stories** from the command palette, or click
   the sync icon in the ribbon.

The plugin never sees your password. It keeps its sign-in in Obsidian's
keychain, not in your vault, so it isn't synced or committed with your notes.
A sign-in lasts 90 days, then the plugin asks you to sign in again. To end
its access, choose **Sign out**, or disconnect it on Literary Universe under
*Settings → Integrations*.

**Signed in with version 0.1?** That sign-in only covers stories. The first
sync or command after updating tells you once to sign in again, and signs the
old session out. Your notes are not touched.

More help: [Obsidian plugin](https://literaryuniverse.com/feedback/help/article/obsidian-plugin)
in the Literary Universe help center.

## What syncs

The settings show which of these the vault uses.

- **A universe or a story.** Run `lu init universe` or `lu init story` from the
  [Literary Universe CLI](https://github.com/LiteraryUniverse/cli) in the
  vault's folder. It writes `.lu/vault.json`, and the plugin then syncs that
  universe or story, in the language the file names if it names one. If the
  file was made for a different server than the plugin's *Server* setting, the
  plugin says so and doesn't sync.
- **Your workshop.** Without `.lu/vault.json`, every story you can write,
  including ones shared with you, becomes a folder under *Literary Universe*
  (change the folder in the settings). This is what version 0.1 did, and notes
  it made keep working.

A universe vault looks like this:

```
Universe.md                     title, genre, rating, license; the description is the body
Universe.de.md                  a translation of the title and description
Series.md                       reading order, written from Literary Universe
Stories/My Story/Story.md       the story's details
Stories/My Story/01 Arrival.md  a chapter
Stories/My Story/01 Arrival.de.md  its German translation
Encyclopedia/Places/Rome.md     an entry; the folder is its category
Comics/My Comic.md              written from Literary Universe
```

A story vault holds `Story.md` and the chapter notes at its root. In workshop
mode each story folder holds the same.

## How sync works

Each sync first pulls from Literary Universe, then sends what you changed.

- **You edit** the note's text and the frontmatter fields without the `lu_`
  prefix. Leave the `lu_*` fields as they are: they hold the sync state, which
  is why notes can be renamed and moved.
- **Chapters:** the body is the chapter's draft. Changing `title` renames the
  chapter, and changing `sequence` (counting from 1) moves it; the note's file
  name follows. Translations are their own notes, `01 Title.<language>.md`.
- **Story and universe details:** `Story.md` and `Universe.md` carry the title,
  genres or genre, tags, rating and license in the frontmatter and the
  description as the body.
- **Encyclopedia entries:** the body is the summary, then a `## Field` section
  per text field (`## Field (private)` for private ones). `parent` and
  `related` are `[[wikilinks]]`. Moving the note to another category folder
  moves the entry. Fields that aren't text stay on Literary Universe.
- **AI-written text** must carry `ai_model: <model>` in the note's frontmatter.
  It is sent with every save of that note and shows readers which model wrote
  it. Removing the mark is done on Literary Universe.
- **Saves are drafts.** Readers don't see a change until you publish it.
- **Your notes are never overwritten.** If something changed on Literary
  Universe and in your note, your note stays as it is and the Literary
  Universe version is saved next to it as `01 Arrival (Literary Universe).md`.
  Merge what you want to keep into your note, delete the copy, and sync again.
  The note is not sent while the copy exists.
- **Deleting a note deletes nothing** on Literary Universe; the next sync
  brings it back. Delete chapters and entries on Literary Universe.
- **New chapters and entries** are notes with `lu_kind: chapter` and a
  `title`, or `lu_kind: entry` and a `name`, and no `lu_id`. The next sync
  creates them. The *New chapter* and *New encyclopedia entry* commands make
  these notes for you.

Every save names the version it is based on, so a sync never replaces work
someone else saved on Literary Universe in the meantime. If the connection
drops after a save, the next sync sees that the item already matches your note
and carries on without a conflict.

## Commands

All commands are in the command palette and work on desktop and mobile.

- **Sync stories** (also the ribbon icon) runs a sync.
- **Show sync status** lists the notes the next sync would send, create, or
  hold back because of a conflict. It works offline.
- **Publish chapter** publishes the open chapter note. A dialog shows the
  title, language, audience (readers or beta readers) and an optional date and
  time in your time zone; nothing is published until you confirm. Sync first if
  the note has unsent changes: publishing releases what Literary Universe has.
- **Release encyclopedia entry** does the same for the open entry note.
- **Create story** and **Create universe** ask for the title, address,
  description, language, genre, rating, license and whether AI wrote it. None
  of these is chosen for you. A story created in a universe vault belongs to
  that universe. A new universe gets its own vault with `lu init universe`.
- **Set cover from image** sets the cover of the open note's story or universe
  from a JPEG, PNG or WebP in the vault. Literary Universe crops it to the
  cover shape.
- **Hide story** and **Show story** hide the open note's story from readers or
  show it again.
- **New chapter** asks for a title and adds a chapter note to the open note's
  story folder.
- **New encyclopedia entry** asks for a category folder (an existing one or a
  category the universe offers) and a name.

### Current limits

- Universe vaults, translations, entry releases and the new story and
  universe fields need the Literary Universe server update that is still in
  review. Until it is live, use workshop mode.
- *Create story* sets one genre; add more in `Story.md` under `genres`.
- `Series.md` and comic notes are written from Literary Universe on every
  sync. Edit series and comics there.
- Deleting chapters and entries, and removing an AI mark, are done on
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
npm test        # path, scope and PKCE rules
npm run lint
```

To try a build, copy `main.js` and `manifest.json` into a test vault's
`.obsidian/plugins/literary-universe/` folder. The plugin talks to the
authoring API through [`@literary-universe/sdk`](https://github.com/LiteraryUniverse/sdk-typescript),
using Obsidian's `requestUrl` because the API doesn't send CORS headers. Sync
is the SDK's `@literary-universe/sdk/vault` engine, the same one `lu sync` in
the CLI runs; `src/vaultFiles.ts` gives it the vault through Obsidian's API. Point
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
