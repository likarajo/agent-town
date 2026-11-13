import { createDataSource, loadActivity, loadAllCues } from './github/client';
import type { TownDataSource } from './github/types';
import { hasToken } from './privacy/tokenStore';
import { registerPwa } from './pwa';
import {
  LOADING_REASON,
  loadingTown,
  loadTown,
  SAMPLE_ROSTER_MARKDOWN,
  sampleTown,
  type TownLoad,
} from './roster/load';
import { clampScale, createCamera } from './town/camera';
import { attachTownInput } from './town/input';
import { TownRenderer } from './town/renderer';
import type { ActivityCue, CameraState, TownBuilding } from './town/types';
import { wireSettings } from './ui/settings';
import { closeSheet, openPlaceholderSheet, openRosterSheet, openSheet } from './ui/sheet';

const canvas = document.querySelector<HTMLCanvasElement>('#town-canvas')!;
const sheet = document.querySelector<HTMLElement>('#sheet')!;
const sheetBody = document.querySelector<HTMLElement>('#sheet-body')!;
const badge = document.querySelector<HTMLElement>('#data-mode-badge')!;
const banner = document.querySelector<HTMLElement>('#town-banner')!;
const bannerText = document.querySelector<HTMLElement>('#town-banner-text')!;
const bannerSettings = document.querySelector<HTMLElement>('#town-banner-settings')!;
const tooltip = document.querySelector<HTMLElement>('#town-tooltip')!;
const settingsDialog = document.querySelector<HTMLDialogElement>('#settings-dialog')!;
const settingsBtn = document.querySelector<HTMLElement>('#btn-settings')!;
const sheetClose = document.querySelector<HTMLElement>('#sheet-close')!;
const hint = document.querySelector<HTMLElement>('#gesture-hint')!;

// With a token, start from grey placeholders so sample bots never stand in for real ones.
const initialLoad: TownLoad = { mode: 'sample', town: hasToken() ? loadingTown() : sampleTown() };
const renderer = new TownRenderer(canvas, initialLoad.town);
/** What the town shows right now; null while the owner's roster loads. */
let current: TownLoad | null = hasToken() ? null : initialLoad;
let source: TownDataSource = createDataSource(initialLoad);
let cues: Record<string, ActivityCue> = {};
let camera: CameraState = createCamera(1, 1);
let raf = 0;
let didCenterCamera = false;
let selectionId = 0;
let loadId = 0;

function updateBadge(load: TownLoad | null): void {
  const mode = load?.mode ?? 'loading';
  badge.textContent = {
    loading: 'Loading…',
    sample: 'Sample data',
    error: 'Not loaded',
    live: `Live · ${load?.town.buildings.length ?? 0} bots`,
  }[mode];
  badge.classList.toggle('live', mode === 'live');
  badge.classList.toggle('error', mode === 'error');
  badge.classList.toggle('sample', mode === 'sample' || mode === 'loading');
  badge.title =
    load?.mode === 'live'
      ? `Your roster (${load.source}), loaded with the token on this device. Click to see your bots.`
      : load?.mode === 'error'
        ? `${load.reason} Click for details.`
        : load
          ? 'Sample bots and activity. Click to see the sample data.'
          : LOADING_REASON;
}

function showBanner(text: string | undefined, kind: 'info' | 'error' = 'info'): void {
  banner.hidden = !text;
  banner.classList.toggle('error', kind === 'error');
  bannerText.textContent = text ?? '';
  bannerSettings.hidden = kind !== 'error';
}

/** A grey building's reason: the roster's for stand-ins, the bot's own for a failed load. */
function placeholderReason(building: TownBuilding): string | undefined {
  if (building.placeholderReason !== undefined) return building.placeholderReason;
  const error = cues[building.id]?.error;
  return error ? `${building.name}: ${error}` : undefined;
}

function showTooltip(building: TownBuilding | null, clientX: number, clientY: number): void {
  const reason = building ? placeholderReason(building) : undefined;
  tooltip.hidden = !reason;
  if (!reason) return;
  tooltip.textContent = reason;
  tooltip.classList.toggle('error', reason !== LOADING_REASON);
  const stage = canvas.parentElement!.getBoundingClientRect();
  const left = Math.min(clientX - stage.left + 14, stage.width - tooltip.offsetWidth - 8);
  const top = Math.min(clientY - stage.top + 16, stage.height - tooltip.offsetHeight - 8);
  tooltip.style.left = `${Math.max(8, left)}px`;
  tooltip.style.top = `${Math.max(8, top)}px`;
}

function scheduleDraw(): void {
  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(() => renderer.draw(camera));
}

