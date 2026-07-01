import { db } from '../database';

export interface ColumnDef {
  name: string;
  type: string;
  isPrimary: boolean;
}

export interface TableDef {
  name: string;
  columns: ColumnDef[];
}

export interface SchemaDef {
  name: string;
  tables: TableDef[];
}

// Simple memory cache for schema
let cachedSchema: SchemaDef[] | null = null;
let lastFetchTime = 0;
const CACHE_TTL = 1000 * 60 * 5; // 5 minutes

export async function getSchema(forceRefresh = false): Promise<SchemaDef[]> {
  const now = Date.now();
  if (!forceRefresh && cachedSchema && (now - lastFetchTime) < CACHE_TTL) {
    return cachedSchema;
  }

  try {
    const tableResult = await db.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `);
    const tables = tableResult.rows as { table_name: string }[];
    
    const schemaTables = await Promise.all(tables.map(async (table) => {
      const colResult = await db.query(`
        SELECT column_name, data_type, 
          (SELECT COUNT(*) FROM information_schema.key_column_usage kcu
           JOIN information_schema.table_constraints tc 
           ON kcu.constraint_name = tc.constraint_name 
           WHERE kcu.table_name = $1 AND kcu.column_name = c.column_name AND tc.constraint_type = 'PRIMARY KEY'
          ) as is_primary
        FROM information_schema.columns c
        WHERE table_schema = 'public' AND table_name = $1
      `, [table.table_name]);
      
      return {
        name: table.table_name,
        columns: colResult.rows.map((col: any) => ({
          name: col.column_name,
          type: col.data_type,
          isPrimary: parseInt(col.is_primary) > 0
        }))
      };
    }));

    cachedSchema = [
      {
        name: 'public',
        tables: schemaTables
      }
    ];
    lastFetchTime = now;
    return cachedSchema;
  } catch (error) {
    console.error('Error fetching schema:', error);
    return [];
  }
}
