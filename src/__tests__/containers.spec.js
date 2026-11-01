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

  function matchedRequest() {
    storage.data = Object.assign({
      'map=x.com': {
        host: 'x.com',
        cookieStoreId: 'firefox-container-1',
        containerName: 'USA',
        enabled: true,
      },
    }, storage.data);
    global.browser.contextualIdentities.query.mockImplementation(() => Promise.resolve([
      {name: 'USA', cookieStoreId: 'firefox-container-1'},
    ]));
  }

  it('creates the replacement tab before closing the current one', async () => {
    const order = [];
    storage.data = {
      'pref=keepOldTabs': {key: 'keepOldTabs', value: false},
    };
    matchedRequest();
    global.browser.tabs.get.mockImplementation(() => Promise.resolve(tab()));
    global.browser.tabs.create.mockImplementation(() => {
      order.push('create');
      return Promise.resolve({id: 9});
    });
    global.browser.tabs.remove.mockImplementation(() => {
      order.push('remove');
      return Promise.resolve();
    });

    const result = await webRequestListener({
      frameId: 0,
      tabId: 1,
      url: 'https://x.com/',
    });

    expect(result).toEqual({cancel: true});
    expect(order).toEqual(['create', 'remove']);
    expect(global.browser.tabs.create).toHaveBeenCalledWith(expect.objectContaining({
      windowId: 7,
      cookieStoreId: 'firefox-container-1',
    }));
  });

  it('leaves the current tab when old tabs are kept', async () => {
    storage.data = {
      'pref=keepOldTabs': {key: 'keepOldTabs', value: true},
    };
    matchedRequest();
    global.browser.tabs.get.mockImplementation(() => Promise.resolve(tab()));

    await webRequestListener({
      frameId: 0,
      tabId: 1,
      url: 'https://x.com/',
    });

    expect(global.browser.tabs.create).toHaveBeenCalled();
    expect(global.browser.tabs.remove).not.toHaveBeenCalled();
  });

  it('still closes an interstitial tab when old tabs are kept', async () => {
    storage.data = {
      'pref=keepOldTabs': {key: 'keepOldTabs', value: true},
    };
    matchedRequest();
    global.browser.tabs.get.mockImplementation(() => Promise.resolve(tab({
      url: 'about:blank',
    })));

    await webRequestListener({
      frameId: 0,
      tabId: 1,
      url: 'https://x.com/',
    });

    expect(global.browser.tabs.remove).toHaveBeenCalledWith(1);
  });

  it('opens a managed rule without storing it locally', async () => {
    global.browser.storage.managed = {
      get: jest.fn(() => Promise.resolve({
        rules: [{host: 'x.com', container: 'USA'}],
      })),
    };
    global.browser.contextualIdentities.query.mockImplementation(() => Promise.resolve([
      {name: 'USA', cookieStoreId: 'firefox-container-usa'},
    ]));
    storage.data = {
      'pref=keepOldTabs': {key: 'keepOldTabs', value: true},
    };
    global.browser.tabs.get.mockImplementation(() => Promise.resolve(tab()));

    const result = await webRequestListener({
      frameId: 0,
      tabId: 1,
      url: 'https://x.com/',
    });

    expect(result).toEqual({cancel: true});
    expect(global.browser.tabs.create).toHaveBeenCalledWith(expect.objectContaining({
      cookieStoreId: 'firefox-container-usa',
    }));
    expect(storage.set).not.toHaveBeenCalled();
    expect(storage.data['map=x.com']).toBeUndefined();
  });

  it('does not reopen a view-source navigation', async () => {
    storage.data = {
      'pref=defaultContainer': {key: 'defaultContainer', value: true},
      'pref=defaultContainer.containerName': {
        key: 'defaultContainer.containerName',
        value: '~{domain}.{tld}',
      },
    };
    global.browser.tabs.get.mockImplementation(() => Promise.resolve(tab()));

    const result = await webRequestListener({
      frameId: 0,
      tabId: 1,
      url: 'view-source:https://example.com/',
    });

    expect(result).toBeUndefined();
    expect(global.browser.tabs.create).not.toHaveBeenCalled();
    expect(global.browser.tabs.remove).not.toHaveBeenCalled();
    expect(global.browser.contextualIdentities.create).not.toHaveBeenCalled();
  });

  it('does not close the current tab when the replacement cannot be created', async () => {
    storage.data = {
      'pref=keepOldTabs': {key: 'keepOldTabs', value: false},
    };
    matchedRequest();
    global.browser.tabs.get.mockImplementation(() => Promise.resolve(tab()));
    global.browser.tabs.create.mockImplementation(() => Promise.reject(new Error('nope')));
    jest.spyOn(console, 'error').mockImplementation(() => {});

    const result = await webRequestListener({
      frameId: 0,
      tabId: 1,
      url: 'https://x.com/',
    });

    expect(result).toEqual({cancel: true});
    expect(global.browser.tabs.remove).not.toHaveBeenCalled();
    console.error.mockRestore();
  });
});
