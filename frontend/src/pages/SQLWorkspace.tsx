import { useState, useEffect, useRef } from 'react';
import Editor from '@monaco-editor/react';
import { Play, Save, Download, Database, Table as TableIcon, Columns, Key, ChevronRight, ChevronDown, Loader2, Trash, Wand2, Sparkles, Wrench } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'react-router-dom';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { useToast } from '@/store/toastStore';

interface ColumnDef { name: string; type: string; isPrimary: boolean; }
interface TableDef { name: string; columns: ColumnDef[]; }
interface SchemaDef { name: string; tables: TableDef[]; }

import { AIChatSidebar } from '../components/chat/AIChatSidebar';
import { FileExplorer } from '../components/workspace/FileExplorer';
import { Panel, Group as PanelGroup, Separator as PanelResizeHandle } from "react-resizable-panels";
import { useSessionStorage } from '@/lib/hooks/useSessionStorage';
import { STORAGE_KEYS } from '@/lib/constants/storage';

const ResizeHandle = ({ direction = "horizontal" }: { direction?: "horizontal" | "vertical" }) => {
  return (
    <PanelResizeHandle 
      className={`relative flex items-center justify-center bg-border transition-colors hover:bg-primary/50 active:bg-primary/80 z-20 ${
        direction === "horizontal" 
          ? "w-1 cursor-col-resize mx-[-1px]" 
          : "h-1 cursor-row-resize my-[-1px]"
      }`} 
    />
  );
};

