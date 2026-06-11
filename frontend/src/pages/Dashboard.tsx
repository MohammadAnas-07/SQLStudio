import { Database, Users, Activity, HardDrive, ArrowUpRight, ArrowDownRight, Loader2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';

export default function Dashboard() {
  const { data, isLoading } = useQuery({
    queryKey: ['dashboardStats'],
    queryFn: async () => {
      const res = await fetch('http://localhost:3000/api/dashboard/stats');
      const json = await res.json();
      return json.success ? json : null;
    }
  });

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center bg-canvas">
        <Loader2 className="animate-spin text-primary" size={32} />
      </div>
    );
  }

  const defaultStats = [
    { name: 'Total Connections', value: '0', change: '+0', trend: 'up', icon: Database },
    { name: 'Active Users', value: '0', change: '+0', trend: 'up', icon: Users },
    { name: 'Queries Run', value: '0', change: '+0', trend: 'up', icon: Activity },
    { name: 'Saved Queries', value: '0', change: '+0', trend: 'up', icon: HardDrive },
  ];

  const stats = data?.stats?.map((stat: { name: string, value: string, change: string, trend: string }, i: number) => ({
    ...stat,
    icon: defaultStats[i].icon
  })) || defaultStats;

  const recentConnections = data?.recentConnections || [];

  return (
    <div className="flex h-full flex-col bg-canvas p-8 overflow-y-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-foreground tracking-tight">Overview</h1>
        <p className="text-sm text-muted-foreground mt-1">Welcome back. Here's what's happening with your databases.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {stats.map((stat: { name: string, value: string, change: string, trend: string, icon: any }) => (
          <div key={stat.name} className="bg-canvas-soft border border-border rounded-xl p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                <stat.icon size={20} />
              </div>
              <div className={`flex items-center text-xs font-medium px-2 py-1 rounded-full ${stat.trend === 'up' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-500'}`}>
                {stat.trend === 'up' ? <ArrowUpRight size={14} className="mr-1" /> : <ArrowDownRight size={14} className="mr-1" />}
                {stat.change}
              </div>
            </div>
            <div>
              <h3 className="text-3xl font-semibold text-foreground tracking-tight">{stat.value}</h3>
              <p className="text-sm text-muted-foreground mt-1">{stat.name}</p>
            </div>
          </div>
        ))}
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="col-span-2 bg-canvas-soft border border-border rounded-xl p-6 shadow-sm flex flex-col">
          <h2 className="text-lg font-medium text-foreground mb-4">Query Activity</h2>
          <div className="flex-1 flex items-center justify-center border border-dashed border-border rounded-lg bg-canvas/50 min-h-[300px]">
            <p className="text-sm text-muted-foreground">Chart placeholder (e.g. Recharts)</p>
          </div>
        </div>
        <div className="bg-canvas-soft border border-border rounded-xl p-6 shadow-sm flex flex-col">
          <h2 className="text-lg font-medium text-foreground mb-4">Recent Connections</h2>
          <div className="space-y-4">
            {recentConnections.length > 0 ? recentConnections.map((conn: any) => (
              <div key={conn.id} className="flex items-center justify-between p-3 rounded-lg hover:bg-canvas-night transition-colors cursor-pointer group">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-primary/10 text-primary rounded-md group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                    <Database size={16} />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">{conn.name}</p>
                    <p className="text-xs text-muted-foreground">{conn.type} &bull; {new Date(conn.updatedAt).toLocaleDateString()}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="flex w-2 h-2 rounded-full bg-emerald-500"></span>
                  <span className="text-xs text-muted-foreground">Active</span>
                </div>
              </div>
            )) : (
              <div className="text-center py-4 text-sm text-muted-foreground">No recent connections</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
