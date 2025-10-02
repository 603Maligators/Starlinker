import { Navigate, Route, Routes } from 'react-router-dom';
import { Dashboard } from './pages/Dashboard';
import { ShellLayout } from './components/ShellLayout';

export default function App() {
  return (
    <ShellLayout>
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<Dashboard />} />
      </Routes>
    </ShellLayout>
  );
}
