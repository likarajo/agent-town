import { desktop } from '../desktop';
import {
  envLockedFields,
  getOwnerConfig,
  getStoredOwnerConfig,
  resetOwnerConfig,
  setOwnerConfig,
} from '../privacy/configStore';
import { forgetToken, getTokenSource, setToken } from '../privacy/tokenStore';
import { parseRepoFullName } from '../roster/location';

const MASK = '••••••••••••••••';

export function wireSettings(options: {
  dialog: HTMLDialogElement;
  openButton: HTMLElement;
  /** Reload the town with the current settings; resolves to a one-line status. */
  onChanged: () => Promise<string>;
}): { open: () => void } {
  const { dialog, openButton, onChanged } = options;

  const tokenInput = dialog.querySelector<HTMLInputElement>('#token-input')!;
  const tokenStatus = dialog.querySelector<HTMLElement>('#token-status')!;
  const saveTokenButton = dialog.querySelector<HTMLButtonElement>('#btn-save-token')!;
  const forgetTokenButton = dialog.querySelector<HTMLButtonElement>('#btn-forget-token')!;
  const secondBrainInput = dialog.querySelector<HTMLInputElement>('#second-brain-input')!;
  const rosterInput = dialog.querySelector<HTMLInputElement>('#roster-url-input')!;
  const saveConfigButton = dialog.querySelector<HTMLButtonElement>('#btn-save-config')!;
  const resetAllButton = dialog.querySelector<HTMLButtonElement>('#btn-reset-all')!;
  const configStatus = dialog.querySelector<HTMLElement>('#config-status')!;
  const envNote = dialog.querySelector<HTMLElement>('#desktop-env-note')!;

  const refreshFields = () => {
    const source = getTokenSource();
    const tokenFromEnv = source === 'env';
    tokenInput.value = source ? MASK : '';
    tokenInput.disabled = tokenFromEnv;
    saveTokenButton.disabled = tokenFromEnv;
    forgetTokenButton.disabled = tokenFromEnv || source === null;
    tokenStatus.textContent = tokenFromEnv
      ? 'Token comes from the .env file. Edit that file to change it, then restart the app.'
      : source
        ? 'Token saved on this device until you forget or reset it (not shown). Sent only to api.github.com.'
        : 'No token saved, so the town shows sample bots.';

    const config = getOwnerConfig();
    const locked = envLockedFields();
    secondBrainInput.value = config.secondBrainRepo;
    secondBrainInput.disabled = locked.secondBrainRepo;
    rosterInput.value = config.rosterUrl;
    rosterInput.disabled = locked.rosterUrl;
    configStatus.textContent = '';

    if (desktop) {
      envNote.hidden = false;
      envNote.textContent = desktop.envFile
        ? `Desktop app: settings in ${desktop.envFile} take priority over this screen.`
        : `Desktop app: no .env file found. Put one at ${desktop.envSearchPaths[0] ?? 'the app folder'} to keep the token there.`;
    }
  };

  const reload = async (status: HTMLElement, done: string) => {
    status.textContent = `${done} Loading…`;
    status.textContent = `${done} ${await onChanged()}`;
  };

  const open = () => {
    refreshFields();
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
  };

  openButton.addEventListener('click', open);

  saveTokenButton.addEventListener('click', () => {
    const value = tokenInput.value.trim();
    if (!value || value === MASK) {
      tokenStatus.textContent = 'Paste a new token to save it.';
      return;
    }
    setToken(value);
    tokenInput.value = MASK;
    forgetTokenButton.disabled = false;
    void reload(tokenStatus, 'Token saved on this device.');
  });

  forgetTokenButton.addEventListener('click', () => {
    forgetToken();
    tokenInput.value = '';
    forgetTokenButton.disabled = true;
    void reload(tokenStatus, 'Token removed from this device.');
  });

  saveConfigButton.addEventListener('click', () => {
    const locked = envLockedFields();
    const stored = getStoredOwnerConfig();
    const secondBrainRepo = locked.secondBrainRepo ? stored.secondBrainRepo : secondBrainInput.value.trim();
    const rosterUrl = locked.rosterUrl ? stored.rosterUrl : rosterInput.value.trim();
    if (secondBrainRepo && !parseRepoFullName(secondBrainRepo)) {
      configStatus.textContent = 'The second-brain repo should look like owner/name.';
      return;
    }
    setOwnerConfig({ secondBrainRepo, rosterUrl });
    void reload(configStatus, 'Saved on this device.');
  });

  resetAllButton.addEventListener('click', () => {
    const keepsEnv = desktop?.envFile ? ' Values in the .env file stay; edit that file to change them.' : '';
    if (!window.confirm(`Remove the saved token and roster settings from this device?${keepsEnv}`)) return;
    forgetToken();
    resetOwnerConfig();
    refreshFields();
    void reload(configStatus, 'Settings reset on this device.');
  });

  // Enter would submit the dialog form and close it without saving.
  const saveOnEnter = (input: HTMLInputElement, button: HTMLButtonElement) =>
    input.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      button.click();
    });
  saveOnEnter(tokenInput, saveTokenButton);
  saveOnEnter(secondBrainInput, saveConfigButton);
  saveOnEnter(rosterInput, saveConfigButton);

  return { open };
}
