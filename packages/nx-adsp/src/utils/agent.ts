import { createInterface } from 'readline';
import { Tree } from '@nx/devkit';
import { io } from 'socket.io-client';
import { getServiceUrls } from '@abgov/nx-oc';

const AGENT_SERVICE_URN = 'urn:ads:platform:agent-service:v1';
const AGENT_ID = 'nx-adsp-agent';

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
  const agentServiceUrl = await resolveAgentServiceUrl(directoryServiceUrl);
  if (!agentServiceUrl) {
    return null;
  }

  return new Promise((resolve) => {
    const socket = io(agentServiceUrl, {
      auth: { token: accessToken },
      timeout: 30000,
      reconnection: false,
    });

    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const threadId = crypto.randomUUID();
    let buffer = '';
    let conversationDone = false;

    // If stdin closes while waiting for user input, apply whatever the agent
    // wrote to the workspace and continue generation.
    rl.on('close', () => {
      if (!conversationDone) {
        requestWorkspaceState();
      }
    });

    const buildInitialMessage = () => {
      const fileSection = Object.entries(projectContext.existingFiles)
        .map(([path, content]) => `${path}:\n\`\`\`typescript\n${content}\n\`\`\``)
        .join('\n\n');

      return (
        `I am setting up a new ${projectContext.projectType} called "${projectContext.projectName}" ` +
        `for ADSP tenant "${projectContext.tenant}" (nx-adsp plugin version ${projectContext.pluginVersion}).\n\n` +
        `Existing project files:\n\n${fileSection}\n\n` +
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

    const promptUser = () => {
      rl.question('\n> ', (input) => {
        const trimmed = input.trim();
        if (trimmed) {
          sendMessage(trimmed);
        } else {
          // Empty input — user is skipping; resolve without files.
          cleanup(0);
        }
      });
    };

    const applyWorkspaceFiles = (files: { path: string; content: string }[]) => {
      let count = 0;
      for (const file of files) {
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
      resolve(filesWritten > 0 ? { filesWritten } : null);
    };

    socket.on('connect', () => {
      sendMessage(buildInitialMessage());
    });

    socket.on('stream', ({ chunk, done }) => {
      if (chunk?.type === 'text-delta') {
        const text: string = chunk.payload?.text ?? '';
        buffer += text;
        process.stdout.write(text);
      }

      if (done) {
        if (buffer.length > 0 && !buffer.endsWith('\n')) {
          process.stdout.write('\n');
        }
        buffer = '';
        // Agent has finished its response — request workspace state to get
        // any files it wrote, or ask user for follow-up if needed.
        requestWorkspaceState();
      }
    });

    socket.on('workspace-state', ({ files }: { files: { path: string; content: string }[] }) => {
      if (files?.length > 0) {
        const written = applyWorkspaceFiles(files);
        process.stdout.write(`\nApplied ${written} file(s) from agent workspace.\n`);
        cleanup(written);
      } else {
        // No files written yet — agent may need more input.
        promptUser();
      }
    });

    socket.on('session-expired', () => {
      process.stdout.write('\nAgent session expired.\n');
      requestWorkspaceState();
    });

    socket.on('connect_error', () => cleanup(0));
    socket.on('error', () => requestWorkspaceState());
  });
}

async function resolveAgentServiceUrl(
  directoryServiceUrl: string
): Promise<string | null> {
  try {
    const urls = await getServiceUrls(directoryServiceUrl);
    return urls[AGENT_SERVICE_URN] ?? null;
  } catch {
    return null;
  }
}
