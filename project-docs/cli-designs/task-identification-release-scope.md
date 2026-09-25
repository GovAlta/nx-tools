---
cli-design: task-identification-release-scope
project-docs-ancestors: [domain-models:release-scoping]
resolves: []
---

## Location

`tools/task-identification.mjs` (workspace root) and
`packages/nx-agent/src/generators/agent-delivery/files/task-identification.mjs__tmpl__` (template).
Both must be kept in sync.

## Change: scope resolution block

The scope resolution block runs before any signal loop. Current shape:

```js
const artifactScope = process.env.ARTIFACT_SCOPE || '';
const scopeFilter = artifactScope ? artifactScope.split(',').map(s => s.trim()) : null;
```

New shape:

```js
const artifactScope = process.env.ARTIFACT_SCOPE || '';
let scopeFilter = artifactScope
  ? artifactScope.split(',').map(s => s.trim())
  : null;

if (!scopeFilter) {
  // Derive scope from active release artifacts when no explicit input is set
  const releasesDir = 'project-docs/releases';
  if (fs.existsSync(releasesDir)) {
    const releaseFiles = fs.readdirSync(releasesDir).filter(f => f.endsWith('.md') && f !== 'README.md');
    const releaseFeatures = new Set();
    for (const file of releaseFiles) {
      const fullPath = path.join(releasesDir, file);
      let parsed;
      try {
        parsed = yaml.parse(fs.readFileSync(fullPath, 'utf8').split('---')[1] || '');
      } catch (e) {
        console.log(`[scope] WARNING: malformed YAML frontmatter in ${fullPath}, skipping`);
        continue;
      }
      const ancestors = parsed?.['project-docs-ancestors'] || [];
      const featureRefs = (Array.isArray(ancestors) ? ancestors : [ancestors])
        .filter(a => String(a).startsWith('features:'));
      for (const ref of featureRefs) {
        const featureSlug = ref.replace(/^features:/, '');
        const featurePath = `project-docs/features/${featureSlug}.md`;
        if (!fs.existsSync(featurePath)) {
          console.log(`[scope] WARNING: release ${file} references missing feature ${ref}, skipping`);
        } else {
          releaseFeatures.add(featurePath);
        }
      }
      if (featureRefs.length > 0) {
        console.log(`[scope] active release ${file}: features ${featureRefs.join(', ')}`);
      }
    }
    if (releaseFeatures.size > 0) {
      scopeFilter = [...releaseFeatures];
    }
  }
}
```

## Behavior contract

| Condition | Outcome | Requirement |
|---|---|---|
| `artifact_scope` input is non-empty | Use it directly; skip release processing | req-014 rule-3 |
| No `artifact_scope` + active release files exist | Build scope from release ancestors | req-014 rule-1 |
| No `artifact_scope` + no release files | `scopeFilter = null` (full backlog, unchanged) | req-014 rule-2 |
| Two active releases reference features A and B | `scopeFilter` includes both A and B paths | req-014 rule-1 |
| Active release references missing feature slug | Warn to stdout, skip that reference | req-014 rule-5 |
| Release file has invalid YAML frontmatter | Warn to stdout, skip that file | req-014 rule-6 |
| Scope derived from releases | Log each active release and its feature contributions to stdout | req-014 rule-4 |

## Dependencies

Requires `yaml` (js-yaml or compatible) and `fs`/`path` from Node stdlib. `yaml` must already
be present as a devDependency of the workspace (lineage tooling uses it); no new dependency needed.

## Notes

- `README.md` in `project-docs/releases/` is excluded from processing by the `!== 'README.md'`
  filter, matching the same pattern used in task-identification for other README files.
- Archived releases under `project-docs/archive/releases/` are never read — `releasesDir` only
  covers the active path.
