import { Search, Clock, Play, FileText, Calendar, Loader2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';

export default function QueryHistory() {
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({
    queryKey: ['queryHistory'],
    queryFn: async () => {
      const res = await fetch('http://localhost:3000/api/history');
      const json = await res.json();
      return json.success ? json.history : [];
    }
  });

  const history = data || [];

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center bg-canvas">
        <Loader2 className="animate-spin text-primary" size={32} />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-canvas p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-foreground tracking-tight">Query History</h1>
          <p className="text-sm text-muted-foreground mt-1">Review your previously executed queries.</p>
        </div>
        <div className="relative w-64">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search queries..."
            className="w-full bg-canvas-soft border border-border rounded-md pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary text-foreground"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="space-y-4">
          {history.length > 0 ? history.map((item: any) => (
            <div key={item.id} className="bg-canvas-soft border border-border rounded-xl p-5 hover:border-muted-foreground/30 transition-colors">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-md ${item.status === 'success' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-500'}`}>
                    <FileText size={18} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs px-2 py-0.5 rounded-full capitalize ${item.status === 'success' ? 'bg-emerald-500/20 text-emerald-500' : 'bg-red-500/20 text-red-500'}`}>
                        {item.status}
                      </span>
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Clock size={12} /> {item.executionTimeMs}ms
                      </span>
                      <span className="text-xs text-muted-foreground flex items-center gap-1 ml-2">
                        <Calendar size={12} /> {new Date(item.createdAt).toLocaleString()}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button 
                    className="p-2 text-muted-foreground hover:text-foreground hover:bg-canvas rounded-md transition-colors tooltip-trigger" 
                    data-tooltip="Run Again"
                    onClick={() => navigate('/workspace', { state: { query: item.query } })}
                  >
                    <Play size={16} />
                  </button>
                </div>
              </div>
              <div className="bg-canvas-night p-4 rounded-lg font-mono text-sm text-foreground overflow-x-auto whitespace-pre-wrap">
                {item.query}
              </div>
              {item.errorMessage && (
                <div className="mt-3 text-xs text-red-400 bg-red-500/10 p-3 rounded-lg border border-red-500/20">
                  {item.errorMessage}
                </div>
              )}
            </div>
          )) : (
            <div className="text-center py-12 text-muted-foreground">No query history found</div>
          )}
        </div>
      </div>
    </div>
  );
}
