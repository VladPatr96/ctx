/**
 * api-design.js — Главная команда генерации API спецификаций
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Найти Express/Fastify маршруты
 */
function findRoutes(directory) {
  const routes = [];
  
  function walk(dir) {
    const entries = readdirSync(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.name.endsWith('.js') || entry.name.endsWith('.ts')) {
        const content = readFileSync(fullPath, 'utf-8');
        const fileRoutes = parseRoutes(content, fullPath);
        routes.push(...fileRoutes);
      }
    }
  }
  
  try {
    walk(directory);
  } catch (error) {
    // ignore
  }
  
  return routes;
}

/**
 * Парсинг маршрутов из кода
 */
function parseRoutes(content, file) {
  const routes = [];
  
  // Express pattern: app.get('/path', ...)
  const expressPattern = /(?:app|router)\.(get|post|put|delete|patch)\s*\(\s*['"`]([^'"`]+)['"`]/gi;
  
  let match;
  while ((match = expressPattern.exec(content)) !== null) {
    routes.push({
      method: match[1].toUpperCase(),
      path: match[2],
      file
    });
  }
  
  // Fastify pattern: fastify.get('/path', ...)
  const fastifyPattern = /fastify\.(get|post|put|delete|patch)\s*\(\s*['"`]([^'"`]+)['"`]/gi;
  
  while ((match = fastifyPattern.exec(content)) !== null) {
    if (!routes.find(r => r.method === match[1].toUpperCase() && r.path === match[2])) {
      routes.push({
        method: match[1].toUpperCase(),
        path: match[2],
        file
      });
    }
  }
  
  return routes;
}

/**
 * Генерация OpenAPI спецификации
 */
function generateOpenAPI(routes, title, version) {
  const spec = {
    openapi: '3.0.0',
    info: {
      title: title || 'API',
      version: version || '1.0.0'
    },
    paths: {}
  };
  
  for (const route of routes) {
    const path = route.path.replace(/:([^/]+)/g, '{$1}');
    
    if (!spec.paths[path]) {
      spec.paths[path] = {};
    }
    
    spec.paths[path][route.method.toLowerCase()] = {
      summary: `${route.method} ${path}`,
      responses: {
        '200': {
          description: 'Success',
          content: {
            'application/json': {
              schema: { type: 'object' }
            }
          }
        }
      }
    };
  }
  
  return spec;
}

/**
 * Генерация GraphQL схемы
 */
function generateGraphQL(routes) {
  let schema = `type Query {\n`;
  
  for (const route of routes) {
    if (route.method === 'GET') {
      const name = route.path.replace(/^\//, '').replace(/\//g, '_');
      schema += `  ${name}: String\n`;
    }
  }
  
  schema += `}\n\n`;
  schema += `type Mutation {\n`;
  
  for (const route of routes) {
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(route.method)) {
      const name = route.path.replace(/^\//, '').replace(/\//g, '_');
      schema += `  ${name}: String\n`;
    }
  }
  
  schema += `}\n`;
  
  return schema;
}

/**
 * Main command handler
 */
export default async function apiDesign(args, ctx) {
  const { storage, loadPipeline, savePipeline, appendLog } = ctx || {};
  
  const format = args.format || 'openapi';
  const routes = args.routes || 'src/routes';
  const title = args.title || 'API';
  const version = args.version || '1.0.0';
  
  // Find routes
  const foundRoutes = findRoutes(routes);
  
  if (foundRoutes.length === 0) {
    return {
      error: 'No routes found',
      hint: `Check directory: ${routes}`
    };
  }
  
  // Generate specification based on format
  let spec;
  
  switch (format) {
    case 'openapi':
      spec = generateOpenAPI(foundRoutes, title, version);
      break;
    case 'graphql':
      spec = generateGraphQL(foundRoutes);
      break;
    default:
      return {
        error: `Unsupported format: ${format}`,
        supported: ['openapi', 'graphql']
      };
  }
  
  const result = {
    format,
    endpoints: foundRoutes.length,
    routes: foundRoutes,
    spec,
    generatedAt: new Date().toISOString()
  };
  
  // Log to CTX
  if (appendLog) {
    appendLog({
      action: 'api_design',
      format,
      endpoints: foundRoutes.length
    });
  }
  
  // Save to pipeline
  if (loadPipeline && savePipeline) {
    const pipeline = loadPipeline();
    pipeline.api = {
      format,
      endpoints: foundRoutes.length,
      generatedAt: new Date().toISOString()
    };
    savePipeline(pipeline);
  }
  
  return result;
}
