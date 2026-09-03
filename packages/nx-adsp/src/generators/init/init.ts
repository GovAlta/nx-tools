import { Tree, formatFiles, installPackagesTask } from '@nx/devkit';
import { addVsCodeSettings } from '../../utils/quality';
import { addAdspMcpServer } from '../../utils/mcp';

// express-service writes CLIENT_SECRET, DATABASE_URL, and MONGODB_URI to
// .env.local — these must be gitignored before any generator run can commit.
// Idempotent: no-op if the patterns are already present.
const ENV_LOCAL_GITIGNORE_PATTERNS = ['.env.local', '.env.*.local'];

function ensureEnvLocalGitignored(host: Tree): void {
  const path = '.gitignore';
  if (!host.exists(path)) {
    host.write(path, `${ENV_LOCAL_GITIGNORE_PATTERNS.join('\n')}\n`);
    return;
  }
  const existing = host.read(path).toString();
  const existingLines = new Set(existing.split('\n').map((l) => l.trim()));
  const missing = ENV_LOCAL_GITIGNORE_PATTERNS.filter(
    (p) => !existingLines.has(p),
  );
  if (missing.length === 0) return;
  host.write(
    path,
    `${existing.replace(/\n+$/, '')}\n\n${missing.join('\n')}\n`,
  );
}

// Every app/service generator (express-service, react-app, angular-app,
// vue-app) calls this as one of its own steps — it's also the standalone
// entry point for the same workspace-root setup. That setup previously only
// ever arrived as a side effect of scaffolding a specific app, which meant
// grounded ADSP platform knowledge (tenant/realm/role model, SDK reference)
// was never available for a decision made before any app exists — a
// Design-stage pass, for instance. A single, prescriptive, re-runnable entry
// point — same shape as @abgov/nx-agent:init — rather than a generator per
// workspace-root concern.
export default async function (host: Tree) {
  ensureEnvLocalGitignored(host);
  addAdspMcpServer(host);
  addVsCodeSettings(host);
  await formatFiles(host);
  // addAdspMcpServer adds a dev dependency, so standalone runs need the install.
  // App/service generators discard this and return their own install task —
  // same package.json in the same Tree, so the dependency still lands.
  return () => {
    installPackagesTask(host);
  };
}
