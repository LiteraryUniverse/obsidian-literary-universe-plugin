import {App, Editor, MarkdownView, Modal, Notice, Plugin} from 'obsidian';
import { LiteraryUniverseSettings, DEFAULT_SETTINGS, LiteraryUniverseSettingsTab } from './settings';
import { LiteraryUniverseBase } from './base';

/* TODO
 * Implement API key validation and user information retrieval
 * Store user ID and username in settings (if stored show them in the settings)
 * Clicking on the ribbon icon should open a BASE which will list all the connected properties from LU and their local elements
 * All connections from LU (be it file or otherwise) need to have LU type and ID added to them so that we can track them. Last updated date is also needed.
 * Items are synced by comparing the update date with LU server. If the local update date is more recent it will push the updated data to LU, if LU has more recent update then it needs to override local data.
 * First we want to sync the Scratchpad with LU. When module is loaded it should create a directory 'Scratchpads' where Scratchpads from LU will be stored. Right now we have only one Scratchpad, but that will change in the future. For now we will ignore any additional files created in the Scratchpad folder, but in the future we will sync them.
 * Next we want to sync personal notes. These will be stored in a 'Notes' directory. But we will care only about those that are synced with LU, any extras will be ignored.
 */


export default class LiteraryUniversePlugin extends Plugin {
    settings: LiteraryUniverseSettings

    async onload(): Promise<void> {
        await this.loadSettings();
        
        this.addRibbonIcon('sparkle', 'Literary Universe', (evt: MouseEvent) => {
            // First check that we have the API key
            if (!this.settings.apiKey) {
                new Notice('Please enter your Literary Universe API key in settings');
                return;
            } else {
                // Check if the key is valid and get user id and username from LU if we don't have it already
                new Notice('Literary Universe plugin loaded!');
            }
        });

        this.addSettingTab(new LiteraryUniverseSettingsTab(this.app, this));

        this.registerBasesView('literary-universe-base', {
            name: 'Literary Universe Base',
            icon: 'sparkle',
            factory: (controller, containerEl) => {
                new LiteraryUniverseBase(controller, containerEl);
            }
        });
    }

    onunload(): void {
        console.log('Literary Universe plugin unloaded');
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }
}