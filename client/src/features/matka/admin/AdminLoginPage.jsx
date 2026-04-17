import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getAdminMe, getAdminToken, loginAdmin, setAdminToken } from '../../../services/matka/matka-api.js';

const DASHBOARD_PATH = '/admin-x-secure-portal/dashboard';

function ensureNoIndexMeta() {
  const existing = document.querySelector('meta[name="robots"]');
  if (existing) {
    existing.setAttribute('content', 'noindex,nofollow');
    return;
  }

  const meta = document.createElement('meta');
  meta.setAttribute('name', 'robots');
  meta.setAttribute('content', 'noindex,nofollow');
  document.head.appendChild(meta);
}

export default function AdminLoginPage() {
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');

  useEffect(() => {
    document.title = 'Admin Login';
    ensureNoIndexMeta();
  }, []);

  useEffect(() => {
    const check = async () => {
      const token = getAdminToken();
      if (!token) {
        return;
      }

      try {
        await getAdminMe({ token });
        navigate(DASHBOARD_PATH, { replace: true });
      } catch {
        setAdminToken('');
      }
    };
    void check();
  }, [navigate]);

  const onSubmit = async (event) => {
    event.preventDefault();
    setStatus('loading');
    setError('');

    try {
      const payload = await loginAdmin({
        username,
        password,
      });
      setAdminToken(payload?.token ?? '');
      navigate(DASHBOARD_PATH, { replace: true });
    } catch (requestError) {
      setError(requestError.message || 'Login failed');
      setStatus('error');
    } finally {
      setStatus('idle');
    }
  };

  return (
    <main className="matka-admin-shell">
      <section className="matka-admin-auth-card">
        <h1>Admin Portal</h1>
        <p>Secure access only.</p>
        <form onSubmit={onSubmit} className="matka-admin-form">
          <label>
            Username
            <input
              type="text"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              required
            />
          </label>
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>
          <button type="submit" disabled={status === 'loading'}>
            {status === 'loading' ? 'Signing in...' : 'Login'}
          </button>
        </form>
        {error ? <p className="matka-admin-error">{error}</p> : null}
      </section>
    </main>
  );
}
