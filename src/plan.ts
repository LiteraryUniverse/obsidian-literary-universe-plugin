/** Pure sync rules, kept free of the Obsidian API so they can be tested in Node. */

/** What the plugin remembers about a chapter in the note's frontmatter. */
export type Pulled = {
	/** Draft version the note is based on. */
	version: string
	/** Hash of the note body when it last matched Literary Universe. */
	hash: string
	/** The chapter header's updatedAt at the last pull. */
	updatedAt?: string | null
}

export type PullAction =
	| 'create' // no note yet
	| 'skip' // nothing changed on Literary Universe
	| 'keep' // only the note changed; push sends it
	| 'overwrite' // only Literary Universe changed
	| 'conflict' // both changed: keep the note, write the server copy beside it

/** Whether the header's updatedAt shows the chapter may have changed since the pull. */
export const headerChanged = (pulled: Pulled | undefined, updatedAt?: string | null) =>
	!pulled || !updatedAt || pulled.updatedAt !== updatedAt

export function pullAction(
	pulled: Pulled | undefined,
	localHash: string | undefined,
	serverVersion: string,
	serverHash: string,
): PullAction {
	if (!pulled) return 'create'
	// A note that already matches the server isn't an edit, e.g. after a push whose response was lost.
	const edited = localHash !== pulled.hash && localHash !== serverHash
	if (serverVersion === pulled.version) return edited ? 'keep' : 'skip'
	return edited ? 'conflict' : 'overwrite'
}

/** A file or folder name that is valid on every platform Obsidian runs on. */
export function safeName(name: string, fallback: string) {
	const cleaned = name
		.replace(/[\\/:*?"<>|#^[\]\p{Cc}]/gu, ' ')
		.replace(/\s+/g, ' ')
		.replace(/^[\s.]+|[\s.]+$/g, '')
		.slice(0, 100)
		.trim()
	return cleaned || fallback
}

export const chapterFileName = (sequence: number, title: string) =>
	`${String(sequence).padStart(2, '0')} ${safeName(title, 'Untitled')}`

/** Trailing whitespace and the blank line after the frontmatter are not edits. */
export const normalizeBody = (body: string) => body.trim()

export async function sha256(text: string) {
	const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
	return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * The same save always gets the same operation ID, so a retry after a lost
 * response returns the first result instead of a VERSION_CONFLICT, and a
 * different body or base version is a new operation.
 */
export const operationId = (id: string, language: string, version: string, bodyHash: string) =>
	sha256(`${id}:${language}:${version}:${bodyHash}`)
