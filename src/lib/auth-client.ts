import { createAuthClient } from 'better-auth/react';

const WORKER_AUTH_URL = import.meta.env.VITE_BETTER_AUTH_URL || 'https://ai-study-companion-backend.rifa-numis.workers.dev';

export const authClient = createAuthClient({
  baseURL: WORKER_AUTH_URL,
});

export const { useSession, signIn, signUp, signOut } = authClient;
