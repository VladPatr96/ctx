/**
 * api-generate-spec.js — Генерация спецификации в файл
 */

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

export default async function apiGenerateSpec(args, ctx) {
  const { appendLog } = ctx || {};
  
  const routes = args.routes || 'src/routes';
  const output = args.output || 'openapi.yaml';
  const format = output.endsWith('.json') ? 'json' : 'yaml';
  
  // Mock implementation
  const spec = {
    openapi: '3.0.0',
    info: {
      title: 'API',
      version: '1.0.0'
    },
    paths: {
      '/api/users': {
        get: { summary: 'List users' },
        post: { summary: 'Create user' }
      }
    }
  };
  
  // Write to file
  const content = format === 'json' 
    ? JSON.stringify(spec, null, 2)
    : yamlStringify(spec);
  
  writeFileSync(output, content, 'utf-8');
  
  const result = {
    output,
    format,
    endpoints: Object.keys(spec.paths).length,
    generatedAt: new Date().toISOString()
  };
  
  if (appendLog) {
    appendLog({ action: 'api_generate_spec', output, endpoints: result.endpoints });
  }
  
  return result;
}

function yamlStringify(obj, indent = 0) {
  // Simple YAML stringify (mock)
  return JSON.stringify(obj, null, 2);
}
