/**
 * Heuristic check for a DELETE or UPDATE statement with no WHERE clause —
 * the clearest, cheapest-to-detect case of "this SQL is about to affect
 * every row in the table", worth a stronger warning than the standard
 * confirm-before-running copy.
 *
 * Not a full SQL parser: strips comments, splits on `;`, and checks each
 * resulting statement for a leading DELETE/UPDATE with no WHERE keyword
 * anywhere in it. Goal is catching the common, obvious case (an
 * AI-generated statement that's missing a WHERE entirely), not exhaustive
 * SQL analysis — unusual formatting or WHERE hidden inside something this
 * regex doesn't expect can still slip through.
 */
export function isBroadDestructiveStatement(sql: string): boolean {
  const withoutComments = sql
    .replace(/--.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');

  const statements = withoutComments
    .split(';')
    .map(s => s.trim())
    .filter(Boolean);

  return statements.some(stmt => {
    const isDeleteOrUpdate = /^(DELETE|UPDATE)\b/i.test(stmt);
    if (!isDeleteOrUpdate) return false;
    return !/\bWHERE\b/i.test(stmt);
  });
}
