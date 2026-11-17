import { Link } from 'react-router-dom';
import { Card } from '../../design/components';

export function ForbiddenPage() {
  return (
    <main className="cl-workspace">
      <Card>
        <h1>That area is not available to this account</h1>
        <Link to="/">Return to CareLens</Link>
      </Card>
    </main>
  );
}
