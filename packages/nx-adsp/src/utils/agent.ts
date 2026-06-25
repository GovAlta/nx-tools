import { createInterface } from 'readline';
import { Tree } from '@nx/devkit';
import { io } from 'socket.io-client';
import { getServiceUrls } from '@abgov/nx-oc';

const AGENT_SERVICE_URN = 'urn:ads:platform:agent-service:v1';
const AGENT_ID = 'nxAdspAgent';

// Keep CapabilitySpec exported for backward compatibility and tests,
// but the primary flow now uses the workspace approach.
export interface AgentCapability {
  generator: string;
  params: Record<string, unknown>;
  description: string;
}

export interface CapabilitySpec {
  capabilities: AgentCapability[];
}

/**
 * Result returned when the agent conversation completes.
 * filesWritten is the number of files applied to the Nx Tree from the
 * agent workspace (new files and modified integration files like main.ts).
 */
export interface AgentResult {
  filesWritten: number;
  /** True when the user was in an active conversation before it ended. */
  userInteracted: boolean;
  /** True when the conversation ended via Ctrl+C (SIGINT). */
  interrupted?: boolean;
}

/**
 * After a consultAgent call, check whether the user interrupted before any
 * files were generated and confirm they still want to proceed with the base
 * scaffolding. Throws if the user declines, which aborts the Nx Tree commit.
 */
export async function confirmAfterAgentInterrupt(
  result: AgentResult | null
): Promise<void> {
  if (result?.interrupted && result.filesWritten === 0) {
    const { prompt } = await import('enquirer');
    const { proceed } = await prompt<{ proceed: boolean }>({
      type: 'confirm',
      name: 'proceed',
      message: 'Agent interaction ended without generating files. Continue with base scaffolding?',
      initial: false,
    });
    if (!proceed) {
      throw new Error('Generation aborted.');
    }
  }
}

/**
 * Connect to the ADSP agent-service and conduct a multi-turn conversation
 * with the nx-adsp-agent. The agent uses its workspace tools to write
 * generated and modified files; this function retrieves the workspace state
 * after the conversation and applies all files to the Nx Tree.
 *
 * The socket connection and file upload start immediately. While the files
 * are uploading, the developer is prompted for a brief project description.
 * The initial message is sent as soon as both the upload and the description
 * are ready — whichever finishes last.
 *
 * Returns null if agent-service is unavailable — callers should skip the
 * agent step gracefully in that case.
 */
