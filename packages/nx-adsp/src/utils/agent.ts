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
}

/**
 * Connect to the ADSP agent-service and conduct a multi-turn conversation
 * with the nx-adsp-agent. The agent uses its workspace tools to write
 * generated and modified files; this function retrieves the workspace state
 * after the conversation and applies all files to the Nx Tree.
 *
 * Returns null if agent-service is unavailable — callers should skip the
 * agent step gracefully in that case.
 */
export async function consultAgent(
  directoryServiceUrl: string,
  accessToken: string,
  projectContext: {
    projectName: string;
    projectType: 'express-service' | 'react-app' | 'angular-app';
    tenant: string;
    pluginVersion: string;
    /** Content of key integration files for the agent to read and potentially modify. */
    existingFiles: Record<string, string>;
  },
  host: Tree,
  projectRoot: string
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

  process.stdout.write(`\n[nx-adsp] Connecting to agent at ${agentServiceUrl}...\n`);

  return new Promise((resolve) => {
    const socket = io(agentServiceUrl, {
      auth: { token: accessToken },
      // Skip polling — go directly to WebSocket to avoid ARO ingress rejecting
      // the polling POST with HTTP 400.
      transports: ['websocket'],
      timeout: 30000,
      reconnection: false,
    });

    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const threadId = crypto.randomUUID();
    let buffer = '';
    let conversationDone = false;
    let agentHasResponded = false;

    // If stdin closes while waiting for user input, apply whatever the agent
    // wrote to the workspace and continue generation.
    rl.on('close', () => {
      if (!conversationDone) {
        requestWorkspaceState();
      }
    });

    const buildInitialMessage = () => {
      const fileNames = Object.keys(projectContext.existingFiles).join(', ');
      return (
        `This is a new generator session running in a developer terminal. ` +
        `Please keep responses brief — two or three plain sentences, no markdown formatting. ` +
        `Ask one question at a time and generate the integration code after one or two exchanges.\n\n` +
        `I am setting up a new ${projectContext.projectType} called "${projectContext.projectName}" ` +
        `for ADSP tenant "${projectContext.tenant}" (nx-adsp plugin version ${projectContext.pluginVersion}). ` +
        `The project files (${fileNames}) have been uploaded to your workspace. ` +
        `What ADSP capabilities would be useful to integrate into this service?`
      );
    };

    const sendMessage = (content: string) => {
      socket.emit('message', {
        agent: AGENT_ID,
        threadId,
        content,
        rawChunks: true,
      });
    };

    const requestWorkspaceState = () => {
      socket.emit('workspace-read', { agent: AGENT_ID, threadId });
    };

    const uploadFilesToWorkspace = () => {
      socket.emit('workspace-update', {
        agent: AGENT_ID,
        threadId,
        writes: Object.entries(projectContext.existingFiles).map(([path, content]) => ({
          path,
          content,
        })),
        deletes: [],
      });
    };

    const promptUser = () => {
      rl.question('\n> ', (input) => {
        const trimmed = input.trim();
        if (trimmed) {
          sendMessage(trimmed);
        } else {
          // Empty input — apply whatever the agent has generated.
          requestWorkspaceState();
        }
      });
    };

    const applyWorkspaceFiles = (files: { path: string; content: string }[]) => {
      let count = 0;
      for (const file of files) {
        // Skip files we uploaded that the agent hasn't modified — only apply
        // new files and agent-modified versions of existing files.
        const original = projectContext.existingFiles[file.path];
        if (original !== undefined && original === file.content) {
          continue;
        }
        const fullPath = `${projectRoot}/${file.path}`;
        host.write(fullPath, file.content);
        count++;
      }
      return count;
    };

    const cleanup = (filesWritten: number) => {
      conversationDone = true;
      rl.close();
      socket.disconnect();
      // Return null for silent skips (no agent, no token, connection failed).
      // Return a result with userInteracted:true when the user was in a
      // conversation so the caller can ask whether to proceed.
      resolve(agentHasResponded ? { filesWritten, userInteracted: true } : null);
    };

    socket.on('workspace-updated', () => {
      process.stdout.write('[nx-adsp] Project files uploaded to workspace.\n');
      process.stdout.write('[nx-adsp] Type your replies at the > prompt. Press Ctrl+D or leave blank to apply generated files.\n\n');
      sendMessage(buildInitialMessage());
    });

    socket.on('connect', () => {
      process.stdout.write('[nx-adsp] Connected to agent-service.\n');
      process.stdout.write('[nx-adsp] Uploading project files to workspace...\n');
      uploadFilesToWorkspace();

      // Show periodic dots while waiting for first response, then a warning at 2 minutes.
      const dotInterval = setInterval(() => {
        if (!conversationDone && !agentHasResponded) process.stdout.write('.');
        else clearInterval(dotInterval);
      }, 3000);
      setTimeout(() => {
        clearInterval(dotInterval);
        if (!conversationDone && !agentHasResponded) {
          process.stdout.write(
            '\n[nx-adsp] No response after 2 minutes. ' +
            'The nxAdspAgent may still be deploying or the LLM is unresponsive. ' +
            'Press Ctrl+C to skip and continue generation.\n'
          );
        }
      }, 120000);
    });

    socket.on('stream', ({ chunk, done }) => {
      if (chunk?.type === 'text-delta') {
        const text: string = chunk.payload?.text ?? '';
        buffer += text;
        agentHasResponded = true;
        process.stdout.write(text);
      }

      if (done) {
        if (buffer.length > 0 && !buffer.endsWith('\n')) {
          process.stdout.write('\n');
        }
        buffer = '';
        // Agent finished its turn — prompt the user to continue the conversation
        // or press Enter to apply whatever the agent has written so far.
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
      // Log the full error object so we can diagnose the root cause.
      const errAny = err as unknown as Record<string, unknown>;
      process.stdout.write(`\n[nx-adsp] Connection failed: ${err?.message ?? err}\n`);
      process.stdout.write(`[nx-adsp] Error detail: ${JSON.stringify(errAny?.description ?? errAny?.context ?? errAny?.cause ?? 'none')}\n`);
      cleanup(0);
    });
    socket.on('error', (err) => {
      process.stdout.write(`\n[nx-adsp] Agent error: ${JSON.stringify(err)}\n`);
      requestWorkspaceState();
    });
  });
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
