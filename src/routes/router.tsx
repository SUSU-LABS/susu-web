import { lazy, Suspense, useEffect, useState } from 'react';
import {
  createBrowserRouter,
  Navigate,
  type RouteObject,
} from 'react-router-dom';

const Landing = lazy(() => import('@/pages/landing/Landing'));
const Dashboard = lazy(() => import('@/pages/dashboard/Dashboard'));
const Wallets = lazy(() => import('@/pages/wallets/Wallets'));
const Transactions = lazy(() => import('@/pages/transactions/Transactions'));
const Tokens = lazy(() => import('@/pages/tokens/Tokens'));
const Portfolio = lazy(() => import('@/pages/portfolio/Portfolio'));
const Staking = lazy(() => import('@/pages/staking/Staking'));
const Swaps = lazy(() => import('@/pages/swaps/Swaps'));
const Settings = lazy(() => import('@/pages/settings/Settings'));
const SignIn = lazy(() => import('@/pages/auth/SignIn'));
const SignUp = lazy(() => import('@/pages/auth/SignUp'));
const ForgotPassword = lazy(() => import('@/pages/auth/ForgotPassword'));
const ResetPassword = lazy(() => import('@/pages/auth/ResetPassword'));
const VerifyEmail = lazy(() => import('@/pages/auth/VerifyEmail'));
const NotFound = lazy(() => import('@/pages/NotFound'));

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const [isAuth, setIsAuth] = useState<boolean | null>(null);

  useEffect(() => {
    const checkAuth = () => setIsAuth(!!sessionStorage.getItem('isLoggedIn'));
    checkAuth();
  }, []);

  if (isAuth === null) return null;
  return isAuth ? children : <Navigate to="/signin" replace />;
};

const routes: RouteObject[] = [
  { path: '/', element: <Landing /> },
  { path: '/signin', element: <SignIn /> },
  { path: '/signup', element: <SignUp /> },
  { path: '/forgot-password', element: <ForgotPassword /> },
  { path: '/reset-password', element: <ResetPassword /> },
  { path: '/verify-email', element: <VerifyEmail /> },
  {
    path: '/dashboard',
    element: (
      <ProtectedRoute>
        <Dashboard />
      </ProtectedRoute>
    ),
  },
  {
    path: '/wallets',
    element: (
      <ProtectedRoute>
        <Wallets />
      </ProtectedRoute>
    ),
  },
  {
    path: '/transactions',
    element: (
      <ProtectedRoute>
        <Transactions />
      </ProtectedRoute>
    ),
  },
  {
    path: '/tokens',
    element: (
      <ProtectedRoute>
        <Tokens />
      </ProtectedRoute>
    ),
  },
  {
    path: '/portfolio',
    element: (
      <ProtectedRoute>
        <Portfolio />
      </ProtectedRoute>
    ),
  },
  {
    path: '/staking',
    element: (
      <ProtectedRoute>
        <Staking />
      </ProtectedRoute>
    ),
  },
  {
    path: '/swaps',
    element: (
      <ProtectedRoute>
        <Swaps />
      </ProtectedRoute>
    ),
  },
  {
    path: '/settings',
    element: (
      <ProtectedRoute>
        <Settings />
      </ProtectedRoute>
    ),
  },
  { path: '*', element: <NotFound /> },
];

const router = createBrowserRouter(routes);

export default router;
