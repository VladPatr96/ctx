---
name: api-designer
description: >
  Автоматическое проектирование API: генерация OpenAPI спецификаций,
  TypeScript SDK, Postman коллекций и документации из кода.
---

# /ctx api-design — Проектировщик API

Автоматическое создание спецификаций и документации API из кода.

## Команды

```
/ctx api-design --format openapi|graphql|asyncapi
/ctx api-generate-spec --routes src/routes/ --output openapi.yaml
/ctx api-validate --base-url http://localhost:3000
/ctx api-generate-sdk --language typescript|python|go
```

## Как работает

```
┌─────────────────────────────────────────┐
│  1. CODE PARSING                         │
│     ├─ Express/Fastify routes            │
│     ├─ TypeScript types                  │
│     └─ JSDoc comments                    │
├─────────────────────────────────────────┤
│  2. SCHEMA EXTRACTION                    │
│     ├─ Request/Response schemas          │
│     ├─ Path parameters                   │
│     └─ Authentication                    │
├─────────────────────────────────────────┤
│  3. SPECIFICATION GENERATION             │
│     ├─ OpenAPI 3.0                       │
│     ├─ GraphQL schema                    │
│     └─ AsyncAPI (event-driven)           │
├─────────────────────────────────────────┤
│  4. ARTIFACTS GENERATION                 │
│     ├─ openapi.yaml                      │
│     ├─ TypeScript SDK                    │
│     ├─ Postman collection                │
│     └─ Swagger UI HTML                   │
└─────────────────────────────────────────┘
```

## Примеры использования

### Генерация OpenAPI спецификации

```bash
/ctx api-design --format openapi
```

Результат:
```yaml
openapi: 3.0.0
info:
  title: CTX Hub API
  version: 1.0.0
paths:
  /api/users:
    get:
      summary: List users
      responses:
        '200':
          content:
            application/json:
              schema:
                type: array
                items:
                  $ref: '#/components/schemas/User'
    post:
      summary: Create user
      requestBody:
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/CreateUser'
      responses:
        '201':
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/User'
```

### Генерация TypeScript SDK

```bash
/ctx api-generate-sdk --language typescript
```

Результат:
```typescript
// api-client.ts (GENERATED)

export interface User {
  id: number;
  name: string;
  email: string;
}

export interface CreateUser {
  name: string;
  email: string;
}

export class ApiClient {
  async getUsers(): Promise<User[]> {
    const response = await fetch('/api/users');
    return response.json();
  }

  async createUser(data: CreateUser): Promise<User> {
    const response = await fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return response.json();
  }
}
```

### Валидация API

```bash
/ctx api-validate --base-url http://localhost:3000
```

Результат:
```json
{
  "endpoints": 15,
  "valid": 14,
  "errors": [
    {
      "endpoint": "POST /api/users",
      "error": "Request body schema mismatch",
      "expected": "{ name: string, email: string }",
      "actual": "{ name: string }"
    }
  ]
}
```

## Интеграция с CTX

### MCP Mode (Claude Code)

```javascript
// Автогенерация спецификации
const spec = await ctx_api_design({
  format: 'openapi',
  routes: 'src/routes'
});

console.log(`Generated ${spec.endpoints} endpoints`);
```

### CLI Mode (другие провайдеры)

```bash
node scripts/ctx-cli.js api-design --format openapi
```

## Поддерживаемые форматы

| Format | Spec | SDK | Docs | Postman |
|--------|------|-----|------|---------|
| OpenAPI 3.0 | ✅ | ✅ | ✅ | ✅ |
| GraphQL | ✅ | ✅ | ✅ | ⚠️ |
| AsyncAPI | ✅ | ⚠️ | ✅ | ❌ |
| RAML | ⚠️ | ⚠️ | ✅ | ❌ |

## Поддерживаемые фреймворки

- ✅ Express
- ✅ Fastify
- ✅ NestJS
- ✅ Koa
- ⚠️ Hapi
- ⚠️ Restify

## Экономия времени

```
Вручную:   8 часов на документацию API
С дизайнером: 30 минут на автогенерацию
Экономия:  94% времени
```

## Преимущества

- 📝 Автогенерация OpenAPI спецификаций
- 🔧 Готовые SDK для 5+ языков
- 📚 Swagger UI из коробки
- ✅ Валидация API по спецификации
- 🔄 Синхронизация docs с кодом
- 🚀 Работает на всех провайдерах
