import { Navigate, Route, Routes } from 'react-router-dom';
import { ShellLayout } from './components/ShellLayout';
import { Dashboard } from './pages/Dashboard';
import { SetupWizard } from './pages/SetupWizard';

export default function App() {
  return (
    <ShellLayout>
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/setup" element={<SetupWizard />} />
      </Routes>
    </ShellLayout>
  );
}
