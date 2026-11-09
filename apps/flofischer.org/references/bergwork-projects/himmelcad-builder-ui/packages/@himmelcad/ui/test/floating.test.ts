import assert from 'node:assert/strict';
import test from 'node:test';

import { placeAnchored, placeAtPoint, shiftInside } from '../src/floating.js';

// A 1000 × 800 window inside the 8 px margin.
const bounds = { left: 8, top: 8, right: 992, bottom: 792 };
const box = (left: number, top: number, width: number, height: number) => ({
  left,
  top,
  right: left + width,
  bottom: top + height,
});

test('anchored surfaces open on the preferred side when it has the room', () => {
  const placed = placeAnchored(box(100, 100, 40, 30), { width: 200, height: 300 }, bounds, {
    side: 'bottom',
    align: 'start',
    gap: 4,
  });
  assert.deepEqual(placed, { x: 100, y: 134, side: 'bottom' });
});

test('anchored surfaces flip to the other side near the bottom and the right edge', () => {
  const below = placeAnchored(box(100, 700, 40, 30), { width: 200, height: 300 }, bounds, {
    side: 'bottom',
    gap: 4,
  });
  assert.equal(below.side, 'top');
  assert.equal(below.y, 700 - 4 - 300);
  const beside = placeAnchored(box(900, 100, 40, 30), { width: 200, height: 100 }, bounds, {
    side: 'right',
    align: 'start',
    gap: 6,
  });
  assert.equal(beside.side, 'left');
  assert.equal(beside.x, 900 - 6 - 200);
  assert.equal(beside.y, 100);
});

test('along the edge the surface shifts back inside the window', () => {
  const centred = placeAnchored(box(980, 100, 10, 20), { width: 240, height: 40 }, bounds, {
    side: 'bottom',
    align: 'center',
  });
  assert.equal(centred.x, 992 - 240);
  const left = placeAnchored(box(0, 100, 10, 20), { width: 240, height: 40 }, bounds, {
    side: 'bottom',
    align: 'center',
  });
  assert.equal(left.x, 8);
  const tall = placeAnchored(box(100, 760, 300, 20), { width: 100, height: 200 }, bounds, {
    side: 'right',
    align: 'start',
  });
  assert.equal(tall.y, 792 - 200);
});

test('a surface taller than both sides takes the roomier one and scrolls', () => {
  const placed = placeAnchored(box(100, 500, 40, 30), { width: 200, height: 900 }, bounds, {
    side: 'bottom',
    gap: 4,
  });
  assert.equal(placed.side, 'top');
  assert.equal(placed.maxHeight, 500 - 4 - 8);
  assert.equal(placed.y, 8);
});

test('a surface wider than the window is limited to it', () => {
  const placed = placeAnchored(box(10, 10, 40, 30), { width: 1200, height: 100 }, bounds, {
    side: 'bottom',
  });
  assert.equal(placed.x, 8);
  assert.equal(placed.maxWidth, 984);
});

test('context menus open below right of the pointer and flip at the edges and corners', () => {
  const size = { width: 200, height: 260 };
  assert.deepEqual(placeAtPoint(300, 200, size, bounds), { x: 300, y: 200, side: 'bottom' });
  const corner = placeAtPoint(980, 780, size, bounds);
  assert.equal(corner.x, 980 - 200);
  assert.equal(corner.y, 780 - 260);
  assert.equal(corner.side, 'top');
  // A pointer inside the margin: flipped, and the margin is kept.
  const edge = placeAtPoint(995, 795, size, bounds);
  assert.deepEqual([edge.x, edge.y], [992 - 200, 792 - 260]);
  const bottomLeft = placeAtPoint(2, 790, size, bounds);
  // The pointer is inside the margin: the menu still keeps 8 px from the edge.
  assert.equal(bottomLeft.x, 8);
  assert.equal(bottomLeft.y, 790 - 260);
  const middleOfShortWindow = placeAtPoint(500, 300, { width: 200, height: 700 }, bounds);
  assert.ok(middleOfShortWindow.y >= 8);
  assert.ok(middleOfShortWindow.y + (middleOfShortWindow.maxHeight ?? 700) <= 792);
});

test('a menu too wide for either side of the pointer shifts inside instead of shrinking', () => {
  // A phone: 390 px wide, the pointer in the middle, a 200 px menu.
  const phone = { left: 8, top: 8, right: 382, bottom: 836 };
  const placed = placeAtPoint(195, 300, { width: 200, height: 260 }, phone);
  assert.equal(placed.maxWidth, undefined);
  assert.equal(placed.x, 382 - 200);
  const beside = placeAnchored(box(150, 100, 90, 30), { width: 200, height: 40 }, phone, {
    side: 'right',
    gap: 6,
  });
  assert.equal(beside.maxWidth, undefined);
  assert.ok(beside.x >= 8 && beside.x + 200 <= 382);
});

test('shiftInside moves a self-placed surface back and limits its height', () => {
  assert.deepEqual(shiftInside(box(900, 100, 200, 100), bounds), { dx: -108, dy: 0 });
  assert.deepEqual(shiftInside(box(-20, 750, 100, 100), bounds), { dx: 28, dy: -58 });
  // Taller than the window: it keeps its top (below its trigger) and scrolls inside.
  assert.deepEqual(shiftInside(box(100, 100, 100, 900), bounds), {
    dx: 0,
    dy: 0,
    maxHeight: 692,
  });
  assert.deepEqual(shiftInside(box(100, -40, 100, 900), bounds), {
    dx: 0,
    dy: 48,
    maxHeight: 784,
  });
  assert.deepEqual(shiftInside(box(100, 100, 100, 100), bounds), { dx: 0, dy: 0 });
});
