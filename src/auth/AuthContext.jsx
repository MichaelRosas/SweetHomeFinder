import { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, signOut as fbSignOut } from 'firebase/auth';
import { auth, db } from '../firebase/config';
import { doc, onSnapshot } from 'firebase/firestore';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let unsubProfile;

    const unsubAuth = onAuthStateChanged(auth, (fbUser) => {
      // Clean up any existing profile listener when auth user changes
      if (unsubProfile) {
        unsubProfile();
        unsubProfile = undefined;
      }

      if (!fbUser) {
        setUser(null);
        setChecking(false);
        return;
      }

      const baseUser = {
        uid: fbUser.uid,
        email: fbUser.email ?? null,
      };

      // Listen to the Firestore profile for this user
      unsubProfile = onSnapshot(
        doc(db, 'users', fbUser.uid),
        (snap) => {
          const data = snap.exists() ? snap.data() : null;

          if (!data) {
            // No profile document yet: send user to onboarding
            setUser({
              ...baseUser,
              role: null,
              needsOnboarding: true,
            });
            setChecking(false);
            return;
          }

          const role = data.role ?? null;
          setUser({
            ...baseUser,
            ...data,
            role,
            needsOnboarding: !role,
          });
          setChecking(false);
        },
        (error) => {
          // Profile listener failed; fall back to bare auth user and force onboarding
          console.error('Auth profile listener error', error);
          setUser({
            uid: fbUser.uid,
            email: fbUser.email ?? null,
            role: null,
            needsOnboarding: true,
          });
          setChecking(false);
        }
      );
    });

    return () => {
      unsubAuth();
      if (unsubProfile) {
        unsubProfile();
      }
    };
  }, []);

  const value = {
    user, // { uid, email, role, needsOnboarding, ...profile }
    checking, // loading flag for initial auth/profile fetch
    signOut: () => fbSignOut(auth),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
