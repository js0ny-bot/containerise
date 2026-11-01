/**
 * Find the container a stored rule should use.
 *
 * A rule whose cookie store has gone is rebound to a container with the
 * same name. The returned map is only set when the cookie store id changed,
 * so a rename of a still-existing container keeps its rules.
 *
 * @param map
 * @param identities
 * @return {{identity: object|null, mapToSave: object|null}}
 */
export function resolveMapIdentity(map, identities) {
  if (!map) {
    return {identity: null, mapToSave: null};
  }
  const byId = identities.find((identity) => identity.cookieStoreId === map.cookieStoreId);
  if (byId) {
    return {identity: byId, mapToSave: null};
  }
  const byName = map.containerName
      ? identities.find((identity) => identity.name === map.containerName)
      : null;
  if (byName) {
    // Managed rules are resolved on read and must not be copied into
    // storage.local, including when the cookie store id has changed.
    return {
      identity: byName,
      mapToSave: map.managed ? null : Object.assign({}, map, {cookieStoreId: byName.cookieStoreId}),
    };
  }
  if (map.managed && map.cookieStoreId) {
    // The container may have been created while the identity list was
    // still being read, so it is not in `identities` yet.
    return {
      identity: {
        name: map.containerName,
        cookieStoreId: map.cookieStoreId,
      },
      mapToSave: null,
    };
  }
  return {identity: null, mapToSave: null};
}

export function mapsToRebind(hostMaps, identities) {
  const updates = [];
  for (const host of Object.keys(hostMaps)) {
    const resolved = resolveMapIdentity(hostMaps[host], identities);
    if (resolved.mapToSave) {
      updates.push(resolved.mapToSave);
    }
  }
  return updates;
}
