import { Navigate, createBrowserRouter } from 'react-router-dom';
import { AppShell } from '../components/layout/AppShell';
import { AnalyticsPage } from '../pages/AnalyticsPage';
import { AuthPage } from '../pages/AuthPage';
import { BugTrackerPage } from '../pages/BugTrackerPage';
import { DashboardPage } from '../pages/DashboardPage';
import { FarmingTrackerPage } from '../pages/FarmingTrackerPage';
import { JournalPage } from '../pages/JournalPage';
import { MintTrackerPage } from '../pages/MintTrackerPage';
import { NotFoundPage } from '../pages/NotFoundPage';
import { ProductivityPage } from '../pages/ProductivityPage';
import { ProjectsPage } from '../pages/ProjectsPage';
import { SettingsPage } from '../pages/SettingsPage';
import { ProtectedRoute } from './routes/ProtectedRoute';

export const router = createBrowserRouter([
  {
    path: '/auth',
    element: <AuthPage />
  },
  {
    path: '/',
    element: <Navigate to="/dashboard" replace />
  },
  {
    element: <ProtectedRoute />,
    children: [
      {
        element: <AppShell />,
        children: [
          {
            path: '/dashboard',
            element: <DashboardPage />
          },
          {
            path: '/analytics',
            element: <AnalyticsPage />
          },
          {
            path: '/mints',
            element: <MintTrackerPage />
          },
          {
            path: '/farming',
            element: <FarmingTrackerPage />
          },
          {
            path: '/productivity',
            element: <ProductivityPage />
          },
          {
            path: '/journal',
            element: <JournalPage />
          },
          {
            path: '/bugs',
            element: <BugTrackerPage />
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
    element: <NotFoundPage />
  }
]);
