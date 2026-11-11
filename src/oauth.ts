import { requestUrl } from 'obsidian'
import { codeChallenge, randomToken, type Started, usernameFromIdToken } from './pkce'

/** obsidian://literary-universe is where the site's /api/obsidian/callback sends the browser back. */
export const CALLBACK_ACTION = 'literary-universe'
const SCOPES = 'openid profile story:read story:write'

export type Session = {
	baseUrl: string
	clientId: string
	accessToken: string
	/** Epoch milliseconds. */
	accessExpiresAt: number
	refreshToken: string
	username?: string
}

type Metadata = {
	issuer: string
	authorization_endpoint: string
	token_endpoint: string
	registration_endpoint: string
	revocation_endpoint: string
}

export type PendingSignIn = Started & {
	baseUrl: string
	metadata: Metadata
	clientId: string
	redirectUri: string
	verifier: string
}

type TokenResponse = { access_token: string; expires_in: number; refresh_token: string; id_token?: string }

export class OAuthError extends Error {
	constructor(
		readonly code: string,
		message: string,
	) {
		super(message)
	}
}

async function post<T>(url: string, body: { json: unknown } | { form: Record<string, string> }) {
	const response = await requestUrl({
		url,
		method: 'POST',
		contentType: 'json' in body ? 'application/json' : 'application/x-www-form-urlencoded',
		body: 'json' in body ? JSON.stringify(body.json) : new URLSearchParams(body.form).toString(),
		throw: false,
	})
	let json: Record<string, unknown> = {}
	try {
		json = response.json as Record<string, unknown>
	} catch {
		/* a non-JSON failure still gets its status below */
	}
	if (response.status >= 400) {
		const code = typeof json.error === 'string' ? json.error : `http_${response.status}`
		const description = typeof json.error_description === 'string' ? json.error_description : undefined
		throw new OAuthError(code, description ?? `Literary Universe refused the sign-in (${code}).`)
	}
	return json as T
}

async function discover(baseUrl: string) {
	const response = await requestUrl({ url: `${baseUrl}/.well-known/oauth-authorization-server`, throw: false })
	if (response.status !== 200)
		throw new OAuthError('unavailable', `${baseUrl} doesn't offer sign-in. Check the server in the plugin settings.`)
	return response.json as Metadata
}

const session = (baseUrl: string, clientId: string, token: TokenResponse, username?: string): Session => ({
	baseUrl,
	clientId,
	accessToken: token.access_token,
	accessExpiresAt: Date.now() + token.expires_in * 1000,
	refreshToken: token.refresh_token,
	username: usernameFromIdToken(token.id_token) ?? username,
})

/**
 * Registers this Obsidian as its own client and returns the page to open.
 * Each vault registers separately, and the vault name in the redirect sends the
 * browser back to the vault that asked.
 */
export async function startSignIn(baseUrl: string, vault: string) {
	const metadata = await discover(baseUrl)
	const redirectUri = `${baseUrl}/api/obsidian/callback?${new URLSearchParams({ vault })}`
	const { client_id: clientId } = await post<{ client_id: string }>(metadata.registration_endpoint, {
		json: {
			client_name: 'Literary Universe for Obsidian',
			redirect_uris: [redirectUri],
			token_endpoint_auth_method: 'none',
			grant_types: ['authorization_code', 'refresh_token'],
			response_types: ['code'],
			scope: SCOPES,
		},
	})
	const pending: PendingSignIn = {
		baseUrl,
		metadata,
		issuer: metadata.issuer,
		clientId,
		redirectUri,
		state: randomToken(),
		verifier: randomToken(),
	}
	const url = new URL(metadata.authorization_endpoint)
	url.search = new URLSearchParams({
		response_type: 'code',
		client_id: clientId,
		redirect_uri: redirectUri,
		scope: SCOPES,
		state: pending.state,
		code_challenge: await codeChallenge(pending.verifier),
		code_challenge_method: 'S256',
	}).toString()
	return { pending, url: url.href }
}

export async function finishSignIn(pending: PendingSignIn, code: string) {
	const token = await post<TokenResponse>(pending.metadata.token_endpoint, {
		form: {
			grant_type: 'authorization_code',
			code,
			client_id: pending.clientId,
			redirect_uri: pending.redirectUri,
			code_verifier: pending.verifier,
		},
	})
	return session(pending.baseUrl, pending.clientId, token)
}

/** Refresh tokens rotate: save the returned session before using it. */
export async function refreshSession(current: Session) {
	const metadata = await discover(current.baseUrl)
	const token = await post<TokenResponse>(metadata.token_endpoint, {
		form: { grant_type: 'refresh_token', refresh_token: current.refreshToken, client_id: current.clientId },
	})
	return session(current.baseUrl, current.clientId, token, current.username)
}

export async function revokeSession(current: Session) {
	const metadata = await discover(current.baseUrl)
	await post(metadata.revocation_endpoint, {
		form: { token: current.refreshToken, token_type_hint: 'refresh_token', client_id: current.clientId },
	})
}
