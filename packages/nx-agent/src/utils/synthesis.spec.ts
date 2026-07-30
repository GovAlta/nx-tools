import {
  buildDeterministicSummary,
  synthesize,
  tryClaudeCli,
  tryCopilotCli,
} from './synthesis';

jest.mock('child_process', () => ({
  ...jest.requireActual('child_process'),
  execSync: jest.fn(),
  execFileSync: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { execSync, execFileSync } = require('child_process') as {
  execSync: jest.Mock;
  execFileSync: jest.Mock;
};

// Simulates `command -v <cmd>` succeeding only for the given commands —
// everything else behaves as "not on PATH".
function onlyOnPath(...available: string[]) {
  execSync.mockImplementation((cmd: string) => {
    const found = available.some((c) => cmd.includes(c));
    if (!found) {
      throw new Error('not found');
    }
    return Buffer.from('');
  });
}

beforeEach(() => {
  execSync.mockReset();
  execFileSync.mockReset();
});

describe('tryClaudeCli / tryCopilotCli', () => {
  it('returns the CLI output when claude is on PATH and responds', () => {
    onlyOnPath('claude');
    execFileSync.mockReturnValue('  A synthesized summary.  \n');

    expect(tryClaudeCli('prompt text')).toBe('A synthesized summary.');
    expect(execFileSync).toHaveBeenCalledWith(
      'claude',
      ['-p', 'prompt text', '--output-format', 'text'],
      expect.objectContaining({ encoding: 'utf-8' }),
    );
  });

  it('skips the CLI call entirely when claude is not on PATH', () => {
    onlyOnPath(); // nothing available
    expect(tryClaudeCli('prompt text')).toBeUndefined();
    expect(execFileSync).not.toHaveBeenCalled();
  });

  it('returns undefined when execFileSync throws (non-zero exit or timeout)', () => {
    onlyOnPath('claude');
    execFileSync.mockImplementation(() => {
      throw new Error('timed out');
    });
    expect(tryClaudeCli('prompt text')).toBeUndefined();
  });

  it('treats whitespace-only output as no result', () => {
    onlyOnPath('claude');
    execFileSync.mockReturnValue('   \n\t  ');
    expect(tryClaudeCli('prompt text')).toBeUndefined();
  });

  it('checks the copilot binary directly, not gh, to avoid triggering an auto-download', () => {
    onlyOnPath('gh'); // gh is on PATH, but the copilot binary is not
    expect(tryCopilotCli('prompt text')).toBeUndefined();
    expect(execFileSync).not.toHaveBeenCalled();
  });

  it('invokes gh copilot -p when the copilot binary is on PATH', () => {
    onlyOnPath('copilot');
    execFileSync.mockReturnValue('Copilot summary.');

    expect(tryCopilotCli('prompt text')).toBe('Copilot summary.');
    expect(execFileSync).toHaveBeenCalledWith(
      'gh',
      ['copilot', '-p', 'prompt text'],
      expect.objectContaining({ encoding: 'utf-8' }),
    );
  });
});

describe('synthesize', () => {
  it('prefers claude when both claude and copilot are available', () => {
    onlyOnPath('claude', 'copilot');
    execFileSync.mockReturnValue('Claude summary.');

    const result = synthesize('prompt', 'deterministic summary', false);
    expect(result).toEqual({ text: 'Claude summary.', source: 'claude' });
  });

  it('falls back to copilot when claude is unavailable', () => {
    onlyOnPath('copilot');
    execFileSync.mockReturnValue('Copilot summary.');

    const result = synthesize('prompt', 'deterministic summary', false);
    expect(result).toEqual({ text: 'Copilot summary.', source: 'copilot' });
  });

  it('falls through from claude to copilot when the claude call itself fails', () => {
    onlyOnPath('claude', 'copilot');
    execFileSync
      .mockImplementationOnce(() => {
        throw new Error('claude failed');
      })
      .mockImplementationOnce(() => 'Copilot summary.');

    const result = synthesize('prompt', 'deterministic summary', false);
    expect(result).toEqual({ text: 'Copilot summary.', source: 'copilot' });
  });

  it('falls back to the deterministic summary when neither CLI is on PATH', () => {
    onlyOnPath();
    const result = synthesize('prompt', 'deterministic summary', false);
    expect(result).toEqual({
      text: 'deterministic summary',
      source: 'deterministic',
    });
    expect(execFileSync).not.toHaveBeenCalled();
  });

  it('forces the deterministic path when noSynthesis is true, without attempting any CLI', () => {
    onlyOnPath('claude', 'copilot'); // both would otherwise be available
    const result = synthesize('prompt', 'deterministic summary', true);
    expect(result).toEqual({
      text: 'deterministic summary',
      source: 'deterministic',
    });
    expect(execFileSync).not.toHaveBeenCalled();
  });
});

describe('buildDeterministicSummary', () => {
  it('states the total and type breakdown with no open/orphan/broken activity', () => {
    const summary = buildDeterministicSummary({
      totalArtifacts: 3,
      byType: { 'domain-terms': 2, 'bounded-contexts': 1 },
      open: 0,
      resolved: 0,
      orphans: 0,
      brokenRefs: 0,
    });
    expect(summary).toBe(
      '3 project-docs artifact(s) tracked (2 domain-terms, 1 bounded-contexts).',
    );
  });

  it('includes open/resolved, orphan, and broken-ref sentences when present', () => {
    const summary = buildDeterministicSummary({
      totalArtifacts: 5,
      byType: { 'open-questions': 2 },
      open: 1,
      resolved: 1,
      orphans: 2,
      brokenRefs: 1,
    });
    expect(summary).toContain('1 resolved, 1 still open.');
    expect(summary).toContain('2 orphaned (nothing derives from them yet).');
    expect(summary).toContain('1 broken reference(s).');
  });

  it('omits the type breakdown parenthetical when byType is empty', () => {
    const summary = buildDeterministicSummary({
      totalArtifacts: 0,
      byType: {},
      open: 0,
      resolved: 0,
      orphans: 0,
      brokenRefs: 0,
    });
    expect(summary).toBe('0 project-docs artifact(s) tracked.');
  });
});
