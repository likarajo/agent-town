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
  /** Mouse or pen over a building (or nothing), with the pointer's client position. */
  onHover?: (building: TownBuilding | null, clientX: number, clientY: number) => void;
}): () => void {
  const { canvas, getCamera, renderer, onSelect, onCameraChange, onHover } = options;
  const pointers = new Map<number, PointerState>();
  let lastPinchDist = 0;
  let dragging = false;
  let moved = false;
  let downX = 0;
  let downY = 0;
  let hoverId: string | null = null;

  const redraw = () => onCameraChange();

  const hover = (building: TownBuilding | null, clientX = 0, clientY = 0) => {
    onHover?.(building, clientX, clientY);
    const id = building?.id ?? null;
    if (id === hoverId) return;
    hoverId = id;
    renderer.setHover(id);
    canvas.style.cursor = building ? 'pointer' : 'grab';
    redraw();
  };

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
    const rect = canvas.getBoundingClientRect();

    if (!pointers.has(e.pointerId)) {
      if (e.pointerType !== 'touch') {
        hover(renderer.hitTest(e.clientX - rect.left, e.clientY - rect.top, getCamera()), e.clientX, e.clientY);
      }
      return;
    }

    const prev = pointers.get(e.pointerId)!;
    const next = { id: e.pointerId, x: e.clientX, y: e.clientY };
    pointers.set(e.pointerId, next);

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
      hover(null);
      return;
    }

    if (dragging && pointers.size === 1) {
      const dx = next.x - prev.x;
      const dy = next.y - prev.y;
      if (Math.hypot(e.clientX - downX, e.clientY - downY) > 6) {
        moved = true;
        hover(null);
      }
      panCamera(getCamera(), dx, dy);
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

  const onPointerLeave = () => hover(null);

  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const factor = e.deltaY < 0 ? 1.08 : 1 / 1.08;
    zoomAt(getCamera(), e.clientX - rect.left, e.clientY - rect.top, factor);
    hover(null);
    redraw();
  };

  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerUp);
  canvas.addEventListener('pointerleave', onPointerLeave);
  canvas.addEventListener('wheel', onWheel, { passive: false });

  return () => {
    canvas.removeEventListener('pointerdown', onPointerDown);
    canvas.removeEventListener('pointermove', onPointerMove);
    canvas.removeEventListener('pointerup', onPointerUp);
    canvas.removeEventListener('pointercancel', onPointerUp);
    canvas.removeEventListener('pointerleave', onPointerLeave);
    canvas.removeEventListener('wheel', onWheel);
  };
}
