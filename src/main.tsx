import React from 'react';
import ReactDOM from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { AuthProvider } from './app/providers/AuthProvider';
import { router } from './app/router';
import { PwaUpdateToast } from './components/pwa/PwaUpdateToast';
import './styles/index.css';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <AuthProvider>
      <RouterProvider router={router} />
      <PwaUpdateToast />
    </AuthProvider>
  </React.StrictMode>
);

