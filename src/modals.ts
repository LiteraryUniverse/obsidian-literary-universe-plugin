import type { LuStoryCreationOptionsQuery } from '@literary-universe/sdk'
import type { NoteStatus } from '@literary-universe/sdk/vault'
import { type App, FuzzySuggestModal, Modal, Notice, Setting, SuggestModal, type TFile } from 'obsidian'
import { slugify } from './helpers'

type Audience = 'READERS' | 'BETA'
export type Release = { audience: Audience; publishAt?: string }

/** Shows exactly what goes live; nothing is published until Publish is chosen. */
export class PublishModal extends Modal {
	private release: Release = { audience: 'READERS' }

	constructor(
		app: App,
		private what: { heading: string; title: string; language: string; action: string },
		private onConfirm: (release: Release) => unknown,
	) {
		super(app)
	}

	onOpen() {
		const { contentEl } = this
		const zone = Intl.DateTimeFormat().resolvedOptions().timeZone
		this.setTitle(this.what.heading)
		new Setting(contentEl).setName('Title').setDesc(this.what.title)
		new Setting(contentEl).setName('Language').setDesc(this.what.language)
		new Setting(contentEl).setName('Audience').addDropdown((dropdown) =>
			dropdown
				.addOptions({ READERS: 'Readers', BETA: 'Beta readers' })
				.setValue(this.release.audience)
				.onChange((value) => {
					this.release.audience = value as Audience
					update()
				}),
		)
		new Setting(contentEl)
			.setName('Schedule')
			.setDesc(`Leave empty to publish now. Times are in ${zone}.`)
			.addText((text) => {
				text.inputEl.type = 'datetime-local'
				text.onChange((value) => {
					// datetime-local is local time; toISOString sends it with its zone.
					this.release.publishAt = value ? new Date(value).toISOString() : undefined
					update()
				})
			})
		const summary = contentEl.createEl('p')
		const update = () => {
			const who = this.release.audience === 'BETA' ? 'your beta readers' : 'readers'
			const when = this.release.publishAt
				? `on ${new Date(this.release.publishAt).toLocaleString()} (${zone})`
				: 'now'
			summary.setText(`"${this.what.title}" (${this.what.language}) goes live for ${who} ${when}.`)
		}
		update()
		new Setting(contentEl)
			.addButton((button) => button.setButtonText('Cancel').onClick(() => this.close()))
			.addButton((button) =>
				button
					.setButtonText(this.what.action)
					.setCta()
					.onClick(() => {
						this.close()
						this.onConfirm({ ...this.release })
					}),
			)
	}

	onClose() {
		this.contentEl.empty()
	}
}

type Options = LuStoryCreationOptionsQuery['result']
export type NewWork = {
	title: string
	slug: string
	description: string
	language: string
	genre: string
	rating: string
	license: string
	aiModel?: string
}

/** Every choice starts empty: license and AI disclosure are the author's to make. */
export class CreateWorkModal extends Modal {
	private work: NewWork & { ai: string } = {
		title: '',
		slug: '',
		description: '',
		language: '',
		genre: '',
		rating: '',
		license: '',
		ai: '',
	}

	constructor(
		app: App,
		private kind: 'story' | 'universe',
		private options: Options,
		private onSubmit: (work: NewWork) => unknown,
		language?: string,
	) {
		super(app)
		if (language && options.languages.includes(language)) this.work.language = language
	}

