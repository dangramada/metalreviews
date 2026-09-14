import React from 'react';
import ReactDOM from 'react-dom/client';
import { createBrowserRouter, RouterProvider, Navigate, useLocation } from 'react-router-dom';
import { ChakraProvider } from '@chakra-ui/react';
import App from './App';
import { LoginPage } from './LoginPage';
import { AuthCallback } from './AuthCallback';
import { AuthProvider } from './AuthContext';
import { RequireAuth } from './RequireAuth';
import { StyleGuide } from './StyleGuide';
import { DevMusicBrainzStreamingCoverage } from './DevMusicBrainzStreamingCoverage';
import { CriteriaCalibrationPage } from './CriteriaCalibrationPage';
import { ErrorBoundary } from './components/ErrorBoundary';

function CalibrationRouteRedirect() {
  const location = useLocation();
  return <Navigate to={{ pathname: '/calibration', search: location.search }} replace />;
}
// Lazy-loaded to prevent FavoritesPage from crashing the module graph on import.
const FavoritesPage = React.lazy(() => import('./FavoritesPage').then(m => ({ default: m.FavoritesPage })));
// Lazy-loaded for the same reason, plus this page pulls in @chakra-ui/charts/recharts —
// no need to add that to every route's initial bundle.
const AlbumRatingPage = React.lazy(() => import('./AlbumRatingPage').then(m => ({ default: m.AlbumRatingPage })));
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
  // Throwaway dev route for the MusicBrainz streaming-link coverage spike
  // (spike/musicbrainz-streaming-links) — remove along with DevMusicBrainzStreamingCoverage.tsx
  // once the spike is reviewed.
  { path: '/dev-musicbrainz-streaming-coverage', element: <DevMusicBrainzStreamingCoverage /> },
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
  // Renamed from /criteria-calibration for the criteria-calibration-page-redesign IA (single
  // route + ?step=guide|calibration|results, see CalibrationPageHeader) — the old path is
  // preserved just below as a redirect, since it was reachable even though unlinked.
  {
    path: '/calibration',
    // ErrorBoundary is a backstop only — the page catches its own solver failures and
    // recovers in place. Before both existed, a solver throw during render unmounted the
    // whole root and left a blank page (see the safety-net note in CriteriaCalibrationPage).
    element: (
      <RequireAuth>
        <ErrorBoundary message="Something went wrong while loading your calibration session.">
          <CriteriaCalibrationPage />
        </ErrorBoundary>
      </RequireAuth>
    ),
  },
  // A bare <Navigate to="/calibration"> would drop the query string (?from=, ?step=), so this
  // small wrapper reads the current location and forwards its search along with the redirect.
  { path: '/criteria-calibration', element: <CalibrationRouteRedirect /> },
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
