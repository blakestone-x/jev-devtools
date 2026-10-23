import { test } from "node:test";
import assert from "node:assert/strict";
import { fitCamera, zoomCamera } from "../src/diagram-camera";

test("fit keeps wide and tall diagrams fully visible with room at every edge", () => {
  for (const content of [
    { width: 1120, height: 520 },
    { width: 1120, height: 1800 },
  ]) {
    const view = { width: 900, height: 420 };
    const camera = fitCamera(view, content);
    assert.ok(camera.x >= 23.99 && camera.y >= 23.99);
    assert.ok(camera.x + content.width * camera.scale <= view.width - 23.99);
    assert.ok(camera.y + content.height * camera.scale <= view.height - 23.99);
    assert.ok(camera.scale <= 1);
  }
});

test("zoom keeps the pointed-at diagram coordinate anchored, even at zoom limits", () => {
  const start = { x: -125, y: 70, scale: 0.8 };
  const pointer = { x: 300, y: 240 };
  const world = {
    x: (pointer.x - start.x) / start.scale,
    y: (pointer.y - start.y) / start.scale,
  };
  for (const factor of [1.2, 1 / 1.2, 100, 0.001]) {
    const next = zoomCamera(start, factor, pointer);
    assert.ok(Math.abs(next.x + world.x * next.scale - pointer.x) < 1e-9);
    assert.ok(Math.abs(next.y + world.y * next.scale - pointer.y) < 1e-9);
    assert.ok(next.scale >= 0.1 && next.scale <= 4);
  }
});

test("a moving pinch carries the content under its midpoint while scaling", () => {
  // The world origin starts at the first midpoint; it follows the fingers.
  const next = zoomCamera(
    { x: 100, y: 80, scale: 1 },
    2,
    { x: 100, y: 80 },
    { x: 140, y: 110 },
  );
  assert.equal(next.scale, 2);
  assert.equal(next.x, 140);
  assert.equal(next.y, 110);
});
