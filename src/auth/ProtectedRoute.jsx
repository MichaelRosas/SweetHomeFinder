import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';

export default function ProtectedRoute({ children }) {
  const { user, checking } = useAuth();
  const location = useLocation();

  // While we don't yet know whether the user is signed in, avoid flashing
  // protected content or redirecting. The individual pages already use the
  // shared auth layout styles.
  if (checking) {
    return (
      <div className="auth-container">
        <main className="auth-content">
          <div className="auth-card">Checking your account…</div>
        </main>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/signin" replace state={{ from: location }} />;
  }

  const pathname = location.pathname;
  const requiresProfile = pathname !== '/onboarding';

  // Any signed-in user without a completed profile should be funneled through
  // onboarding before they can see the rest of the app.
  if (requiresProfile && (user.needsOnboarding || !user.role)) {
    return <Navigate to="/onboarding" replace />;
  }

  return children;
}
