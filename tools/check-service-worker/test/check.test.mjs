import { test } from 'node:test'
import assert from 'node:assert/strict'

import { checkServiceWorker } from '../src/check.mjs'

const goodSw = `
const CACHE_NAME = 'app-v3'
const CORE_ASSETS = ['/', '/logo.svg']
self.addEventListener('fetch', (event) => {
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).catch(() => caches.match('/')))
  }
})
`

test('accepts a well-formed service worker', () => {
  const { problems, summary } = checkServiceWorker({
    swSource: goodSw,
    resolveAsset: (url) => url,
    exists: () => true,
  })
  assert.deepEqual(problems, [])
  assert.equal(summary.cacheName, 'app-v3')
  assert.equal(summary.coreCount, 2)
})

test('flags a CACHE_NAME with no version token', () => {
  const { problems } = checkServiceWorker({
    swSource: goodSw.replace('app-v3', 'app'),
    exists: () => true,
  })
  assert.ok(problems.some((p) => /no version number/.test(p)))
})

test('flags a missing navigate branch', () => {
  const { problems } = checkServiceWorker({
    swSource: goodSw.replace("event.request.mode === 'navigate'", 'false'),
    exists: () => true,
  })
  assert.ok(problems.some((p) => /navigate/.test(p)))
})

test('flags a CORE_ASSETS entry that does not resolve', () => {
  const { problems } = checkServiceWorker({
    swSource: goodSw,
    resolveAsset: (url) => url,
    exists: (path) => path !== '/logo.svg',
  })
  assert.equal(problems.length, 1)
  assert.match(problems[0], /\/logo\.svg/)
})

test('flags a missing CORE_ASSETS array', () => {
  const { problems } = checkServiceWorker({
    swSource: goodSw.replace(/const CORE_ASSETS[\s\S]*?\]/, ''),
    exists: () => true,
  })
  assert.ok(problems.some((p) => /no CORE_ASSETS/.test(p)))
})
