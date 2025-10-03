import { Navigate, Route, Routes } from 'react-router-dom';
import { ShellLayout } from './components/ShellLayout';
import { Dashboard } from './pages/Dashboard';
import { AdminConsole } from './pages/AdminConsole';
import { SetupWizard } from './pages/SetupWizard';
import { ToastViewport } from './components/ToastViewport';

export default function App() {
  return (
    <>
      <ShellLayout>
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/setup" element={<SetupWizard />} />
          <Route path="/admin" element={<AdminConsole />} />
        </Routes>
      </ShellLayout>
      <ToastViewport />
    </>
  );
}
