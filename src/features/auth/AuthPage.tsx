import { FirebaseError } from 'firebase/app';
import { motion } from 'framer-motion';
import { Chrome } from 'lucide-react';
import { FormEvent, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../app/providers/AuthProvider';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';

type AuthMode = 'signin' | 'signup';

function mapFirebaseError(error: unknown) {
  if (!(error instanceof FirebaseError)) return 'Unable to authenticate right now.';
  if (error.code.includes('wrong-password') || error.code.includes('invalid-credential')) {
    return 'Invalid email or password.';
  }
  if (error.code.includes('email-already-in-use')) {
    return 'Email is already registered.';
  }
  if (error.code.includes('popup-closed-by-user')) {
    return 'Google sign-in popup was closed.';
  }
  return error.message;
}

export function AuthPage() {
  const [mode, setMode] = useState<AuthMode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorText, setErrorText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { user, signInEmail, signInGoogle, signUpEmail } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  if (user) {
    return <Navigate to="/" replace />;
  }

  async function handleEmailAuth(event: FormEvent) {
    event.preventDefault();
    setErrorText('');
    setIsSubmitting(true);
    try {
      if (mode === 'signin') {
        await signInEmail(email, password);
      } else {
        await signUpEmail(email, password);
      }
      const nextPath = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname || '/';
      navigate(nextPath, { replace: true });
    } catch (error) {
      setErrorText(mapFirebaseError(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleGoogleAuth() {
    setErrorText('');
    setIsSubmitting(true);
    try {
      await signInGoogle();
      navigate('/', { replace: true });
    } catch (error) {
      setErrorText(mapFirebaseError(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-base p-6 text-slate-100">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_20%,rgba(45,247,204,0.2),transparent_32%),radial-gradient(circle_at_80%_0%,rgba(0,163,255,0.2),transparent_24%)]" />
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className="relative w-full max-w-md rounded-3xl border border-slate-700/60 bg-panel/90 p-7 shadow-2xl backdrop-blur-xl"
      >
        <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Secure Access</p>
        <h1 className="mt-2 font-display text-2xl text-white">Neon Console</h1>
        <p className="mt-1 text-sm text-slate-400">Authenticate with Firebase and enter your control panel.</p>

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

        <form className="mt-5 space-y-3" onSubmit={handleEmailAuth}>
          <Input
            type="email"
            placeholder="Email address"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <Input
            type="password"
            placeholder="Password"
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={6}
            required
          />

          {errorText && <p className="text-sm text-danger">{errorText}</p>}

          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? 'Please wait...' : mode === 'signin' ? 'Sign In' : 'Create Account'}
          </Button>
        </form>

        <div className="my-4 flex items-center gap-2">
          <div className="h-px flex-1 bg-slate-700" />
          <span className="text-xs uppercase tracking-[0.2em] text-slate-500">or</span>
          <div className="h-px flex-1 bg-slate-700" />
        </div>

        <Button variant="secondary" className="w-full justify-center" onClick={handleGoogleAuth} disabled={isSubmitting}>
          <Chrome className="mr-2 h-4 w-4" />
          Continue with Google
        </Button>
      </motion.div>
    </div>
  );
}

