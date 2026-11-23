import { LiteraryUniverseApiError, LiteraryUniverseClient } from '@literary-universe/sdk'
import {
	readVaultConfig,
	type SyncReport,
	safeName,
	splitNote,
	syncVault,
	type VaultFiles,
	type VaultScope,
	vaultStatus,
} from '@literary-universe/sdk/vault'
import { normalizePath, Notice, Platform, Plugin, requestUrl, stringifyYaml, TFile, TFolder } from 'obsidian'
import { missingScopes } from './helpers'
import { CategoryModal, CreateWorkModal, ImageModal, imageType, type NewWork, PublishModal, StatusModal, TextModal } from './modals'
import {
	CALLBACK_ACTION,
	finishSignIn,
	OAuthError,
	type PendingSignIn,
	refreshSession,
	revokeSession,
	type Session,
	startSignIn,
} from './oauth'
import { callbackCode } from './pkce'
import { DEFAULT_SETTINGS, type LiteraryUniverseSettings, LiteraryUniverseSettingsTab } from './settings'
import { obsidianFiles, obsidianYaml } from './vaultFiles'

/**
 * The API sends no CORS headers, so the SDK goes through Obsidian's requestUrl.
 * shortcut: requestUrl can't be aborted, so the SDK's timeout only applies once it returns.
 */
const obsidianFetch: typeof fetch = async (input, init) => {
	const body = init?.body
	const response = await requestUrl({
		url: input instanceof URL ? input.href : (input as string),
		method: init?.method,
		headers: init?.headers as Record<string, string>,
		// Cover uploads send bytes; requestUrl takes an ArrayBuffer, not a view.
		body: body instanceof Uint8Array ? new Uint8Array(body).buffer : (body as string | ArrayBuffer | undefined),
		throw: false,
	})
	const empty = response.status === 204 || response.status === 304
	return new Response(empty ? null : response.arrayBuffer, {
		status: response.status,
		headers: response.headers,
	})
}

function summary(report: SyncReport) {
	const parts = [
		`${report.created.length} new`,
		`${report.updated.length} updated`,
		`${report.pushed.length} sent to Literary Universe`,
	]
	const lines = [`Literary Universe: ${parts.join(', ')}.`]
	if (report.conflicts.length)
		lines.push(
			`Changed in both places, merge from the "(Literary Universe)" copy, delete it, then sync again:\n${report.conflicts.join('\n')}`,
		)
	if (report.failures.length) lines.push(`Not synced:\n${report.failures.join('\n')}`)
	return lines.join('\n\n')
}

/** The sign-in lives in Obsidian's keychain, never in the vault or data.json. */
const SESSION_SECRET = 'literary-universe-session'
/** Refresh a little early so a token doesn't expire in the middle of a sync. */
const REFRESH_MARGIN_MS = 5 * 60_000
const message = (error: unknown) => (error instanceof Error ? error.message : String(error))
const str = (value: unknown) => (typeof value === 'string' || typeof value === 'number' ? String(value) : '')
const trimUrl = (url: string) => url.trim().replace(/\/+$/, '')
const folderOf = (file: TFile) => (!file.parent || file.parent.isRoot() ? '' : file.parent.path)
/** Chapter notes from plugin 0.1 have no `lu_kind`, only `lu_story`. */
const kindOf = (meta: Record<string, unknown>) => str(meta.lu_kind) || (meta.lu_story ? 'chapter' : '')

type Mode = { scope: VaultScope; language?: string; label: string }

export default class LiteraryUniversePlugin extends Plugin {
	declare settings: LiteraryUniverseSettings
	files!: VaultFiles
	private syncing = false
	/** shortcut: kept in memory, so a sign-in doesn't survive Obsidian restarting midway; it just has to be started again. */
	private pending?: PendingSignIn
	private settingsTab?: LiteraryUniverseSettingsTab

