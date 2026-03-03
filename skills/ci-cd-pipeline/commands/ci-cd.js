/**
 * ci-cd.js — Главная команда генерации CI/CD
 */

import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export default async function ciCd(args, ctx) {
  const { appendLog } = ctx || {};
  
  const platform = args.platform || 'github';
  const stages = (args.stages || 'test,build,deploy').split(',');
  const rootDir = process.cwd();
  
  // Generate GitHub Actions
  if (platform === 'github') {
    const workflowDir = join(rootDir, '.github', 'workflows');
    if (!existsSync(workflowDir)) {
      mkdirSync(workflowDir, { recursive: true });
    }
    
    const workflow = `name: CI/CD Pipeline

on:
  push:
    branches: [main, master]
  pull_request:
    branches: [main]

jobs:
${stages.includes('test') ? `  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: 20
      - run: npm ci
      - run: npm test
      - run: npm run coverage
` : ''}${stages.includes('build') ? `
  build:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - run: docker build -t app:\${{ github.sha }} .
      - run: docker push registry/app:\${{ github.sha }}
` : ''}${stages.includes('deploy') ? `
  deploy:
    needs: build
    runs-on: ubuntu-latest
    steps:
      - run: kubectl apply -f k8s/
      - run: kubectl rollout status deployment/app
` : ''}`;
    
    writeFileSync(join(workflowDir, 'ci-cd.yml'), workflow, 'utf-8');
  }
  
  const result = {
    platform,
    stages,
    file: `${platform === 'github' ? '.github/workflows/ci-cd.yml' : '.gitlab-ci.yml'}`,
    generatedAt: new Date().toISOString()
  };
  
  if (appendLog) {
    appendLog({ action: 'ci_cd', platform, stages: stages.length });
  }
  
  return result;
}
