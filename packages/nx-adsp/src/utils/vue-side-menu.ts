import { Tree } from '@nx/devkit';

export interface SideMenuItemSpec {
  /** Nav label shown in the side menu, e.g. 'Review queue'. */
  label: string;
  /** Route path the item navigates to, e.g. '/queue'. */
  to: string;
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

/**
 * Adds a nav item to a generated app's side menu.
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

  const insertAt = anchorIndex + ANCHOR.length;
  host.write(
    appPath,
    content.slice(0, insertAt) +
      `\n  { label: '${item.label}', to: '${item.to}' },` +
      content.slice(insertAt),
  );
}
