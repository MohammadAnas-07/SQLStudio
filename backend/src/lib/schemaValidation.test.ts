import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isValidSchemaNameFormat, isExistingSchema, SchemaQueryable } from './schemaValidation';

function fakeDbWithSchemas(existingSchemas: string[]): SchemaQueryable {
  return {
    async query(sql: string, params: any[] = []) {
      const [name] = params;
      return { rows: existingSchemas.includes(name) ? [{ schema_name: name }] : [] };
    },
  };
}

test('isValidSchemaNameFormat accepts alphanumeric/underscore names', () => {
  assert.equal(isValidSchemaNameFormat('public'), true);
  assert.equal(isValidSchemaNameFormat('my_schema_1'), true);
});

test('isValidSchemaNameFormat rejects a SQL injection payload', () => {
  const malicious = 'public"; DROP TABLE users; --';
  assert.equal(isValidSchemaNameFormat(malicious), false);
});

test('isExistingSchema rejects a SQL injection payload even if the db were to (incorrectly) say yes', async () => {
  const malicious = 'public"; DROP TABLE users; --';
  // A db stub that (wrongly) reports the raw string as an existing schema,
  // to prove rejection happens on format before any DB round-trip matters.
  const db = fakeDbWithSchemas([malicious]);
  assert.equal(await isExistingSchema(db, malicious), false);
});

test('isExistingSchema rejects a well-formatted name that is not an actual schema', async () => {
  const db = fakeDbWithSchemas(['public']);
  assert.equal(await isExistingSchema(db, 'not_a_real_schema'), false);
});

test('isExistingSchema accepts a well-formatted name that matches an existing schema', async () => {
  const db = fakeDbWithSchemas(['public', 'analytics']);
  assert.equal(await isExistingSchema(db, 'analytics'), true);
});
