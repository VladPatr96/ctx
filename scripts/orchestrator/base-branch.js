import { runCommand } from '../utils/shell.js';

function normalizeBranchName(value) {
  const branch = String(value || '').trim();
  return branch.length > 0 ? branch : null;
}

function stripRemotePrefix(branch) {
  return branch?.startsWith('origin/') ? branch.slice('origin/'.length) : branch;
}

async function branchExists(branch, cwd, runCommandFn) {
  const result = await runCommandFn('git', ['show-ref', '--verify', '--quiet', `refs/heads/${branch}`], {
    cwd,
    shell: false,
  });
  return result.success;
}

async function readFirstBranch(candidates, cwd, runCommandFn) {
  for (const branch of candidates) {
    if (await branchExists(branch, cwd, runCommandFn)) {
      return branch;
    }
  }
  return null;
}

export async function detectBaseBranch({
  cwd = process.cwd(),
  runCommandFn = runCommand,
} = {}) {
  const localPreferred = await readFirstBranch(['main', 'master'], cwd, runCommandFn);
  if (localPreferred) return localPreferred;

  const remoteHead = await runCommandFn('git', ['symbolic-ref', '--quiet', '--short', 'refs/remotes/origin/HEAD'], {
    cwd,
    shell: false,
  });
  const remoteBranch = stripRemotePrefix(normalizeBranchName(remoteHead.stdout));
  if (remoteHead.success && remoteBranch && await branchExists(remoteBranch, cwd, runCommandFn)) {
    return remoteBranch;
  }

  const currentBranch = await runCommandFn('git', ['branch', '--show-current'], {
    cwd,
    shell: false,
  });
  const current = normalizeBranchName(currentBranch.stdout);
  if (current) return current;

  const localBranches = await runCommandFn('git', ['for-each-ref', '--format=%(refname:short)', 'refs/heads'], {
    cwd,
    shell: false,
  });
  if (localBranches.success) {
    const firstLocal = normalizeBranchName((localBranches.stdout || '').split(/\r?\n/).find(Boolean));
    if (firstLocal) return firstLocal;
  }

  return 'master';
}

export async function resolveBaseBranch(requestedBaseBranch, {
  cwd = process.cwd(),
  runCommandFn = runCommand,
} = {}) {
  if (typeof requestedBaseBranch === 'string' && requestedBaseBranch.trim().length > 0) {
    return requestedBaseBranch.trim();
  }
  return detectBaseBranch({ cwd, runCommandFn });
}
