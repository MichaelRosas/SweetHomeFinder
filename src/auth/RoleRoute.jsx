import { Navigate } from 'react-router-dom';
import { useAuth } from './AuthContext';

export default function RoleRoute(props) {
  const { user, checking } = useAuth();
  const allow = props.allow ?? props.roles ?? [];
  const { children } = props;

  // In practice this is usually wrapped in <ProtectedRoute>, but handling the
  // loading state here makes this component safe to use on its own as well.
  if (checking) {
    return null;
  }

  if (!user) {
    return <Navigate to="/signin" replace />;
  }

  if (user.needsOnboarding) {
    return <Navigate to="/onboarding" replace />;
  }

  const role = user.role;
  if (!role || !allow.includes(role)) {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
}
