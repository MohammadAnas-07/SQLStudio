import type { ReactNode } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AppLayout from './components/layout/AppLayout';
import SQLWorkspace from './pages/SQLWorkspace';
import Dashboard from './pages/Dashboard';
import QueryHistory from './pages/QueryHistory';
import SavedQueries from './pages/SavedQueries';
import Login from './pages/Login';
import { useAuthStore } from './store/authStore';
import './index.css';

import { ToastContainer } from './components/ui/Toast';

const queryClient = new QueryClient();

function ProtectedRoute({ children }: { children: ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
            <Route index element={<Navigate to="/workspace" replace />} />
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="workspace" element={<SQLWorkspace />} />
            <Route path="history" element={<QueryHistory />} />
            <Route path="saved" element={<SavedQueries />} />
          </Route>
        </Routes>
      </BrowserRouter>
      <ToastContainer />
    </QueryClientProvider>
  );
}

export default App;
