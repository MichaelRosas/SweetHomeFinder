import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../firebase/config';
import { useAuth } from '../auth/AuthContext';
import NavBar from '../components/NavBar';
import '../styles/Auth.css';

export default function SignIn() {
  const nav = useNavigate();
  const { user, checking } = useAuth();

  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // If the user is already signed in, keep them out of the sign-in screen.
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
      case 'auth/invalid-credential':
      case 'auth/wrong-password':
        return 'Incorrect email or password.';
      case 'auth/user-not-found':
        return 'No account found with that email.';
      case 'auth/too-many-requests':
        return 'Too many attempts. Try again later.';
      default:
        return 'Sign in failed. Please try again.';
    }
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const email = form.email.trim();
    const { password } = form;

    if (!email || !password) {
      setError('Email and password are required.');
      return;
    }

    try {
      setBusy(true);

      const credential = await signInWithEmailAndPassword(auth, email, password);
      const uid = credential.user?.uid;

      if (!uid) {
        nav('/signin', { replace: true });
        return;
      }

      const snap = await getDoc(doc(db, 'users', uid));
      const profile = snap.exists() ? snap.data() : null;

      if (!profile || !profile.role) {
        nav('/onboarding', { replace: true });
        return;
      }

      nav('/dashboard', { replace: true });
    } catch (err) {
      console.error('Sign in failed', err);
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
          <h1>Welcome back</h1>
          <p>Sign in to continue.</p>

          {error && <div className="error-message">{error}</div>}

          <form className="auth-form" onSubmit={onSubmit}>
            <div className="form-group">
              <label htmlFor="signin-email">Email</label>
              <input
                id="signin-email"
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
              <label htmlFor="signin-password">Password</label>
              <input
                id="signin-password"
                name="password"
                type="password"
                placeholder="••••••••"
                value={form.password}
                onChange={onChange}
                autoComplete="current-password"
                required
              />
            </div>

            <button className="auth-button" disabled={busy}>
              {busy ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          <div className="auth-footer">
            <p>Don’t have an account?</p>
            <Link to="/signup">Create one</Link>
          </div>
        </div>
      </main>
    </div>
  );
}
