import assert from 'node:assert/strict'
import test from 'node:test'

import { createReactActWarningDetector } from './frontend-test-warning-gate.mjs'

const ACT_WARNING = 'An update to Example inside a test was not wrapped in act(...).'

void test('accepts frontend test output without React act warnings', () => {
  const detector = createReactActWarningDetector()
  detector.write('Test Files 137 passed\n')
  assert.equal(detector.hasWarning(), false)
})

void test('detects a complete React act warning', () => {
  const detector = createReactActWarningDetector()
  detector.write(ACT_WARNING)
  assert.equal(detector.hasWarning(), true)
})

void test('allows unrelated React and application warnings', () => {
  const detector = createReactActWarningDetector()
  detector.write('Warning: Failed to sample palette preview row.\n')
  detector.write('[webview][WARN] Launcher settings save failed\n')
  assert.equal(detector.hasWarning(), false)
})

void test('does not combine warning markers that appear in reverse order', () => {
  const detector = createReactActWarningDetector()
  detector.write('inside a test was not wrapped in act(...).')
  detector.write('An update to a separate diagnostic')
  assert.equal(detector.hasWarning(), false)
})

void test('detects React act warnings split across stderr chunks', () => {
  const detector = createReactActWarningDetector()
  detector.write('An update to Example inside a test was not wrapped')
  detector.write(' in act(...).')
  assert.equal(detector.hasWarning(), true)
})
