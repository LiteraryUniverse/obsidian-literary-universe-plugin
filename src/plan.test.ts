import assert from 'node:assert/strict'
import { test } from 'node:test'
import { chapterFileName, headerChanged, operationId, pullAction, safeName } from './plan.ts'

const pulled = { version: 'v1', hash: 'h1', updatedAt: '2026-11-01' }

test('pull never overwrites an edited note', () => {
	assert.equal(pullAction(undefined, undefined, 'v1', 'h1'), 'create')
	assert.equal(pullAction(pulled, 'h1', 'v1', 'h1'), 'skip')
	assert.equal(pullAction(pulled, 'h2', 'v1', 'h1'), 'keep')
	assert.equal(pullAction(pulled, 'h1', 'v2', 'h3'), 'overwrite')
	assert.equal(pullAction(pulled, 'h2', 'v2', 'h3'), 'conflict')
})

test('a note that already matches the server is not a conflict', () => {
	// The push landed but its response was lost: same text, newer version.
	assert.equal(pullAction(pulled, 'h2', 'v2', 'h2'), 'overwrite')
})

test('a chapter is fetched again only when its header changed', () => {
	assert.equal(headerChanged(pulled, '2026-11-01'), false)
	assert.equal(headerChanged(pulled, '2026-11-02'), true)
	assert.equal(headerChanged(pulled, null), true)
	assert.equal(headerChanged(undefined, '2026-11-01'), true)
})

test('names are safe on every platform', () => {
	assert.equal(safeName('A/B: "C"? #1 [x]', 'f'), 'A B C 1 x')
	assert.equal(safeName(' ..  ', 'Untitled'), 'Untitled')
	assert.equal(chapterFileName(3, 'The End.'), '03 The End')
})

test('operation IDs repeat for a retry and differ for a new save', async () => {
	const id = await operationId('c1', 'en', 'v1', 'h1')
	assert.match(id, /^[a-f0-9]{64}$/)
	assert.equal(id, await operationId('c1', 'en', 'v1', 'h1'))
	assert.notEqual(id, await operationId('c1', 'en', 'v2', 'h1'))
	assert.notEqual(id, await operationId('c1', 'en', 'v1', 'h2'))
})
