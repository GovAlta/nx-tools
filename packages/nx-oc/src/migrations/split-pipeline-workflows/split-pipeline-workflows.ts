import { formatFiles, logger, Tree } from '@nx/devkit';
import { readFileSync } from 'fs';
import { join } from 'path';

const PIPELINE_PATH = '.github/workflows/pipeline.yml';
const PR_PATH = '.github/workflows/pull-request.yml';

// The generated pipeline workflow's head region, verbatim, either side of the
// split — as the generator actually emits it, i.e. after formatFiles(). That
// differs from the .yml__tmpl__ template, whose `"24"` and `"origin/main"`
// Prettier rewrites to single quotes on generation; the generated file is what
// this migration reads and writes, so it's the generated file captured here.
//
// Held as fixtures rather than read from the live template because a migration
// has to keep applying the same change forever: sourcing from the template
// would mean a later edit to it silently changed what this already-released
// migration does. A future change to the workflows is a future migration.
const HEAD_BEFORE_PATH = join(__dirname, 'pipeline-head.before.txt');
const HEAD_AFTER_PATH = join(__dirname, 'pipeline-head.after.txt');
const PR_WORKFLOW_PATH = join(__dirname, 'pull-request.after.txt');

// Only the region from `name: Pipeline` through the build job's event guard is
// static in the generated file — everything above it (the environment→project
// comment list) and below it (registry, namespaces, env names) is interpolated
// per workspace, so a whole-file fixture comparison is impossible. The region
// is bounded by markers rather than line numbers because the header above it
// varies in length with the environment count.
const REGION_START = 'name: Pipeline';
const REGION_END = `  build:\n    if: github.event_name != 'pull_request'\n`;

// What each fixture must contain to be the fixture at all. The asset glob in
// project.json is the only thing putting these .txt files in the published
// package, so a mis-scoped glob would otherwise splice emptiness into every
// matching workflow — checked once, loudly, instead of trusted.
const FIXTURE_MARKERS: [string, string, string[]][] = [
  [
    'pipeline-head.before.txt',
    HEAD_BEFORE_PATH,
    ["if: github.event_name == 'pull_request'", 'cancel-in-progress: true'],
  ],
  [
    'pipeline-head.after.txt',
    HEAD_AFTER_PATH,
    ['cancel-in-progress: false', 'jobs:'],
  ],
  [
    'pull-request.after.txt',
    PR_WORKFLOW_PATH,
    ['name: Pull Request Check', 'trufflesecurity/trufflehog', 'check:'],
  ],
];

// Compared after normalising only line endings and trailing whitespace — the
// noise git and editors introduce, which cannot hide a meaningful change.
//
// Deliberately NOT a general YAML normaliser: a workflow is executable config,
// and tolerating arbitrary reformatting would risk splicing a new head onto a
// file whose deploy jobs someone has since rewired. A workspace that reformatted
// its workflow gets a warning naming it instead — the safe direction, since we
// only rewrite a file we can positively identify.
function normalize(content: string): string {
  return content
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+$/gm, '')
    .trimEnd();
}

// What Nx reads off a migration's return value: nextSteps is surfaced to the
// user in the run summary, agentContext is handed to the paired prompt phase as
// advisory hints (see the `prompt` field on this migration's entry in
// migrations.json). Returning them is the structured channel — better than
// leaving the agent to scrape the warnings out of captured console output.
interface MigrationReport {
  nextSteps: string[];
  agentContext: string[];
}

