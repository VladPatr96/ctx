/**
 * docker-compose.js — Генерация docker-compose.yml
 */

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

export default async function dockerCompose(args, ctx) {
  const { appendLog } = ctx || {};
  
  const services = (args.services || 'app,db,redis').split(',');
  const rootDir = process.cwd();
  
  // Generate docker-compose.yml
  const compose = `version: '3.8'

services:
${services.includes('app') ? `  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
    depends_on:
      - db
      - redis
` : ''}${services.includes('db') ? `
  db:
    image: postgres:15-alpine
    ports:
      - "5432:5432"
    environment:
      POSTGRES_DB: app
      POSTGRES_USER: user
      POSTGRES_PASSWORD: password
    volumes:
      - postgres_data:/var/lib/postgresql/data
` : ''}${services.includes('redis') ? `
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
` : ''}
volumes:
  postgres_data:
  redis_data:
`;
  
  // Write file
  writeFileSync(join(rootDir, 'docker-compose.yml'), compose, 'utf-8');
  
  const result = {
    file: 'docker-compose.yml',
    services: services.length,
    generatedAt: new Date().toISOString()
  };
  
  if (appendLog) {
    appendLog({ action: 'docker_compose', services: services.length });
  }
  
  return result;
}
