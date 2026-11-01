import ContextualIdentity, {NO_CONTAINER} from './ContextualIdentity';
import HostStorage from './Storage/HostStorage';
import {PREFIX_GLOB, PREFIX_REGEX, cleanHostInput} from './utils';

let managedInflight = null;

function readManagedStorage() {
  const managed = browser.storage && browser.storage.managed;
  if (!managed || typeof managed.get !== 'function') {
    return Promise.resolve({});
  }
  // No enterprise policy rejects the promise. An empty policy is the same
  // outcome for us: there are no managed rules.
  return browser.storage.managed.get(null).then((data) => data || {}).catch(() => ({}));
}

/**
 * Firefox enterprise policy `3rdparty.Extensions.<extension id>` is exposed
 * here as `browser.storage.managed`. Shape:
 * `{rules: [{host, container}]}`.
 * `host` uses the usual rule syntax. `container` is a container name.
 * Nothing returned from here is written to storage.local.
 */
export async function loadManagedHostMaps() {
  const data = await readManagedStorage();
  const rules = data && Array.isArray(data.rules) ? data.rules : [];
  if (rules.length === 0) {
    return {};
  }

  const identities = await ContextualIdentity.getAll();
  const byName = new Map();
  for (const identity of identities) {
    byName.set(cleanHostInput(identity.name), identity);
  }

  const maps = {};
  for (const rule of rules) {
    if (!rule || typeof rule.host !== 'string' || typeof rule.container !== 'string') {
      continue;
    }
    const host = cleanHostInput(rule.host);
    const containerName = rule.container.trim();
    if (!host || host === PREFIX_REGEX || host === PREFIX_GLOB || !containerName) {
      continue;
    }

    const nameKey = cleanHostInput(containerName);
    let identity = byName.get(nameKey);
    if (!identity && nameKey === cleanHostInput(NO_CONTAINER.name)) {
      identity = NO_CONTAINER;
    }
    if (!identity) {
      try {
        identity = await ContextualIdentity.create(containerName);
      } catch (e) {
        console.error('Couldn\'t create managed container', containerName, e);
        continue;
      }
      byName.set(cleanHostInput(identity.name), identity);
    }

    // A later entry for the same host replaces an earlier one.
    maps[host] = {
      host,
      containerName: identity.name,
      cookieStoreId: identity.cookieStoreId,
      enabled: true,
      managed: true,
    };
  }
  return maps;
}

export function getManagedHostMaps() {
  if (!managedInflight) {
    managedInflight = loadManagedHostMaps().finally(() => {
      managedInflight = null;
    });
  }
  return managedInflight;
}

export async function getHostMap(url, matchDomainOnly) {
  const managed = await getManagedHostMaps();
  return HostStorage.get(url, matchDomainOnly, managed);
}
