import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../firebase/config';
import { useAuth } from '../auth/AuthContext';
import NavBar from '../components/NavBar';
import '../styles/Auth.css';

export default function SignUp() {
  const nav = useNavigate();
  const { user, checking } = useAuth();

  const [form, setForm] = useState({ email: '', password: '', confirm: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // If the user is already signed in, don't let them see the sign-up form.
  useEffect(() => {
    if (checking) return;
    if (!user) return;

    const needsProfile = user.needsOnboarding || !user.role;
    nav(needsProfile ? '/onboarding' : '/dashboard', { replace: true });
  }, [user, checking, nav]);

  const onChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    if (error) {
      setError('');
    }
  };

  const toMsg = (code) => {
    switch (code) {
      case 'auth/email-already-in-use':
        return 'That email is already registered.';
      case 'auth/weak-password':
        return 'Password is too weak (min 6 characters).';
      case 'auth/invalid-email':
        return 'Please enter a valid email.';
      default:
        return 'Sign up failed. Please try again.';
    }
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const email = form.email.trim();
    const { password, confirm } = form;

    if (!email || !password || !confirm) {
      setError('Email and password are required.');
      return;
    }

    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }

    try {
      setBusy(true);
      await createUserWithEmailAndPassword(auth, email, password);
      nav('/onboarding', { replace: true });
    } catch (err) {
      console.error('Sign up failed', err);
      setError(toMsg(err.code));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-container">
      <NavBar variant="auth" backTo="/" />

      <main className="auth-content">
        <div className="auth-card">
          <h1>Create your account</h1>
          <p>Start by creating an account, then we&apos;ll walk you through onboarding.</p>

          {error && <div className="error-message">{error}</div>}

          <form className="auth-form" onSubmit={onSubmit}>
            <div className="form-group">
              <label htmlFor="signup-email">Email</label>
              <input
                id="signup-email"
                name="email"
                type="email"
                placeholder="you@example.com"
                value={form.email}
                onChange={onChange}
                autoComplete="email"
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="signup-password">Password</label>
              <input
                id="signup-password"
                name="password"
                type="password"
                placeholder="••••••••"
                value={form.password}
                onChange={onChange}
                autoComplete="new-password"
                required
                minLength={6}
              />
            </div>

            <div className="form-group">
              <label htmlFor="signup-confirm">Confirm password</label>
              <input
                id="signup-confirm"
                name="confirm"
                type="password"
                placeholder="••••••••"
                value={form.confirm}
                onChange={onChange}
                autoComplete="new-password"
                required
                minLength={6}
              />
            </div>

            <button className="auth-button" disabled={busy}>
              {busy ? 'Creating…' : 'Create account'}
            </button>
          </form>

          <div className="auth-footer">
            <p>Already have an account?</p>
            <Link to="/signin">Sign in</Link>
          </div>
        </div>
      </main>
    </div>
  );
}