export default function SQLWorkspace() {
  const location = useLocation();
  const { success, error } = useToast();
  const [schemaToDelete, setSchemaToDelete] = useState<string | null>(null);
  const [query, setQuery] = useSessionStorage(STORAGE_KEYS.SQL_EDITOR_QUERY, location.state?.query || 'SELECT * FROM users LIMIT 10;');
  const [isAIOpen, setIsAIOpen] = useState(false);
  const [fixedSql, setFixedSql] = useState<string | null>(null);
  const [activeFilePath, setActiveFilePath] = useState<string | null>(null);
  const [isResultsOpen, setIsResultsOpen] = useState(true);
  
  const editorRef = useRef<any>(null);
  
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
    },
    onError: async () => {
      // If error occurs, we can offer fix
      setFixedSql(null);
    }
  });

  const explainMutation = useMutation({
    mutationFn: async (sql: string) => {
      const res = await fetch('http://localhost:3000/api/ai/explain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sql })
      });
      return res.json();
    }
  });

  const optimizeMutation = useMutation({
    mutationFn: async (sql: string) => {
      const res = await fetch('http://localhost:3000/api/ai/optimize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sql })
      });
      return res.json();
    }
  });

  const fixMutation = useMutation({
    mutationFn: async ({ sql, error }: { sql: string, error: string }) => {
      const res = await fetch('http://localhost:3000/api/ai/fix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sql, error })
      });
      return res.json();
    },
    onSuccess: (data) => {
      if (data.success && data.response) {
        // Extract SQL block from response if any
        const match = data.response.match(/```sql\n([\s\S]*?)```/);
        if (match) {
          setFixedSql(match[1]);
        } else {
          setFixedSql(data.response);
        }
      }
    }
  });

  const deleteDatabaseMutation = useMutation({
    mutationFn: async (name: string) => {
      const res = await fetch(`http://localhost:3000/api/database/${name}`, {
        method: 'DELETE',
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      return json;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['schema'] });
      success('Database deleted', 'The database and all its tables have been removed.');
    },
    onError: (err: any) => {
      error('Failed to delete database', err.message);
    }
  });

  const toggleTable = (tableName: string) => {
    setExpandedTables(prev => ({ ...prev, [tableName]: !prev[tableName] }));
  };

  const handleSaveQuery = async () => {
    if (!query.trim()) return;

    if (activeFilePath) {
      try {
        const res = await fetch('http://localhost:3000/api/files/content', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: activeFilePath, content: query })
        });
        const json = await res.json();
        if (json.success) {
          success('File Saved', `${activeFilePath} has been updated.`);
        } else {
          error('Failed to save file', json.error);
        }
      } catch (err: any) {
        error('Error saving file', err.message);
      }
      return;
    }
    
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
        success('Query Saved', 'Your query has been saved successfully.');
      } else {
        error('Failed to save query', json.error);
      }
    } catch (err: any) {
      error('Error saving query', err.message);
    }
  };

  const handleFileSelect = async (path: string) => {
    try {
      const res = await fetch(`http://localhost:3000/api/files/content?path=${encodeURIComponent(path)}`);
      const data = await res.json();
      if (data.success) {
        setQuery(data.content);
        setActiveFilePath(path);
      } else {
        error('Failed to load file', data.error);
      }
    } catch (err: any) {
      error('Failed to load file', err.message);
    }
  };

  const handleRunQuery = () => {
    executeMutation.mutate(query);
  };

  const handleEditorDidMount = (editor: any, monaco: any) => {
    editorRef.current = editor;
    
    // Add "Run Selected Query" context menu action
    editor.addAction({
      id: 'run-selected-query',
      label: 'Run Selected Query',
      keybindings: [
        monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter
      ],
      contextMenuGroupId: 'navigation',
      contextMenuOrder: 1.5,
      precondition: 'editorHasSelection',
      run: (ed: Parameters<typeof handleEditorDidMount>[0]) => {
        const selection = ed.getSelection();
        const model = ed.getModel();
        if (selection && !selection.isEmpty()) {
          const selectedText = model.getValueInRange(selection);
          executeMutation.mutate(selectedText);
        }
      }
    });

    // Add "Run All" context menu action (shown when no selection)
    editor.addAction({
      id: 'run-all-query',
      label: 'Run All',
      contextMenuGroupId: 'navigation',
      contextMenuOrder: 1.6,
      precondition: '!editorHasSelection',
      run: () => {
        handleRunQuery();
      }
    });

    // Add AI Autocomplete Action
    editor.addAction({
      id: 'ai-autocomplete',
      label: 'AI Autocomplete',
      keybindings: [
        monaco.KeyMod.CtrlCmd | monaco.KeyCode.Space
      ],
      run: async () => {
        const position = editor.getPosition();
        const model = editor.getModel();
        const textUntilPosition = model.getValueInRange({
          startLineNumber: 1,
          startColumn: 1,
          endLineNumber: position.lineNumber,
          endColumn: position.column
        });
        
        try {
          const res = await fetch('http://localhost:3000/api/ai/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt: `Complete this SQL query (ONLY RETURN THE COMPLETION CODE AND NOTHING ELSE):\n${textUntilPosition}` })
          });
          const data = await res.json();
          if (data.success) {
            const completion = data.response.replace(/```sql|```/g, '').trim();
            // Insert completion
            editor.executeEdits('ai-autocomplete', [{
              range: new monaco.Range(position.lineNumber, position.column, position.lineNumber, position.column),
              text: ' ' + completion,
              forceMoveMarkers: true
            }]);
          }
        } catch (e) {
          console.error(e);
        }
      }
    });
  };

  return (
    <div className="flex h-full flex-col">
      {/* Top action bar */}
      <div className="h-12 border-b border-border bg-canvas flex items-center px-4 justify-between shrink-0 sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="text-sm font-medium text-foreground">{activeFilePath ? activeFilePath.split('/').pop() : 'Query 1'}</div>
          <div className="h-4 w-px bg-border"></div>
          <select className="bg-transparent text-sm border-none outline-none text-muted-foreground cursor-pointer">
            <option>PostgreSQL - Local</option>
            <option>MySQL - Staging</option>
          </select>
        </div>
        <div className="flex items-center gap-1.5">
          {explainMutation.data && (
            <div className="text-xs text-primary max-w-xs truncate mr-2">
              ✨ Explain: {explainMutation.data.response.replace(/```sql|```/g, '').substring(0, 100)}...
            </div>
          )}
          <Button variant="outline" size="sm" className="h-7 text-xs px-2.5 text-muted-foreground border-purple-500/30 hover:text-purple-400 hover:bg-purple-500/10 transition-colors" onClick={() => setIsAIOpen(!isAIOpen)}>
            <Sparkles size={13} className="mr-1.5 text-purple-400" />
            AI Chat
          </Button>
          <Button variant="outline" size="sm" className="h-7 text-xs px-2.5 text-muted-foreground transition-colors" onClick={() => explainMutation.mutate(query)} disabled={explainMutation.isPending}>
            {explainMutation.isPending ? <Loader2 size={13} className="mr-1.5 animate-spin" /> : <Wand2 size={13} className="mr-1.5" />}
            Explain
          </Button>
          <Button variant="outline" size="sm" className="h-7 text-xs px-2.5 text-muted-foreground transition-colors" onClick={() => optimizeMutation.mutate(query)} disabled={optimizeMutation.isPending}>
            {optimizeMutation.isPending ? <Loader2 size={13} className="mr-1.5 animate-spin" /> : <Wrench size={13} className="mr-1.5" />}
            Optimize
          </Button>
          <div className="h-4 w-px bg-border mx-0.5"></div>
          <Button variant="outline" size="sm" className="h-7 text-xs px-2.5 text-muted-foreground transition-colors" onClick={handleSaveQuery}>
            <Save size={13} className="mr-1.5" />
            Save
          </Button>
          <Button size="sm" className="h-7 text-xs px-2.5 bg-primary text-primary-foreground hover:bg-primary-deep transition-colors" onClick={handleRunQuery} disabled={executeMutation.isPending}>
            {executeMutation.isPending ? <Loader2 size={13} className="mr-1.5 animate-spin" /> : <Play size={13} className="mr-1.5 fill-current" />}
            Run
          </Button>
        </div>
      </div>
      {/* Main workspace area */}
      <div className="flex-1 flex overflow-hidden">
        <PanelGroup orientation="horizontal" id="sql-workspace-layout">
          
          {/* Schema & File Explorer Sidebar */}
          <Panel defaultSize="16%" minSize="10%" maxSize="30%" collapsible={true} id="explorer">
            <div className="h-full bg-canvas-soft flex flex-col shrink-0 overflow-hidden">
              <div className="h-10 border-b border-border flex items-center px-4 font-medium text-xs text-muted-foreground uppercase tracking-wider shrink-0">
                Database
              </div>
              <div className="flex-1 overflow-auto p-2">
                {isLoadingSchema ? (
                  <div className="flex items-center justify-center h-20"><Loader2 className="animate-spin text-muted-foreground" size={20} /></div>
                ) : (
                  schemaData?.schema.map(schema => (
                    <div key={schema.name} className="mb-4">
                      <div className="flex items-center justify-between px-2 py-1 group hover:bg-canvas-night-soft rounded-md">
                        <div className="flex items-center gap-2 text-sm font-medium text-foreground truncate w-full">
                          <Database size={14} className="text-muted-foreground shrink-0" />
                          <span className="truncate">{schema.name}</span>
                        </div>
                        <button
                          className="p-1 text-muted-foreground hover:text-red-500 hover:bg-red-500/10 rounded opacity-0 group-hover:opacity-100 transition-all tooltip-trigger shrink-0"
                          data-tooltip="Delete Database"
                          onClick={() => setSchemaToDelete(schema.name)}
                        >
                          <Trash size={14} />
                        </button>
                      </div>
                      <div className="ml-2 mt-1 flex flex-col gap-1">
                        {schema.tables.map(table => (
                          <div key={table.name}>
                            <div 
                              className="flex items-center gap-2 px-2 py-1 text-sm text-muted-foreground hover:bg-canvas-night-soft hover:text-foreground cursor-pointer rounded-sm"
                              onClick={() => toggleTable(table.name)}
                            >
                              <div className="shrink-0">{expandedTables[table.name] ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</div>
                              <TableIcon size={14} className="text-primary-soft shrink-0" />
                              <span className="truncate">{table.name}</span>
                            </div>
                            {expandedTables[table.name] && (
                              <div className="ml-6 flex flex-col gap-1 mt-1 border-l border-border pl-2">
                                {table.columns.map(col => (
                                  <div key={col.name} className="flex items-center gap-2 px-2 py-1 text-xs text-muted-foreground">
                                    <div className="shrink-0">{col.isPrimary ? <Key size={12} className="text-yellow-500" /> : <Columns size={12} className="text-muted-foreground" />}</div>
                                    <span className="truncate">{col.name}</span>
                                    <span className="text-[10px] text-ink-faint ml-auto shrink-0">{col.type}</span>
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
              <div className="h-10 border-t border-b border-border flex items-center px-4 font-medium text-xs text-muted-foreground uppercase tracking-wider shrink-0">
                Workspace
              </div>
              <div className="flex-1 overflow-hidden flex flex-col">
                <FileExplorer onFileSelect={handleFileSelect} />
              </div>
            </div>
          </Panel>

          <ResizeHandle direction="horizontal" />

          {/* Editor and Results */}
          <Panel defaultSize="84%" minSize="30%" id="main-content">
            <PanelGroup orientation="vertical" id="sql-workspace-vertical-layout">
              {/* Editor Area */}
              <Panel defaultSize={isResultsOpen ? "60%" : "100%"} minSize="20%" id="editor">
                <div className="h-full w-full bg-canvas-night relative overflow-hidden flex flex-col">
                  <Editor
                    height="100%"
                    defaultLanguage="sql"
                    theme="vs-dark"
                    value={query}
                    onChange={(value) => setQuery(value || '')}
                    onMount={handleEditorDidMount}
                    options={{
                      minimap: { enabled: false },
                      fontSize: 14,
                      fontFamily: 'ui-monospace, Menlo, Monaco, "Cascadia Mono", "Segoe UI Mono", "Roboto Mono", "Oxygen Mono", "Ubuntu Monospace", "Source Code Pro", "Fira Mono", "Droid Sans Mono", "Courier New", monospace',
                      padding: { top: 0, bottom: 0 },
                      scrollBeyondLastLine: false,
                      smoothScrolling: true,
                      automaticLayout: true,
                    }}
                  />
                  
                  {!isResultsOpen && (
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="absolute bottom-4 right-4 bg-canvas-soft border-border shadow-lg z-10 text-muted-foreground"
                      onClick={() => setIsResultsOpen(true)}
                    >
                      Show Results
                    </Button>
                  )}
                </div>
              </Panel>

              {isResultsOpen && <ResizeHandle direction="vertical" />}

              {/* Results Area */}
              {isResultsOpen && (
                <Panel defaultSize="40%" minSize="10%" collapsible={true} id="results">
                  <div className="h-full w-full flex flex-col bg-canvas border-t border-border overflow-hidden">
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
                        <button 
                          className="hover:text-foreground transition-colors" 
                          title="Collapse Results"
                          onClick={() => setIsResultsOpen(false)}
                        >
                          <ChevronDown size={14} />
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
                          <div className="text-red-500 bg-red-500/10 p-4 rounded border border-red-500/20 w-full text-sm flex flex-col gap-4 overflow-x-auto">
                            <div><strong>Error:</strong> {executeMutation.data.error}</div>
                            
                            {!fixedSql && (
                              <Button size="sm" variant="outline" className="self-start text-purple-400 border-purple-500/30 hover:bg-purple-500/10" 
                                onClick={() => fixMutation.mutate({ sql: query, error: executeMutation.data.error })} 
                                disabled={fixMutation.isPending}>
                                {fixMutation.isPending ? <Loader2 size={14} className="mr-2 animate-spin" /> : <Sparkles size={14} className="mr-2" />}
                                Fix SQL with AI
                              </Button>
                            )}

                            {fixedSql && (
                              <div className="mt-4 border border-purple-500/30 bg-canvas-night p-4 rounded-md">
                                <div className="text-purple-400 text-xs uppercase tracking-wider mb-2 font-medium">AI Suggested Fix:</div>
                                <pre className="font-mono text-sm text-foreground overflow-x-auto">{fixedSql}</pre>
                                <div className="flex gap-2 mt-4">
                                  <Button size="sm" className="bg-purple-600 hover:bg-purple-700 text-white" 
                                    onClick={() => { setQuery(fixedSql); setFixedSql(null); }}>
                                    Apply Fix
                                  </Button>
                                  <Button size="sm" variant="outline" className="border-border text-foreground hover:bg-canvas-soft"
                                    onClick={() => setFixedSql(null)}>
                                    Dismiss
                                  </Button>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className="min-w-max">
                          <table className="w-full text-sm text-left border-collapse">
                            <thead className="bg-canvas-soft text-muted-foreground sticky top-0 z-10 shadow-sm">
                              <tr>
                                <th className="px-4 py-2 border-b border-r border-border font-medium w-12 text-center text-xs">#</th>
                                {executeMutation.data.data?.columns?.map((col: string) => (
                                  <th key={col} className="px-4 py-2 border-b border-r border-border font-medium whitespace-nowrap">{col}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {executeMutation.data.data?.rows?.map((row: any, i: number) => (
                                <tr key={i} className="border-b border-border hover:bg-canvas-soft/50 transition-colors">
                                  <td className="px-4 py-2 border-r border-border text-muted-foreground text-xs text-center">{i + 1}</td>
                                  {executeMutation.data.data.columns.map((col: string) => (
                                    <td key={col} className="px-4 py-2 border-r border-border text-foreground whitespace-nowrap" title={String(row[col])}>
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
                        </div>
                      )}
                    </div>
                  </div>
                </Panel>
              )}
            </PanelGroup>
          </Panel>

          {/* AI Chat Sidebar */}
          {isAIOpen && (
            <>
              <ResizeHandle direction="horizontal" />
              <Panel defaultSize="25%" minSize="15%" maxSize="40%" id="ai-chat">
                <div className="h-full w-full bg-canvas overflow-hidden flex flex-col">
                  <AIChatSidebar 
                    onClose={() => setIsAIOpen(false)} 
                    onExecuteQuery={(sql) => {
                      setQuery(sql);
                      executeMutation.mutate(sql);
                    }}
                    onInsertIntoEditor={(sql) => {
                      setQuery(sql);
                    }}
                  />
                </div>
              </Panel>
            </>
          )}

        </PanelGroup>
      </div>

      <ConfirmModal
        isOpen={!!schemaToDelete}
        onClose={() => setSchemaToDelete(null)}
        onConfirm={() => {
          if (schemaToDelete) {
            deleteDatabaseMutation.mutate(schemaToDelete);
          }
        }}
        title="Delete Database"
        message={`Delete database '${schemaToDelete}'? This action cannot be undone and will remove all associated tables, views, and data.`}
        confirmText="Delete"
        cancelText="Cancel"
        isDestructive={true}
      />
    </div>
  );
}
