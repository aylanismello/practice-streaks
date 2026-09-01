import assert from "node:assert/strict";
import test from "node:test";

import {
  effectiveWotScore,
  formatWotScoreLabel,
  normalizeWotScore,
  wotScoreCssColor,
  wotStorageFields,
} from "../src/lib/wot.ts";

test("accepts whole and half-step WOT scores only", () => {
  assert.equal(normalizeWotScore(3.5), 3.5);
  assert.equal(normalizeWotScore("2.5"), 2.5);
  assert.equal(normalizeWotScore(3.2), null);
  assert.equal(normalizeWotScore(5.5), null);
});

test("round-trips half scores through the integer-schema bridge", () => {
  const stored = wotStorageFields(3.5);
  assert.deepEqual(stored, { score: 3, color: "yellow", legacy_color: "3.5" });
  assert.equal(effectiveWotScore(stored), 3.5);
});

test("whole scores clear the bridge and retain existing behavior", () => {
  const stored = wotStorageFields(4);
  assert.deepEqual(stored, { score: 4, color: "yellow_green", legacy_color: null });
  assert.equal(effectiveWotScore(stored), 4);
});

test("half scores have exact labels and distinct display colors", () => {
  assert.equal(formatWotScoreLabel(2.5), "2.5/5");
  assert.notEqual(wotScoreCssColor(2.5), wotScoreCssColor(2));
  assert.notEqual(wotScoreCssColor(2.5), wotScoreCssColor(3));
});
