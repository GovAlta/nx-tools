// Resolves which emitted dependency a finding is reached through.
//
// `npm audit --json` names the vulnerable package and the physical paths it
// sits at, but not which of our pins drags it in — and without that a reader
// cannot act on the finding. Nearly every path here is several levels deep
// (semantic-release depends on npm, which vendors its own tree), so the raw
// node path is not enough either.
//
// Resolution works outward from the vulnerable node's own path first, so the
// chain describes the instance the advisory actually matched. Walking the
// dependency graph by name alone would not: the same package can be installed
// at several paths under different owners, and only some of those resolve to a
// vulnerable version.

// name -> set of names declaring a dependency on it, from the lockfile's edges.
function buildOwnerIndex(lock) {
  const dependents = new Map();
  for (const [location, entry] of Object.entries(lock.packages || {})) {
    if (!location.startsWith('node_modules/')) continue;
    const name = packageNameAt(location);
    for (const dep of Object.keys({
      ...entry.dependencies,
      ...entry.optionalDependencies,
      ...entry.peerDependencies,
    })) {
      if (!dependents.has(dep)) dependents.set(dep, new Set());
      dependents.get(dep).add(name);
    }
  }
  return dependents;
}

function packageNameAt(location) {
  return location.slice(
    location.lastIndexOf('node_modules/') + 'node_modules/'.length,
  );
}

// Physical nesting, innermost last: 'node_modules/npm/node_modules/pacote'
// becomes ['npm', 'pacote'].
function nestingChain(nodePath) {
  return nodePath
    .split('node_modules/')
    .slice(1)
    .map((segment) => segment.replace(/\/$/, ''))
    .filter(Boolean);
}

// Shortest chain of names from an emitted dependency down to `target`.
// Breadth-first, so the chain reported is the most direct one; emitted packages
// terminate the search because they are where a fix would be applied.
function chainToEmitted(dependents, emitted, target) {
  if (emitted.has(target)) return [target];
  const seen = new Set([target]);
  let frontier = [[target]];

  while (frontier.length) {
    const next = [];
    for (const chain of frontier) {
      for (const parent of dependents.get(chain[0]) || []) {
        if (seen.has(parent)) continue;
        if (emitted.has(parent)) return [parent, ...chain];
        seen.add(parent);
        next.push([parent, ...chain]);
      }
    }
    frontier = next;
  }
  return null;
}

// The chain from one of our pins to the vulnerable instance at `nodePath`.
function ownerChain(dependents, emitted, nodePath) {
  const nesting = nestingChain(nodePath);
  if (!nesting.length) return null;
  // The outermost physically-nested package is the one to trace back to a pin;
  // everything inside it is already accounted for by the nesting itself.
  const outer = nesting[0];
  const toOuter = chainToEmitted(dependents, emitted, outer);
  if (!toOuter) return null;
  return [...toOuter, ...nesting.slice(1)];
}

module.exports = { buildOwnerIndex, ownerChain, nestingChain };
