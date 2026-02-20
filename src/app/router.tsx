import { Navigate, createBrowserRouter } from 'react-router-dom';
import { AppShell } from '../components/layout/AppShell';
import { AuthPage } from '../features/auth/AuthPage';
import { DashboardPage } from '../features/dashboard/pages/DashboardPage';
import { ProjectsPage } from '../features/dashboard/pages/ProjectsPage';
import { SettingsPage } from '../features/dashboard/pages/SettingsPage';
import { ProtectedRoute } from './routes/ProtectedRoute';

export const router = createBrowserRouter([
  {
    path: '/auth',
    element: <AuthPage />
  },
  {
    element: <ProtectedRoute />,
    children: [
      {
        element: <AppShell />,
        children: [
          {
            path: '/',
            element: <DashboardPage />
          },
          {
            path: '/projects',
            element: <ProjectsPage />
          },
          {
            path: '/settings',
            element: <SettingsPage />
          }
        ]
      }
    ]
  },
  {
    path: '*',
    element: <Navigate to="/" replace />
  }
]);

