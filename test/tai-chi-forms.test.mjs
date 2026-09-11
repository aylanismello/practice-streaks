import assert from "node:assert/strict";
import test from "node:test";

import { CHEN18_LESSONS } from "../src/lib/tai-chi-forms.ts";

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
