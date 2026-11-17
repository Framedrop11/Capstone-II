import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Card } from '../../design/components';
import { useAuthSession } from '../../shared/auth/useAuthSession';
import { AuthPopupError } from '../../shared/auth/session';

export function PublicPage() {
  const { session, snapshot } = useAuthSession();
  const navigate = useNavigate();
  const [message, setMessage] = useState<string | null>(null);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [demoRole, setDemoRole] = useState<'patient' | 'doctor' | 'admin'>('patient');
  const isLocalDemo =
    window.CARELENS_CONFIG?.environment === 'local' &&
    window.CARELENS_CONFIG.authProvider === 'mock';

  useEffect(() => {
    if (snapshot.status === 'authenticated' && snapshot.role)
      navigate(`/${snapshot.role}`, { replace: true });
  }, [navigate, snapshot.role, snapshot.status]);

  async function signIn() {
    setMessage(null);
    setIsSigningIn(true);
    try {
      await session.signInWithGoogle(isLocalDemo ? demoRole : undefined);
    } catch (error) {
      setMessage(
        error instanceof AuthPopupError
          ? error.message
          : 'Sign-in could not start. Please try again.',
      );
    } finally {
      setIsSigningIn(false);
    }
  }

  return (
    <main className="cl-public-page">
      <section className="cl-public-intro" aria-labelledby="public-title">
        <a className="cl-public-brand" href="/" aria-label="CareLens home">
          <span className="cl-brand-mark" aria-hidden="true">
            <svg viewBox="0 0 32 32" fill="none">
              <path d="M16 4v24M4 16h24" />
              <circle cx="16" cy="16" r="10.5" />
            </svg>
          </span>
          <span>CareLens</span>
        </a>
        <div className="cl-public-copy">
          <p className="cl-public-eyebrow">A thoughtful first step</p>
          <h1 id="public-title">A clearer picture starts with a conversation.</h1>
          <p className="cl-public-description">
            Early screening can help start a conversation with your doctor.
          </p>
          <div className="cl-public-assurance">
            <span className="cl-assurance-mark" aria-hidden="true">
              ✓
            </span>
            <p>Screening aid, not a diagnosis.</p>
          </div>
        </div>
        <p className="cl-public-footer">CareLens · Supporting informed conversations</p>
      </section>

      <section className="cl-auth-panel" aria-label="Sign in to CareLens">
        <Card className="cl-auth-card">
          <div className="cl-auth-heading">
            <p className="cl-eyebrow">WELCOME</p>
            <h2>Sign in to CareLens</h2>
            <p>Continue securely with your Google account.</p>
          </div>
          {isLocalDemo && (
            <label className="form-label" htmlFor="demo-role">
              Local demo account
              <select
                id="demo-role"
                value={demoRole}
                onChange={(event) => setDemoRole(event.target.value as typeof demoRole)}
              >
                <option value="patient">Patient</option>
                <option value="doctor">Doctor</option>
                <option value="admin">Administrator</option>
              </select>
            </label>
          )}
          <Button className="cl-google-button" onClick={() => void signIn()} disabled={isSigningIn}>
            <span className="cl-google-g" aria-hidden="true">
              G
            </span>
            {isSigningIn ? 'Opening secure sign-in…' : 'Sign in with Google'}
          </Button>
          {message && (
            <p className="cl-auth-error" role="alert">
              {message}
            </p>
          )}
          <p className="cl-auth-note">
            Your screening information is handled through your CareLens session.
          </p>
        </Card>
      </section>
    </main>
  );
}