	async onload(): Promise<void> {
		await this.loadSettings()
		this.files = obsidianFiles(this.app)
		this.settingsTab = new LiteraryUniverseSettingsTab(this.app, this)
		this.addSettingTab(this.settingsTab)
		this.registerObsidianProtocolHandler(CALLBACK_ACTION, (params) => this.completeSignIn(params))
		this.addRibbonIcon('refresh-cw', 'Sync with Literary Universe', () => this.sync())
		const commands: [string, string, () => unknown][] = [
			['sync', 'Sync stories', () => this.sync()],
			['status', 'Show sync status', () => this.showStatus()],
			['publish-chapter', 'Publish chapter', () => this.publishChapter()],
			['release-entry', 'Release encyclopedia entry', () => this.releaseEntry()],
			['create-story', 'Create story', () => this.createWork('story')],
			['create-universe', 'Create universe', () => this.createWork('universe')],
			['set-cover', 'Set cover from image', () => this.setCover()],
			['hide-story', 'Hide story', () => this.setVisibility('PRIVATE')],
			['show-story', 'Show story', () => this.setVisibility('PUBLIC')],
			['new-chapter', 'New chapter', () => this.newChapter()],
			['new-entry', 'New encyclopedia entry', () => this.newEntry()],
		]
		for (const [id, name, callback] of commands) this.addCommand({ id, name, callback })
	}

	/** The current sign-in for the configured server, if any. */
	session(): Session | undefined {
		try {
			const saved = JSON.parse(this.app.secretStorage.getSecret(SESSION_SECRET) || 'null') as Session | null
			return saved?.baseUrl === this.settings.baseUrl ? saved : undefined
		} catch {
			return undefined
		}
	}

	private saveSession(session: Session | undefined) {
		// SecretStorage has no delete; an empty value means signed out.
		this.app.secretStorage.setSecret(SESSION_SECRET, session ? JSON.stringify(session) : '')
		this.settingsTab?.refreshAccount()
	}

	async signIn() {
		try {
			// The redirect names the vault to come back to. The desktop app also takes the vault's ID, which
			// has no spaces to arrive as "+" (Obsidian doesn't read those as spaces) and is unique among vaults of one name.
			const vaultId = Platform.isDesktopApp ? (this.app as { appId?: string }).appId : undefined
			const { pending, url } = await startSignIn(this.settings.baseUrl, vaultId ?? this.app.vault.getName())
			this.pending = pending
			window.open(url)
		} catch (error) {
			new Notice(`Literary Universe sign-in failed: ${message(error)}`, 0)
		}
	}

	private async completeSignIn(params: Record<string, string | undefined>) {
		try {
			const code = callbackCode(this.pending, params)
			const pending = this.pending as PendingSignIn
			this.pending = undefined
			const session = await finishSignIn(pending, code)
			this.saveSession(session)
			new Notice(`Signed in to Literary Universe${session.username ? ` as ${session.username}` : ''}.`)
		} catch (error) {
			new Notice(`Literary Universe sign-in failed: ${message(error)}`, 0)
		}
	}

	async signOut() {
		const current = this.session()
		this.saveSession(undefined)
		// Best effort: the sign-in is gone here either way; it can also be disconnected on the site.
		if (current) await revokeSession(current).catch((error) => console.warn('Literary Universe sign-out', error))
	}

	/** A sign-in from before universes and publishing: one clear prompt, then Sign in shows in the settings. */
	private async signInAgain() {
		await this.signOut()
		new Notice(
			'Literary Universe needs new permissions for universes, encyclopedia entries and publishing. Sign in again in the plugin settings. Your notes are not affected.',
			0,
		)
	}

	/** An access token for the SDK, refreshed when it's about to expire. */
	private async accessToken() {
		let current = this.session()
		if (!current) throw new OAuthError('signed_out', 'Sign in to Literary Universe in the plugin settings first.')
		if (current.accessExpiresAt - Date.now() < REFRESH_MARGIN_MS) {
			try {
				current = await refreshSession(current)
			} catch (error) {
				if (error instanceof OAuthError && error.code === 'invalid_grant') this.saveSession(undefined)
				throw error
			}
			this.saveSession(current)
		}
		return { kind: 'api-key' as const, token: current.accessToken }
	}

