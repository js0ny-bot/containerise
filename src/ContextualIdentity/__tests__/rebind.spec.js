/**
 * @jest-environment jsdom
 */

describe('container removal and rebind', () => {
  let ContextualIdentities;
  let storage;

  beforeEach(() => {
    jest.resetModules();
    storage = {
      data: {},
      get: jest.fn(() => Promise.resolve(storage.data)),
      set: jest.fn((obj) => {
        Object.assign(storage.data, obj);
        return Promise.resolve(obj);
      }),
      remove: jest.fn((keys) => {
        keys.forEach((key) => {
          delete storage.data[key];
        });
        return Promise.resolve();
      }),
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
    };
    ContextualIdentities = require('../index').default;
  });

  function removedListener() {
    return global.browser.contextualIdentities.onRemoved.addListener.mock.calls[0][0];
  }

  it('keeps host rules when a container disappears', async () => {
    storage.data = {
      'map=example.com': {
        host: 'example.com',
        cookieStoreId: 'firefox-container-old',
        containerName: 'Work',
        enabled: true,
      },
    };
    await removedListener()({
      contextualIdentity: {cookieStoreId: 'firefox-container-old'},
    });
    expect(storage.data['map=example.com']).toEqual({
      host: 'example.com',
      cookieStoreId: 'firefox-container-old',
      containerName: 'Work',
      enabled: true,
    });
    const removed = storage.remove.mock.calls.map((call) => call[0]).flat();
    expect(removed).not.toContain('map=example.com');
  });

  it('clears that container\'s rules on an intentional remove', async () => {
    storage.data = {
      'map=example.com': {
        host: 'example.com',
        cookieStoreId: 'firefox-container-old',
        containerName: 'Work',
        enabled: true,
      },
      'map=other.example': {
        host: 'other.example',
        cookieStoreId: 'firefox-container-other',
        containerName: 'Personal',
        enabled: true,
      },
    };
    await ContextualIdentities.remove('firefox-container-old');
    expect(global.browser.contextualIdentities.remove).toHaveBeenCalledWith('firefox-container-old');
    expect(storage.data['map=example.com']).toBeUndefined();
    expect(storage.data['map=other.example']).toBeDefined();
  });

  it('rebinds stored rules when a container with the same name exists', async () => {
    storage.data = {
      'map=example.com': {
        host: 'example.com',
        cookieStoreId: 'firefox-container-old',
        containerName: 'Work',
        enabled: true,
      },
      'map=keep.example': {
        host: 'keep.example',
        cookieStoreId: 'firefox-container-personal',
        containerName: 'Personal',
        enabled: true,
      },
    };
    global.browser.contextualIdentities.query.mockImplementation(() => Promise.resolve([
      {name: 'Work', cookieStoreId: 'firefox-container-new'},
      {name: 'Personal', cookieStoreId: 'firefox-container-personal'},
    ]));
    await ContextualIdentities.rebindHostMaps();
    expect(storage.data['map=example.com'].cookieStoreId).toEqual('firefox-container-new');
    expect(storage.data['map=keep.example'].cookieStoreId).toEqual('firefox-container-personal');
  });

  it('rebinds when a container is created', async () => {
    storage.data = {
      'map=example.com': {
        host: 'example.com',
        cookieStoreId: 'firefox-container-old',
        containerName: 'Work',
        enabled: true,
      },
    };
    global.browser.contextualIdentities.query.mockImplementation(() => Promise.resolve([
      {name: 'Work', cookieStoreId: 'firefox-container-new'},
    ]));
    const onCreated = global.browser.contextualIdentities.onCreated.addListener.mock.calls[0][0];
    await onCreated({});
    expect(storage.data['map=example.com'].cookieStoreId).toEqual('firefox-container-new');
  });
});