	onOpen() {
		const { contentEl, work, options } = this
		this.setTitle(this.kind === 'story' ? 'Create story' : 'Create universe')
		const choose = (values: Record<string, string>) => ({ '': 'Choose…', ...values })
		let slugEdited = false
		let slugInput: HTMLInputElement | undefined
		new Setting(contentEl).setName('Title').addText((text) =>
			text.onChange((value) => {
				work.title = value.trim()
				if (slugEdited || !slugInput) return
				work.slug = slugify(value)
				slugInput.value = work.slug
			}),
		)
		new Setting(contentEl)
			.setName('Address')
			.setDesc('Lowercase letters, digits and hyphens.')
			.addText((text) => {
				slugInput = text.inputEl
				text.onChange((value) => {
					slugEdited = true
					work.slug = value.trim()
				})
			})
		new Setting(contentEl).setName('Description').addTextArea((text) =>
			text.onChange((value) => {
				work.description = value.trim()
			}),
		)
		const select = (name: string, field: 'language' | 'genre' | 'rating' | 'license', values: Record<string, string>) =>
			new Setting(contentEl).setName(name).addDropdown((dropdown) =>
				dropdown
					.addOptions(choose(values))
					.setValue(work[field])
					.onChange((value) => {
						work[field] = value
					}),
			)
		select('Language', 'language', Object.fromEntries(options.languages.map((code) => [code, code])))
		select('Genre', 'genre', Object.fromEntries(options.genres.map((genre) => [genre.value, genre.name])))
		select('Rating', 'rating', Object.fromEntries(options.ratings.map((rating) => [rating, rating])))
		select('License', 'license', Object.fromEntries(options.licenses.map((item) => [item.value, item.name])))
		let model: Setting | undefined
		new Setting(contentEl).setName('Written with AI').addDropdown((dropdown) =>
			dropdown.addOptions(choose({ no: 'No, I wrote it', yes: 'Yes, AI wrote some or all of it' })).onChange((value) => {
				work.ai = value
				model?.settingEl.toggle(value === 'yes')
			}),
		)
		model = new Setting(contentEl)
			.setName('AI model')
			.setDesc('The model that wrote it. Readers see this.')
			.addText((text) =>
				text.onChange((value) => {
					work.aiModel = value.trim() || undefined
				}),
			)
		model.settingEl.hide()
		new Setting(contentEl)
			.addButton((button) => button.setButtonText('Cancel').onClick(() => this.close()))
			.addButton((button) =>
				button
					.setButtonText('Create')
					.setCta()
					.onClick(() => {
						const missing = [
							!work.title && 'title',
							!work.slug && 'address',
							!work.description && 'description',
							!work.language && 'language',
							!work.genre && 'genre',
							!work.rating && 'rating',
							!work.license && 'license',
							!work.ai && 'whether AI wrote it',
							work.ai === 'yes' && !work.aiModel && 'AI model',
						].filter(Boolean)
						if (missing.length) {
							new Notice(`Fill in: ${missing.join(', ')}.`)
							return
						}
						this.close()
						const { ai, ...chosen } = work
						this.onSubmit({ ...chosen, aiModel: ai === 'yes' ? work.aiModel : undefined })
					}),
			)
	}

	onClose() {
		this.contentEl.empty()
	}
}

/** Asks for one line of text. */
export class TextModal extends Modal {
	constructor(
		app: App,
		private heading: string,
		private onSubmit: (value: string) => unknown,
	) {
		super(app)
	}

	onOpen() {
		let value = ''
		const submit = () => {
			if (!value.trim()) return
			this.close()
			this.onSubmit(value.trim())
		}
		this.setTitle(this.heading)
		new Setting(this.contentEl).addText((text) => {
			text.onChange((input) => {
				value = input
			})
			text.inputEl.addEventListener('keydown', (event) => {
				if (event.key === 'Enter') submit()
			})
		})
		new Setting(this.contentEl).addButton((button) => button.setButtonText('Create').setCta().onClick(submit))
	}

	onClose() {
		this.contentEl.empty()
	}
}

const IMAGE_TYPES: Record<string, string> = {
	jpg: 'image/jpeg',
	jpeg: 'image/jpeg',
	png: 'image/png',
	webp: 'image/webp',
}
export const imageType = (file: TFile) => IMAGE_TYPES[file.extension.toLowerCase()]

export class ImageModal extends FuzzySuggestModal<TFile> {
	constructor(
		app: App,
		private onPick: (file: TFile) => unknown,
	) {
		super(app)
		this.setPlaceholder('Cover image (JPEG, PNG or WebP)')
	}
	getItems() {
		return this.app.vault.getFiles().filter((file) => imageType(file))
	}
	getItemText(file: TFile) {
		return file.path
	}
	onChooseItem(file: TFile) {
		this.onPick(file)
	}
}

/** Existing categories, or the typed name for one the universe offers but has no notes in yet. */
export class CategoryModal extends SuggestModal<string> {
	constructor(
		app: App,
		private categories: string[],
		private onPick: (category: string) => unknown,
	) {
		super(app)
		this.setPlaceholder('Encyclopedia category, as on Literary Universe')
	}
	getSuggestions(query: string) {
		const typed = query.trim()
		const found = this.categories.filter((name) => name.toLowerCase().includes(typed.toLowerCase()))
		return typed && !found.some((name) => name.toLowerCase() === typed.toLowerCase()) ? [...found, typed] : found
	}
	renderSuggestion(category: string, el: HTMLElement) {
		el.setText(this.categories.includes(category) ? category : `New: ${category}`)
	}
	onChooseSuggestion(category: string) {
		this.onPick(category)
	}
}

const STATES: Record<NoteStatus['state'], string> = {
	edited: 'Sent by the next sync',
	new: 'Created by the next sync',
	conflict: 'Waiting: merge the "(Literary Universe)" copy and delete it',
}

export class StatusModal extends Modal {
	constructor(
		app: App,
		private mode: string,
		private notes: NoteStatus[],
	) {
		super(app)
	}

	onOpen() {
		const { contentEl } = this
		this.setTitle('Literary Universe sync status')
		contentEl.createEl('p', { text: this.mode })
		if (!this.notes.length) contentEl.createEl('p', { text: 'Nothing to send. Every note matches the last sync.' })
		for (const note of this.notes) new Setting(contentEl).setName(note.path).setDesc(`${note.kind}: ${STATES[note.state]}`)
	}

	onClose() {
		this.contentEl.empty()
	}
}
