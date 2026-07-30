// Only alphanumeric/underscore names are ever allowed through, and even then
// only if they exactly match a schema that already exists in the database.
// This is deliberately a whitelist check rather than quote-escaping, since
// escaping is easy to get wrong and this value is interpolated directly into
// a raw SQL statement (DROP SCHEMA / CREATE SCHEMA don't support parameter
// binding for identifiers).
const SCHEMA_NAME_PATTERN = /^[a-zA-Z0-9_]+$/;

export function isValidSchemaNameFormat(name: unknown): name is string {
  return typeof name === 'string' && SCHEMA_NAME_PATTERN.test(name);
}

export interface SchemaQueryable {
  query(sql: string, params?: any[]): Promise<{ rows: any[] }>;
}

export async function isExistingSchema(db: SchemaQueryable, name: unknown): Promise<boolean> {
  if (!isValidSchemaNameFormat(name)) return false;

  const result = await db.query(
    `SELECT schema_name FROM information_schema.schemata WHERE schema_name = $1`,
    [name]
  );
  return result.rows.length > 0;
}