/** Center the town and zoom out just enough that every building and label fits. */
function centerOnTown(width: number, height: number): void {
  const box = renderer.buildingBounds();
  const pad = 16;
  const fit = Math.min((width - pad * 2) / (box.maxX - box.minX), (height - pad * 2) / (box.maxY - box.minY));
  camera = createCamera(width, height);
  camera.scale = clampScale(Math.min(width < 700 ? 0.9 : 1.15, fit));
  camera.x = width / 2 - ((box.minX + box.maxX) / 2) * camera.scale;
  camera.y = height / 2 - ((box.minY + box.maxY) / 2) * camera.scale;
}

function recenter(): void {
  const stage = canvas.parentElement!;
  if (stage.clientWidth > 1 && stage.clientHeight > 1) {
    centerOnTown(stage.clientWidth, stage.clientHeight);
    didCenterCamera = true;
  }
}

function resize(): void {
  const stage = canvas.parentElement!;
  renderer.resize(stage.clientWidth, stage.clientHeight);
  if (!didCenterCamera) recenter();
  scheduleDraw();
}

function statusFor(load: TownLoad): string {
  if (load.mode === 'live') return `Loaded ${load.town.buildings.length} bots from ${load.source}.`;
  if (load.mode === 'error') return load.reason;
  return 'No token saved, so the town shows sample bots.';
}

/** Load the sample town or the owner's roster, draw it, then light up buildings with activity. */
async function loadAndRender(): Promise<string> {
  const id = ++loadId;
  selectionId++;
  closeSheet(sheet);
  tooltip.hidden = true;

  if (hasToken()) {
    current = null;
    cues = {};
    renderer.setTown(loadingTown());
    updateBadge(null);
    showBanner(LOADING_REASON);
    recenter();
    scheduleDraw();
  }

  const load = await loadTown();
  if (id !== loadId) return statusFor(load);

  current = load;
  source = createDataSource(load);
  cues = {};
  renderer.setTown(load.town);
  recenter();
  updateBadge(load);
  showBanner(
    load.mode === 'error' ? "Couldn't load your roster. Hover or tap a grey building to see why." : undefined,
    'error',
  );
  scheduleDraw();

  if (load.mode !== 'error') {
    void loadAllCues(source, load.town.buildings).then((loaded) => {
      if (id !== loadId) return;
      cues = loaded;
      renderer.setCues(loaded);
      scheduleDraw();
    });
  }
  return statusFor(load);
}

/** Open one building's sheet: from a tap on the map or a row in the data panel. */
async function showBuilding(building: TownBuilding | null): Promise<void> {
  const selection = ++selectionId;
  tooltip.hidden = true;
  if (!building) {
    closeSheet(sheet);
    return;
  }
  hint.style.opacity = '0';
  if (building.placeholderReason !== undefined) {
    openPlaceholderSheet(sheet, sheetBody, building.placeholderReason, building.placeholderReason === LOADING_REASON);
    return;
  }
  const activity = await loadActivity(source, building);
  if (selection !== selectionId) return;
  openSheet(sheet, sheetBody, building, activity);
}

/** The data badge: the bots behind the town (sample or live), or why there aren't any yet. */
function showRoster(): void {
  selectionId++;
  tooltip.hidden = true;
  hint.style.opacity = '0';
  if (!current) {
    openRosterSheet(sheet, sheetBody, { mode: 'loading' });
  } else if (current.mode === 'error') {
    openRosterSheet(sheet, sheetBody, { mode: 'error', reason: current.reason });
  } else if (current.mode === 'live') {
    openRosterSheet(sheet, sheetBody, { mode: 'live', buildings: current.town.buildings, cues, source: current.source });
  } else {
    openRosterSheet(sheet, sheetBody, {
      mode: 'sample',
      buildings: current.town.buildings,
      cues,
      rosterMarkdown: SAMPLE_ROSTER_MARKDOWN,
    });
  }
}

attachTownInput({
  canvas,
  getCamera: () => camera,
  renderer,
  onCameraChange: scheduleDraw,
  onHover: showTooltip,
  onSelect: (building) => void showBuilding(building),
});

sheetClose.addEventListener('click', () => {
  selectionId++;
  closeSheet(sheet);
});

const settings = wireSettings({
  dialog: settingsDialog,
  openButton: settingsBtn,
  onChanged: loadAndRender,
});
bannerSettings.addEventListener('click', () => settings.open());
badge.addEventListener('click', showRoster);
sheetBody.addEventListener('click', (event) => {
  const target = event.target as HTMLElement;
  if (target.closest('[data-action="settings"]')) {
    settings.open();
    return;
  }
  const id = target.closest<HTMLElement>('[data-building]')?.dataset.building;
  const building = current?.town.buildings.find((b) => b.id === id);
  if (building) void showBuilding(building);
});

window.addEventListener('resize', resize);
resize();
void loadAndRender();
void registerPwa();
