import React, { useState } from 'react';
import {
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  AuthError,
} from 'firebase/auth';
import { auth } from '../firebase';
import { Loader2, Lock, Mail, AlertTriangle } from 'lucide-react';

// Maps Firebase auth error codes to operator-friendly copy.
function describeAuthError(code: string): string {
  switch (code) {
    case 'auth/invalid-email':
      return 'That email address is not valid.';
    case 'auth/user-disabled':
      return 'This account has been disabled. Contact an administrator.';
    case 'auth/user-not-found':
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
      return 'Incorrect email or password.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Please wait and try again.';
    case 'auth/operation-not-allowed':
      return 'Email/password sign-in is not enabled for this project.';
    default:
      return 'Authentication failed. Please try again.';
  }
}

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setNotice('');
    if (!email || !password) {
      setError('Email and password are required.');
      return;
    }
    setSubmitting(true);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
      // On success the top-level auth listener swaps to the app shell.
    } catch (err) {
      if (err instanceof Error && !(err as AuthError).code) {
        setError(err.message);
      } else {
        setError(describeAuthError((err as AuthError).code));
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleReset = async () => {
    setError('');
    setNotice('');
    if (!email) {
      setError('Enter your email above first, then reset.');
      return;
    }
    try {
      await sendPasswordResetEmail(auth, email.trim());
      setNotice('Password reset email sent. Check your inbox.');
    } catch (err) {
      setError(describeAuthError((err as AuthError).code));
    }
  };

  return (
    <div className="h-screen w-screen bg-[#F9FAFB] flex items-center justify-center p-4 text-[#111827] font-sans antialiased">
      <div className="w-full max-w-sm bg-white border border-gray-200 rounded-lg shadow-sm p-8">
        {/* Branding */}
        <div className="flex items-center gap-3 mb-8">
          <div className="w-8 h-8 bg-black rounded flex items-center justify-center flex-shrink-0">
            <div className="w-4 h-4 border-2 border-white"></div>
          </div>
          <div>
            <h1 className="font-bold text-sm tracking-tight uppercase text-[#111827] leading-none font-mono">Agency OS</h1>
            <span className="text-[10px] uppercase tracking-widest text-gray-400 font-bold block mt-0.5">SLA MONITOR</span>
          </div>
        </div>

        <h2 className="text-lg font-bold mb-1">Sign in</h2>
        <p className="text-xs text-gray-500 mb-6 font-mono uppercase tracking-wide">
          Use the credentials your administrator gave you
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block">
            <span className="text-[10px] uppercase tracking-widest text-gray-400 font-bold">Email</span>
            <div className="mt-1 flex items-center border border-gray-200 rounded px-3 focus-within:border-black transition-colors">
              <Mail className="w-4 h-4 text-gray-400" />
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full py-2.5 px-2 text-sm outline-none bg-transparent"
                placeholder="you@agency.com"
              />
            </div>
          </label>

          <label className="block">
            <span className="text-[10px] uppercase tracking-widest text-gray-400 font-bold">Password</span>
            <div className="mt-1 flex items-center border border-gray-200 rounded px-3 focus-within:border-black transition-colors">
              <Lock className="w-4 h-4 text-gray-400" />
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full py-2.5 px-2 text-sm outline-none bg-transparent"
                placeholder="••••••••"
              />
            </div>
          </label>

          {error && (
            <div className="flex items-start gap-2 text-xs text-rose-600 bg-rose-50 border border-rose-100 rounded px-3 py-2">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
          {notice && (
            <div className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-100 rounded px-3 py-2">
              {notice}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-black hover:bg-gray-900 text-white font-bold py-2.5 px-4 rounded text-sm active:scale-95 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
            Sign in
          </button>
        </form>

        <div className="mt-6 flex items-center justify-end text-xs">
          <button
            onClick={handleReset}
            className="text-gray-500 hover:text-black font-semibold cursor-pointer"
          >
            Forgot password?
          </button>
        </div>
      </div>
    </div>
  );
}
