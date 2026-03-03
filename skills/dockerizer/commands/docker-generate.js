/**
 * docker-generate.js — Генерация Dockerfile по типу
 */

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

export default async function dockerGenerate(args, ctx) {
  const { appendLog } = ctx || {};
  
  const type = args.type || 'multi-stage';
  const rootDir = process.cwd();
  
  let dockerfile = '';
  
  if (type === 'multi-stage') {
    dockerfile = `# Multi-stage build
FROM node:20-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# Production
FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules

EXPOSE 3000
CMD ["node", "dist/index.js"]
`;
  } else if (type === 'simple') {
    dockerfile = `FROM node:20-alpine

WORKDIR /app
COPY package*.json ./
RUN npm install

COPY . .
EXPOSE 3000
CMD ["npm", "start"]
`;
  }
  
  // Write file
  writeFileSync(join(rootDir, 'Dockerfile'), dockerfile, 'utf-8');
  
  const result = {
    file: 'Dockerfile',
    type,
    generatedAt: new Date().toISOString()
  };
  
  if (appendLog) {
    appendLog({ action: 'docker_generate', type });
  }
  
  return result;
}
