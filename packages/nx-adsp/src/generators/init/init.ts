import { Tree, formatFiles } from '@nx/devkit';
import { addAdspMcpServer, addVsCodeSettings } from '../../utils/quality';

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
  addAdspMcpServer(host);
  addVsCodeSettings(host);
  await formatFiles(host);
}
