import { useState, useEffect } from 'react';
import Editor from '@monaco-editor/react';
import { Play, Save, Download, Database, Table as TableIcon, Columns, Key, ChevronRight, ChevronDown, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'react-router-dom';

interface ColumnDef { name: string; type: string; isPrimary: boolean; }
interface TableDef { name: string; columns: ColumnDef[]; }
interface SchemaDef { name: string; tables: TableDef[]; }

export default function SQLWorkspace() {
  const location = useLocation();
  const [query, setQuery] = useState(location.state?.query || 'SELECT * FROM users LIMIT 10;');
  
  useEffect(() => {
    if (location.state?.query) {
      setQuery(location.state.query);
      // Optional: clear state so a refresh doesn't keep it
      window.history.replaceState({}, document.title);
    }
  }, [location.state?.query]);

  const [expandedTables, setExpandedTables] = useState<Record<string, boolean>>({});

  // Fetch schema
  const { data: schemaData, isLoading: isLoadingSchema } = useQuery({
    queryKey: ['schema'],
    queryFn: async () => {
      const res = await fetch('http://localhost:3000/api/schema');
      return res.json() as Promise<{ schema: SchemaDef[] }>;
    }
  });

  // Execute query
  const queryClient = useQueryClient();
  const executeMutation = useMutation({
    mutationFn: async (sql: string) => {
      const res = await fetch('http://localhost:3000/api/query/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: sql })
      });
      return res.json();
    },
    onSuccess: (data) => {
      // Invalidate schema so the sidebar refreshes if tables were created/altered
      if (data.success) {
        queryClient.invalidateQueries({ queryKey: ['schema'] });
      }
    }
  });

  const toggleTable = (tableName: string) => {
    setExpandedTables(prev => ({ ...prev, [tableName]: !prev[tableName] }));
  };

  const handleSaveQuery = async () => {
    if (!query.trim()) return;
    
    // In a full implementation, we'd open a modal to ask for the query name.
    // For now, we'll auto-generate a name.
    const queryName = `Saved Query ${new Date().toLocaleString()}`;
    
    try {
      const res = await fetch('http://localhost:3000/api/saved-queries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: queryName,
          description: 'Saved from SQL Workspace',
          query: query
        })
      });
      
      const json = await res.json();
      if (json.success) {
        // You could add a toast notification here
        console.log('Query saved successfully');
      } else {
        console.error('Failed to save query:', json.error);
      }
    } catch (err) {
      console.error('Error saving query:', err);
    }
  };

  const handleRunQuery = () => {
    executeMutation.mutate(query);
  };

  return (
    <div className="flex h-full flex-col">
      {/* Top action bar */}
      <div className="h-14 border-b border-border bg-canvas flex items-center px-4 justify-between shrink-0">
        <div className="flex items-center gap-4">
          <div className="text-sm font-medium text-foreground">Query 1</div>
          <div className="h-4 w-px bg-border"></div>
          <select className="bg-transparent text-sm border-none outline-none text-muted-foreground cursor-pointer">
            <option>PostgreSQL - Local</option>
            <option>MySQL - Staging</option>
          </select>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="h-8 text-xs px-3 text-muted-foreground" onClick={handleSaveQuery}>
            <Save size={14} className="mr-2" />
            Save
          </Button>
          <Button size="sm" className="h-8 text-xs px-3 bg-primary text-primary-foreground hover:bg-primary-deep" onClick={handleRunQuery} disabled={executeMutation.isPending}>
            {executeMutation.isPending ? <Loader2 size={14} className="mr-2 animate-spin" /> : <Play size={14} className="mr-2 fill-current" />}
            Run Query
          </Button>
        </div>
      </div>

      {/* Main workspace area */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* Schema Explorer Sidebar */}
        <div className="w-64 border-r border-border bg-canvas-soft flex flex-col shrink-0">
          <div className="h-10 border-b border-border flex items-center px-4 font-medium text-xs text-muted-foreground uppercase tracking-wider shrink-0">
            Explorer
          </div>
          <div className="flex-1 overflow-auto p-2">
            {isLoadingSchema ? (
              <div className="flex items-center justify-center h-20"><Loader2 className="animate-spin text-muted-foreground" size={20} /></div>
            ) : (
              schemaData?.schema.map(schema => (
                <div key={schema.name} className="mb-4">
                  <div className="flex items-center gap-2 px-2 py-1 text-sm font-medium text-foreground">
                    <Database size={14} className="text-muted-foreground" />
                    {schema.name}
                  </div>
                  <div className="ml-2 mt-1 flex flex-col gap-1">
                    {schema.tables.map(table => (
                      <div key={table.name}>
                        <div 
                          className="flex items-center gap-2 px-2 py-1 text-sm text-muted-foreground hover:bg-canvas-night-soft hover:text-foreground cursor-pointer rounded-sm"
                          onClick={() => toggleTable(table.name)}
                        >
                          {expandedTables[table.name] ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                          <TableIcon size={14} className="text-primary-soft" />
                          {table.name}
                        </div>
                        {expandedTables[table.name] && (
                          <div className="ml-6 flex flex-col gap-1 mt-1 border-l border-border pl-2">
                            {table.columns.map(col => (
                              <div key={col.name} className="flex items-center gap-2 px-2 py-1 text-xs text-muted-foreground">
                                {col.isPrimary ? <Key size={12} className="text-yellow-500" /> : <Columns size={12} className="text-muted-foreground" />}
                                <span>{col.name}</span>
                                <span className="text-[10px] text-ink-faint ml-auto">{col.type}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Editor and Results */}
        <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
          {/* Editor Area */}
          <div className="flex-1 flex flex-col border-r border-border bg-canvas-night relative">
            <Editor
              height="100%"
              defaultLanguage="sql"
              theme="vs-dark"
              value={query}
              onChange={(value) => setQuery(value || '')}
              options={{
                minimap: { enabled: false },
                fontSize: 14,
                fontFamily: 'ui-monospace, Menlo, Monaco, "Cascadia Mono", "Segoe UI Mono", "Roboto Mono", "Oxygen Mono", "Ubuntu Monospace", "Source Code Pro", "Fira Mono", "Droid Sans Mono", "Courier New", monospace',
                padding: { top: 16, bottom: 16 },
                scrollBeyondLastLine: false,
                smoothScrolling: true,
              }}
            />
          </div>

          {/* Results Area */}
          <div className="h-1/2 lg:h-full lg:w-1/2 flex flex-col bg-canvas">
            <div className="h-10 border-b border-border flex items-center px-4 justify-between bg-canvas-soft shrink-0">
              <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Results</div>
              {executeMutation.data?.data && (
                <div className="text-xs text-muted-foreground">
                  {executeMutation.data.data.rowCount} rows • {executeMutation.data.data.executionTimeMs}ms
                </div>
              )}
              <div className="flex gap-2 text-muted-foreground">
                <button className="hover:text-foreground transition-colors" title="Export CSV">
                  <Download size={14} />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-auto bg-canvas relative">
              {executeMutation.isPending && (
                <div className="absolute inset-0 bg-canvas/50 flex items-center justify-center z-10">
                  <Loader2 className="animate-spin text-primary" size={32} />
                </div>
              )}
              
              {!executeMutation.data ? (
                <div className="flex h-full items-center justify-center p-4">
                  <div className="text-center text-muted-foreground">
                    <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-canvas-night mb-4">
                      <Play size={20} className="text-muted-foreground ml-1" />
                    </div>
                    <p className="text-sm">Run a query to see results</p>
                  </div>
                </div>
              ) : !executeMutation.data.success ? (
                <div className="flex h-full items-start justify-start p-4">
                  <div className="text-red-500 bg-red-500/10 p-4 rounded border border-red-500/20 w-full font-mono text-sm">
                    <strong>Error:</strong> {executeMutation.data.error}
                  </div>
                </div>
              ) : (
                <table className="w-full text-sm text-left border-collapse">
                  <thead className="bg-canvas-soft text-muted-foreground sticky top-0 z-10 shadow-sm">
                    <tr>
                      <th className="px-4 py-2 border-b border-r border-border font-medium w-12 text-center text-xs">#</th>
                      {executeMutation.data.data?.columns?.map((col: string) => (
                        <th key={col} className="px-4 py-2 border-b border-r border-border font-medium">{col}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {executeMutation.data.data?.rows?.map((row: any, i: number) => (
                      <tr key={i} className="border-b border-border hover:bg-canvas-soft/50 transition-colors">
                        <td className="px-4 py-2 border-r border-border text-muted-foreground text-xs text-center">{i + 1}</td>
                        {executeMutation.data.data.columns.map((col: string) => (
                          <td key={col} className="px-4 py-2 border-r border-border text-foreground truncate max-w-[200px]" title={String(row[col])}>
                            {String(row[col])}
                          </td>
                        ))}
                      </tr>
                    ))}
                    {executeMutation.data.data?.rows?.length === 0 && (
                      <tr>
                        <td colSpan={(executeMutation.data.data?.columns?.length || 0) + 1} className="px-4 py-8 text-center text-muted-foreground">
                          No rows returned
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
