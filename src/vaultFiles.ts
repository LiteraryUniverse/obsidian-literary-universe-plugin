import type { VaultFiles, Yaml } from '@literary-universe/sdk/vault'
import { type App, normalizePath, parseYaml, stringifyYaml, TFile } from 'obsidian'
import { isHidden, parentFolders } from './helpers'

export const obsidianYaml: Yaml = { parse: parseYaml, stringify: stringifyYaml }

/**
 * The sync engine's storage on the Obsidian API, so it works on mobile too.
 * Notes go through the vault (renames update links); `.lu/vault.json` goes
 * through the adapter because the vault doesn't index dot-folders.
 */
export function obsidianFiles(app: App): VaultFiles {
	const { vault } = app
	const file = (path: string) => {
		const found = vault.getAbstractFileByPath(normalizePath(path))
		return found instanceof TFile ? found : undefined
	}
	async function ensureFolders(path: string) {
		for (const folder of parentFolders(normalizePath(path)))
			if (!vault.getAbstractFileByPath(folder)) await vault.createFolder(folder)
	}
	return {
		list: async () => vault.getMarkdownFiles().map((note) => note.path),
		async read(path) {
			if (isHidden(path))
				return (await vault.adapter.exists(normalizePath(path))) ? vault.adapter.read(normalizePath(path)) : undefined
			const note = file(path)
			return note ? vault.read(note) : undefined
		},
		async write(path, text) {
			if (isHidden(path)) {
				for (const folder of parentFolders(normalizePath(path)))
					if (!(await vault.adapter.exists(folder))) await vault.adapter.mkdir(folder)
				return vault.adapter.write(normalizePath(path), text)
			}
			const note = file(path)
			if (note) return vault.modify(note, text)
			await ensureFolders(path)
			await vault.create(normalizePath(path), text)
		},
		async rename(from, to) {
			const note = file(from)
			if (!note) return
			await ensureFolders(to)
			await app.fileManager.renameFile(note, normalizePath(to))
		},
		async exists(path) {
			return isHidden(path)
				? vault.adapter.exists(normalizePath(path))
				: Boolean(vault.getAbstractFileByPath(normalizePath(path)))
		},
	}
}
