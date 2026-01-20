import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import '../styles/Navbar.css';

export default function NavBar({
  variant = 'app', // "public" | "auth" | "app"
  backTo = '/',
  centerContent = null,
  rightContent = null,
}) {
  const { user, checking, signOut } = useAuth();
  const nav = useNavigate();

  const handleSignOut = async () => {
    try {
      await signOut();
      nav('/signin');
    } catch {
      // optional: toast
    }
  };

  const AppLinks = () => {
    const role = user?.role;
    const adopterHasPrefs =
      role === 'adopter' &&
      !!user?.preferences &&
      Object.values(user.preferences ?? {}).some((v) => (v ?? '').toString().trim().length > 0);
    const prefsLabel = adopterHasPrefs ? 'Pet Preferences' : 'Quiz';

    return (
      <>
        <Link to="/dashboard" className="nav-btn link">
          Dashboard
        </Link>
        <Link to="/pets" className="nav-btn link">
          Browse
        </Link>
        <Link to="/chat" className="nav-btn link">
          Chat
        </Link>
        <Link to="/profile" className="nav-btn link">
          {role === 'admin' ? 'Users' : 'Profile'}
        </Link>

        {role === 'adopter' && (
          <>
            <Link to="/applications" className="nav-btn link">
              Applications
            </Link>
            <Link to="/quiz" className="nav-btn link">
              {prefsLabel}
            </Link>
          </>
        )}

        {(role === 'shelter' || role === 'admin') && (
          <Link to="/shelter/applications" className="nav-btn link">
            Applications
          </Link>
        )}

        <button className="nav-btn solid" onClick={handleSignOut}>
          Sign Out
        </button>
      </>
    );
  };

  return (
    <header className="navbar">
      <div className="nav-inner">
        <div className="nav-left">
          {variant === 'auth' ? (
            <Link to={backTo} className="nav-link back-link">
              ← Back
            </Link>
          ) : (
            <Link
              to={user ? '/dashboard' : '/'}
              className="brand"
              aria-label="SweetHomeFinder Home"
            >
              <span className="brand-icon" aria-hidden>
                🏠
              </span>
              <span className="brand-text">SweetHomeFinder</span>
            </Link>
          )}
        </div>

        <div className="nav-center">{centerContent}</div>

        <div className="nav-right">
          {rightContent ?? (
            <>
              {variant === 'public' && (
                <>
                  <Link to="/signin" className="nav-btn link">
                    Sign In
                  </Link>
                  <Link to="/signup" className="nav-btn solid">
                    Sign Up
                  </Link>
                </>
              )}
              {variant === 'auth' && (
                <Link to="/" className="nav-btn link">
                  Home
                </Link>
              )}
              {variant === 'app' && !checking && user && <AppLinks />}
              {variant === 'app' && !checking && !user && (
                <>
                  <Link to="/signin" className="nav-btn link">
                    Sign In
                  </Link>
                  <Link to="/signup" className="nav-btn solid">
                    Sign Up
                  </Link>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </header>
  );
}
