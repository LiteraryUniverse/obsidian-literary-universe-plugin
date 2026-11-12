import { type App, PluginSettingTab, Setting } from 'obsidian'
import type LiteraryUniversePlugin from './main'

export interface LiteraryUniverseSettings {
	baseUrl: string
	folder: string
}

export const DEFAULT_SETTINGS: LiteraryUniverseSettings = {
	baseUrl: 'https://literaryuniverse.com',
	folder: 'Literary Universe',
}

export class LiteraryUniverseSettingsTab extends PluginSettingTab {
	plugin: LiteraryUniversePlugin
	private accountEl?: HTMLElement

	constructor(app: App, plugin: LiteraryUniversePlugin) {
		super(app, plugin)
		this.plugin = plugin
	}

	/** Redraws the Account row after signing in or out. */
	refreshAccount() {
		if (!this.accountEl) return
		this.accountEl.empty()
		const session = this.plugin.session()
		const account = new Setting(this.accountEl).setName('Account')
		if (session)
			account
				.setDesc(`Signed in${session.username ? ` as ${session.username}` : ''}.`)
				.addButton((button) => button.setButtonText('Sign out').onClick(() => this.plugin.signOut()))
		else
			account
				.setDesc('Sign in with your Literary Universe account in your browser, then allow the plugin to read and edit your stories.')
				.addButton((button) =>
					button
						.setButtonText('Sign in')
						.setCta()
						.onClick(() => this.plugin.signIn()),
				)
	}

	display(): void {
		const { containerEl } = this
		containerEl.empty()

		this.accountEl = containerEl.createDiv()
		this.refreshAccount()

		new Setting(containerEl)
			.setName('Folder')
			.setDesc('Where your stories are kept in this vault.')
			.addText((text) =>
				text.setValue(this.plugin.settings.folder).onChange(async (value) => {
					this.plugin.settings.folder = value.trim() || DEFAULT_SETTINGS.folder
					await this.plugin.saveSettings()
				}),
			)

		new Setting(containerEl)
			.setName('Server')
			.setDesc('Change this only for a self-hosted or test deployment. You sign in to each server separately.')
			.addText((text) =>
				text.setValue(this.plugin.settings.baseUrl).onChange(async (value) => {
					this.plugin.settings.baseUrl = value.trim().replace(/\/+$/, '') || DEFAULT_SETTINGS.baseUrl
					await this.plugin.saveSettings()
					// Each server has its own sign-in.
					this.refreshAccount()
				}),
			)
	}
}
