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
import { CriteriaCalibrationPage } from './CriteriaCalibrationPage';
// Lazy-loaded to prevent FavoritesPage from crashing the module graph on import.
const FavoritesPage = React.lazy(() => import('./FavoritesPage').then(m => ({ default: m.FavoritesPage })));
// Lazy-loaded for the same reason, plus this page pulls in @chakra-ui/charts/recharts —
// no need to add that to every route's initial bundle.
const AlbumRatingPage = React.lazy(() => import('./AlbumRatingPage').then(m => ({ default: m.AlbumRatingPage })));
const DevRatingPreview = React.lazy(() => import('./DevRatingPreview').then(m => ({ default: m.DevRatingPreview })));
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
  // TEMPORARY dev-only harness — remove before merging.
  { path: '/dev-rating-preview', element: <React.Suspense fallback={null}><DevRatingPreview /></React.Suspense> },
  {
    path: '/rate/:albumId',
    element: (
      <RequireAuth>
        <React.Suspense fallback={null}>
          <AlbumRatingPage />
        </React.Suspense>
      </RequireAuth>
    ),
  },
  // Wired to the real engine + Supabase persistence (parts 5a/5b) — still unlinked from
  // the app's nav (separate IA decision). Auth-gated since progress is saved per-user.
  {
    path: '/criteria-calibration',
    element: (
      <RequireAuth>
        <CriteriaCalibrationPage />
      </RequireAuth>
    ),
  },
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
