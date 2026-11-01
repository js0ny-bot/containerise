import Storage from './Storage/HostStorage';
import ContextualIdentity, {NO_CONTAINER} from './ContextualIdentity';
import Tabs from './Tabs';
import PreferenceStorage from './Storage/PreferenceStorage';
import {filterByKey} from './utils';
import {buildDefaultContainer} from './defaultContainer';
import {resolveMapIdentity} from './rebindMaps';

const IGNORED_URLS_REGEX = /^(about|moz-extension|file|javascript|data|chrome):/;

/**
 * Keep track of the tabs we're creating
 * tabId: url
 */
const creatingTabs = {};

const createTab = async (url, newTabIndex, currentTabId, openerTabId, cookieStoreId) => {
  try {
    const currentTab = await Tabs.get(currentTabId);
    const createOptions = {
      url,
      index: newTabIndex,
      windowId: currentTab.windowId,
      cookieStoreId,
      active: currentTab.active,
      pinned: currentTab.pinned,
      discarded: currentTab.discarded,
      openInReaderMode: currentTab.isInReaderMode,
    };
    // Passing the openerTabId without a cookieStoreId
    // creates a tab in the same container as the opener
    if (cookieStoreId && openerTabId) {
      createOptions.openerTabId = openerTabId;
    }
    // Create the replacement before closing the current tab. Closing the
    // only tab closes the window, and the new tab never appears.
    const createdTab = await Tabs.create(createOptions);
    creatingTabs[createdTab.id] = url;
    if (!cookieStoreId && openerTabId) {
      Tabs.update(createdTab.id, {
        openerTabId: openerTabId,
      });
    }
    let keepOldTabs = false;
    try {
      const preference = await PreferenceStorage.get('keepOldTabs');
      keepOldTabs = !!(preference && preference.value);
    } catch (e) {
      console.error('Couldn\'t read keepOldTabs', e);
      keepOldTabs = false;
    }
    // if keepOldTabs is false, remove the 'old' tab
    // -or-
    // if the current tab is about:blank or about:newtab
    // or some custom moz-extension pages
    // we should still close the current tab even though
    // keepOldTabs is true, because these are just
    // interstitial tabs that are no longer used
    if (!keepOldTabs || /^(about:)|(moz-extension:)/.test(currentTab.url)) {
      await Tabs.remove(currentTabId);
    }
  } catch (e) {
    console.error('Failed to reopen tab in container', e);
  }

  return {
    cancel: true,
  };
};


async function handle(url, tabId) {
  const creatingUrl = creatingTabs[tabId];
  if (IGNORED_URLS_REGEX.test(url) || creatingUrl === url) {
    return;
  } else if (creatingUrl) {
    delete creatingTabs[tabId];
  }
  let preferences = await PreferenceStorage.getAll(true);
  let [hostMap, identities, currentTab] = await Promise.all([
    Storage.get(url, preferences.matchDomainOnly),
    ContextualIdentity.getAll(),
    Tabs.get(tabId),
  ]);

  if (currentTab.incognito || !hostMap) {
    return {};
  }

  const resolved = resolveMapIdentity(hostMap, identities);
  if (resolved.mapToSave) {
    Storage.set(resolved.mapToSave);
  }
  const hostIdentity = resolved.identity;
  let targetCookieStoreId;

  if (!hostIdentity) {
    if (preferences.defaultContainer) {
      const defaultContainer = await buildDefaultContainer(
          filterByKey(preferences, prefKey => prefKey.startsWith('defaultContainer')),
          url
      );
      targetCookieStoreId = defaultContainer.cookieStoreId;
      // console.debug('Going to open', url, 'in default container', targetCookieStoreId, defaultContainer.name);
    } else {
      return {};
    }
  } else {
    targetCookieStoreId = hostIdentity.cookieStoreId;
  }

  const targetIsNoContainer = targetCookieStoreId === NO_CONTAINER.cookieStoreId;
  const tabHasContainer = currentTab.cookieStoreId !== NO_CONTAINER.cookieStoreId;
  const tabInDifferentContainer = currentTab.cookieStoreId !== targetCookieStoreId;
  const openInNoContainer = targetIsNoContainer && tabHasContainer;
  if ((tabInDifferentContainer && !openInNoContainer) || openInNoContainer) {
    return createTab(
        url,
        currentTab.index + 1, currentTab.id,
        currentTab.openerTabId,
        targetCookieStoreId);
  }

  return {};

}

export const webRequestListener = (requestDetails) => {

  if (requestDetails.frameId !== 0 || requestDetails.tabId === -1) {
    return {};
  }
  return handle(requestDetails.url, requestDetails.tabId);
};

export const tabUpdatedListener = (tabId, changeInfo) => {
  if (!changeInfo.url) {
    return;
  }
  return handle(changeInfo.url, tabId);
};
