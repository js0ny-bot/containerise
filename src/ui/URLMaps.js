import State from '../State';
import HostStorage from '../Storage/HostStorage';
import Tabs from '../Tabs';
import {qs, qsAll} from '../utils';
import {showLoader, hideLoader} from './loader';
import {showToast, hideToast} from './toast';
import {cleanHostInput} from '../utils';

const addButton = qs('.add-button');
const saveButton = qs('.save-button');
const umMaps = qs('.url-maps-list');
const umItem = qs('.url-map-item');

class URLMaps {

  constructor(state) {
    this.state = state;
    State.addListener(this.update.bind(this));
    addButton.addEventListener('click', this.addItem.bind(this, ''));
    saveButton.addEventListener('click', this.saveUrlMaps.bind(this));
    this.render();
    this.itemsCount = 0;
  }

  update(newState) {
    this.state = newState;
    this.render();
  }

  render() {
    showLoader();
    if(!this.state.urlMaps || !this.state.selectedIdentity) {
      return false;
    }

    umMaps.innerHTML = '';
    this.itemsCount = 0;

    const managedMaps = this.state.managedUrlMaps || {};
    const cookieStoreId = this.state.selectedIdentity.cookieStoreId;

    for (const key in managedMaps) {
      const urlMap = managedMaps[key];
      if (cookieStoreId === urlMap.cookieStoreId) {
        this.addItem(urlMap.host, true);
      }
    }

    for (const key in this.state.urlMaps) {
      if (managedMaps[key]) {
        continue;
      }
      const urlMap = this.state.urlMaps[key];
      if (cookieStoreId === urlMap.cookieStoreId) {
        this.addItem(urlMap.host);
      }
    }

    hideLoader();
  }

  async addItem(host, managed) {
    const item = umItem.cloneNode(true);
    item.setAttribute('data-id', String(this.itemsCount));
    item.classList.remove('template');
    if (!host && !managed) {
      // Fallback to hostname of current tab
      try {
        let currentTab = (await Tabs.query({
          active: true,
          windowId: browser.windows.WINDOW_ID_CURRENT,
        }))[0];
        host = new URL(currentTab.url).hostname;
      } catch (e) {
        // console.warn("Error while guessing hostname of active tab", e);
      }
    }
    const input = qs('.url-input', item);
    const removeButton = qs('.remove-button', item);
    input.value = host;
    if (managed) {
      item.classList.add('is-managed');
      input.readOnly = true;
      input.title = 'Managed by enterprise policy';
      removeButton.disabled = true;
      removeButton.title = 'Managed by enterprise policy';
      removeButton.setAttribute('aria-label', 'Managed by enterprise policy');
      removeButton.textContent = '\u{1F512}';
    } else {
      removeButton.addEventListener('click', this.removeUrlMap.bind(this, this.itemsCount, host));
    }
    umMaps.appendChild(item);
    this.itemsCount++;
  }

  removeUrlMap(rowId, host) {
    umMaps.removeChild(qs(`[data-id='${String(rowId)}']`));
    HostStorage.remove(host);
  }

  saveUrlMaps() {
    showLoader();
    const items = qsAll('.url-map-item');
    const maps = {};

    for (const item of items) {
      if (item.classList.contains('is-managed')) {
        continue;
      }
      const urlInput = qs('.url-input', item);
      const host = cleanHostInput(urlInput && urlInput.value);

      if (host) {
        maps[host] = {
          host: host,
          containerName: this.state.selectedIdentity.name,
          cookieStoreId: this.state.selectedIdentity.cookieStoreId,
          enabled: true,
        };
      }
    }

    const preserved = Object.keys(this.state.managedUrlMaps || {});
    HostStorage.replaceForContainer(this.state.selectedIdentity.cookieStoreId, maps, preserved).then(() => {
      hideLoader();
      showToast('Saved!');
      setTimeout(() => hideToast(), 3000);
    });
  }

}

export default new URLMaps({
  urlMaps: State.get('urlMaps'),
  selectedIdentity: State.get('selectedIdentity'),
  managedUrlMaps: State.get('managedUrlMaps'),
});
