import {
  getOwnerConfig,
  PLACEHOLDER_CONFIG,
  resetOwnerConfig,
  setOwnerConfig,
  type OwnerConfig,
} from '../privacy/configStore';
import { forgetToken, getToken, setToken } from '../privacy/tokenStore';

export function wireSettings(options: {
  dialog: HTMLDialogElement;
  openButton: HTMLElement;
  onChanged: () => void;
}): void {
  const { dialog, openButton, onChanged } = options;

  const tokenInput = dialog.querySelector<HTMLInputElement>('#token-input')!;
  const tokenStatus = dialog.querySelector<HTMLElement>('#token-status')!;
  const wikiRepoInput = dialog.querySelector<HTMLInputElement>('#wiki-repo-input')!;
  const reposInput = dialog.querySelector<HTMLTextAreaElement>('#repos-json-input')!;
  const sectionsInput = dialog.querySelector<HTMLTextAreaElement>('#wiki-sections-input')!;
  const configStatus = dialog.querySelector<HTMLElement>('#config-status')!;

  const refreshFields = () => {
    const token = getToken();
    tokenInput.value = token ? '••••••••••••••••' : '';
    tokenStatus.textContent = token
      ? 'Token present on this device (not shown). Sent only to api.github.com.'
      : 'No token stored — showing sample data.';

    const config = getOwnerConfig();
    wikiRepoInput.value = config.wikiRepo;
    reposInput.value = JSON.stringify(config.reposByBuilding, null, 2);
    sectionsInput.value = JSON.stringify(config.wikiSectionByBuilding, null, 2);
    configStatus.textContent = '';
  };

  openButton.addEventListener('click', () => {
    refreshFields();
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
  });

  dialog.querySelector('#btn-save-token')!.addEventListener('click', () => {
    const value = tokenInput.value.trim();
    if (!value || value.startsWith('••')) {
      tokenStatus.textContent = 'Enter a new token to save (placeholder dots are ignored).';
      return;
    }
    setToken(value);
    tokenInput.value = '••••••••••••••••';
    tokenStatus.textContent = 'Token saved to localStorage on this device.';
    onChanged();
  });

  dialog.querySelector('#btn-forget-token')!.addEventListener('click', () => {
    forgetToken();
    tokenInput.value = '';
    tokenStatus.textContent = 'Token removed from this device. Back to sample data.';
    onChanged();
  });

  dialog.querySelector('#btn-save-config')!.addEventListener('click', () => {
    try {
      const reposByBuilding = JSON.parse(reposInput.value) as OwnerConfig['reposByBuilding'];
      const wikiSectionByBuilding = JSON.parse(
        sectionsInput.value,
      ) as OwnerConfig['wikiSectionByBuilding'];
      if (typeof reposByBuilding !== 'object' || typeof wikiSectionByBuilding !== 'object') {
        throw new Error('Invalid JSON objects');
      }
      setOwnerConfig({
        wikiRepo: wikiRepoInput.value.trim() || PLACEHOLDER_CONFIG.wikiRepo,
        reposByBuilding,
        wikiSectionByBuilding,
      });
      configStatus.textContent = 'Config saved on this device only.';
      onChanged();
    } catch (err) {
      configStatus.textContent = `Could not save: ${(err as Error).message}`;
    }
  });

  dialog.querySelector('#btn-reset-config')!.addEventListener('click', () => {
    resetOwnerConfig();
    refreshFields();
    configStatus.textContent = 'Restored generic placeholders.';
    onChanged();
  });
}
