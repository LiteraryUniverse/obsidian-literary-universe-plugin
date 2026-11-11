import { type App, PluginSettingTab, SecretComponent, Setting } from 'obsidian'
import type LiteraryUniversePlugin from './main'

export interface LiteraryUniverseSettings {
	baseUrl: string
	/** Name of the API key in Obsidian's keychain; the key itself never enters the vault. */
	apiKeySecret: string
	folder: string
}

export const DEFAULT_SETTINGS: LiteraryUniverseSettings = {
	baseUrl: 'https://literaryuniverse.com',
	apiKeySecret: '',
	folder: 'Literary Universe',
}

export class LiteraryUniverseSettingsTab extends PluginSettingTab {
	plugin: LiteraryUniversePlugin

	constructor(app: App, plugin: LiteraryUniversePlugin) {
		super(app, plugin)
		this.plugin = plugin
	}

	display(): void {
		const { containerEl } = this
		containerEl.empty()

		new Setting(containerEl)
			.setName('API key')
			.setDesc(
				'Create a key that can read and edit stories at literaryuniverse.com/user/settings/integrations/api-keys, then store it here.',
			)
			.addComponent((el) =>
				new SecretComponent(this.app, el).setValue(this.plugin.settings.apiKeySecret).onChange(async (value) => {
					this.plugin.settings.apiKeySecret = value ?? ''
					await this.plugin.saveSettings()
				}),
			)

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
			.setDesc('Change this only for a self-hosted or test deployment.')
			.addText((text) =>
				text.setValue(this.plugin.settings.baseUrl).onChange(async (value) => {
					this.plugin.settings.baseUrl = value.trim().replace(/\/+$/, '') || DEFAULT_SETTINGS.baseUrl
					await this.plugin.saveSettings()
				}),
			)
	}
}
