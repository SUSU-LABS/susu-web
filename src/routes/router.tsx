import { lazy, Suspense, type ReactNode } from 'react';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { AppLayout } from './AppLayout';
import { RequireAuth } from './RequireAuth';
import { RouteError } from './RouteError';
import { Spinner } from '@/components/ui';

/**
 * Route components load lazily so the initial bundle stays small: the public
 * landing page and the auth forms never download the authenticated app, and
 * the Stellar SDK — reachable only from the /app pages — is not part of the
 * entry chunk at all (see the `vendor-stellar` manual chunk in vite.config.ts).
 *
 * Every page keeps its named export; each loader maps it onto the default
 * export `React.lazy` requires.
 */
const Landing = lazy(() => import('@/pages/Landing').then((m) => ({ default: m.Landing })));
const Login = lazy(() => import('@/pages/auth/Login').then((m) => ({ default: m.Login })));
const Signup = lazy(() => import('@/pages/auth/Signup').then((m) => ({ default: m.Signup })));
const ForgotPassword = lazy(() =>
  import('@/pages/auth/ForgotPassword').then((m) => ({ default: m.ForgotPassword })),
);
const ResetPassword = lazy(() =>
  import('@/pages/auth/ResetPassword').then((m) => ({ default: m.ResetPassword })),
);
const JoinInvite = lazy(() =>
  import('@/pages/JoinInvite').then((m) => ({ default: m.JoinInvite })),
);
const Dashboard = lazy(() =>
  import('@/pages/app/Dashboard').then((m) => ({ default: m.Dashboard })),
);
const Groups = lazy(() => import('@/pages/app/Groups').then((m) => ({ default: m.Groups })));
const CreateGroup = lazy(() =>
  import('@/pages/app/CreateGroup').then((m) => ({ default: m.CreateGroup })),
);
const GroupDetail = lazy(() =>
  import('@/pages/app/GroupDetail').then((m) => ({ default: m.GroupDetail })),
);
const Activity = lazy(() => import('@/pages/app/Activity').then((m) => ({ default: m.Activity })));
const Settings = lazy(() => import('@/pages/app/Settings').then((m) => ({ default: m.Settings })));
const TransactionDetail = lazy(() =>
  import('@/pages/app/TransactionDetail').then((m) => ({ default: m.TransactionDetail })),
);
const NotFound = lazy(() => import('@/pages/NotFound').then((m) => ({ default: m.NotFound })));

/**
 * What the user sees while a route chunk downloads. It renders inside the
 * already-mounted layout, so navigating never blanks the shell — and on the
 * first paint it is all that shows until the route's own chunk arrives.
 */
function RouteFallback() {
  return (
    <div role="status" aria-label="Loading page" className="grid min-h-[40vh] place-items-center">
      <Spinner />
    </div>
  );
}

/**
 * Wraps a lazily loaded route element so a chunk download suspends the page,
 * not the app: the layout and its error boundary stay mounted behind the
 * fallback.
 */
function lazyRoute(element: ReactNode) {
  return <Suspense fallback={<RouteFallback />}>{element}</Suspense>;
}

/**
 * Every route carries an `errorElement` so a render failure costs the page it
 * happened on, not the app: the nearest layout stays mounted behind the notice,
 * and the person reading it can navigate away. The top-level boundary in
 * `main.tsx` covers whatever is outside these routes — see #8.
 */
const router = createBrowserRouter([
  { path: '/', element: lazyRoute(<Landing />), errorElement: <RouteError /> },
  { path: '/login', element: lazyRoute(<Login />), errorElement: <RouteError /> },
  { path: '/signup', element: lazyRoute(<Signup />), errorElement: <RouteError /> },
  {
    path: '/forgot-password',
    element: lazyRoute(<ForgotPassword />),
    errorElement: <RouteError />,
  },
  {
    path: '/reset-password',
    element: lazyRoute(<ResetPassword />),
    errorElement: <RouteError />,
  },
  { path: '/join/:inviteCode', element: lazyRoute(<JoinInvite />), errorElement: <RouteError /> },
  {
    path: '/app',
    element: (
      <RequireAuth>
        <AppLayout />
      </RequireAuth>
    ),
    errorElement: <RouteError />,
    children: [
      { index: true, element: lazyRoute(<Dashboard />), errorElement: <RouteError /> },
      { path: 'groups', element: lazyRoute(<Groups />), errorElement: <RouteError /> },
      { path: 'groups/create', element: lazyRoute(<CreateGroup />), errorElement: <RouteError /> },
      { path: 'groups/:id', element: lazyRoute(<GroupDetail />), errorElement: <RouteError /> },
      { path: 'activity', element: lazyRoute(<Activity />), errorElement: <RouteError /> },
      { path: 'settings', element: lazyRoute(<Settings />), errorElement: <RouteError /> },
      {
        path: 'transactions/:hash',
        element: lazyRoute(<TransactionDetail />),
        errorElement: <RouteError />,
      },
    ],
  },
  { path: '*', element: lazyRoute(<NotFound />), errorElement: <RouteError /> },
]);

export function Router() {
  return <RouterProvider router={router} />;
}
