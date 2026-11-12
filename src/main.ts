import townJson from './data/town.json';
import { getDataMode, loadActivity, loadAllCues } from './github/client';
import { registerPwa } from './pwa';
import { createCamera } from './town/camera';
import { attachTownInput } from './town/input';
import { tileToScreen } from './town/iso';
import { TownRenderer } from './town/renderer';
import type { CameraState, TownData } from './town/types';
import { wireSettings } from './ui/settings';
import { closeSheet, openSheet } from './ui/sheet';

const town = townJson as TownData;

const canvas = document.querySelector<HTMLCanvasElement>('#town-canvas')!;
const sheet = document.querySelector<HTMLElement>('#sheet')!;
const sheetBody = document.querySelector<HTMLElement>('#sheet-body')!;
const badge = document.querySelector<HTMLElement>('#data-mode-badge')!;
const settingsDialog = document.querySelector<HTMLDialogElement>('#settings-dialog')!;
const settingsBtn = document.querySelector<HTMLElement>('#btn-settings')!;
const sheetClose = document.querySelector<HTMLElement>('#sheet-close')!;
const hint = document.querySelector<HTMLElement>('#gesture-hint')!;

const renderer = new TownRenderer(canvas, town);
let camera: CameraState = createCamera(1, 1);
let raf = 0;
let didCenterCamera = false;
let selectionId = 0;

function updateBadge(): void {
  const mode = getDataMode();
  badge.textContent = mode === 'live' ? 'Live on this device' : 'Sample data';
  badge.classList.toggle('live', mode === 'live');
  badge.classList.toggle('sample', mode === 'sample');
  badge.title =
    mode === 'live'
      ? 'A token is stored in localStorage on this device. Public visitors still only see sample data until they add their own token.'
      : 'Public visitors always see labelled sample/placeholder data.';
}

function scheduleDraw(): void {
  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(() => renderer.draw(camera));
}

/** Place the plaza (town center) in the middle of the viewport. */
function centerOnTown(width: number, height: number): void {
  const plaza = town.buildings.find((b) => b.id === 'grok') ?? town.buildings[0];
  const focus = tileToScreen(plaza.q, plaza.r, town.ground.tileW, town.ground.tileH);
  camera = createCamera(width, height);
  camera.scale = width < 700 ? 0.9 : 1.15;
  camera.x = width / 2 - focus.x * camera.scale;
  camera.y = height * 0.46 - focus.y * camera.scale;
}

function resize(): void {
  const stage = canvas.parentElement!;
  const w = stage.clientWidth;
  const h = stage.clientHeight;
  renderer.resize(w, h);
  if (!didCenterCamera && w > 1 && h > 1) {
    centerOnTown(w, h);
    didCenterCamera = true;
  }
  scheduleDraw();
}

async function refreshCues(): Promise<void> {
  const cues = await loadAllCues(town.buildings.map((b) => b.id));
  renderer.setCues(cues);
  scheduleDraw();
}

attachTownInput({
  canvas,
  getCamera: () => camera,
  renderer,
  onCameraChange: scheduleDraw,
  onSelect: async (building) => {
    const selection = ++selectionId;
    if (!building) {
      closeSheet(sheet);
      return;
    }
    hint.style.opacity = '0';
    const activity = await loadActivity(building.id);
    if (selection !== selectionId) return;
    openSheet(sheet, sheetBody, building, activity);
  },
});

sheetClose.addEventListener('click', () => {
  selectionId++;
  closeSheet(sheet);
});

wireSettings({
  dialog: settingsDialog,
  openButton: settingsBtn,
  onChanged: () => {
    updateBadge();
    void refreshCues();
  },
});

window.addEventListener('resize', resize);
updateBadge();
resize();
void refreshCues();
void registerPwa();

// Gentle idle cue: subtle canvas redraw keeps lit-window feel fresh after cue load
setTimeout(() => scheduleDraw(), 300);
