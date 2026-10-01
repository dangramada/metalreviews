import { Link } from '@chakra-ui/react';
import { Link as RouterLink } from 'react-router-dom';
import { Alert } from './ui/alert';
import { confidenceLabel } from '../hooks/useCalibrationGate';

// The tier === 'none' banner shared by ContendersPage and AotyPage. Reuses the shared `Alert` and
// `status.info` tokens (same as AlbumRatingPage's insufficient-data banner); the body is the same
// "settle the score" sentence CalibrationGateDialog's soft mode uses, and the link copy and
// `?from=` convention match the rating page's "Go to calibration" link.
export function TierNoneBanner({ from }: { from: 'contenders' | 'aoty' }) {
  return (
    <Alert
      status="info"
      variant="surface"
      bg="status.info.bg"
      color="status.info.text"
      title={`Score level: ${confidenceLabel('none')}`}
    >
      A few more comparisons usually settle the score closer to what matters most to you.{' '}
      <Link asChild color="status.info.text" fontWeight="600">
        <RouterLink to={`/calibration?from=${from}`}>Go to calibration</RouterLink>
      </Link>
    </Alert>
  );
}
