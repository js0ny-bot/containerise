import {matchesSavedMap, sortMaps} from '../utils';
import PrefixStorage from './PrefixStorage';

class HostStorage extends PrefixStorage {
  constructor() {
    super();
    this.PREFIX = 'map=';
    this.SET_KEY = 'host';
  }

  get(url, matchDomainOnly, overrides) {
    return super.getAll().then(maps => {
      if (overrides) {
        maps = Object.assign({}, maps, overrides);
      }
      const sorted = sortMaps(Object.keys(maps).map(key => maps[key]));
      // Sorts by domain length, then by path length
      return sorted.find((map) => {
        try{
          return matchesSavedMap( url, matchDomainOnly, map);
        } catch (e) {
          console.error('Error matching maps', map, url, matchDomainOnly, e);
          return false;
        }
      }) || {};
    });
  }

  /**
   * Replace the rules for one container. setAll only writes keys, so a
   * renamed host would otherwise leave the previous rule active.
   */
  async replaceForContainer(cookieStoreId, maps = {}, preservedHosts = []) {
    // Preserved hosts are omitted from the editable list on purpose.
    // Managed rules must not cause a shadowed user rule to be deleted,
    // or it would be gone if the policy was removed later.
    const preserved = new Set(preservedHosts);
    const existing = await this.getAll();
    const stale = Object.keys(existing).filter((host) => {
      return existing[host].cookieStoreId === cookieStoreId
          && !Object.prototype.hasOwnProperty.call(maps, host)
          && !preserved.has(host);
    });
    if (stale.length > 0) {
      await this.remove(stale);
    }
    return this.setAll(maps);
  }

}

export default new HostStorage();
