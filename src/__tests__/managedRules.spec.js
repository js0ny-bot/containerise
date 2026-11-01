/**
 * @jest-environment jsdom
 */

const TEMPORARY_CONTAINERS = '{c607c8df-14a7-4f28-894f-29e8722976af}';

describe('managed rules', () => {
  let storage;
  let getManagedHostMaps;
  let getHostMap;
  let HostStorage;
  let messageExternalListener;

  beforeEach(() => {
    jest.resetModules();
    storage = {
      data: {},
      managedData: {},
      managedError: null,
    };
    global.browser = {
      contextualIdentities: {
        query: jest.fn(() => Promise.resolve([])),
        create: jest.fn((details) => Promise.resolve({
          name: details.name,
          cookieStoreId: `created-${details.name}`,
        })),
        remove: jest.fn(() => Promise.resolve()),
        onCreated: {addListener: jest.fn()},
        onRemoved: {addListener: jest.fn()},
        onUpdated: {addListener: jest.fn()},
      },
      storage: {
        local: {
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
        },
        managed: {
          get: jest.fn(() => {
            if (storage.managedError) {
              return Promise.reject(storage.managedError);
            }
            return Promise.resolve(storage.managedData);
          }),
        },
        onChanged: {addListener: jest.fn()},
      },
    };
    ({getManagedHostMaps, getHostMap} = require('../managedRules'));
    HostStorage = require('../Storage/HostStorage').default;
    ({messageExternalListener} = require('../messageExternalListener'));
  });

  function identities(...containers) {
    global.browser.contextualIdentities.query.mockImplementation(() => Promise.resolve(containers));
  }

  it('returns no rules when managed storage is unavailable', async () => {
    delete global.browser.storage.managed;
    await expect(getManagedHostMaps()).resolves.toEqual({});
    expect(global.browser.storage.local.set).not.toHaveBeenCalled();
  });

  it('returns no rules when managed storage rejects', async () => {
    storage.managedError = new Error('Managed storage manifest not found');
    await expect(getManagedHostMaps()).resolves.toEqual({});
    expect(global.browser.storage.local.set).not.toHaveBeenCalled();
  });

  it('resolves an existing container and does not write local storage', async () => {
    identities(
        {name: 'Work', cookieStoreId: 'firefox-container-work'},
    );
    storage.managedData = {
      rules: [
        {host: 'Example.COM', container: 'Work'},
        {host: '!*.Example.ORG', container: 'work'},
        {host: '@.+\\.Example\\.NET$', container: 'Work'},
      ],
    };

    const maps = await getManagedHostMaps();

    expect(maps['example.com']).toEqual({
      host: 'example.com',
      containerName: 'Work',
      cookieStoreId: 'firefox-container-work',
      enabled: true,
      managed: true,
    });
    expect(maps['!*.example.org'].cookieStoreId).toEqual('firefox-container-work');
    expect(maps['@.+\\.Example\\.NET$'].managed).toBe(true);
    expect(global.browser.contextualIdentities.create).not.toHaveBeenCalled();
    expect(global.browser.storage.local.set).not.toHaveBeenCalled();
    await expect(HostStorage.getAll()).resolves.toEqual({});
  });

  it('creates a missing container and still does not persist the rule', async () => {
    storage.managedData = {
      rules: [{host: 'finance.example', container: '  Finance  '}],
    };

    const maps = await getManagedHostMaps();

    expect(global.browser.contextualIdentities.create).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Finance',
    }));
    expect(maps['finance.example']).toMatchObject({
      containerName: 'Finance',
      cookieStoreId: 'created-Finance',
      managed: true,
    });
    expect(global.browser.storage.local.set).not.toHaveBeenCalled();
  });

  it('maps No Container without creating one', async () => {
    storage.managedData = {
      rules: [{host: 'open.example', container: 'No Container'}],
    };

    const maps = await getManagedHostMaps();

    expect(maps['open.example'].cookieStoreId).toEqual('firefox-default');
    expect(maps['open.example'].containerName).toEqual('No Container');
    expect(global.browser.contextualIdentities.create).not.toHaveBeenCalled();
  });

  it('skips entries that are not usable rules', async () => {
    identities({name: 'Work', cookieStoreId: 'firefox-container-work'});
    storage.managedData = {
      rules: [
        null,
        {host: '   ', container: 'Work'},
        {container: 'Work'},
        {host: 'missing.example'},
        {host: 'blank.example', container: '   '},
        {host: '@', container: 'Work'},
        {host: '!', container: 'Work'},
        {host: 'ok.example', container: 'Work'},
        'nope',
      ],
    };

    const maps = await getManagedHostMaps();

    expect(Object.keys(maps)).toEqual(['ok.example']);
  });

  it('lets the later entry win when a host is repeated', async () => {
    identities(
        {name: 'Work', cookieStoreId: 'firefox-container-work'},
        {name: 'Personal', cookieStoreId: 'firefox-container-personal'},
    );
    storage.managedData = {
      rules: [
        {host: 'a.example', container: 'Work'},
        {host: 'a.example', container: 'Personal'},
      ],
    };

    const maps = await getManagedHostMaps();

    expect(maps['a.example'].cookieStoreId).toEqual('firefox-container-personal');
  });

  it('skips a rule whose container cannot be created', async () => {
    identities({name: 'Work', cookieStoreId: 'firefox-container-work'});
    global.browser.contextualIdentities.create.mockImplementation(() => Promise.reject(new Error('nope')));
    jest.spyOn(console, 'error').mockImplementation(() => {});
    storage.managedData = {
      rules: [
        {host: 'bad.example', container: 'Missing'},
        {host: 'ok.example', container: 'Work'},
      ],
    };

    const maps = await getManagedHostMaps();

    expect(Object.keys(maps)).toEqual(['ok.example']);
    console.error.mockRestore();
  });

  it('gives a managed rule precedence for the same host', async () => {
    identities(
        {name: 'Work', cookieStoreId: 'firefox-container-work'},
        {name: 'Personal', cookieStoreId: 'firefox-container-personal'},
    );
    storage.data = {
      'map=example.com': {
        host: 'example.com',
        cookieStoreId: 'firefox-container-personal',
        containerName: 'Personal',
        enabled: true,
      },
    };
    storage.managedData = {
      rules: [{host: 'example.com', container: 'Work'}],
    };

    const match = await getHostMap('https://example.com/');

    expect(match).toMatchObject({
      cookieStoreId: 'firefox-container-work',
      managed: true,
    });
    expect(storage.data['map=example.com'].cookieStoreId).toEqual('firefox-container-personal');
  });

  it('still prefers a more specific user rule over a broader managed rule', async () => {
    identities(
        {name: 'Work', cookieStoreId: 'firefox-container-work'},
        {name: 'Personal', cookieStoreId: 'firefox-container-personal'},
    );
    storage.data = {
      'map=example.com/secret/place': {
        host: 'example.com/secret/place',
        cookieStoreId: 'firefox-container-personal',
        containerName: 'Personal',
        enabled: true,
      },
    };
    storage.managedData = {
      rules: [{host: 'example.com', container: 'Work'}],
    };

    await expect(getHostMap('https://example.com/secret/place')).resolves.toMatchObject({
      host: 'example.com/secret/place',
      cookieStoreId: 'firefox-container-personal',
    });
    await expect(getHostMap('https://example.com/')).resolves.toMatchObject({
      host: 'example.com',
      cookieStoreId: 'firefox-container-work',
      managed: true,
    });
  });

  it('keeps \\S and \\D in a managed regex', async () => {
    identities({name: 'Work', cookieStoreId: 'firefox-container-work'});
    storage.managedData = {
      rules: [
        {host: '@^https://digits\\.example/\\D+$', container: 'Work'},
        {host: '@^https://spaces\\.example/\\S+$', container: 'Work'},
      ],
    };

    const maps = await getManagedHostMaps();

    expect(maps['@^https://digits\\.example/\\D+$']).toMatchObject({
      host: '@^https://digits\\.example/\\D+$',
      cookieStoreId: 'firefox-container-work',
      managed: true,
    });
    expect(maps['@^https://spaces\\.example/\\S+$'].host).toBe('@^https://spaces\\.example/\\S+$');
    expect(global.browser.storage.local.set).not.toHaveBeenCalled();

    await expect(getHostMap('https://DIGITS.example/Ab')).resolves.toMatchObject({
      host: '@^https://digits\\.example/\\D+$',
    });
    await expect(getHostMap('https://digits.example/12')).resolves.toEqual({});
    await expect(getHostMap('https://spaces.example/File')).resolves.toMatchObject({
      host: '@^https://spaces\\.example/\\S+$',
    });
  });

  it('matches a managed regex against uppercase characters in the URL', async () => {
    identities({name: 'Work', cookieStoreId: 'firefox-container-work'});
    storage.managedData = {
      rules: [{
        host: '@https?:\\/{2}signin\\.ebay\\.com\\/.+AppName=ImpactEP',
        container: 'Work',
      }],
    };

    const match = await getHostMap(
        'https://signin.ebay.com/ws/eBayISAPI.dll?SignIn&AppName=ImpactEP-EPN'
    );

    expect(match.cookieStoreId).toEqual('firefox-container-work');
  });

  it('answers Temporary Containers with the managed map', async () => {
    identities({name: 'Work', cookieStoreId: 'firefox-container-work'});
    storage.managedData = {
      rules: [{host: 'example.com', container: 'Work'}],
    };

    const result = await messageExternalListener({
      method: 'getHostMap',
      url: 'https://example.com/path',
    }, {id: TEMPORARY_CONTAINERS});

    expect(result).toMatchObject({
      host: 'example.com',
      cookieStoreId: 'firefox-container-work',
      managed: true,
    });
  });

  it('shares one load when managed rules are read concurrently', async () => {
    let release;
    global.browser.contextualIdentities.query.mockImplementation(() => new Promise((resolve) => {
      release = () => resolve([{name: 'Work', cookieStoreId: 'firefox-container-work'}]);
    }));
    storage.managedData = {
      rules: [{host: 'example.com', container: 'Work'}],
    };

    const first = getManagedHostMaps();
    const second = getManagedHostMaps();
    expect(first).toBe(second);
    await new Promise((resolve) => setTimeout(resolve, 0));
    release();
    const maps = await first;

    expect(maps['example.com'].cookieStoreId).toEqual('firefox-container-work');
    expect(global.browser.storage.managed.get).toHaveBeenCalledTimes(1);
  });
});
