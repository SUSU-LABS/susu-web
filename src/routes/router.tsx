import { lazy, Suspense } from 'react';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { AppLayout } from './AppLayout';
import { RequireAuth } from './RequireAuth';
import { RouteError } from './RouteError';
import { Landing } from '@/pages/Landing';
import { Login } from '@/pages/auth/Login';
import { Signup } from '@/pages/auth/Signup';
import { ForgotPassword } from '@/pages/auth/ForgotPassword';
import { ResetPassword } from '@/pages/auth/ResetPassword';

const JoinInvite = lazy(() =>
  import('@/pages/JoinInvite').then(({ JoinInvite }) => ({ default: JoinInvite })),
);
const Dashboard = lazy(() =>
  import('@/pages/app/Dashboard').then(({ Dashboard }) => ({ default: Dashboard })),
);
const Groups = lazy(() => import('@/pages/app/Groups').then(({ Groups }) => ({ default: Groups })));
const CreateGroup = lazy(() =>
  import('@/pages/app/CreateGroup').then(({ CreateGroup }) => ({ default: CreateGroup })),
);
const GroupDetail = lazy(() =>
  import('@/pages/app/GroupDetail').then(({ GroupDetail }) => ({ default: GroupDetail })),
);
const Activity = lazy(() =>
  import('@/pages/app/Activity').then(({ Activity }) => ({ default: Activity })),
);
const Settings = lazy(() =>
  import('@/pages/app/Settings').then(({ Settings }) => ({ default: Settings })),
);
const TransactionDetail = lazy(() =>
  import('@/pages/app/TransactionDetail').then(({ TransactionDetail }) => ({
    default: TransactionDetail,
  })),
);
const NotFound = lazy(() =>
  import('@/pages/NotFound').then(({ NotFound }) => ({ default: NotFound })),
);

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
      { index: true, element: <Dashboard />, errorElement: <RouteError /> },
      { path: 'groups', element: <Groups />, errorElement: <RouteError /> },
      { path: 'groups/create', element: <CreateGroup />, errorElement: <RouteError /> },
      { path: 'groups/:id', element: <GroupDetail />, errorElement: <RouteError /> },
      { path: 'activity', element: <Activity />, errorElement: <RouteError /> },
      { path: 'settings', element: <Settings />, errorElement: <RouteError /> },
      { path: 'transactions/:hash', element: <TransactionDetail />, errorElement: <RouteError /> },
    ],
  },
  { path: '*', element: <NotFound />, errorElement: <RouteError /> },
]);

export function Router() {
  return (
    <Suspense
      fallback={
        <div role="status" className="mx-auto max-w-3xl px-6 py-10 text-sm text-neutral-500">
          Loading page…
        </div>
      }
    >
      <RouterProvider router={router} />
    </Suspense>
  );
}
