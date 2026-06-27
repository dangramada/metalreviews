import React from 'react';
import ReactDOM from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { ChakraProvider } from '@chakra-ui/react';
import App from './App';
import { LoginPage } from './LoginPage';
import { AuthCallback } from './AuthCallback';
import { AuthProvider } from './AuthContext';
import { RequireAuth } from './RequireAuth';
import { StyleGuide } from './StyleGuide';
// Lazy-loaded to prevent FavoritesPage from crashing the module graph on import.
const FavoritesPage = React.lazy(() => import('./FavoritesPage').then(m => ({ default: m.FavoritesPage })));
import system from './theme';
import { Toaster } from './components/ui/toaster';

const router = createBrowserRouter([
  { path: '/', element: <App /> },
  { path: '/login', element: <LoginPage /> },
  { path: '/auth/callback', element: <AuthCallback /> },
  {
    path: '/favorites',
    element: (
      <RequireAuth>
        <React.Suspense fallback={null}>
          <FavoritesPage />
        </React.Suspense>
      </RequireAuth>
    ),
  },
  { path: '/style-guide', element: <StyleGuide /> },
  // { path: '/aoty/:shareId', element: <SharedList /> }  — reserved for shareable favorites
]);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ChakraProvider value={system}>
      <Toaster />
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </ChakraProvider>
  </React.StrictMode>
);
