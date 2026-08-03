import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import { signOut as betterSignOut } from '@/lib/auth-client';

const WORKER_AUTH_URL = import.meta.env.VITE_BETTER_AUTH_URL || 'https://ai-study-companion-backend.rifa-numis.workers.dev';

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
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  const checkSession = useCallback(async () => {
    try {
      const token = localStorage.getItem('better-auth_token');
      const headers: Record<string, string> = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const res = await fetch(`${WORKER_AUTH_URL}/api/auth/get-session`, {
        headers,
        credentials: 'include',
      });

      if (res.ok) {
        const data = await res.json();
        if (data?.session && data?.user) {
          setSession({
            id: String(data.session.id || ''),
            userId: String(data.session.userId || data.session.user_id || ''),
            expiresAt: data.session.expiresAt ? new Date(data.session.expiresAt) : new Date(),
            token: String(data.session.token || token || ''),
          });
          setUser({
            id: String(data.user.id || ''),
            email: String(data.user.email || ''),
            name: String(data.user.name || 'User'),
            image: data.user.image || null,
          });
          setLoading(false);
          return;
        }
      }
    } catch (err) {
      console.warn('Session check error:', err);
    }
    setSession(null);
    setUser(null);
    setLoading(false);
  }, []);

  useEffect(() => {
    checkSession();
  }, [checkSession]);

  const signOut = async () => {
    localStorage.removeItem('better-auth_token');
    try {
      await betterSignOut();
    } catch (e) {
      console.error('SignOut error:', e);
    }
    setSession(null);
    setUser(null);
    window.location.reload();
  };

  return (
    <AuthContext.Provider value={{ session, user, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
