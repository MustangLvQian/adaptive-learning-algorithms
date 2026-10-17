import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as fs from 'node:fs'
import * as path from 'node:path'

import { checkTemplates, lintSvg, lintWxml, lintWxss } from '../src/lint.mjs'

test('lintWxss accepts a well-formed file', () => {
  assert.deepEqual(lintWxss('.a { color: red; }\n.b { color: blue; }'), [])
})

test('lintWxss catches a selector glued onto a closing brace', () => {
  const problems = lintWxss('.a { color: red; }.b { color: blue; }')
  assert.equal(problems.length, 1)
  assert.match(problems[0].message, /selector starts right after \}/)
})

test('lintWxss catches an unexpected closing brace', () => {
  const problems = lintWxss('.a { color: red; } }')
  assert.equal(problems.length, 1)
  assert.match(problems[0].message, /unexpected \}/)
})

test('lintWxss catches an unclosed block and ignores braces in comments', () => {
  const problems = lintWxss('/* { not a block } */\n.a { color: red;')
  assert.equal(problems.length, 1)
  assert.match(problems[0].message, /unclosed \{/)
})

test('lintWxml accepts balanced tags and void elements', () => {
  const wxml = '<view><image src="x.png" /><text>{{ a > b }}</text></view>'
  assert.deepEqual(lintWxml(wxml), [])
})

test('lintWxml catches a missing closing tag', () => {
  const problems = lintWxml('<view>\n<text>hi</text>')
  assert.equal(problems.length, 1)
  assert.match(problems[0].message, /<view> is never closed/)
})

test('lintWxml catches a mismatched close', () => {
  const problems = lintWxml('<view><text></view></text>')
  assert.ok(problems.some((p) => /closes <text>/.test(p.message)))
})

test('lintSvg flags a missing xmlns and intrinsic size', () => {
  const problems = lintSvg('<svg viewBox="0 0 10 10"><rect/></svg>')
  assert.ok(problems.some((p) => /xmlns/.test(p.message)))
  assert.ok(problems.some((p) => /width\/height/.test(p.message)))
})

test('lintSvg accepts a self-contained asset', () => {
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 10 10"><rect/></svg>'
  assert.deepEqual(lintSvg(svg), [])
})

test('checkTemplates walks a project and reports every problem type', () => {
  const root = mkdtempSync(join(tmpdir(), 'check-templates-'))
  writeFileSync(join(root, 'a.wxss'), '.a { color: red; }.b { color: blue; }')
  writeFileSync(join(root, 'a.wxml'), '<view><text></view>')
  mkdirSync(join(root, 'assets'))
  writeFileSync(join(root, 'assets', 'logo.svg'), '<svg viewBox="0 0 1 1"/>')

  const { counts, problems } = checkTemplates({ root, fs, path })
  assert.deepEqual(counts, { wxss: 1, wxml: 1, svg: 1 })
  // wxss: 1 glued selector; wxml: 1 mismatched close + 1 never closed;
  // svg: missing xmlns + missing width/height.
  assert.equal(problems.length, 5)
  assert.ok(problems.every((p) => typeof p.file === 'string' && p.line >= 1))
})
