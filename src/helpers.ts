/** Rules without the Obsidian API, so they can be tested in Node. */

/** API permissions the plugin signs in with, besides `openid profile`. */
export const API_SCOPES = [
	'story:read',
	'story:write',
	'story:publish',
	'universe:read',
	'universe:write',
	'universe:translate',
	'comic:read',
]

/** Permissions a sign-in lacks; `granted` is a space-separated list, as OAuth sends it. */
export const missingScopes = (granted: string) => {
	const have = granted.split(/\s+/)
	return API_SCOPES.filter((scope) => !have.includes(scope))
}

/** Dot-folders such as `.lu` are not in Obsidian's file index, so they go through the adapter. */
export const isHidden = (path: string) => path.split('/').some((part) => part.startsWith('.'))

/** The folders above a file, outermost first: `a/b/c.md` → `a`, `a/b`. */
export function parentFolders(path: string) {
	const parts = path.split('/').slice(0, -1)
	return parts.map((_, index) => parts.slice(0, index + 1).join('/'))
}

/** An address segment from a title: lowercase letters, digits and single hyphens. */
export const slugify = (title: string) =>
	title
		.normalize('NFKD')
		.replace(/[̀-ͯ]/g, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.slice(0, 60)
		.replace(/^-+|-+$/g, '')
