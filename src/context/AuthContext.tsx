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
  const { data: sessionData, isPending } = useSession();
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setTimedOut(true);
    }, 1500);
    return () => clearTimeout(timer);
  }, []);

  const signOut = async () => {
    await betterSignOut();
  };

  const user = sessionData?.user ? {
    id: sessionData.user.id,
    email: sessionData.user.email,
    name: sessionData.user.name,
    image: sessionData.user.image,
  } : null;

  const session = sessionData?.session ? {
    id: sessionData.session.id,
    userId: sessionData.session.userId,
    expiresAt: new Date(sessionData.session.expiresAt),
    token: sessionData.session.token,
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
