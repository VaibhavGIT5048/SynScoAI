import { RouteObject } from 'react-router-dom';
import { lazy } from 'react';
import HomePage from './pages/index';

// Lazy load components for code splitting (except HomePage for instant loading)
const isDevelopment = import.meta.env.MODE === 'development';
const NotFoundPage = isDevelopment
  ? lazy(() => import('../dev-tools/src/PageNotFound'))
  : lazy(() => import('./pages/_404'));

const SimulatePage = lazy(() => import('./pages/simulate'));
const ResultsPage = lazy(() => import('./pages/results'));
const AboutPage = lazy(() => import('./pages/about'));

export const routes: RouteObject[] = [
  {
    path: '/',
    element: <HomePage />,
  },
  {
    path: '/simulate',
    element: <SimulatePage />,
  },
  {
    path: '/results',
    element: <ResultsPage />,
  },
  {
    path: '/about',
    element: <AboutPage />,
  },
  {
    path: '*',
    element: <NotFoundPage />,
  },
];

export type Path = '/' | '/simulate' | '/results' | '/about';
export type Params = Record<string, string | undefined>;
