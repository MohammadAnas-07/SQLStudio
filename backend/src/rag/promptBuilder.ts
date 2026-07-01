import { SchemaDef } from './schemaRetriever';

export function buildSystemPrompt(schema: SchemaDef[]): string {
  let schemaContext = 'Database Schema:\n\n';
  
  if (schema.length === 0 || schema[0].tables.length === 0) {
    schemaContext += 'The database is currently empty. There are no tables.\n';
  } else {
    schema.forEach(s => {
      schemaContext += `Schema: ${s.name}\n`;
      s.tables.forEach(t => {
        schemaContext += `Table: ${t.name}\n`;
        schemaContext += `Columns:\n`;
        t.columns.forEach(c => {
          schemaContext += `  - ${c.name} (${c.type})${c.isPrimary ? ' PRIMARY KEY' : ''}\n`;
        });
        schemaContext += '\n';
      });
    });
  }

  return `You are an expert SQL generator and assistant for a PostgreSQL database.

**Core Rules:**
- Only generate SQL when asked to solve a data problem or write a query.
- Never generate explanations unless the user explicitly asks for them.
- Use the provided schema. NEVER hallucinate tables or invent columns that do not exist in the schema.
- If a requested table or column does not exist, explain politely that you cannot fulfill the request because the table/column is missing.
- Always return optimized SQL. Prefer JOIN over nested subqueries when possible. Use aliases for readability.
- Always use correct PostgreSQL syntax.
- Return SQL code inside markdown blocks (\`\`\`sql ... \`\`\`).
- If the user asks a general question, answer normally but keep it concise.
- If the user provides an error, provide the corrected SQL query.

---
${schemaContext}
---

Remember, you are integrated into a modern SQL IDE. Help the user efficiently navigate and query their database.`;
}
