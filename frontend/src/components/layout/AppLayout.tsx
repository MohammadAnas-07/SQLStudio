import { Outlet, NavLink } from 'react-router-dom';
import { Database, LayoutDashboard, Terminal, History, BookOpen, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function AppLayout() {
  const navItems = [
    { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { to: '/workspace', icon: Terminal, label: 'SQL Workspace' },
    { to: '/history', icon: History, label: 'Query History' },
    { to: '/saved', icon: BookOpen, label: 'Saved Queries' },
  ];

  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden">
      {/* Sidebar */}
      <aside className="w-16 flex flex-col items-center py-4 border-r border-border bg-canvas-night">
        <div className="mb-8 text-primary">
          <Database size={28} strokeWidth={2} />
        </div>
        <nav className="flex-1 flex flex-col gap-4 w-full px-2">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              title={item.label}
              className={({ isActive }) =>
                cn(
                  "p-3 rounded-md flex items-center justify-center transition-colors",
                  isActive 
                    ? "bg-primary text-primary-foreground" 
                    : "text-muted-foreground hover:bg-canvas-night-soft hover:text-foreground"
                )
              }
            >
              <item.icon size={22} strokeWidth={1.5} />
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto px-2 w-full">
          <button className="p-3 w-full rounded-md flex items-center justify-center text-muted-foreground hover:bg-canvas-night-soft hover:text-foreground transition-colors">
            <Settings size={22} strokeWidth={1.5} />
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-full overflow-hidden">
        <Outlet />
      </main>
    </div>
  );
}
