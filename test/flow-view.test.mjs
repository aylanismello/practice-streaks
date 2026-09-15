import test from 'node:test';
import assert from 'node:assert/strict';
import { flowViewFromSearch, hrefForFlowView } from '../src/lib/flow-view.ts';

test('reads timer widget and fullscreen states from the URL', () => {
  assert.equal(flowViewFromSearch(''), 'closed');
  assert.equal(flowViewFromSearch('?timer=widget'), 'widget');
  assert.equal(flowViewFromSearch('?timer=full'), 'full');
  assert.equal(flowViewFromSearch('?timer=wat'), 'closed');
});

test('updates only the timer query parameter', () => {
  const href = 'https://example.com/?form=chen18#today';
  assert.equal(hrefForFlowView(href, 'widget'), '/?form=chen18&timer=widget#today');
  assert.equal(hrefForFlowView(href, 'full'), '/?form=chen18&timer=full#today');
  assert.equal(hrefForFlowView('https://example.com/?form=chen18&timer=full', 'closed'), '/?form=chen18');
});
