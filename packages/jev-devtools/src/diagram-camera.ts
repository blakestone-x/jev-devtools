export type Point = { x: number; y: number };
export type Camera = Point & { scale: number };
export type Size = { width: number; height: number };
export const minScale = 0.1;
export const maxScale = 4;
const limit = (scale: number) => Math.max(minScale, Math.min(maxScale, scale));

export function fitCamera(view: Size, content: Size): Camera {
  const scale = limit(
    Math.min(
      (view.width - 48) / content.width,
      (view.height - 48) / content.height,
      1,
    ),
  );
  return {
    x: (view.width - content.width * scale) / 2,
    y: (view.height - content.height * scale) / 2,
    scale,
  };
}

/** Keep the content under `from` under `to`, including while a pinch moves. */
export function zoomCamera(
  camera: Camera,
  factor: number,
  from: Point,
  to = from,
): Camera {
  const scale = limit(camera.scale * factor);
  return {
    x: to.x - ((from.x - camera.x) * scale) / camera.scale,
    y: to.y - ((from.y - camera.y) * scale) / camera.scale,
    scale,
  };
}