export async function consultAgent(
  directoryServiceUrl: string,
  accessToken: string,
  projectContext: {
    projectName: string;
    projectType: 'express-service' | 'react-app' | 'angular-app' | 'mern' | 'mean' | 'pern' | 'pean';
    tenant: string;
    pluginVersion: string;
    /** Content of key integration files for the agent to read and potentially modify. */
    existingFiles: Record<string, string>;
  },
  host: Tree,
  projectRoot: string,
  options?: {
    /** Thread ID to use. When omitted a new UUID is generated. */
    threadId?: string;
    /**
     * When true, skip the description prompt and send a continuation message instead,
     * letting the agent carry context from a prior interaction on the same thread.
     */
    isContinuation?: boolean;
    /**
     * Additional project roots for composite generators (mern, mean).
     * Files whose paths start with a given prefix are written to the mapped root
     * rather than projectRoot. E.g. { 'app': '/path/to/my-app' } routes any
     * workspace file beginning with 'app/' to that root (with the prefix stripped).
     */
    additionalRoots?: Record<string, string>;
  }
): Promise<AgentResult | null> {
  if (!accessToken) {
    process.stdout.write('\n[nx-adsp] No access token — skipping agent interaction.\n');
    return null;
  }

  const agentServiceUrl = await resolveAgentServiceUrl(directoryServiceUrl);
  if (!agentServiceUrl) {
    process.stdout.write('\n[nx-adsp] Agent-service not found in directory — skipping agent interaction.\n');
    return null;
  }

  const isContinuation = options?.isContinuation ?? false;
  const threadId = options?.threadId ?? crypto.randomUUID();

  process.stdout.write(`\n[nx-adsp] Connecting to agent at ${agentServiceUrl}...\n`);

  // Start socket connection immediately so file upload overlaps with the description prompt.
  const socket = io(agentServiceUrl, {
    auth: { token: accessToken },
    // Skip polling — go directly to WebSocket to avoid ARO ingress rejecting
    // the polling POST with HTTP 400.
    transports: ['websocket'],
    timeout: 30000,
    reconnection: false,
  });

  // rl is created after the enquirer prompt (below) so that readline gets a
  // clean stdin — enquirer sets raw mode on stdin and restoring it before
  // readline attaches avoids the two libraries leaving stdin in a bad state.
  let rl: ReturnType<typeof createInterface> | null = null;

  // Coordination: sendInitialMessage is called once BOTH conditions are met:
  //   1. description prompt has been answered (descriptionReady = true)
  //   2. workspace files have been uploaded (workspaceReady = true)
  // Whichever condition is satisfied last triggers the send.
  let description: string | undefined;
  let descriptionReady = false;
  let workspaceReady = false;
  let conversationStarted = false;

  let buffer = '';
  let conversationDone = false;
  let agentHasResponded = false;
  let thinkingInterval: ReturnType<typeof setInterval> | null = null;
  let interrupted = false;

  let resolveConversation: (result: AgentResult | null) => void;
  const conversationPromise = new Promise<AgentResult | null>((r) => {
    resolveConversation = r;
  });

  // ANSI helpers — no-op when stdout is not a TTY (e.g. CI, piped output).
  const DIM   = process.stdout.isTTY ? '\x1b[2m' : '';
  const RESET = process.stdout.isTTY ? '\x1b[0m' : '';

  const startThinking = () => {
    // Dim colour is left open so the dots inherit it; stopThinking resets.
    process.stdout.write(`${DIM}[nx-adsp] Agent is thinking`);
    thinkingInterval = setInterval(() => {
      if (!conversationDone) process.stdout.write('.');
      else stopThinking();
    }, 1000);
  };

  const stopThinking = () => {
    if (thinkingInterval) {
      clearInterval(thinkingInterval);
      thinkingInterval = null;
      process.stdout.write(`${RESET}\n`);
    }
  };

  const cleanup = (filesWritten: number) => {
    conversationDone = true;
    rl?.close();
    socket.disconnect();
    // Return null only for truly silent skips (no agent, no token, connection failed).
    // Return a result whenever the user was actively engaged (agent responded)
    // OR when they explicitly interrupted (Ctrl+C), so the caller always gets
    // a chance to confirm before proceeding.
    resolveConversation(
      agentHasResponded || interrupted
        ? { filesWritten, userInteracted: agentHasResponded, interrupted }
        : null
    );
  };

  const buildInitialMessage = () => {
    const { projectType, projectName, tenant, pluginVersion } = projectContext;
    const descriptionLine = description ? `It is described as: "${description}". ` : '';

    if (isContinuation) {
      const stackDetail =
        projectType === 'react-app'
          ? 'It uses Redux Toolkit slices for state (store.ts, config.slice.ts, intake.slice.ts) and keycloak-js for authentication. '
          : projectType === 'angular-app'
          ? 'It uses Angular standalone components, HttpClient with includeBearerTokenInterceptor for authenticated requests, and keycloak-angular for authentication. '
          : '';
      const fileNames = Object.keys(projectContext.existingFiles).join(', ');
      return (
        `I've also scaffolded a ${projectType} called "${projectName}" for the same tenant. ` +
        stackDetail +
        `The files (${fileNames}) have been uploaded to your workspace — please read them to understand the current structure before suggesting capabilities. ` +
        `Based on our service discussion, what ADSP frontend integrations would be most useful?`
      );
    }

    if (projectType === 'mern' || projectType === 'mean') {
      const frontendStack =
        projectType === 'mern'
          ? 'React frontend using Redux Toolkit slices and keycloak-js'
          : 'Angular frontend using standalone components and keycloak-angular';
      const serviceFiles = Object.keys(projectContext.existingFiles)
        .filter((f) => f.startsWith('service/'))
        .join(', ');
      const appFiles = Object.keys(projectContext.existingFiles)
        .filter((f) => f.startsWith('app/'))
        .join(', ');
      return (
        `I am setting up a ${projectType.toUpperCase()} full-stack project called "${projectName}" ` +
        `for ADSP tenant "${tenant}" (nx-adsp plugin version ${pluginVersion}). ` +
        descriptionLine +
        `It has an Express service ("${projectName}-service") and a ${frontendStack} ("${projectName}-app"). ` +
        `Both have been uploaded to your workspace: service files (${serviceFiles}) and frontend files (${appFiles}). ` +
        `When writing generated files, use the service/ prefix for backend files and the app/ prefix for frontend files. ` +
        `What ADSP capabilities would be useful for this full-stack project?`
      );
    }

    const fileNames = Object.keys(projectContext.existingFiles).join(', ');
    return (
      `I am setting up a new ${projectType} called "${projectName}" ` +
      `for ADSP tenant "${tenant}" (nx-adsp plugin version ${pluginVersion}). ` +
      descriptionLine +
      `The project files (${fileNames}) have been uploaded to your workspace. ` +
      `What ADSP capabilities would be useful to integrate into this service?`
    );
  };

  const sendInitialMessage = () => {
    if (conversationStarted) return;
    conversationStarted = true;
    process.stdout.write('[nx-adsp] Type your replies at the > prompt. Press Ctrl+D or leave blank to apply generated files.\n\n');
    socket.emit('message', {
      agent: AGENT_ID,
      threadId,
      content: buildInitialMessage(),
      rawChunks: true,
    });
    startThinking();
    setTimeout(() => {
      stopThinking();
      if (!conversationDone && !agentHasResponded) {
        process.stdout.write(
          '\n[nx-adsp] No response after 2 minutes. ' +
            'The nxAdspAgent may still be deploying or the LLM is unresponsive. ' +
            'Press Ctrl+C to skip and continue generation.\n'
        );
      }
    }, 120000);
  };

  const requestWorkspaceState = () => {
    socket.emit('workspace-read', { agent: AGENT_ID, threadId });
  };

  const promptUser = () => {
    rl.question('\n> ', (input) => {
      const trimmed = input.trim();
      if (trimmed) {
        socket.emit('message', {
          agent: AGENT_ID,
          threadId,
          content: trimmed,
          rawChunks: true,
        });
        startThinking();
      } else {
        // Empty input — apply whatever the agent has generated.
        requestWorkspaceState();
      }
    });
  };

  const applyWorkspaceFiles = (files: { path: string; content: string }[]) => {
    let count = 0;
    for (const file of files) {
      // Skip files we uploaded that the agent hasn't modified.
      const original = projectContext.existingFiles[file.path];
      if (original !== undefined && original === file.content) {
        continue;
      }

      // Route to the correct project root. For composite generators (mern, mean)
      // files are prefixed with 'service/' or 'app/' to distinguish the two parts.
      let targetRoot = projectRoot;
      let relativePath = file.path;
      if (options?.additionalRoots) {
        for (const [prefix, root] of Object.entries(options.additionalRoots)) {
          if (file.path.startsWith(prefix + '/')) {
            targetRoot = root;
            relativePath = file.path.slice(prefix.length + 1);
            break;
          }
        }
        // Also strip the default 'service/' prefix when it matches projectRoot
        if (relativePath === file.path && file.path.startsWith('service/')) {
          relativePath = file.path.slice('service/'.length);
        }
      }

      host.write(`${targetRoot}/${relativePath}`, file.content);
      count++;
    }
    return count;
  };

  // Register socket handlers upfront so they are active while the description
  // prompt is being shown. readline handlers are registered after the prompt
  // (see below) to avoid enquirer leaving stdin in a bad state.

  socket.on('connect', () => {
    // Connect and upload silently — stdout writes here would interleave with
    // the description prompt that is active concurrently.
    // The server signals handler readiness via socket.send() after its async
    // getServiceConfiguration() resolves; wait for that before uploading.
    socket.once('message', () => {
      socket.emit('workspace-update', {
        agent: AGENT_ID,
        threadId,
        writes: Object.entries(projectContext.existingFiles).map(([path, content]) => ({
          path,
          content,
        })),
        deletes: [],
      });
    });
  });

  socket.on('workspace-updated', () => {
    workspaceReady = true;
    if (descriptionReady) {
      // Description was entered before upload finished — send now.
      sendInitialMessage();
    }
    // else: description prompt is still open — post-prompt code will call sendInitialMessage.
  });

  const describeToolCall = (toolName: string, args: Record<string, unknown>): string => {
    switch (toolName) {
      // Workspace tools (Mastra built-in names)
      case 'mastra_workspace_write_file': return `Writing:  ${args['path']}`;
      case 'mastra_workspace_edit_file':  return `Editing:  ${args['path']}`;
      case 'mastra_workspace_read_file':  return `Reading:  ${args['path']}`;
      case 'mastra_workspace_list_files': return `Listing workspace files`;
      // nx-adsp template tools (Mastra uses the agent registration key, not the tool id)
      case 'listNxAdspTemplatesTool':     return `Listing available ADSP templates`;
      case 'getNxAdspTemplateTool':       return `Getting template: ${args['templateId']}`;
      default:                            return `Tool: ${toolName}`;
    }
  };

  let firstDeltaOfTurn = true;

  socket.on('stream', ({ chunk, done }) => {
    if (chunk?.type === 'tool-call') {
      const p = chunk.payload as { toolName?: string; args?: Record<string, unknown> };
      if (p?.toolName) {
        stopThinking();
        process.stdout.write(`${DIM}[nx-adsp] ${describeToolCall(p.toolName, p.args ?? {})}${RESET}\n`);
      }
    }

    if (chunk?.type === 'text-delta') {
      const text: string = chunk.payload?.text ?? '';
      stopThinking();
      if (firstDeltaOfTurn) {
        // Blank line between the status/tool output and the agent's response text.
        process.stdout.write('\n');
        firstDeltaOfTurn = false;
      }
      buffer += text;
      agentHasResponded = true;
      process.stdout.write(text);
    }

    if (done) {
      if (buffer.length > 0 && !buffer.endsWith('\n')) {
        process.stdout.write('\n');
      }
      if (firstDeltaOfTurn) {
        // Agent completed its turn (possibly doing tool work) without sending any
        // text. Clear any active thinking indicator and show a dim hint so the
        // user knows the turn ended and they can reply or press Enter to finish.
        stopThinking();
        process.stdout.write(`${DIM}[nx-adsp] Agent completed work without a response — reply or press Enter to apply files.${RESET}\n`);
      }
      buffer = '';
      firstDeltaOfTurn = true;  // reset for the next turn
      promptUser();
    }
  });

  socket.on('workspace-state', ({ files }: { files: { path: string; content: string }[] }) => {
    // Only apply files the agent added or modified — not unchanged uploaded files.
    const written = applyWorkspaceFiles(files ?? []);
    if (written > 0) {
      process.stdout.write(`\nApplied ${written} file(s) from agent workspace.\n`);
    } else {
      process.stdout.write('\nNo files generated by agent.\n');
    }
    cleanup(written);
  });

  socket.on('session-expired', () => {
    process.stdout.write('\nAgent session expired.\n');
    requestWorkspaceState();
  });

  socket.on('connect_error', (err) => {
    const errAny = err as unknown as Record<string, unknown>;
    process.stdout.write(`\n[nx-adsp] Connection failed: ${err?.message ?? err}\n`);
    process.stdout.write(
      `[nx-adsp] Error detail: ${JSON.stringify(errAny?.description ?? errAny?.context ?? errAny?.cause ?? 'none')}\n`
    );
    cleanup(0);
  });

  socket.on('error', (err) => {
    process.stdout.write(`\n[nx-adsp] Agent error: ${JSON.stringify(err)}\n`);
    requestWorkspaceState();
  });

  // For continuation calls (shared thread from composite generator), skip the
  // description prompt — the agent already has context from the prior service
  // interaction on the same thread.
  if (isContinuation) {
    descriptionReady = true;
  } else {
    // Show description prompt while socket connects and uploads files in the background.
    try {
      const { prompt } = await import('enquirer');
      const answer = await prompt<{ description: string }>({
        type: 'input',
        name: 'description',
        message: `Briefly describe what ${projectContext.projectName} does:`,
      });
      description = answer.description?.trim() || undefined;
      descriptionReady = true;
    } catch {
      // Ctrl+C or cancellation during the description prompt.
      interrupted = true;
      cleanup(0);
      return conversationPromise;
    }
  }

  // Create readline after enquirer has fully released stdin so the two
  // libraries don't conflict over stdin state.
  rl = createInterface({ input: process.stdin, output: process.stdout });

  rl.on('SIGINT', () => {
    interrupted = true;
    process.stdout.write('\n');
    cleanup(0);
  });

  rl.on('close', () => {
    if (!conversationDone && !interrupted) {
      requestWorkspaceState();
    }
  });

  if (workspaceReady) {
    // Upload finished while the user was typing — send immediately.
    sendInitialMessage();
  } else {
    // Rare: user typed faster than the upload completed. Show a brief status
    // so the prompt doesn't appear to hang.
    process.stdout.write('[nx-adsp] Uploading project files to workspace...\n');
    // workspace-updated handler will call sendInitialMessage once upload completes.
  }

  return conversationPromise;
}

async function resolveAgentServiceUrl(
  directoryServiceUrl: string
): Promise<string | null> {
  try {
    const urls = await getServiceUrls(directoryServiceUrl);
    const apiUrl = urls[AGENT_SERVICE_URN];
    if (!apiUrl) return null;
    // The directory URL includes the REST API path (e.g. /agent/v1).
    // Socket.io attaches at the server root, so use only the origin.
    return new URL(apiUrl).origin;
  } catch {
    return null;
  }
}
