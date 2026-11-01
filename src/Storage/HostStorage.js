import {matchesSavedMap, sortMaps} from '../utils';
import PrefixStorage from './PrefixStorage';

class HostStorage extends PrefixStorage {
  constructor() {
    super();
    this.PREFIX = 'map=';
    this.SET_KEY = 'host';
  }

  get(url, matchDomainOnly) {
    return super.getAll().then(maps => {
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
  async replaceForContainer(cookieStoreId, maps = {}) {
    const existing = await this.getAll();
    const stale = Object.keys(existing).filter((host) => {
      return existing[host].cookieStoreId === cookieStoreId
          && !Object.prototype.hasOwnProperty.call(maps, host);
    });
    if (stale.length > 0) {
      await this.remove(stale);
    }
    return this.setAll(maps);
  }

}

export default new HostStorage();
