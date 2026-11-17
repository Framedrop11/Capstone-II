import { createBrowserRouter } from 'react-router-dom';
import { ProtectedRoute } from './ProtectedRoute';
import { RouteError } from './RouteError';

export const router = createBrowserRouter([
  {
    path: '/',
    errorElement: <RouteError />,
    lazy: async () => {
      const { PublicPage } = await import('./routes/PublicPage');
      return { Component: PublicPage };
    },
  },
  {
    path: '/patient',
    element: <ProtectedRoute role="patient" />,
    errorElement: <RouteError />,
    children: [
      {
        index: true,
        lazy: async () => {
          const { PatientWorkspace } = await import('./routes/PatientWorkspace');
          return { Component: PatientWorkspace };
        },
      },
    ],
  },
  {
    path: '/doctor',
    element: <ProtectedRoute role="doctor" />,
    errorElement: <RouteError />,
    children: [
      {
        index: true,
        lazy: async () => {
          const { DoctorWorkspace } = await import('./routes/DoctorWorkspace');
          return { Component: DoctorWorkspace };
        },
      },
    ],
  },
  {
    path: '/admin',
    element: <ProtectedRoute role="admin" />,
    errorElement: <RouteError />,
    children: [
      {
        index: true,
        lazy: async () => {
          const { AdminWorkspace } = await import('./routes/AdminWorkspace');
          return { Component: AdminWorkspace };
        },
      },
    ],
  },
  {
    path: '/forbidden',
    errorElement: <RouteError />,
    lazy: async () => {
      const { ForbiddenPage } = await import('./routes/ForbiddenPage');
      return { Component: ForbiddenPage };
    },
  },
]);
