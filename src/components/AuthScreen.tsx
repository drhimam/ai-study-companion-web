import { useState } from 'react';
import { Sparkles, Mail, Lock, ArrowRight, Loader2, User as UserIcon } from 'lucide-react';
import { signIn, signUp } from '@/lib/auth-client';

export function AuthScreen() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email.trim() || !password) {
      setError('Enter your email and password.');
      return;
    }
    if (mode === 'signup' && !name.trim()) {
      setError('Enter your full name.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    setLoading(true);
    try {
      if (mode === 'signup') {
        const { error: err } = await signUp.email({
          email: email.trim(),
          password,
          name: name.trim(),
        });
        if (err) throw err;
      } else {
        const { error: err } = await signIn.email({
          email: email.trim(),
          password,
        });
        if (err) throw err;
      }
    } catch (err: any) {
      console.error('Auth failure:', err);
      setError(
        err?.message ||
          (mode === 'signup'
            ? 'We could not complete sign up with those details. If you already have an account, try signing in instead.'
            : 'That email and password combination is not correct.')
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-app px-4 relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-40 -left-40 w-[480px] h-[480px] rounded-full bg-indigo-600/20 blur-[120px]" />
        <div className="absolute -bottom-40 -right-40 w-[480px] h-[480px] rounded-full bg-sky-500/20 blur-[120px]" />
        <div className="absolute top-1/3 left-1/2 w-[320px] h-[320px] rounded-full bg-emerald-500/10 blur-[100px]" />
      </div>

      <div className="relative w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-sky-500 shadow-lg shadow-indigo-500/30 mb-4">
            <Sparkles className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-primary tracking-tight">AI Web Companion</h1>
          <p className="text-sm text-muted mt-1">Your AI study tutor, notebooks, and flashcards.</p>
        </div>

        <div className="bg-white/[0.03] backdrop-blur-xl border border-default rounded-2xl p-6 shadow-2xl">
          <div className="flex gap-1 p-1 bg-white/5 rounded-lg mb-6">
            <button
              onClick={() => setMode('signin')}
              className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${
                mode === 'signin' ? 'bg-white/10 text-primary' : 'text-muted hover:text-white'
              }`}
            >
              Sign In
            </button>
            <button
              onClick={() => setMode('signup')}
              className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${
                mode === 'signup' ? 'bg-white/10 text-primary' : 'text-muted hover:text-white'
              }`}
            >
              Create Account
            </button>
          </div>

          <form onSubmit={submit} className="space-y-4">
            {mode === 'signup' && (
              <div>
                <label className="block text-xs font-medium text-muted mb-1.5">Name</label>
                <div className="relative">
                  <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Alex Smith"
                    className="w-full pl-10 pr-3 py-2.5 bg-white/5 border border-default rounded-lg text-primary placeholder:text-muted text-sm focus:outline-none focus:border-indigo-400/50 focus:ring-1 focus:ring-indigo-400/30 transition"
                  />
                </div>
              </div>
            )}
            <div>
              <label className="block text-xs font-medium text-muted mb-1.5">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full pl-10 pr-3 py-2.5 bg-white/5 border border-default rounded-lg text-primary placeholder:text-muted text-sm focus:outline-none focus:border-indigo-400/50 focus:ring-1 focus:ring-indigo-400/30 transition"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted mb-1.5">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-10 pr-3 py-2.5 bg-white/5 border border-default rounded-lg text-primary placeholder:text-muted text-sm focus:outline-none focus:border-indigo-400/50 focus:ring-1 focus:ring-indigo-400/30 transition"
                />
              </div>
            </div>

            {error && (
              <div className="text-sm text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-2.5 bg-gradient-to-r from-indigo-500 to-sky-500 hover:from-indigo-400 hover:to-sky-400 disabled:opacity-50 text-white font-medium rounded-lg transition-all shadow-lg shadow-indigo-500/20"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  {mode === 'signin' ? 'Sign In' : 'Create Account'}
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          <p className="text-xs text-muted text-center mt-5">
            {mode === 'signin' ? "Don't have an account? " : 'Already have an account? '}
            <button
              onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}
              className="text-indigo-400 hover:text-indigo-300 font-medium"
            >
              {mode === 'signin' ? 'Sign up' : 'Sign in'}
            </button>
          </p>
        </div>

        <p className="text-xs text-dim text-center mt-6">
          Powered by Better Auth & Neon PostgreSQL.
        </p>
      </div>
    </div>
  );
}