	/** A client for a sign-in with every permission the plugin needs, or undefined after telling why not. */
	private async connect() {
		if (!this.session()) {
			new Notice('Sign in to Literary Universe in the plugin settings first.')
			return
		}
		const client = new LiteraryUniverseClient({
			baseUrl: this.settings.baseUrl,
			// The SDK sends OAuth access tokens the same way as API keys.
			credentials: () => this.accessToken(),
			fetch: obsidianFetch,
			clientName: `obsidian-literary-universe/${this.manifest.version}`,
			maxRetries: 2,
			timeoutMs: 60_000,
		})
		await this.accessToken()
		let granted = this.session()?.scope
		if (granted === undefined) {
			// Sessions from plugin 0.1 didn't keep the granted scopes; ask the server once.
			granted = (await client.identity()).scopes.join(' ')
			const current = this.session()
			if (current) this.saveSession({ ...current, scope: granted })
		}
		if (missingScopes(granted).length) {
			await this.signInAgain()
			return
		}
		return client
	}

	private async failed(action: string, error: unknown) {
		console.error(`Literary Universe ${action} failed`, error)
		if (error instanceof LiteraryUniverseApiError) {
			// Disconnected on the site, or the sign-in ran out: show Sign in again.
			if (error.code === 'UNAUTHENTICATED') this.saveSession(undefined)
			if (error.code === 'FORBIDDEN' && /Required scope|does not permit this operation/.test(error.message))
				return this.signInAgain()
		}
		new Notice(`Literary Universe: ${action} stopped: ${message(error)}`, 0)
	}

	/** Runs one API action with its errors shown; undefined when it didn't run. */
	private async withClient<T>(action: string, work: (client: LiteraryUniverseClient) => Promise<T>) {
		try {
			const client = await this.connect()
			if (client) return await work(client)
		} catch (error) {
			await this.failed(action, error)
		}
	}

	/**
	 * A vault set up by `lu init universe|story` syncs that scope; any other
	 * vault syncs every workshop story under the configured folder.
	 */
	async mode(): Promise<Mode | { error: string }> {
		let config
		try {
			config = await readVaultConfig(this.files)
		} catch (error) {
			return { error: message(error) }
		}
		if (!config) {
			const folder = normalizePath(this.settings.folder)
			return { scope: { kind: 'workshop', folder }, label: `Every story you can write, in the "${folder}" folder.` }
		}
		if (trimUrl(config.baseUrl) !== this.settings.baseUrl)
			return {
				error: `This vault belongs to ${config.baseUrl}, but the plugin's server is ${this.settings.baseUrl}. Change Server in the plugin settings to sync it.`,
			}
		const language = config.language ? `, ${config.language} only` : ''
		const label =
			config.scope.kind === 'universe'
				? `A universe with its stories and encyclopedia (from .lu/vault.json${language}).`
				: config.scope.kind === 'story'
					? `One story (from .lu/vault.json${language}).`
					: `Every story you can write, in the "${config.scope.folder}" folder (from .lu/vault.json${language}).`
		return { scope: config.scope, language: config.language, label }
	}

	private async usableMode() {
		const mode = await this.mode()
		if ('error' in mode) {
			new Notice(`Literary Universe: ${mode.error}`, 0)
			return
		}
		return mode
	}

	async sync() {
		if (this.syncing) return
		const mode = await this.usableMode()
		if (!mode) return
		this.syncing = true
		const progress = new Notice('Syncing with Literary Universe…', 0)
		try {
			await this.withClient('sync', async (client) => {
				const report = await syncVault({
					client,
					files: this.files,
					yaml: obsidianYaml,
					scope: mode.scope,
					language: mode.language,
				})
				const failed = report.conflicts.length + report.failures.length > 0
				new Notice(summary(report), failed ? 0 : 5000)
			})
		} finally {
			progress.hide()
			this.syncing = false
		}
	}

	private async showStatus() {
		const mode = await this.usableMode()
		if (!mode) return
		const notes = await vaultStatus({ files: this.files, yaml: obsidianYaml, scope: mode.scope })
		new StatusModal(this.app, mode.label, notes).open()
	}

	/** The open note with its frontmatter, read from the file so it's current right after a sync. */
	private async activeNote() {
		const file = this.app.workspace.getActiveFile()
		if (!file || file.extension !== 'md') return
		const { meta } = splitNote(await this.app.vault.read(file), obsidianYaml)
		return { file, meta, kind: kindOf(meta) }
	}

