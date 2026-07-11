#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ROOT } from './lib/paths.mjs';

const EXACT_VERSION_RE = /^(\d+)\.(\d+)\.(\d+)$/u;
const PACKAGE_MANAGER_RE = /^npm@(\d+\.\d+\.\d+)$/u;
const SETUP_NODE_RE = /^\s*-\s+uses:\s+actions\/setup-node@/mu;
const NODE_VERSION_FILE_RE = /^\s+node-version-file:\s*['"]?\.nvmrc['"]?\s*(?:#.*)?$/mu;
const NODE_VERSION_RE = /^\s+node-version:/mu;

function normalizedVersion(value) {
  return String(value || '').trim().replace(/^v/u, '');
}

function versionMajor(value) {
  const match = EXACT_VERSION_RE.exec(normalizedVersion(value));
  return match ? Number(match[1]) : null;
}

export function auditToolchainContract({
  packageJson,
  nvmrc,
  workflows,
  nodeVersion,
  npmVersion,
}) {
  const failures = [];
  const packageManager = String(packageJson.packageManager || '');
  const packageManagerMatch = PACKAGE_MANAGER_RE.exec(packageManager);
  const pinnedNpm = packageManagerMatch?.[1] || null;
  const pinnedNode = normalizedVersion(nvmrc);
  const pinnedNodeMajor = versionMajor(pinnedNode);
  const pinnedNpmMajor = versionMajor(pinnedNpm);

  if (!pinnedNpm) {
    failures.push('package.json packageManager must be an exact npm@x.y.z version');
  }
  if (!pinnedNodeMajor) {
    failures.push('.nvmrc must contain one exact x.y.z Node version');
  }

  if (pinnedNodeMajor && packageJson.engines?.node !== `>=${pinnedNode} <${pinnedNodeMajor + 1}`) {
    failures.push(
      `package.json engines.node must describe the supported range >=${pinnedNode} <${pinnedNodeMajor + 1}`,
    );
  }
  if (pinnedNpmMajor && packageJson.engines?.npm !== `>=${pinnedNpm} <${pinnedNpmMajor + 1}`) {
    failures.push(
      `package.json engines.npm must describe the supported range >=${pinnedNpm} <${pinnedNpmMajor + 1}`,
    );
  }

  const actualNode = normalizedVersion(nodeVersion);
  if (pinnedNodeMajor && actualNode !== pinnedNode) {
    failures.push(`running Node ${actualNode || '(unknown)'} does not equal canonical ${pinnedNode}`);
  }

  const actualNpm = normalizedVersion(npmVersion);
  if (pinnedNpm && actualNpm !== pinnedNpm) {
    failures.push(`running npm ${actualNpm || '(unknown)'} does not equal ${pinnedNpm}`);
  }

  const workflowEntries = Object.entries(workflows || {});
  if (workflowEntries.length === 0) failures.push('no GitHub Actions workflows were found');

  for (const [name, source] of workflowEntries) {
    if (!SETUP_NODE_RE.test(source)) continue;
    if (!NODE_VERSION_FILE_RE.test(source)) {
      failures.push(`${name} setup-node must use node-version-file: .nvmrc`);
    }
    if (NODE_VERSION_RE.test(source)) {
      failures.push(`${name} must not duplicate a node-version value`);
    }

    const installIndex = source.indexOf('npm install --global');
    const packageManagerIndex = source.indexOf("require('./package.json').packageManager");
    const auditIndex = source.indexOf('node scripts/audit-toolchain.mjs');
    const ciIndex = source.indexOf('npm ci');
    if (ciIndex >= 0 && (
      installIndex < 0
      || packageManagerIndex < installIndex
      || installIndex > ciIndex
    )) {
      failures.push(`${name} must install package.json packageManager before npm ci`);
    }
    if (ciIndex >= 0 && (
      auditIndex < 0
      || auditIndex < installIndex
      || auditIndex > ciIndex
    )) {
      failures.push(`${name} must run node scripts/audit-toolchain.mjs after npm selection and before npm ci`);
    }
  }

  return failures;
}

export function readWorkflowSources(root = ROOT) {
  const directory = path.join(root, '.github', 'workflows');
  return Object.fromEntries(
    fs.readdirSync(directory)
      .filter((name) => /\.ya?ml$/u.test(name))
      .sort()
      .map((name) => [name, fs.readFileSync(path.join(directory, name), 'utf8')]),
  );
}

export function readNpmVersion() {
  const result = spawnSync('npm', ['--version'], { encoding: 'utf8' });
  if (result.status !== 0) return '';
  return result.stdout.trim();
}

export function auditRepositoryToolchain(root = ROOT) {
  const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const nvmrc = fs.readFileSync(path.join(root, '.nvmrc'), 'utf8');
  return auditToolchainContract({
    packageJson,
    nvmrc,
    workflows: readWorkflowSources(root),
    nodeVersion: process.versions.node,
    npmVersion: readNpmVersion(),
  });
}

function main() {
  const failures = auditRepositoryToolchain();
  if (failures.length > 0) {
    console.error('[toolchain] contract failed:');
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
  }

  console.log(`[toolchain] Node ${process.versions.node} and npm ${readNpmVersion()} match the repository contract.`);
}

if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1] || '')) main();
