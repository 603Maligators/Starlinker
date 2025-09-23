import { Route, Routes } from 'react-router-dom';
import AppLayout from '../components/AppLayout';
import Dashboard from '../pages/Dashboard';

const AppRoutes = () => (
  <Routes>
    <Route element={<AppLayout />}>
      <Route index element={<Dashboard />} />
    </Route>
  </Routes>
);

export default AppRoutes;
