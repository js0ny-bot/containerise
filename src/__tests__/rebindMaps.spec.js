import {mapsToRebind, resolveMapIdentity} from '../rebindMaps';

describe('resolveMapIdentity', () => {
  const work = {name: 'Work', cookieStoreId: 'firefox-container-work'};
  const personal = {name: 'Personal', cookieStoreId: 'firefox-container-personal'};
  const identities = [work, personal];

  it('keeps a rule whose cookie store still exists', () => {
    const map = {
      host: 'example.com',
      cookieStoreId: 'firefox-container-work',
      containerName: 'Old name',
      enabled: true,
    };
    expect(resolveMapIdentity(map, identities)).toEqual({
      identity: work,
      mapToSave: null,
    });
  });

  it('does not move a live container onto another container with the old name', () => {
    const renamed = {name: 'Shopping', cookieStoreId: 'firefox-container-work'};
    const newWork = {name: 'Work', cookieStoreId: 'firefox-container-new'};
    const map = {
      host: 'example.com',
      cookieStoreId: 'firefox-container-work',
      containerName: 'Work',
      enabled: true,
    };
    expect(resolveMapIdentity(map, [renamed, newWork])).toEqual({
      identity: renamed,
      mapToSave: null,
    });
  });

  it('rebinds a missing cookie store to the container with the same name', () => {
    const map = {
      host: 'example.com',
      cookieStoreId: 'firefox-container-gone',
      containerName: 'Work',
      enabled: true,
    };
    expect(resolveMapIdentity(map, identities)).toEqual({
      identity: work,
      mapToSave: {
        host: 'example.com',
        cookieStoreId: 'firefox-container-work',
        containerName: 'Work',
        enabled: true,
      },
    });
  });

  it('leaves a rule alone when the named container is gone too', () => {
    const map = {
      host: 'example.com',
      cookieStoreId: 'firefox-container-gone',
      containerName: 'Missing',
      enabled: true,
    };
    expect(resolveMapIdentity(map, identities)).toEqual({
      identity: null,
      mapToSave: null,
    });
  });
});

describe('mapsToRebind', () => {
  it('returns only the rules whose cookie store must change', () => {
    const identities = [
      {name: 'Work', cookieStoreId: 'new-work'},
      {name: 'Personal', cookieStoreId: 'same-personal'},
    ];
    const updates = mapsToRebind({
      'example.com': {
        host: 'example.com',
        cookieStoreId: 'old-work',
        containerName: 'Work',
        enabled: true,
      },
      'keep.example': {
        host: 'keep.example',
        cookieStoreId: 'same-personal',
        containerName: 'Personal',
        enabled: true,
      },
    }, identities);
    expect(updates).toEqual([{
      host: 'example.com',
      cookieStoreId: 'new-work',
      containerName: 'Work',
      enabled: true,
    }]);
  });
});
