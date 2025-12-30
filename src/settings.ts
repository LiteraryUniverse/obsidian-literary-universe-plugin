import { App, PluginSettingTab, Setting } from 'obsidian';
import LiteraryUniversePlugin from './main';

export const API_ENDPOINT = 'https://literaryuniverse.com/graphql';

export interface LiteraryUniverseSettings {
    apiKey: string;
    syncScratchpad: boolean;
}

export const DEFAULT_SETTINGS: LiteraryUniverseSettings = {
    apiKey: '',
    syncScratchpad: true
}

export class LiteraryUniverseSettingsTab extends PluginSettingTab {
	plugin: LiteraryUniversePlugin;

	constructor(app: App, plugin: LiteraryUniversePlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

    display(): void {
		const { containerEl } = this;

		containerEl.empty();

        new Setting(containerEl).setName("Literary Universe Integration").setHeading();

        containerEl.createEl('h3', { text: 'Personal Information' });

		new Setting(containerEl)
			.setName('API Key')
			.setDesc('Your personal API key from Literary Universe')
			.addText(text => text
				.setPlaceholder('API Key')
				.setValue(this.plugin.settings.apiKey)
				.onChange(async (value) => {
					this.plugin.settings.apiKey = value;
					await this.plugin.saveSettings();
				}));

        containerEl.createEl('h3', { text: 'Synchronization settings' });

        new Setting(containerEl)
            .setName('Sync Scratchpad')
            .setDesc('Synchronize your Literary Universe Scratchpad locally')
            .addToggle((toggle) => {
                toggle
                    .setValue(this.plugin.settings.syncScratchpad)
                    .onChange(async (value) => {  
                        this.plugin.settings.syncScratchpad = value;  
                        await this.plugin.saveSettings();  
                        this.display();  
                    });
            });
	}
}