	/** Publishing sends what Literary Universe has, so the note must match it. */
	private async unsynced(mode: Mode, path: string) {
		const status = (await vaultStatus({ files: this.files, yaml: obsidianYaml, scope: mode.scope })).find(
			(note) => note.path === path,
		)
		if (status)
			new Notice(
				status.state === 'conflict'
					? 'This note has a conflict. Merge the "(Literary Universe)" copy, delete it and sync before publishing.'
					: 'This note has changes that are not on Literary Universe yet. Sync first, then publish.',
			)
		return Boolean(status)
	}

	private async publishChapter() {
		const mode = await this.usableMode()
		const note = await this.activeNote()
		if (!mode) return
		if (!note || note.kind !== 'chapter' || !note.meta.lu_id) {
			new Notice('Open a synced chapter note to publish it.')
			return
		}
		if (await this.unsynced(mode, note.file.path)) return
		const { meta } = note
		const language = str(meta.lu_language)
		new PublishModal(
			this.app,
			{ heading: 'Publish chapter', title: str(meta.title) || note.file.basename, language, action: 'Publish' },
			async (release) => {
				const result = await this.withClient('publishing', (client) =>
					client.publishChapter({
						id: str(meta.lu_id),
						language,
						expectedVersion: str(meta.lu_version),
						operationId: crypto.randomUUID(),
						...release,
					}),
				)
				if (!result) return
				const warnings = result.warnings.map((warning) => warning.message)
				new Notice(
					[`Published "${str(meta.title) || note.file.basename}".`, ...warnings].join('\n'),
					warnings.length ? 0 : 5000,
				)
				await this.sync()
			},
		).open()
	}

	private async releaseEntry() {
		const mode = await this.usableMode()
		const note = await this.activeNote()
		if (!mode) return
		if (!note || note.kind !== 'entry' || !note.meta.lu_id) {
			new Notice('Open a synced encyclopedia entry note to release it.')
			return
		}
		if (await this.unsynced(mode, note.file.path)) return
		const id = str(note.meta.lu_id)
		const language = str(note.meta.lu_language) || undefined
		// The original's note doesn't name its language; the entry does.
		const entry = await this.withClient('release', (client) => client.encyclopediaEntry({ id, language }))
		if (!entry) return
		if (entry.version !== str(note.meta.lu_version)) {
			new Notice('This entry changed on Literary Universe since the last sync. Sync first, then release it.')
			return
		}
		new PublishModal(
			this.app,
			{ heading: 'Release encyclopedia entry', title: entry.name, language: entry.language, action: 'Release' },
			async (release) => {
				const released = await this.withClient('release', (client) =>
					client.publishEncyclopediaEntry({
						id,
						language,
						expectedVersion: entry.version,
						operationId: crypto.randomUUID(),
						...release,
					}),
				)
				if (!released) return
				new Notice(`Released "${entry.name}".`)
				await this.sync()
			},
		).open()
	}

	private async createWork(kind: 'story' | 'universe') {
		const mode = await this.usableMode()
		if (!mode) return
		const options = await this.withClient('loading choices', (client) => client.storyCreationOptions())
		if (!options) return
		const universeId = mode.scope.kind === 'universe' ? mode.scope.universeId : undefined
		const create = async (work: NewWork) => {
			const { genre, ...rest } = work
			const created = await this.withClient('creating', (client) =>
				kind === 'story'
					? client.createStory({ ...rest, genres: [genre], isAIGenerated: Boolean(work.aiModel), universeId })
					: client.createUniverse({ ...rest, genre }),
			)
			if (!created) return
			new Notice(
				kind === 'universe'
					? `Created the universe "${work.title}". To write it in Obsidian, set up a vault for it with "lu init universe" in the Literary Universe CLI.`
					: `Created the story "${work.title}".`,
				kind === 'universe' ? 0 : 5000,
			)
			await this.sync()
		}
		new CreateWorkModal(this.app, kind, options, create, mode.language).open()
	}

