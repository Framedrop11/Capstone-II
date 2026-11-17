import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { PublicPage } from './app/routes/PublicPage';
import { AuthSessionProvider } from './shared/auth/AuthSessionProvider';
import { AuthSession } from './shared/auth/session';

describe('CareLens app scaffold', () => {
  it('renders the product name and screening disclaimer', () => {
    render(
      <AuthSessionProvider session={new AuthSession()} restoreOnMount={false}>
        <MemoryRouter>
          <PublicPage />
        </MemoryRouter>
      </AuthSessionProvider>,
    );
    expect(screen.getByRole('heading', { name: 'CareLens' })).toBeInTheDocument();
    expect(screen.getByText('Screening aid, not a diagnosis.')).toBeInTheDocument();
  });
});
