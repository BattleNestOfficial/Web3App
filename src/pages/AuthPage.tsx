import { FirebaseError } from 'firebase/app';
import { motion } from 'framer-motion';
import { Chrome } from 'lucide-react';
import { FormEvent, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../app/providers/AuthProvider';
import { AmbientBackground } from '../components/layout/AmbientBackground';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';

type Mode = 'signin' | 'signup';

function getErrorMessage(error: unknown) {
  if (!(error instanceof FirebaseError)) {
    return 'Authentication failed. Please try again.';
  }
  if (error.code.includes('wrong-password') || error.code.includes('invalid-credential')) {
    return 'Invalid email or password.';
  }
  if (error.code.includes('email-already-in-use')) {
    return 'Email is already in use.';
  }
  if (error.code.includes('popup-closed-by-user')) {
    return 'Google popup closed before completion.';
  }
  return error.message;
}

export function AuthPage() {
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [errorText, setErrorText] = useState('');
  const { user, signInEmail, signUpEmail, signInGoogle } = useAuth();
  const navigate = useNavigate();

  if (user) {
    return <Navigate to="/dashboard" replace />;
  }

  async function submitEmailAuth(event: FormEvent) {
    event.preventDefault();
    setErrorText('');
    setBusy(true);
    try {
      if (mode === 'signin') {
        await signInEmail(email, password);
      } else {
        await signUpEmail(email, password);
      }
      navigate('/dashboard', { replace: true });
    } catch (error) {
      setErrorText(getErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function submitGoogleAuth() {
    setErrorText('');
    setBusy(true);
    try {
      await signInGoogle();
      navigate('/dashboard', { replace: true });
    } catch (error) {
      setErrorText(getErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-base p-6 text-slate-100">
      <AmbientBackground dense />

      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: 'spring', stiffness: 180, damping: 22, mass: 0.8 }}
        className="relative w-full max-w-md rounded-3xl border border-slate-700/60 bg-panel/90 p-7 shadow-2xl backdrop-blur-xl"
      >
        <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Secure Access</p>
        <h1 className="mt-2 font-display text-2xl text-white">Neon Console</h1>
        <p className="mt-1 text-sm text-slate-400">Sign in with email/password or Google.</p>

        <div className="mt-6 grid grid-cols-2 gap-2 rounded-xl border border-slate-700 bg-panelAlt p-1">
          <button
            type="button"
            className={`rounded-lg px-3 py-2 text-sm transition ${
              mode === 'signin' ? 'bg-slate-100 text-slate-900' : 'text-slate-300 hover:text-white'
            }`}
            onClick={() => setMode('signin')}
          >
            Sign In
          </button>
          <button
            type="button"
            className={`rounded-lg px-3 py-2 text-sm transition ${
              mode === 'signup' ? 'bg-slate-100 text-slate-900' : 'text-slate-300 hover:text-white'
            }`}
            onClick={() => setMode('signup')}
          >
            Register
          </button>
        </div>

        <form className="mt-5 space-y-3" onSubmit={submitEmailAuth}>
          <Input
            type="email"
            placeholder="Email address"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
          <Input
            type="password"
            placeholder="Password"
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            minLength={6}
            required
          />
          {errorText ? <p className="text-sm text-danger">{errorText}</p> : null}
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? 'Please wait...' : mode === 'signin' ? 'Sign In' : 'Create Account'}
          </Button>
        </form>

        <div className="my-4 flex items-center gap-2">
          <div className="h-px flex-1 bg-slate-700" />
          <span className="text-xs uppercase tracking-[0.2em] text-slate-500">or</span>
          <div className="h-px flex-1 bg-slate-700" />
        </div>

        <Button variant="secondary" className="w-full justify-center" onClick={submitGoogleAuth} disabled={busy}>
          <Chrome className="mr-2 h-4 w-4" />
          Continue with Google
        </Button>
      </motion.div>
    </div>
  );
}
