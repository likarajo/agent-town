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
import { timeOverride } from './town/scene';
import type { ActivityCue, TownBuilding } from './town/types';
import { createTownView, type TownView } from './town/view';
import { wireSettings } from './ui/settings';
import { closeSheet, openPlaceholderSheet, openRosterSheet, openSheet } from './ui/sheet';

const canvas = document.querySelector<HTMLCanvasElement>('#town-canvas')!;
const stage = canvas.parentElement!;
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
/** The 3D town, or the 2D map on devices that can't draw it; null until it has loaded. */
let view: TownView | null = null;
/** What the town shows right now; null while the owner's roster loads. */
let current: TownLoad | null = hasToken() ? null : initialLoad;
let source: TownDataSource = createDataSource(initialLoad);
let cues: Record<string, ActivityCue> = {};
let raf = 0;
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
  const box = stage.getBoundingClientRect();
  const left = Math.min(clientX - box.left + 14, box.width - tooltip.offsetWidth - 8);
  const top = Math.min(clientY - box.top + 16, box.height - tooltip.offsetHeight - 8);
  tooltip.style.left = `${Math.max(8, left)}px`;
  tooltip.style.top = `${Math.max(8, top)}px`;
}

/**
 * Ambient animation (water, walkers, clouds) runs at up to 30 fps. Input redraws on the next
 * frame, and while the view is busy (walking, flying) every frame is drawn.
 */
const FRAME_MS = 1000 / 30;
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
let dirty = true;
let lastFrame = 0;

function frame(now: number): void {
  raf = 0;
  if (!view) return;
  const still = reducedMotion.matches;
  const busy = view.busy();
  const animate = !document.hidden && (busy || !still);
  if (dirty || (animate && (busy || now - lastFrame >= FRAME_MS))) {
    dirty = false;
    lastFrame = now;
    view.render(still ? 0 : now);
  }
  if (animate) raf = requestAnimationFrame(frame);
}

function scheduleDraw(): void {
  dirty = true;
  if (!raf) raf = requestAnimationFrame(frame);
}

function resize(): void {
  view?.resize(stage.clientWidth, stage.clientHeight);
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
    view?.setTown(loadingTown());
    updateBadge(null);
    showBanner(LOADING_REASON);
    view?.recenter();
    scheduleDraw();
  }

  const load = await loadTown();
  if (id !== loadId) return statusFor(load);

  current = load;
  source = createDataSource(load);
  cues = {};
  view?.setTown(load.town);
  view?.recenter();
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
      view?.setCues(loaded);
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
  if (!building) return;
  view?.focus(building);
  scheduleDraw();
  void showBuilding(building);
});
// Hovering a bot in the roster panel highlights its building.
sheetBody.addEventListener('pointerover', (event) => {
  const row = (event.target as HTMLElement).closest<HTMLElement>('[data-building]');
  view?.setHover(row?.dataset.building ?? null);
  scheduleDraw();
});
sheetBody.addEventListener('pointerleave', () => {
  view?.setHover(null);
  scheduleDraw();
});

window.addEventListener('resize', resize);
document.addEventListener('visibilitychange', scheduleDraw);
reducedMotion.addEventListener('change', scheduleDraw);
// The sky follows the clock even when nothing else moves.
window.setInterval(scheduleDraw, 60_000);

async function start(): Promise<void> {
  view = await createTownView({
    canvas,
    stage,
    town: initialLoad.town,
    onChange: scheduleDraw,
    onSelect: (building) => void showBuilding(building),
    onHover: showTooltip,
    reducedMotion: () => reducedMotion.matches,
  });
  view.setClock(timeOverride(window.location.search));
  resize();
  await loadAndRender();
}

void start();
void registerPwa();
