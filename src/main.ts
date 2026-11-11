import { LiteraryUniverseApiError, LiteraryUniverseClient } from '@literary-universe/sdk'
import { Notice, Plugin, requestUrl } from 'obsidian'
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
import { type SyncReport, sync } from './sync'

/**
 * The API sends no CORS headers, so the SDK goes through Obsidian's requestUrl.
 * shortcut: requestUrl can't be aborted, so the SDK's timeout only applies once it returns.
 */
const obsidianFetch: typeof fetch = async (input, init) => {
	const response = await requestUrl({
		url: input as string, // the SDK always passes the endpoint as a string
		method: init?.method,
		headers: init?.headers as Record<string, string>,
		body: init?.body as string | ArrayBuffer | undefined,
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
		`${report.created} new`,
		`${report.updated} updated`,
		`${report.pushed} sent to Literary Universe`,
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

export default class LiteraryUniversePlugin extends Plugin {
	declare settings: LiteraryUniverseSettings
	private syncing = false
	/** shortcut: kept in memory, so a sign-in doesn't survive Obsidian restarting midway; it just has to be started again. */
	private pending?: PendingSignIn
	private settingsTab?: LiteraryUniverseSettingsTab

	async onload(): Promise<void> {
		await this.loadSettings()
		this.settingsTab = new LiteraryUniverseSettingsTab(this.app, this)
		this.addSettingTab(this.settingsTab)
		this.registerObsidianProtocolHandler(CALLBACK_ACTION, (params) => this.completeSignIn(params))
		this.addRibbonIcon('refresh-cw', 'Sync with Literary Universe', () => this.sync())
		this.addCommand({
			id: 'sync',
			name: 'Sync stories',
			callback: () => this.sync(),
		})
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
			const { pending, url } = await startSignIn(this.settings.baseUrl, this.app.vault.getName())
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

	async sync() {
		if (this.syncing) return
		if (!this.session()) {
			new Notice('Sign in to Literary Universe in the plugin settings first.')
			return
		}
		this.syncing = true
		const progress = new Notice('Syncing with Literary Universe…', 0)
		try {
			const client = new LiteraryUniverseClient({
				baseUrl: this.settings.baseUrl,
				// The SDK sends OAuth access tokens the same way as API keys.
				credentials: () => this.accessToken(),
				fetch: obsidianFetch,
				clientName: `obsidian-literary-universe/${this.manifest.version}`,
				maxRetries: 2,
				timeoutMs: 60_000,
			})
			const report = await sync(this.app, client, this.settings.folder)
			const failed = report.conflicts.length + report.failures.length > 0
			new Notice(summary(report), failed ? 0 : 5000)
		} catch (error) {
			console.error('Literary Universe sync failed', error)
			// Disconnected on the site, or the sign-in ran out: show Sign in again.
			if (error instanceof LiteraryUniverseApiError && error.code === 'UNAUTHENTICATED') this.saveSession(undefined)
			new Notice(`Literary Universe sync stopped: ${message(error)}`, 0)
		} finally {
			progress.hide()
			this.syncing = false
		}
	}

	async loadSettings() {
		this.settings = { ...DEFAULT_SETTINGS, ...((await this.loadData()) as Partial<LiteraryUniverseSettings> | null) }
	}

	async saveSettings() {
		await this.saveData(this.settings)
	}
}
