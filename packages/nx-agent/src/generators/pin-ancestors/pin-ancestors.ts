import { Tree, formatFiles, logger } from '@nx/devkit';
import {
  artifactDigest,
  buildRegistry,
  parseAncestorRef,
  refKey,
  Registry,
} from '../../utils/project-docs-refs';
import {
  ArtifactSchema,
  readArtifactSchema,
} from '../../utils/artifact-schema';
import { Schema } from './schema';

// Records each resolved ancestor's current body digest on the reference that
// names it, so project-docs-lineage can later report that the ancestor moved
// and downstream review is pending.
//
// Its own generator rather than a --repin flag on project-docs-lineage, for two
// reasons. project-docs-lineage reads the graph and reports; this writes to
// artifacts, and mixing a mutation into the reporting tool is how it ends up
// next to --strict in a workflow with the check silently dead. And re-pinning
// asserts "I reviewed this and my artifact still holds" — a claim only a human
// can make. So: never call this from a hook, a CI step, or a clean-run path. A
// blind bulk re-pin bakes in whatever drift already exists and then reports it
// as the floor.
//
// Scoping is the point of --artifact/--ancestor. "I fixed a typo in this one
// term, re-pin its descendants" is an act you can justify in a commit message;
// re-pinning the whole workspace is only ever "make the report stop."
const ANCESTORS_KEY = 'project-docs-ancestors';
const FRONTMATTER_BLOCK = /^---\n([\s\S]*?)\n---/;
// Both YAML sequence styles, because the generators emit both: `requirements`
// write a block list, `domain-terms` write a flow list on one line. Matched by
// line rather than round-tripped through a YAML parser, which would reformat
// the whole block and lose comments and quoting with it — at the cost of having
// to know each style, hence the warning below for anything neither matches.
const BLOCK_ITEM = /^(\s*-\s*)(\S+)\s*$/;
const FLOW_LIST = /^(project-docs-ancestors:\s*\[)([^\]]*)(\]\s*)$/;

function pinFile(
  host: Tree,
  registry: Registry,
  artifactSchema: ArtifactSchema,
  path: string,
  options: Schema,
): string[] {
  const content = host.read(path, 'utf-8') ?? '';
  const block = FRONTMATTER_BLOCK.exec(content);
  if (!block) {
    return [];
  }

  const pinned: string[] = [];

  // Returns the token re-pinned, or the token unchanged when it shouldn't be.
  const pin = (token: string): string => {
    const parsed = parseAncestorRef(token);
    if (!parsed) {
      return token;
    }
    const key = refKey(parsed);
    // A reference that doesn't resolve is a broken reference, and
    // project-docs-lineage reports it as one. Pinning it would invent
    // provenance for something that was never read.
    const ancestor = registry.get(key);
    if (!ancestor) {
      return token;
    }
    if (options.ancestor && options.ancestor !== key) {
      return token;
    }
    // Through artifactDigest, never bodyDigest directly: the type may declare
    // digestFields, and a pin computed any other way would read as stale the
    // moment project-docs-lineage looked at it.
    const digest = artifactDigest(
      ancestor,
      artifactSchema[parsed.type]?.digestFields,
    );
    if (parsed.digest === digest) {
      return token;
    }
    pinned.push(key);
    const fragment = parsed.fragment ? `#${parsed.fragment}` : '';
    return `${key}@${digest}${fragment}`;
  };

  let inAncestors = false;
  const rewritten = block[1]
    .split('\n')
    .map((line) => {
      if (/^\S/.test(line)) {
        const flow = FLOW_LIST.exec(line);
        if (flow) {
          // Self-contained on this line, so the block-item branch below never
          // applies to it.
          inAncestors = false;
          const items = flow[2].trim();
          if (!items) {
            return line;
          }
          const rewrittenItems = items
            .split(',')
            .map((token) => pin(token.trim()))
            .join(', ');
          return `${flow[1]}${rewrittenItems}${flow[3]}`;
        }
        inAncestors = line.startsWith(`${ANCESTORS_KEY}:`);
        return line;
      }
      if (!inAncestors) {
        return line;
      }
      const item = BLOCK_ITEM.exec(line);
      if (!item) {
        // Inside the ancestors list but in neither style this knows how to
        // rewrite. Warned rather than skipped: a silently unpinned reference
        // looks identical to a deliberately unpinned one, and reports nothing
        // forever.
        if (line.trim()) {
          logger.warn(
            `[nx-agent] ${path}: could not pin "${line.trim()}" — not a form this ` +
              `generator rewrites. Pin it by hand as <type>:<id>@<digest>.`,
          );
        }
        return line;
      }
      return `${item[1]}${pin(item[2])}`;
    })
    .join('\n');

  if (pinned.length === 0) {
    return [];
  }
  host.write(path, `---\n${rewritten}\n---${content.slice(block[0].length)}`);
  return pinned;
}

export default async function (host: Tree, options: Schema = {}) {
  // formatFiles() before anything is read, not only at the end. Digests cover
  // the body, and Prettier rewrites bodies — list markers, heading style, table
  // alignment, emphasis characters — none of which extractBody normalises. So a
  // pin computed against an unformatted body was invalidated by the format pass
  // that followed it: for any artifact that is both a pin target and itself
  // pinned (a chain, i.e. the normal shape), project-docs-lineage reported it
  // stale seconds after pinning, with no edit in between.
  await formatFiles(host);

  const registry = buildRegistry(host);
  const artifactSchema = readArtifactSchema(host);

  for (const scoped of [options.artifact, options.ancestor]) {
    if (scoped && !registry.has(scoped)) {
      throw new Error(
        `[nx-agent] "${scoped}" is not a registered project-docs artifact. ` +
          `Reference it as <type>:<id> (e.g. domain-terms:collision-report).`,
      );
    }
  }

  let updated = 0;
  for (const [key, entry] of registry) {
    if (options.artifact && options.artifact !== key) {
      continue;
    }
    const pinned = pinFile(host, registry, artifactSchema, entry.path, options);
    if (pinned.length > 0) {
      updated += pinned.length;
      logger.info(`[nx-agent] ${key}: pinned ${pinned.join(', ')}`);
    }
  }

  if (updated === 0) {
    logger.info(
      '[nx-agent] every in-scope reference is already pinned to its ancestor.',
    );
    return;
  }
  // Again, so the frontmatter just rewritten is itself formatted. Safe for the
  // digests recorded above: they cover bodies, and nothing here touched one.
  await formatFiles(host);
  logger.info(
    `[nx-agent] pinned ${updated} reference(s). Each records that you have read the ` +
      `ancestor as it stands now — the digests appear in your own diff, so review them ` +
      `as the assertion they are.`,
  );
}
