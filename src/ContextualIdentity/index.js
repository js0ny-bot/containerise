import HostStorage from '../Storage/HostStorage';
import PreferenceStorage from '../Storage/PreferenceStorage';
import {mapsToRebind} from '../rebindMaps';

export const NO_CONTAINER = {
  name: 'No Container',
  icon: 'circle',
  iconUrl: 'resource://usercontext-content/circle.svg',
  color: 'grey',
  colorCode: '#999',
  cookieStoreId: 'firefox-default',
};
export const COLORS = [
  'blue',
  'green',
  'orange',
  'pink',
  'purple',
  'red',
  'turquoise',
  'yellow',
];

class ContextualIdentities {

  constructor() {
    this.contextualIdentities = browser.contextualIdentities;
    // Firefox also fires onRemoved when containers vanish after a crash or
    // when this extension is disabled. Deleting rules there drops them for
    // good, so only an intentional remove() clears host rules. Surviving
    // rules are rebound by container name when that container exists again.
    this.addOnRemoveListener((changeInfo) => {
      const cookieStoreId = changeInfo.contextualIdentity.cookieStoreId;
      this.cleanPreferences(cookieStoreId);
    });
    this.addOnCreateListener(() => this.rebindHostMaps());
  }

  create(name) {
    return this.contextualIdentities.create({
      name: name,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      icon: 'circle',
    });
  }

  /**
   * Gets rid of a container and all corresponding rules.
   * Host rules are cleared here, not in the onRemoved listener, so a
   * container that disappears out from under us does not take its rules.
   */
  async remove(cookieStoreId) {
    if (cookieStoreId === NO_CONTAINER.cookieStoreId) {
      return;
    }
    const removed = await this.contextualIdentities.remove(cookieStoreId);
    await this.cleanMaps(cookieStoreId);
    return removed;
  }

  async rebindHostMaps() {
    try {
      const [hostMaps, identities] = await Promise.all([
        HostStorage.getAll(),
        this.getAll(),
      ]);
      const updates = mapsToRebind(hostMaps, identities);
      await Promise.all(updates.map((map) => HostStorage.set(map)));
    } catch (e) {
      console.error('Couldn\'t rebind host rules to containers', e);
    }
  }

  async cleanMaps(cookieStoreId) {
    const hostMaps = await HostStorage.getAll();
    return HostStorage.remove(Object.keys(hostMaps)
        .filter(host => hostMaps[host].cookieStoreId === cookieStoreId)
    );
  }
  async cleanPreferences(cookieStoreId) {
    const preferences = await PreferenceStorage.getAll();
    return PreferenceStorage.remove(Object.keys(preferences)
        .filter(prefName => prefName.startsWith(`containers.${cookieStoreId}`))
    );
  }

  getAll(details = {}) {
    return this.contextualIdentities.query(details).then((identities) => [...identities, NO_CONTAINER]);
  }

  get(name) {
    if (name === NO_CONTAINER.name) {
      return Promise.resolve([NO_CONTAINER]);
    }
    return this.contextualIdentities.query({name});
  }

  addOnCreateListener(fn) {
    browser.contextualIdentities.onCreated.addListener(fn);
  }

  addOnRemoveListener(fn) {
    browser.contextualIdentities.onRemoved.addListener(fn);
  }

  addOnUpdateListener(fn) {
    browser.contextualIdentities.onUpdated.addListener(fn);
  }

  addOnChangedListener(fn) {
    this.addOnCreateListener(fn);
    this.addOnRemoveListener(fn);
    this.addOnUpdateListener(fn);
  }
}

export default new ContextualIdentities();
