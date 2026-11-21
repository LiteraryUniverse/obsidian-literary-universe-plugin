import assert from 'node:assert/strict'
import { test } from 'node:test'
import { isHidden, missingScopes, parentFolders, slugify } from './helpers.ts'

test('dot-folders go through the adapter, notes through the vault', () => {
	assert.equal(isHidden('.lu/vault.json'), true)
	assert.equal(isHidden('Stories/.drafts/01 A.md'), true)
	assert.equal(isHidden('Stories/My Story/01 A.md'), false)
	assert.equal(isHidden('Universe.md'), false)
})

test('a write creates the folders above the file, outermost first', () => {
	assert.deepEqual(parentFolders('Encyclopedia/Places/Rome.md'), ['Encyclopedia', 'Encyclopedia/Places'])
	assert.deepEqual(parentFolders('Universe.md'), [])
})

test('a sign-in from plugin 0.1 lacks the universe and publishing permissions', () => {
	assert.deepEqual(missingScopes('openid profile story:read story:write'), [
		'story:publish',
		'universe:read',
		'universe:write',
		'universe:translate',
		'comic:read',
	])
	assert.deepEqual(
		missingScopes('openid profile story:read story:write story:publish universe:read universe:write universe:translate comic:read'),
		[],
	)
})

test('slugs are lowercase letters, digits and single hyphens', () => {
	assert.equal(slugify('Žluťoučký kůň: Part 2!'), 'zlutoucky-kun-part-2')
	assert.equal(slugify('  --  '), '')
})
