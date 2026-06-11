import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AppLayout from './components/layout/AppLayout';
import SQLWorkspace from './pages/SQLWorkspace';
import Dashboard from './pages/Dashboard';
import QueryHistory from './pages/QueryHistory';
import SavedQueries from './pages/SavedQueries';
import './index.css';

const queryClient = new QueryClient();

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<AppLayout />}>
            <Route index element={<Navigate to="/workspace" replace />} />
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="workspace" element={<SQLWorkspace />} />
            <Route path="history" element={<QueryHistory />} />
            <Route path="saved" element={<SavedQueries />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;
