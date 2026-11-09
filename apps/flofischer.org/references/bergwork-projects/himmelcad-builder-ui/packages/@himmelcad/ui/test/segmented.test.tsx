import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { Segmented } from '../src/Segmented.js';

const OPTIONS = [
  { value: 'one', label: 'One side' },
  { value: 'sym', label: 'Symmetric' },
  { value: 'two', label: 'Two sides', disabled: true },
] as const;

void test('segmented: one radiogroup track, radios with the checked one filled', () => {
  const html = renderToStaticMarkup(
    <Segmented aria-label="Sides" value="sym" options={OPTIONS} onChange={() => undefined} />,
  );
  assert.match(html, /role="radiogroup"[^>]*aria-label="Sides"/);
  assert.match(html, /data-segmented=""/);
  assert.equal((html.match(/role="radio"/g) ?? []).length, 3);
  // Only the checked segment is a tab stop (roving focus) and carries the selected style.
  assert.match(html, /aria-checked="true"[^>]*tabindex="0"[^>]*class="[^"]*selected/);
  assert.equal((html.match(/tabindex="0"/g) ?? []).length, 1);
  assert.match(html, /aria-checked="false"[^>]*disabled=""/, 'a disabled option');
  assert.match(html, />Symmetric</);
});

void test('segmented: fill spreads the segments over the container; icon options keep a name', () => {
  const html = renderToStaticMarkup(
    <Segmented
      aria-labelledby="lbl"
      fill
      value="l"
      options={[
        { value: 'l', label: <svg />, ariaLabel: 'Align left' },
        { value: 'r', label: <svg />, ariaLabel: 'Align right' },
      ]}
      onChange={() => undefined}
    />,
  );
  assert.match(html, /aria-labelledby="lbl"/);
  assert.match(html, /class="[^"]*fill/);
  assert.match(html, /aria-label="Align left"/);
  assert.match(html, /--hc-segmented-count:2/);
});