	/** The story or universe the open note belongs to. */
	private async target(mode: Mode) {
		const note = await this.activeNote()
		const meta = note?.meta ?? {}
		const id = str(meta.lu_id)
		if (note?.kind === 'chapter') return { kind: 'story' as const, id: str(meta.lu_story) }
		if (note?.kind === 'story' && id) return { kind: 'story' as const, id }
		if (note?.kind.startsWith('universe') && id) return { kind: 'universe' as const, id }
		if (mode.scope.kind === 'story') return { kind: 'story' as const, id: mode.scope.storyId }
		if (mode.scope.kind === 'universe') return { kind: 'universe' as const, id: mode.scope.universeId }
	}

	private async setCover() {
		const mode = await this.usableMode()
		if (!mode) return
		const target = await this.target(mode)
		if (!target) {
			new Notice('Open a note of the story to set its cover.')
			return
		}
		new ImageModal(this.app, async (image) => {
			const bytes = new Uint8Array(await this.app.vault.readBinary(image))
			const cover = await this.withClient('setting the cover', (client) =>
				// The server crops it to the cover shape and stores WebP.
				client.setCover({ ...target, bytes, type: imageType(image) }),
			)
			if (cover) new Notice(`Cover set for the ${target.kind}.`)
		}).open()
	}

	private async setVisibility(visibility: 'PUBLIC' | 'PRIVATE') {
		const mode = await this.usableMode()
		if (!mode) return
		const target = await this.target(mode)
		if (target?.kind !== 'story') {
			new Notice('Open a story or chapter note first.')
			return
		}
		const story = await this.withClient('changing visibility', (client) =>
			client.setStoryVisibility({ storyId: target.id, visibility }),
		)
		if (story)
			new Notice(visibility === 'PRIVATE' ? `"${story.title}" is hidden from readers.` : `"${story.title}" is shown to readers.`)
	}

	/** A note the next sync creates on Literary Universe. */
	private async createNote(path: string, meta: Record<string, string>) {
		if (await this.files.exists(path)) {
			new Notice(`${path} already exists.`)
			return
		}
		await this.files.write(path, `---\n${stringifyYaml(meta)}---\n\n`)
		const file = this.app.vault.getAbstractFileByPath(path)
		if (file instanceof TFile) await this.app.workspace.getLeaf().openFile(file)
		new Notice('The next sync creates it on Literary Universe.')
	}

	private async newChapter() {
		const file = this.app.workspace.getActiveFile()
		const folder = file && folderOf(file)
		// A story folder holds its Story.md or, from plugin 0.1, chapter notes.
		const story =
			file?.parent?.children.some((child) => {
				const meta = child instanceof TFile ? this.app.metadataCache.getFileCache(child)?.frontmatter : undefined
				return meta && (meta.lu_kind === 'story' || meta.lu_story)
			}) ?? false
		if (folder === null || !story) {
			new Notice('Open a note in the story folder first.')
			return
		}
		new TextModal(this.app, 'New chapter title', (title) =>
			this.createNote(normalizePath(`${folder}/${safeName(title, 'Untitled')}.md`), { lu_kind: 'chapter', title }),
		).open()
	}

	private async newEntry() {
		const mode = await this.usableMode()
		if (!mode) return
		if (mode.scope.kind !== 'universe') {
			new Notice('Encyclopedia entries are written in a universe vault, set up with "lu init universe".')
			return
		}
		const root = this.app.vault.getAbstractFileByPath('Encyclopedia')
		const categories = root instanceof TFolder ? root.children.filter((child) => child instanceof TFolder).map((child) => child.name) : []
		new CategoryModal(this.app, categories, (category) =>
			new TextModal(this.app, `New entry in ${category}`, (name) =>
				this.createNote(normalizePath(`Encyclopedia/${safeName(category, 'Uncategorized')}/${safeName(name, 'Untitled')}.md`), {
					lu_kind: 'entry',
					name,
				}),
			).open(),
		).open()
	}

	async loadSettings() {
		this.settings = { ...DEFAULT_SETTINGS, ...((await this.loadData()) as Partial<LiteraryUniverseSettings> | null) }
	}

	async saveSettings() {
		await this.saveData(this.settings)
	}
}
