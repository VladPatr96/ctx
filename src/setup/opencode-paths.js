import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';

export function resolveHomeDir(env = process.env) {
  return env.HOME || env.USERPROFILE || '';
}

export function getOpenCodeSkillsDirCandidates(env = process.env) {
  const home = resolveHomeDir(env);
  const candidates = [
    env.CTX_OPENCODE_SKILLS_DIR,
    env.APPDATA && join(env.APPDATA, 'OpenCode', 'skills'),
    env.LOCALAPPDATA && join(env.LOCALAPPDATA, 'OpenCode', 'skills'),
    env.USERPROFILE && join(env.USERPROFILE, '.opencode', 'skills'),
    home && join(home, '.opencode', 'skills'),
    home && join(home, '.config', 'opencode', 'skills'),
    env.ProgramFiles && join(env.ProgramFiles, 'OpenCode', 'skills'),
    env['ProgramFiles(x86)'] && join(env['ProgramFiles(x86)'], 'OpenCode', 'skills'),
  ].filter(Boolean);

  return [...new Set(candidates)];
}

export function findOpenCodeSkillsDir({
  env = process.env,
  exists = existsSync,
  stat = statSync,
} = {}) {
  for (const candidate of getOpenCodeSkillsDirCandidates(env)) {
    if (!exists(candidate)) continue;
    try {
      if (stat(candidate).isDirectory()) {
        return candidate;
      }
    } catch {
      // Ignore inaccessible candidates.
    }
  }
  return null;
}

export function hasOpenCodeCtxInstall({
  env = process.env,
  exists = existsSync,
} = {}) {
  return getOpenCodeSkillsDirCandidates(env).some((skillsDir) => (
    exists(join(skillsDir, 'ctx', 'SKILL.md'))
  ));
}
