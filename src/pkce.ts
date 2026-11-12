/** OAuth helpers without the Obsidian API, so they can be tested in Node. */

export const base64url = (bytes: Uint8Array) =>
	btoa(String.fromCharCode(...bytes))
		.replace(/\+/g, '-')
		.replace(/\//g, '_')
		.replace(/=+$/, '')

export const randomToken = () => base64url(crypto.getRandomValues(new Uint8Array(32)))

export async function codeChallenge(verifier: string) {
	const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
	return base64url(new Uint8Array(digest))
}

/** For display only: the token came straight from the token endpoint over TLS. */
export function usernameFromIdToken(idToken: unknown) {
	if (typeof idToken !== 'string') return undefined
	try {
		const payload = idToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
		const bytes = Uint8Array.from(atob(payload), (char) => char.charCodeAt(0))
		const claims = JSON.parse(new TextDecoder().decode(bytes)) as { preferred_username?: unknown }
		return typeof claims.preferred_username === 'string' ? claims.preferred_username : undefined
	} catch {
		return undefined
	}
}

export type Started = { state: string; issuer: string }

/** The authorization code from Obsidian's callback, after checking it answers this sign-in. */
export function callbackCode(started: Started | undefined, params: Record<string, string | undefined>) {
	if (!started || params.state !== started.state)
		throw new Error('This sign-in was not started here. Choose Sign in again.')
	// RFC 9207: the code must come from the server the sign-in went to.
	if (params.iss && params.iss !== started.issuer) throw new Error('Sign-in came back from another server.')
	if (params.error)
		throw new Error(
			params.error === 'access_denied'
				? 'Sign-in was cancelled.'
				: (params.error_description ?? params.error),
		)
	if (!params.code) throw new Error('Sign-in came back without a code. Choose Sign in again.')
	return params.code
}
