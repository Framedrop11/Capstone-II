import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router-dom';
import { AuthSessionProvider } from './shared/auth/AuthSessionProvider';
import {
  getQueryRetryDelay,
  isFriendlyApiError,
  shouldRetryQuery,
} from './shared/api/query-policy';
import { router } from './app/router';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: (failureCount, error) =>
        isFriendlyApiError(error) && shouldRetryQuery(failureCount, error),
      retryDelay: (attempt, error) =>
        getQueryRetryDelay(attempt, isFriendlyApiError(error) ? error.retryAfterMs : null),
    },
    mutations: { retry: false },
  },
});

export function App() {
  return (
    <AuthSessionProvider>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </AuthSessionProvider>
  );
}
