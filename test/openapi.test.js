import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';

process.env.JWT_SECRET ??= 'test-secret-with-at-least-32-characters-only';
const { app } = await import('../app.js');
const { default: routes } = await import('../src/routes.js');
const { buildOpenApiDocument, documentedOperations } =
  await import('../src/modules/docs/openapi.js');

// Walks the real Express router so a new route cannot ship without a spec entry (and vice versa).
function registeredRoutes(router, prefix = '') {
  const found = [];
  for (const layer of router.stack) {
    const base = layer.rawPath && layer.rawPath !== '/' ? prefix + layer.rawPath : prefix;
    if (layer.route) {
      const path = (prefix + layer.route.path).replace(/\/$/, '') || '/';
      for (const method of Object.keys(layer.route.methods)) found.push(`${method} ${path}`);
    } else if (layer.handle?.stack && layer.rawPath !== '/docs') {
      found.push(...registeredRoutes(layer.handle, base));
    }
  }
  return found;
}

test('OpenAPI paths match the routes Express registers', () => {
  const ignored = new Set(['get /openapi.json']);
  const actual = registeredRoutes(routes)
    .filter((route) => !ignored.has(route))
    .sort();
  const documented = documentedOperations
    .map(({ method, path }) => `${method} ${path.replace(/\{(\w+)\}/g, ':$1')}`)
    .sort();
  assert.deepEqual(documented, actual);
});

test('OpenAPI document references only defined schemas', () => {
  const document = buildOpenApiDocument();
  const refs = [...JSON.stringify(document).matchAll(/"\$ref":"#\/components\/schemas\/(\w+)"/g)];
  for (const [, name] of refs)
    assert.ok(document.components.schemas[name], `missing schema ${name}`);
  for (const [path, methods] of Object.entries(document.paths)) {
    for (const name of path.match(/\{(\w+)\}/g) ?? []) {
      for (const operation of Object.values(methods)) {
        const declared = operation.parameters?.some(
          (p) => p.in === 'path' && `{${p.name}}` === name,
        );
        assert.ok(declared, `${path} does not declare path parameter ${name}`);
      }
    }
  }
});

test('every request field and parameter is described', () => {
  const missing = [];
  const walk = (schema, where) => {
    for (const [name, property] of Object.entries(schema?.properties ?? {})) {
      if (!property.description) missing.push(`${where}.${name}`);
      walk(property, `${where}.${name}`);
    }
    if (schema?.items) walk(schema.items, `${where}[]`);
  };
  for (const [path, methods] of Object.entries(buildOpenApiDocument().paths)) {
    for (const [method, operation] of Object.entries(methods)) {
      const label = `${method.toUpperCase()} ${path}`;
      for (const p of operation.parameters ?? [])
        if (!p.description) missing.push(`${label} ${p.in}:${p.name}`);
      for (const content of Object.values(operation.requestBody?.content ?? {}))
        walk(content.schema, `${label} body`);
    }
  }
  assert.deepEqual(missing, [], 'Add .meta({ description }) to these Zod fields');
});

test('spec and Swagger UI are served', async () => {
  const spec = await request(app).get('/api/v1/openapi.json').expect(200);
  assert.equal(spec.body.openapi, '3.1.0');
  const ui = await request(app).get('/api/v1/docs/').expect(200);
  assert.match(ui.text, /swagger-ui/);
});
