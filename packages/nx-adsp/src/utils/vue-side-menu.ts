import { Tree } from '@nx/devkit';

export interface SideMenuItemSpec {
  /** Nav label shown in the side menu, e.g. 'Review queue'. */
  label: string;
  /** Route path the item navigates to, e.g. '/queue'. */
  to: string;
  /**
   * Ionicon name, e.g. 'list'. Effectively required: goa-work-side-menu-item
   * renders a blank item when it has no icon, so a generator that omits this
   * produces nav that looks broken on arrival. Passed straight through to the
   * element's <ion-icon>, so any valid ionicon name works.
   */
  icon?: string;
}

// Deterministic text insertion into vue-app's `primaryItems` array, mirroring
// insertVueRoute's approach for the same reason: the template's shape is fixed,
// so a targeted anchor beats pulling in an AST library for one array entry.
//
// The array is a plain literal in App.vue rather than something derived from the
// router, deliberately: a generated app is an opinionated starting point, and
// nav order, grouping and labels are decisions the owning team should be able to
// read and change in one obvious place -- not behaviour resolved at runtime by
// the shell that every app then has to work around.
const ANCHOR = 'const primaryItems = [';

// Finds the `]` closing the array literal that ANCHOR opens, so items can be
// appended at the end rather than inserted at the head. Tracks nesting depth and
// skips over string literals, so a label containing a bracket can't end the scan
// early. Returns -1 if the literal is unterminated (a hand-edited App.vue we
// shouldn't touch).
function findArrayEnd(content: string, openIndex: number): number {
  let depth = 1;
  let quote: string | null = null;
  for (let i = openIndex; i < content.length; i++) {
    const ch = content[i];
    if (quote) {
      if (ch === '\\') i++;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') quote = ch;
    else if (ch === '[' || ch === '{') depth++;
    else if (ch === ']' || ch === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/**
 * Appends a nav item to a generated app's side menu.
 *
 * Appends rather than prepends so the shell's own 'Home' entry stays first and
 * generated items accumulate in the order they were run. Inserting at the head
 * (an earlier version of this function) pushed Home to the bottom of the nav
 * after the first generator run, which no consuming app wants.
 *
 * A no-op when the app has no `primaryItems` array. That is the signal the app
 * was generated with `--layout=header` (a public app has no side menu at all),
 * so adding a staff view to it should not fail or warn -- there is simply no nav
 * to add to.
 *
 * Idempotent: re-running a generator, or two generators claiming the same path,
 * leaves one entry.
 */
export function insertSideMenuItem(
  host: Tree,
  projectRoot: string,
  item: SideMenuItemSpec,
): void {
  const appPath = `${projectRoot}/src/App.vue`;
  const content = host.read(appPath)?.toString();
  if (content === undefined) return;

  const anchorIndex = content.indexOf(ANCHOR);
  if (anchorIndex === -1) return;

  if (content.includes(`to: '${item.to}'`)) return;

  const openIndex = anchorIndex + ANCHOR.length;
  const closeIndex = findArrayEnd(content, openIndex);
  if (closeIndex === -1) return;

  const icon = item.icon ? `, icon: '${item.icon}'` : '';
  const entry = `{ label: '${item.label}', to: '${item.to}'${icon} },`;

  // Trim the whitespace ahead of the closing bracket and re-emit it, rather than
  // inserting in front of it: the array may already end with a newline (a
  // previous append) or not (the one-line literal formatFiles produces), and
  // prepending a newline to the former leaves a blank line between entries.
  const head = content.slice(0, closeIndex).replace(/\s+$/, '');

  // The last element may or may not carry a trailing comma depending on whether
  // formatFiles has run; add one if it's missing so appending stays valid.
  const separator = head.endsWith('[') || head.endsWith(',') ? '' : ',';

  host.write(
    appPath,
    `${head}${separator}\n  ${entry}\n` + content.slice(closeIndex),
  );
}
