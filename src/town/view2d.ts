import { clampScale, createCamera } from './camera';
import { attachTownInput } from './input';
import { TownRenderer } from './renderer';
import type { TownView, TownViewOptions } from './view';

/** The flat isometric map: the fallback for devices that can't draw the 3D town. */
export function createView2D(options: TownViewOptions): TownView {
  const { canvas, town, onChange, onSelect, onHover } = options;
  const renderer = new TownRenderer(canvas, town);
  let camera = createCamera(1, 1);
  let width = 0;
  let height = 0;
  let framed = false;

  attachTownInput({ canvas, getCamera: () => camera, renderer, onCameraChange: onChange, onHover, onSelect });

  /** Centre the town and zoom out just enough that every building and label fits. */
  const recenter = () => {
    if (width < 2 || height < 2) return;
    const box = renderer.buildingBounds();
    const pad = 16;
    const fit = Math.min((width - pad * 2) / (box.maxX - box.minX), (height - pad * 2) / (box.maxY - box.minY));
    camera = createCamera(width, height);
    camera.scale = clampScale(Math.min(width < 700 ? 0.9 : 1.15, fit));
    camera.x = width / 2 - ((box.minX + box.maxX) / 2) * camera.scale;
    camera.y = height / 2 - ((box.minY + box.maxY) / 2) * camera.scale;
    framed = true;
  };

  return {
    kind: '2d',
    setTown: (next) => renderer.setTown(next),
    setCues: (cues) => renderer.setCues(cues),
    setClock: (hour) => renderer.setClock(hour),
    setHover: (id) => renderer.setHover(id),
    resize(w, h) {
      width = w;
      height = h;
      renderer.resize(w, h);
      if (!framed) recenter();
    },
    recenter,
    render: (now) => renderer.draw(camera, now),
    pick(clientX, clientY) {
      const rect = canvas.getBoundingClientRect();
      return renderer.hitTest(clientX - rect.left, clientY - rect.top, camera);
    },
    focus(building) {
      // Above the middle, so the building sheet sliding up from the bottom doesn't cover it.
      const [x, y] = renderer.anchorOf(building);
      camera.x = width / 2 - x * camera.scale;
      camera.y = height * 0.38 - y * camera.scale;
    },
    busy: () => false,
  };
}
