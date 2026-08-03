import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useSession, signOut as betterSignOut } from '@/lib/auth-client';

type User = {
  id: string;
  email: string;
  name: string;
  image?: string | null;
};

type Session = {
  id: string;
  userId: string;
  expiresAt: Date;
  token: string;
};

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue>({
  session: null,
  user: null,
  loading: true,
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  let sessionData: any = null;
  let isPending = false;

  try {
    const res = useSession();
    sessionData = res.data;
    isPending = res.isPending;
  } catch (err) {
    console.warn('Session hook failed, falling back to logged-out state:', err);
    isPending = false;
  }

  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setTimedOut(true);
    }, 1500);
    return () => clearTimeout(timer);
  }, []);

  const signOut = async () => {
    try {
      await betterSignOut();
    } catch (e) {
      console.error('SignOut error:', e);
    }
  };

  const user: User | null = sessionData?.user ? {
    id: String(sessionData.user.id || ''),
    email: String(sessionData.user.email || ''),
    name: String(sessionData.user.name || 'User'),
    image: sessionData.user.image || null,
  } : null;

  const session: Session | null = sessionData?.session ? {
    id: String(sessionData.session.id || ''),
    userId: String(sessionData.session.userId || ''),
    expiresAt: sessionData.session.expiresAt ? new Date(sessionData.session.expiresAt) : new Date(),
    token: String(sessionData.session.token || ''),
  } : null;

  const loading = isPending && !timedOut;

  return (
    <AuthContext.Provider value={{ session, user, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
