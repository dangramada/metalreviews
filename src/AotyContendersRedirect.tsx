import { Navigate, useLocation } from 'react-router-dom';

// The old Contenders route, now the Contenders tab of the AOTY hub. A bare <Navigate to="/aoty">
// would drop the query string, so the whole search (?year, ?from) is carried over and only `view` is
// set. `replace`: the old URL must not stay in the history, or Back would bounce straight forward.
export function AotyContendersRedirect() {
  const { search } = useLocation();
  const params = new URLSearchParams(search);
  params.set('view', 'contenders');
  return <Navigate to={{ pathname: '/aoty', search: `?${params.toString()}` }} replace />;
}
