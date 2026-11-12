import { LiteraryUniverseApiError, type LiteraryUniverseClient } from '@literary-universe/sdk'
import {
	type App,
	getFrontMatterInfo,
	normalizePath,
	parseYaml,
	stringifyYaml,
	TFile,
} from 'obsidian'
import {
	chapterFileName,
	headerChanged,
	normalizeBody,
	operationId,
	type Pulled,
	pullAction,
	safeName,
	sha256,
} from './plan'

/** Frontmatter written into every synced chapter note. */
type ChapterMeta = {
	lu_id: string
	lu_story: string
	lu_language: string
	lu_version: string
	lu_updated?: string | null
	lu_hash: string
	/** Path of the server copy written on a conflict; the note isn't pushed while it exists. */
	lu_conflict?: string
}

export type SyncReport = {
	created: number
	updated: number
	pushed: number
	conflicts: string[]
	failures: string[]
}

type Note = { file: TFile; meta: ChapterMeta; body: string; hash: string }

const CONFLICT_SUFFIX = ' (Literary Universe)'

async function readNote(app: App, file: TFile): Promise<Note | undefined> {
	const text = await app.vault.read(file)
	const info = getFrontMatterInfo(text)
	if (!info.exists) return
	const meta = parseYaml(info.frontmatter) as Partial<ChapterMeta> | null
	if (!meta?.lu_id || !meta.lu_version || !meta.lu_language) return
	const body = normalizeBody(text.slice(info.contentStart))
	return { file, meta: meta as ChapterMeta, body, hash: await sha256(body) }
}

/** Chapter notes anywhere under the sync folder, by chapter ID. */
async function chapterNotes(app: App, folder: string) {
	const notes = new Map<string, Note>()
	for (const file of app.vault.getMarkdownFiles()) {
		if (!file.path.startsWith(`${folder}/`)) continue
		const note = await readNote(app, file)
		if (note) notes.set(note.meta.lu_id, note)
	}
	return notes
}

const render = (meta: ChapterMeta, body: string) => `---\n${stringifyYaml(meta)}---\n\n${body}\n`

async function ensureFolder(app: App, path: string) {
	if (!app.vault.getAbstractFileByPath(path)) await app.vault.createFolder(path)
}

/** A path that isn't taken yet; two chapters or stories can share a title. */
function freePath(app: App, folder: string, name: string, id: string) {
	const path = normalizePath(`${folder}/${name}.md`)
	return app.vault.getAbstractFileByPath(path)
		? normalizePath(`${folder}/${name} (${id.slice(0, 6)}).md`)
		: path
}

async function all<T>(
	page: (after?: string) => Promise<{ nodes: T[]; pageInfo: { endCursor?: string | null; hasNextPage: boolean } }>,
) {
	const nodes: T[] = []
	let after: string | undefined
	do {
		const result = await page(after)
		nodes.push(...result.nodes)
		after = result.pageInfo.hasNextPage ? (result.pageInfo.endCursor ?? undefined) : undefined
	} while (after)
	return nodes
}

const describe = (error: unknown) =>
	error instanceof LiteraryUniverseApiError
		? `${error.code}: ${error.message}${error.requestId ? ` (request ${error.requestId})` : ''}`
		: String(error)

/**
 * Errors that stop the whole sync instead of one chapter. FORBIDDEN isn't one:
 * a chapter you can read but not edit (as a beta reader) must not block the rest.
 */
const fatal = (error: unknown) =>
	error instanceof LiteraryUniverseApiError &&
	['UNAUTHENTICATED', 'RATE_LIMITED', 'REDIRECTED', 'INVALID_CONFIGURATION'].includes(error.code)

