import { LiteraryUniverseClient } from '@literary-universe/sdk'
import { Notice, Plugin, requestUrl } from 'obsidian'
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

export default class LiteraryUniversePlugin extends Plugin {
	declare settings: LiteraryUniverseSettings
	private syncing = false

	async onload(): Promise<void> {
		await this.loadSettings()
		this.addSettingTab(new LiteraryUniverseSettingsTab(this.app, this))
		this.addRibbonIcon('refresh-cw', 'Sync with Literary Universe', () => this.sync())
		this.addCommand({
			id: 'sync',
			name: 'Sync stories',
			callback: () => this.sync(),
		})
	}

	async sync() {
		if (this.syncing) return
		const token = this.settings.apiKeySecret && this.app.secretStorage.getSecret(this.settings.apiKeySecret)
		if (!token) {
			new Notice('Add your Literary Universe API key in the plugin settings first.')
			return
		}
		this.syncing = true
		const progress = new Notice('Syncing with Literary Universe…', 0)
		try {
			const client = new LiteraryUniverseClient({
				baseUrl: this.settings.baseUrl,
				token,
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
			new Notice(`Literary Universe sync stopped: ${error instanceof Error ? error.message : String(error)}`, 0)
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
