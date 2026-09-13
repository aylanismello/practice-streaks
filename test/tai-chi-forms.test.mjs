import assert from "node:assert/strict";
import test from "node:test";

import {
  buildYang24Lessons,
  CHEN18_LESSONS,
  EIGHT_BROCADES_LESSONS,
  formatTaiChiTimestamp,
  getYouTubeVideoId,
  parseTaiChiFormId,
  SIX_HEALING_SOUNDS_LESSONS,
  TAI_CHI_10_LESSONS,
} from "../src/lib/tai-chi-forms.ts";

test("parses form IDs from shareable URLs and defaults invalid values to Yang 24", () => {
  assert.equal(parseTaiChiFormId("chen18"), "chen18");
  assert.equal(parseTaiChiFormId("six_healing_sounds"), "six_healing_sounds");
  assert.equal(parseTaiChiFormId("nope"), "yang24");
  assert.equal(parseTaiChiFormId(null), "yang24");
});

test("maps the final 18 playlist videos to Chen movements 1 through 18", () => {
  assert.equal(CHEN18_LESSONS.length, 18);
  assert.deepEqual(CHEN18_LESSONS.map((lesson) => lesson.number), Array.from({ length: 18 }, (_, index) => index + 1));
  assert.equal(new Set(CHEN18_LESSONS.map((lesson) => lesson.youtubeUrl)).size, 18);
});

test("matches the numbered titles that confirm the playlist offset", () => {
  assert.equal(CHEN18_LESSONS[8].youtubeUrl, "https://youtu.be/bP--0jW4FCk");
  assert.equal(CHEN18_LESSONS[11].youtubeUrl, "https://youtu.be/7FIVkbZKDvQ");
  assert.equal(CHEN18_LESSONS[12].youtubeUrl, "https://youtu.be/wia28Uscw5Q");
});

test("maps each single-video practice to its FangYuan playlist video", () => {
  assert.deepEqual(
    [TAI_CHI_10_LESSONS, SIX_HEALING_SOUNDS_LESSONS, EIGHT_BROCADES_LESSONS]
      .map((lessons) => lessons.map((lesson) => lesson.youtubeUrl)),
    [
      ["https://youtu.be/f3m-ZImsr_M"],
      ["https://youtu.be/54jCN0Dq0JQ"],
      ["https://youtu.be/8-bZxZZuZwY"],
    ]
  );
});

test("combines Yang movements 7 and 8 into one linked lesson", () => {
  const lessons = buildYang24Lessons([
    { move_number: 7, youtube_url: "https://youtu.be/gxv5bYlv-iY" },
    { move_number: 8, youtube_url: "https://youtu.be/gxv5bYlv-iY" },
  ]);
  assert.equal(lessons.length, 23);
  assert.equal(lessons.find((lesson) => lesson.number === 7)?.label, "7–8");
  assert.equal(lessons.find((lesson) => lesson.number === 7)?.youtubeUrl, "https://youtu.be/gxv5bYlv-iY");
  assert.equal(lessons.some((lesson) => lesson.number === 8), false);
});

test("extracts canonical YouTube video ids", () => {
  assert.equal(getYouTubeVideoId("https://youtu.be/BYkm7iV3VRE?t=2"), "BYkm7iV3VRE");
  assert.equal(getYouTubeVideoId("https://www.youtube.com/watch?v=heZU2hE5ldM&list=ignored"), "heZU2hE5ldM");
  assert.equal(getYouTubeVideoId("not-a-url"), null);
});

test("formats study-mark timestamps", () => {
  assert.equal(formatTaiChiTimestamp(0), "0:00");
  assert.equal(formatTaiChiTimestamp(65.9), "1:05");
  assert.equal(formatTaiChiTimestamp(3661), "1:01:01");
});
