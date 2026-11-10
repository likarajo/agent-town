import { panCamera, zoomAt } from './camera';
import type { TownRenderer } from './renderer';
import type { CameraState, TownBuilding } from './types';

interface PointerState {
  id: number;
  x: number;
  y: number;
}

export function attachTownInput(options: {
  canvas: HTMLCanvasElement;
  getCamera: () => CameraState;
  renderer: TownRenderer;
  onSelect: (building: TownBuilding | null) => void;
  onCameraChange: () => void;
}): () => void {
  const { canvas, getCamera, renderer, onSelect, onCameraChange } = options;
  const pointers = new Map<number, PointerState>();
  let lastPinchDist = 0;
  let dragging = false;
  let moved = false;
  let downX = 0;
  let downY = 0;

  const redraw = () => onCameraChange();

  const onPointerDown = (e: PointerEvent) => {
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { id: e.pointerId, x: e.clientX, y: e.clientY });
    if (pointers.size === 1) {
      dragging = true;
      moved = false;
      downX = e.clientX;
      downY = e.clientY;
    } else if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      lastPinchDist = Math.hypot(a.x - b.x, a.y - b.y);
    }
  };

  const onPointerMove = (e: PointerEvent) => {
    if (!pointers.has(e.pointerId)) return;
    const prev = pointers.get(e.pointerId)!;
    const next = { id: e.pointerId, x: e.clientX, y: e.clientY };
    pointers.set(e.pointerId, next);

    const rect = canvas.getBoundingClientRect();
    const localX = e.clientX - rect.left;
    const localY = e.clientY - rect.top;

    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      if (lastPinchDist > 0) {
        const factor = dist / lastPinchDist;
        const midX = (a.x + b.x) / 2 - rect.left;
        const midY = (a.y + b.y) / 2 - rect.top;
        zoomAt(getCamera(), midX, midY, factor);
        redraw();
      }
      lastPinchDist = dist;
      moved = true;
      return;
    }

    if (dragging && pointers.size === 1) {
      const dx = next.x - prev.x;
      const dy = next.y - prev.y;
      if (Math.hypot(e.clientX - downX, e.clientY - downY) > 6) moved = true;
      panCamera(getCamera(), dx, dy);
      redraw();
    } else {
      const hit = renderer.hitTest(localX, localY, getCamera());
      renderer.setHover(hit?.id ?? null);
      canvas.style.cursor = hit ? 'pointer' : 'grab';
      redraw();
    }
  };

  const onPointerUp = (e: PointerEvent) => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) lastPinchDist = 0;
    if (pointers.size === 0) {
      if (dragging && !moved) {
        const rect = canvas.getBoundingClientRect();
        const hit = renderer.hitTest(e.clientX - rect.left, e.clientY - rect.top, getCamera());
        onSelect(hit);
      }
      dragging = false;
    }
  };

  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const factor = e.deltaY < 0 ? 1.08 : 1 / 1.08;
    zoomAt(getCamera(), e.clientX - rect.left, e.clientY - rect.top, factor);
    redraw();
  };

  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerUp);
  canvas.addEventListener('wheel', onWheel, { passive: false });

  return () => {
    canvas.removeEventListener('pointerdown', onPointerDown);
    canvas.removeEventListener('pointermove', onPointerMove);
    canvas.removeEventListener('pointerup', onPointerUp);
    canvas.removeEventListener('pointercancel', onPointerUp);
    canvas.removeEventListener('wheel', onWheel);
  };
}
