import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const sourceRoot = fileURLToPath(new URL('../src/', import.meta.url));

async function javascriptFiles(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const groups = await Promise.all(
    entries.map(async (entry) => {
      const filename = path.join(directory, entry.name);
      return entry.isDirectory()
        ? javascriptFiles(filename)
        : entry.name.endsWith('.js')
          ? [filename]
          : [];
    }),
  );
  return groups.flat();
}

const files = await javascriptFiles(sourceRoot);
const dependencies = new Map();
for (const filename of files) {
  const source = await fs.readFile(filename, 'utf8');
  const label = path.relative(sourceRoot, filename);
  const imports = [
    ...source.matchAll(/\b(?:import|export)\s+(?:[^;'"\n]*?\s+from\s+)?['"]([^'"]+)['"]/g),
  ].map((match) => match[1]);
  const localImports = imports
    .filter((specifier) => specifier.startsWith('.'))
    .map((specifier) => path.resolve(path.dirname(filename), specifier));
  for (const dependency of localImports) {
    assert.ok(
      files.includes(dependency),
      `${label}: local dependency does not exist: ${dependency}`,
    );
  }
  dependencies.set(filename, localImports);
  if (filename.endsWith('.service.js')) {
    assert.ok(
      !imports.some((value) => value === 'express' || /\.(routes|controller)\.js$/.test(value)),
      `${label}: services must not depend on the HTTP layer`,
    );
    assert.ok(
      !/\b(req|res|request|response)\.(body|params|query|status|json|headers|user)\b/.test(source),
      `${label}: pass explicit values to services, not Express request/response objects`,
    );
  }
  if (filename.endsWith('.controller.js')) {
    assert.ok(
      !imports.some(
        (value) =>
          value === 'mongoose' || /\.model\.js$/.test(value) || value.includes('/integrations/'),
      ),
      `${label}: controllers must delegate persistence/integrations to services`,
    );
  }
  if (filename.endsWith('.routes.js')) {
    assert.ok(
      !imports.some((value) => /\.(model|service)\.js$/.test(value)),
      `${label}: routes must delegate to controllers`,
    );
  }
  if (filename.endsWith('.validation.js') || filename.endsWith('.model.js')) {
    assert.ok(
      !imports.some((value) => /\.(routes|controller|service)\.js$/.test(value)),
      `${label}: schemas must not depend on application behavior`,
    );
  }
}

const visited = new Set();
function visit(filename, ancestors = []) {
  assert.ok(
    !ancestors.includes(filename),
    `Circular dependency: ${[...ancestors, filename].map((value) => path.relative(sourceRoot, value)).join(' -> ')}`,
  );
  if (visited.has(filename)) return;
  for (const dependency of dependencies.get(filename) || [])
    visit(dependency, [...ancestors, filename]);
  visited.add(filename);
}
for (const filename of files) visit(filename);
console.log(
  `Architecture checks passed for ${files.length} source files: valid imports, layer boundaries, and no dependency cycles.`,
);
