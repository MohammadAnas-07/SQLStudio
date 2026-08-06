import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { Copy, FileWarning, Loader2 } from 'lucide-react';
import { useToast } from '@/store/toastStore';
import { apiFetch } from '@/lib/api';

// Public, unauthenticated view of a shared saved query. Deliberately
// minimal and read-only:
//   - No Monaco editor, no "Run"/"Execute" button, no connection picker —
//     this page is reachable by anyone with the link, logged in or not,
//     so there is nothing here that could execute SQL against a database.
//   - Renders exactly what GET /api/public/shared-queries/:token returns,
//     which is exactly {name, query} — see queries.routes.ts. There is no
//     results table to render because the endpoint never sends one.
export default function SharedQuery() {
  const { token } = useParams<{ token: string }>();
  const { success, error } = useToast();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['sharedQuery', token],
    queryFn: async () => {
      const res = await apiFetch(`/api/public/shared-queries/${token}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Not found');
      return json as { name: string; query: string };
    },
    retry: false,
  });

  const copySql = async () => {
    if (!data) return;
    try {
      await navigator.clipboard.writeText(data.query);
      success('SQL copied');
    } catch {
      error('Could not copy automatically', 'Select the text and copy it manually.');
    }
  };

  return (
    <div className="min-h-screen bg-canvas flex items-start justify-center p-6 sm:p-12">
      <div className="w-full max-w-2xl">
        <div className="mb-6 text-center">
          <span className="text-sm font-medium text-muted-foreground">SQLStudio — Shared Query</span>
        </div>

        {isLoading && (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="animate-spin text-primary" size={32} />
          </div>
        )}

        {isError && (
          <div className="bg-canvas-soft border border-border rounded-xl p-8 text-center">
            <FileWarning className="mx-auto mb-4 text-muted-foreground" size={32} />
            <h1 className="text-lg font-medium text-foreground mb-2">Link not found</h1>
            <p className="text-sm text-muted-foreground">
              This link is invalid, or the owner has turned off sharing for this query.
            </p>
            <Link to="/login" className="inline-block mt-6 text-sm text-primary hover:underline">
              Go to SQLStudio
            </Link>
          </div>
        )}

        {data && (
          <div className="bg-canvas-soft border border-border rounded-xl overflow-hidden">
            <div className="p-5 border-b border-border">
              <h1 className="text-lg font-semibold text-foreground truncate">{data.name}</h1>
              <p className="text-xs text-muted-foreground mt-1">
                Shared read-only — viewing this does not run any SQL or access any database.
              </p>
            </div>
            <div className="relative group">
              <div className="flex items-center justify-between px-4 py-1.5 bg-canvas-night text-xs text-muted-foreground border-b border-border">
                <span>SQL</span>
                <button
                  onClick={copySql}
                  className="hover:text-foreground transition-colors flex items-center gap-1"
                  title="Copy SQL"
                >
                  <Copy size={12} /> Copy
                </button>
              </div>
              <SyntaxHighlighter
                style={vscDarkPlus as any}
                language="sql"
                PreTag="div"
                customStyle={{ margin: 0, borderRadius: 0, background: 'transparent' }}
              >
                {data.query}
              </SyntaxHighlighter>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
