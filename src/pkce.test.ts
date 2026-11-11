import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { test } from 'node:test'
import { callbackCode, codeChallenge, randomToken, usernameFromIdToken } from './pkce.ts'

test('the code challenge is the S256 of the verifier', async () => {
	const verifier = randomToken()
	assert.match(verifier, /^[A-Za-z0-9_-]{43}$/)
	assert.equal(await codeChallenge(verifier), createHash('sha256').update(verifier).digest('base64url'))
})

test('reads the username from the ID token, and nothing from junk', () => {
	const payload = Buffer.from(JSON.stringify({ sub: 'u1', preferred_username: 'Žofie' })).toString('base64url')
	assert.equal(usernameFromIdToken(`h.${payload}.s`), 'Žofie')
	assert.equal(usernameFromIdToken('not a token'), undefined)
	assert.equal(usernameFromIdToken(undefined), undefined)
})

test('only accepts the callback of the sign-in it started', () => {
	const started = { state: 's1', issuer: 'https://literaryuniverse.com' }
	assert.equal(callbackCode(started, { state: 's1', code: 'c', iss: started.issuer }), 'c')
	assert.equal(callbackCode(started, { state: 's1', code: 'c' }), 'c')
	assert.throws(() => callbackCode(undefined, { state: 's1', code: 'c' }), /not started here/)
	assert.throws(() => callbackCode(started, { state: 's2', code: 'c' }), /not started here/)
	assert.throws(() => callbackCode(started, { state: 's1', code: 'c', iss: 'https://evil.example' }), /another server/)
	assert.throws(() => callbackCode(started, { state: 's1', error: 'access_denied' }), /cancelled/)
	assert.throws(() => callbackCode(started, { state: 's1' }), /without a code/)
})
