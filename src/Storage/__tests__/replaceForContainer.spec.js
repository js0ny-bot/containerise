/**
 * @jest-environment jsdom
 */

describe('HostStorage.replaceForContainer', () => {
  let HostStorage;
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
      storage: {
        local: storage,
        onChanged: {addListener: jest.fn()},
      },
    };
    HostStorage = require('../HostStorage').default;
  });

  function rule(host, cookieStoreId, containerName) {
    return {
      host,
      cookieStoreId,
      containerName,
      enabled: true,
    };
  }

  it('drops the previous host when a rule is renamed', async () => {
    storage.data = {
      'map=old.example': rule('old.example', 'c1', 'Work'),
      'map=keep.example': rule('keep.example', 'c1', 'Work'),
      'map=other.example': rule('other.example', 'c2', 'Personal'),
    };

    await HostStorage.replaceForContainer('c1', {
      'new.example': rule('new.example', 'c1', 'Work'),
      'keep.example': rule('keep.example', 'c1', 'Work'),
    });

    expect(storage.data['map=old.example']).toBeUndefined();
    expect(storage.data['map=new.example']).toEqual(rule('new.example', 'c1', 'Work'));
    expect(storage.data['map=keep.example']).toEqual(rule('keep.example', 'c1', 'Work'));
    expect(storage.data['map=other.example']).toEqual(rule('other.example', 'c2', 'Personal'));
  });

  it('keeps a preserved host that the saved list does not include', async () => {
    storage.data = {
      'map=shadowed.example': rule('shadowed.example', 'c1', 'Work'),
      'map=old.example': rule('old.example', 'c1', 'Work'),
    };

    await HostStorage.replaceForContainer('c1', {}, ['shadowed.example']);

    expect(storage.data['map=shadowed.example']).toBeDefined();
    expect(storage.data['map=old.example']).toBeUndefined();
  });

  it('removes every rule for the container when the saved list is empty', async () => {
    storage.data = {
      'map=old.example': rule('old.example', 'c1', 'Work'),
      'map=other.example': rule('other.example', 'c2', 'Personal'),
    };

    await HostStorage.replaceForContainer('c1', {});

    expect(storage.data['map=old.example']).toBeUndefined();
    expect(storage.data['map=other.example']).toBeDefined();
  });
});