/** Pull first, never overwriting an edited note, then push what changed locally. */
export async function sync(app: App, client: LiteraryUniverseClient, root: string): Promise<SyncReport> {
	const folder = normalizePath(root)
	const report: SyncReport = { created: 0, updated: 0, pushed: 0, conflicts: [], failures: [] }
	await ensureFolder(app, folder)
	const notes = await chapterNotes(app, folder)

	const stories = await all((after) => client.stories({ first: 100, after }))
	for (const story of stories) {
		const chapters = await all((after) => client.chapters({ storyId: story.id, first: 100, after }))
		for (const chapter of chapters) {
			if (!chapter.hasDraft) continue
			const note = notes.get(chapter.id)
			const pulled: Pulled | undefined = note && {
				version: note.meta.lu_version,
				hash: note.meta.lu_hash,
				updatedAt: note.meta.lu_updated,
			}
			if (!headerChanged(pulled, chapter.updatedAt)) continue
			try {
				const draft = await client.draft({ id: chapter.id, language: chapter.language })
				const body = normalizeBody(draft.markdown ?? '')
				const meta: ChapterMeta = {
					lu_id: draft.id,
					lu_story: story.id,
					lu_language: draft.language,
					lu_version: draft.version,
					lu_updated: chapter.updatedAt,
					lu_hash: await sha256(body),
				}
				const action = pullAction(pulled, note?.hash, draft.version, meta.lu_hash)
				if (action === 'create') {
					const storyFolder = normalizePath(`${folder}/${safeName(story.title, story.id)}`)
					await ensureFolder(app, storyFolder)
					// sequence is 0-based; file names count from 1 like the reader does.
					const path = freePath(app, storyFolder, chapterFileName(draft.sequence + 1, draft.title), draft.id)
					await app.vault.create(path, render(meta, body))
					report.created++
				} else if (note && action === 'overwrite') {
					await app.vault.modify(note.file, render(meta, body))
					// The note now matches the server, so the push below must not resend it.
					note.meta = meta
					note.hash = meta.lu_hash
					report.updated++
				} else if (note && action === 'conflict') {
					const copy = normalizePath(`${note.file.parent?.path ?? folder}/${note.file.basename}${CONFLICT_SUFFIX}.md`)
					const existing = app.vault.getAbstractFileByPath(copy)
					if (existing instanceof TFile) await app.vault.modify(existing, `${body}\n`)
					else await app.vault.create(copy, `${body}\n`)
					// Rebase the note on the server version; it stays held back while the copy exists.
					await app.fileManager.processFrontMatter(note.file, (fm: ChapterMeta) => {
						fm.lu_version = draft.version
						fm.lu_updated = chapter.updatedAt
						fm.lu_conflict = copy
					})
					note.meta = { ...note.meta, lu_version: draft.version, lu_conflict: copy }
					report.conflicts.push(note.file.path)
				} else if (note) {
					// 'skip' or 'keep': remember the header so the next sync doesn't fetch it again.
					await app.fileManager.processFrontMatter(note.file, (fm: ChapterMeta) => {
						fm.lu_updated = chapter.updatedAt
					})
				}
			} catch (error) {
				if (fatal(error)) throw error
				report.failures.push(`${story.title} / ${chapter.title}: ${describe(error)}`)
			}
		}
	}

	for (const note of notes.values()) {
		if (note.hash === note.meta.lu_hash) continue
		if (note.meta.lu_conflict) {
			if (app.vault.getAbstractFileByPath(note.meta.lu_conflict)) {
				if (!report.conflicts.includes(note.file.path)) report.conflicts.push(note.file.path)
				continue
			}
		}
		try {
			const { lu_id: id, lu_language: language, lu_version: expectedVersion } = note.meta
			const saved = await client.saveDraft({
				id,
				language,
				expectedVersion,
				markdown: note.body,
				operationId: await operationId(id, language, expectedVersion, note.hash),
			})
			await app.fileManager.processFrontMatter(note.file, (fm: ChapterMeta) => {
				fm.lu_version = saved.version
				fm.lu_hash = note.hash
				fm.lu_updated = saved.draft.updatedAt
				delete fm.lu_conflict
			})
			report.pushed++
		} catch (error) {
			if (fatal(error)) throw error
			report.failures.push(`${note.file.path}: ${describe(error)}`)
		}
	}
	return report
}
