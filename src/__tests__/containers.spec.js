/**
 * @jest-environment jsdom
 */

describe('containers', () => {
  let webRequestListener;
  let storage;

  beforeEach(() => {
    jest.resetModules();
    storage = {
      data: {},
      get: jest.fn((key) => {
        if (key && key !== null) {
          const value = storage.data[key];
          return Promise.resolve(value ? {[key]: value} : {});
        }
        return Promise.resolve(storage.data);
      }),
      set: jest.fn((obj) => {
        Object.assign(storage.data, obj);
        return Promise.resolve(obj);
      }),
      remove: jest.fn(() => Promise.resolve()),
    };
    global.browser = {
      contextualIdentities: {
        query: jest.fn(() => Promise.resolve([])),
        create: jest.fn(),
        remove: jest.fn(() => Promise.resolve()),
        onCreated: {addListener: jest.fn()},
        onRemoved: {addListener: jest.fn()},
        onUpdated: {addListener: jest.fn()},
      },
      storage: {
        local: storage,
        onChanged: {addListener: jest.fn()},
      },
      tabs: {
        get: jest.fn(),
        create: jest.fn(() => Promise.resolve({id: 2})),
        update: jest.fn(() => Promise.resolve()),
        remove: jest.fn(() => Promise.resolve()),
        query: jest.fn(() => Promise.resolve([])),
      },
    };
    webRequestListener = require('../containers').webRequestListener;
  });

  function tab(overrides) {
    return Object.assign({
      id: 1,
      index: 0,
      active: true,
      pinned: false,
      discarded: false,
      isInReaderMode: false,
      url: 'https://x.com/',
      cookieStoreId: 'firefox-default',
      openerTabId: undefined,
      incognito: false,
      windowId: 7,
    }, overrides);
  }

  it('opens a stale rule in the container that now has its name', async () => {
    storage.data = {
      'map=x.com': {
        host: 'x.com',
        cookieStoreId: 'firefox-container-old',
        containerName: 'USA',
        enabled: true,
      },
      'pref=keepOldTabs': {key: 'keepOldTabs', value: true},
    };
    global.browser.contextualIdentities.query.mockImplementation(() => Promise.resolve([
      {name: 'USA', cookieStoreId: 'firefox-container-new'},
    ]));
    global.browser.tabs.get.mockImplementation(() => Promise.resolve(tab()));

    const result = await webRequestListener({
      frameId: 0,
      tabId: 1,
      url: 'https://x.com/',
    });

    expect(result).toEqual({cancel: true});
    expect(global.browser.tabs.create).toHaveBeenCalledWith(expect.objectContaining({
      url: 'https://x.com/',
      cookieStoreId: 'firefox-container-new',
    }));
    expect(storage.data['map=x.com'].cookieStoreId).toEqual('firefox-container-new');
  });
});
