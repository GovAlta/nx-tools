#!/usr/bin/env node
// Audits the dependency ranges the generators write into consuming workspaces.
//
// These ranges are string literals in generator bodies, so they are invisible
// to this repo's own `npm audit` (none of the packages appear in any manifest
// here) and to Dependabot and Renovate (both read manifests and lockfiles).
// Nothing else in CI looks at them; a new advisory against a generated app's
// dependency surfaces only when someone happens to notice.
//
// Deliberately scoped to what the generators pin themselves. The rest of a
// generated app's dependencies come from the delegated @nx/* generators and
// move with the consumer's Nx version — see nx-alignment.js for the check that
// covers where the two overlap, and `nx migrate` for keeping that layer current.
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { extract } = require('./extract');
const { buildOwnerIndex, ownerChain } = require('./owners');

const THRESHOLD = process.env.AUDIT_LEVEL || 'high';
const SEVERITY_ORDER = ['info', 'low', 'moderate', 'high', 'critical'];

function meetsThreshold(severity) {
  return SEVERITY_ORDER.indexOf(severity) >= SEVERITY_ORDER.indexOf(THRESHOLD);
}

function singleRange(byRange, name) {
  const ranges = [...byRange.keys()];
  if (ranges.length > 1) {
    const where = ranges
      .map((r) => `${r} (${byRange.get(r).join(', ')})`)
      .join(' vs ');
    console.log(`  ! ${name} is pinned inconsistently: ${where}`);
  }
  // Audit the loosest range when generators disagree — it admits the widest
  // set of resolutions, so it is the one that can surface a finding the
  // stricter pin would hide.
  return ranges[0];
}

function synthesizeManifest(extracted) {
  const toObject = (map) => {
    const out = {};
    for (const [name, byRange] of [...map].sort(([a], [b]) =>
      a.localeCompare(b),
    )) {
      out[name] = singleRange(byRange, name);
    }
    return out;
  };
  return {
    name: 'emitted-deps-audit-probe',
    version: '0.0.0',
    private: true,
    dependencies: toObject(extracted.dependencies),
    devDependencies: toObject(extracted.devDependencies),
  };
}

function resolveAndAudit(manifest) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'emitted-deps-audit-'));
  fs.writeFileSync(
    path.join(dir, 'package.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );

  // --package-lock-only resolves the tree without downloading tarballs, which
  // is all `npm audit` needs. --legacy-peer-deps because this probe manifest is
  // the union of every generator's pins — React, Vue and Angular apps never
  // share a real workspace, so their peer conflicts here are an artifact of the
  // probe and say nothing about any generated app.
  execFileSync(
    'npm',
    [
      'install',
      '--package-lock-only',
      '--no-audit',
      '--no-fund',
      '--legacy-peer-deps',
    ],
    { cwd: dir, stdio: ['ignore', 'ignore', 'inherit'] },
  );

  const lock = JSON.parse(
    fs.readFileSync(path.join(dir, 'package-lock.json'), 'utf8'),
  );

  let raw;
  try {
    raw = execFileSync('npm', ['audit', '--json'], {
      cwd: dir,
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
    });
  } catch (error) {
    // `npm audit` exits non-zero whenever it finds anything, so a non-zero exit
    // with parseable JSON on stdout is the normal path, not a failure.
    raw = error.stdout;
    if (!raw) throw error;
  }
  return { report: JSON.parse(raw), lock };
}

function advisoryId(via) {
  const match = /\/(GHSA-[a-z0-9-]+)$/i.exec(via.url || '');
  return match ? match[1] : `npm-${via.source}`;
}

function main() {
  const extracted = extract('packages');
  const manifest = synthesizeManifest(extracted);
  const emitted = new Set([
    ...Object.keys(manifest.dependencies),
    ...Object.keys(manifest.devDependencies),
  ]);
  console.log(
    `Auditing ${emitted.size} dependency ranges emitted by the generators (threshold: ${THRESHOLD}).\n`,
  );

  const { report, lock } = resolveAndAudit(manifest);
  const dependents = buildOwnerIndex(lock);
  const allowlist = new Map(
    require('./allowlist.json').advisories.map((entry) => [entry.id, entry]),
  );

  const findings = new Map();
  for (const [name, vuln] of Object.entries(report.vulnerabilities || {})) {
    for (const via of vuln.via) {
      if (typeof via !== 'object') continue;
      const id = advisoryId(via);
      if (!findings.has(id)) {
        const chains = [
          ...new Set(
            (vuln.nodes || [])
              .map((node) => ownerChain(dependents, emitted, node))
              .filter(Boolean)
              .map((chain) => chain.join(' > ')),
          ),
        ];
        findings.set(id, {
          id,
          package: name,
          title: via.title,
          severity: via.severity,
          range: via.range,
          url: via.url,
          // A direct pin is one we can fix here; anything else is reached
          // through a dependency's own pin and needs that project to move.
          direct: emitted.has(name),
          chains,
        });
      }
    }
  }

  const blocking = [];
  const allowed = [];
  for (const finding of findings.values()) {
    if (!meetsThreshold(finding.severity)) continue;
    (allowlist.has(finding.id) ? allowed : blocking).push(finding);
  }

  if (allowed.length) {
    console.log(`Accepted (${allowed.length}):`);
    for (const finding of allowed) {
      const entry = allowlist.get(finding.id);
      console.log(
        `  - ${finding.id} ${finding.package} (${finding.severity}) — reviewed ${entry.reviewed}`,
      );
    }
    console.log('');
  }

  const staleAllowlist = [...allowlist.keys()].filter(
    (id) => !findings.has(id),
  );
  if (staleAllowlist.length) {
    console.log(
      `Allowlist entries that no longer match a finding — delete them: ${staleAllowlist.join(', ')}\n`,
    );
  }

  if (!blocking.length) {
    console.log(`No un-accepted findings at or above ${THRESHOLD}.`);
    return staleAllowlist.length ? 1 : 0;
  }

  console.log(`Findings needing a decision (${blocking.length}):\n`);
  for (const finding of blocking.sort(
    (a, b) =>
      SEVERITY_ORDER.indexOf(b.severity) - SEVERITY_ORDER.indexOf(a.severity),
  )) {
    console.log(`  ${finding.severity.toUpperCase()}  ${finding.package}`);
    console.log(`    ${finding.title}`);
    console.log(`    vulnerable: ${finding.range}`);
    if (finding.direct) {
      console.log('    pinned directly by a generator — bump it');
    } else {
      for (const chain of finding.chains) {
        console.log(`    via ${chain}`);
      }
      if (!finding.chains.length) {
        console.log('    no path back to a generator pin — probe artifact');
      }
    }
    console.log(`    ${finding.url}\n`);
  }
  console.log(
    'Fix by bumping the generator pin, or add an allowlist.json entry with a reason and a reviewed date.',
  );
  return 1;
}

process.exit(main());
