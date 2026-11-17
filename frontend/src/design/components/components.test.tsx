import { render, screen } from '@testing-library/react';
import { axe } from 'jest-axe';
import { describe, expect, it } from 'vitest';
import { Button, Card, RiskBadge } from './index';

describe('design system primitives', () => {
  it('exposes visible risk labels and accessible interactive states', async () => {
    const { container } = render(
      <main>
        <Card>
          <Button>Start check-up</Button>
          <Button variant="secondary" disabled>
            Cancel
          </Button>
          <RiskBadge level="low" />
          <RiskBadge level="moderate" />
          <RiskBadge level="high" />
        </Card>
      </main>,
    );

    expect(screen.getByRole('button', { name: 'Start check-up' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    expect(screen.getByText('Low risk')).toBeInTheDocument();
    expect(screen.getByText('Moderate risk')).toBeInTheDocument();
    expect(screen.getByText('High risk')).toBeInTheDocument();
    expect(await axe(container)).toHaveProperty('violations', []);
  });
});