// Splits the single generated `pipeline.yml` — which ran the PR check and the
// deploy chain as two event-gated halves of one workflow — into a check-only
// `pull-request.yml` and a deploy-only `pipeline.yml`.
//
// The motivating defect is concurrency: one workflow carries one `concurrency`
// block, and the two halves need opposite policies. `cancel-in-progress: true`
// is right for a superseded check run and wrong for the deploy chain, where a
// run can sit for hours awaiting an environment approval and cancelling it
// mid-rollout leaves the Deployment on `oc set triggers --auto`. Per-job
// concurrency can't express it either — each job would queue in its own group,
// so two runs' promotion chains interleave instead of serializing as a unit.
export default async function splitPipelineWorkflows(
  tree: Tree,
): Promise<MigrationReport | undefined> {
  const fixtures = FIXTURE_MARKERS.map(([name, path, markers]) => {
    const content = readFileSync(path, 'utf-8');
    const missing = markers.filter((marker) => !content.includes(marker));
    if (missing.length > 0) {
      throw new Error(
        `[nx-oc] ${name} is missing ${missing.join(', ')} — the packaged ` +
          `migration fixture is incomplete, so nothing was rewritten. This is ` +
          `a packaging bug in @abgov/nx-oc, not a problem with your workspace.`,
      );
    }
    return content;
  });
  const [headBefore, headAfter, prWorkflow] = fixtures;

  // No generated Actions pipeline here — a Jenkins workspace, or one that never
  // ran the pipeline generator. Nothing to split.
  if (!tree.exists(PIPELINE_PATH)) {
    return undefined;
  }

  const content = tree.read(PIPELINE_PATH, 'utf-8') ?? '';

  // Already split by a newer generator or a previous run of this migration.
  if (!content.includes(REGION_END)) {
    return undefined;
  }

  if (tree.exists(PR_PATH)) {
    logger.warn(
      `[nx-oc] ${PIPELINE_PATH} still runs the PR check, but ${PR_PATH} already ` +
        `exists — left both untouched rather than overwriting a file this ` +
        `migration did not write.`,
    );
    return {
      nextSteps: [
        `${PIPELINE_PATH} still contains the event-gated "check" job while ${PR_PATH} ` +
          `also exists, so pull requests may be checked twice. Move the check to ` +
          `${PR_PATH} (or delete whichever is redundant), then narrow ${PIPELINE_PATH} ` +
          `to \`on: push\` and set \`cancel-in-progress: false\` on it — an in-flight ` +
          `deploy must not be cancelled by a later push.`,
      ],
      agentContext: [
        `${PIPELINE_PATH} and ${PR_PATH} both exist and the former still has the ` +
          `PR-gated "check" job. Reconcile them by hand, preserving whatever either ` +
          `file customises. Keep the job name "check" so an existing required ` +
          `status check keeps resolving.`,
      ],
    };
  }

  const startIdx = content.indexOf(REGION_START);
  const endIdx = content.indexOf(REGION_END);
  if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) {
    logger.warn(
      `[nx-oc] Could not locate the generated head region in ${PIPELINE_PATH} — ` +
        `left untouched.`,
    );
    return report(
      PIPELINE_PATH,
      'its structure does not match the generated one',
    );
  }

  const region = content.slice(startIdx, endIdx + REGION_END.length);
  if (normalize(region) !== normalize(headBefore)) {
    logger.warn(
      `[nx-oc] ${PIPELINE_PATH} runs the PR check and the deploy chain in one ` +
        `workflow, but differs from the generated version — left untouched.`,
    );
    return report(PIPELINE_PATH, 'it differs from the generated version');
  }

  tree.write(
    PIPELINE_PATH,
    content.slice(0, startIdx) +
      headAfter +
      content.slice(endIdx + REGION_END.length),
  );
  tree.write(PR_PATH, prWorkflow);
  await formatFiles(tree);

  logger.info(
    `[nx-oc] Split ${PIPELINE_PATH} into a check-only ${PR_PATH} and a ` +
      `deploy-only ${PIPELINE_PATH} (queued, never cancelled).`,
  );

  return {
    nextSteps: [
      `Commit the new ${PR_PATH} along with the narrowed ${PIPELINE_PATH}. The check ` +
        `job kept its name ("check"), so an existing required status check on that ` +
        `name keeps resolving without touching branch protection.`,
    ],
    agentContext: [],
  };
}

function report(path: string, why: string): MigrationReport {
  return {
    nextSteps: [
      `${path} was left untouched because ${why}. Split it by hand: move the ` +
        `"check" job into ${PR_PATH} triggered on \`pull_request\` with ` +
        `\`cancel-in-progress: true\`, and narrow ${path} to \`on: push\` with ` +
        `\`cancel-in-progress: false\` — a deploy run can wait hours on an ` +
        `environment approval, and cancelling it mid-rollout leaves the Deployment ` +
        `on \`oc set triggers --auto\`.`,
    ],
    agentContext: [
      `${path} needs splitting by hand: ${why}, so it was not rewritten. Preserve ` +
        `its existing customisations. Keep the job name "check" so an existing ` +
        `required status check keeps resolving, and drop the now-redundant ` +
        `\`if: github.event_name != 'pull_request'\` guard from the build job.`,
    ],
  };
}
