import { Suspense, lazy } from 'react';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { AppLayout } from './AppLayout';
import { RequireAuth } from './RequireAuth';
import { RouteError } from './RouteError';
import { Landing } from '@/pages/Landing';
import { Login } from '@/pages/auth/Login';
import { Signup } from '@/pages/auth/Signup';
import { ForgotPassword } from '@/pages/auth/ForgotPassword';
import { ResetPassword } from '@/pages/auth/ResetPassword';
import { JoinInvite } from '@/pages/JoinInvite';
import { NotFound } from '@/pages/NotFound';
import { RouteFallback } from './RouteFallback';

// Route-level code splitting: Landing + auth + shell stay in the entry chunk.
// Every heavy authenticated page (Stellar SDK / Framer Motion consumers) is
// lazy so `vite build` emits separate chunks per route area.
const Dashboard = lazy(() =>
  import('@/pages/app/Dashboard').then((m) => ({ default: m.Dashboard })),
);
const Groups = lazy(() =>
  import('@/pages/app/Groups').then((m) => ({ default: m.Groups })),
);
const CreateGroup = lazy(() =>
  import('@/pages/app/CreateGroup').then((m) => ({ default: m.CreateGroup })),
);
const GroupDetail = lazy(() =>
  import('@/pages/app/GroupDetail').then((m) => ({ default: m.GroupDetail })),
);
const Activity = lazy(() =>
  import('@/pages/app/Activity').then((m) => ({ default: m.Activity })),
);
const Settings = lazy(() =>
  import('@/pages/app/Settings').then((m) => ({ default: m.Settings })),
);
const TransactionDetail = lazy(() =>
  import('@/pages/app/TransactionDetail').then((m) => ({
    default: m.TransactionDetail,
  })),
);

function withSuspense(element: React.ReactNode) {
  return <Suspense fallback={<RouteFallback />}>{element}</Suspense>;
}

/**
 * Every route carries an `errorElement` so a render failure costs the page it
 * happened on, not the app: the nearest layout stays mounted behind the notice,
 * and the person reading it can navigate away. The top-level boundary in
 * `main.tsx` covers whatever is outside these routes — see #8.
 */
const router = createBrowserRouter([
  { path: '/', element: <Landing />, errorElement: <RouteError /> },
  { path: '/login', element: <Login />, errorElement: <RouteError /> },
  { path: '/signup', element: <Signup />, errorElement: <RouteError /> },
  { path: '/forgot-password', element: <ForgotPassword />, errorElement: <RouteError /> },
  { path: '/reset-password', element: <ResetPassword />, errorElement: <RouteError /> },
  { path: '/join/:inviteCode', element: <JoinInvite />, errorElement: <RouteError /> },
  {
    path: '/app',
    element: (
      <RequireAuth>
        <AppLayout />
      </RequireAuth>
    ),
    errorElement: <RouteError />,
    children: [
      { index: true, element: withSuspense(<Dashboard />), errorElement: <RouteError /> },
      { path: 'groups', element: withSuspense(<Groups />), errorElement: <RouteError /> },
      { path: 'groups/create', element: withSuspense(<CreateGroup />), errorElement: <RouteError /> },
      { path: 'groups/:id', element: withSuspense(<GroupDetail />), errorElement: <RouteError /> },
      { path: 'activity', element: withSuspense(<Activity />), errorElement: <RouteError /> },
      { path: 'settings', element: withSuspense(<Settings />), errorElement: <RouteError /> },
      { path: 'transactions/:hash', element: withSuspense(<TransactionDetail />), errorElement: <RouteError /> },
    ],
  },
  { path: '*', element: <NotFound />, errorElement: <RouteError /> },
]);

export function Router() {
  return <RouterProvider router={router} />;
}
