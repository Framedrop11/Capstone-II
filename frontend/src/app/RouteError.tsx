import { useRouteError } from 'react-router-dom';
import { Button } from '../design/components';

export function RouteError() {
  useRouteError();
  return (
    <main className="cl-route-error" role="alert">
      <h1>We hit a small snag</h1>
      <p>Your health information is safe. Please try this page again.</p>
      <Button variant="secondary" onClick={() => window.location.reload()}>
        Try again
      </Button>
    </main>
  );
}
