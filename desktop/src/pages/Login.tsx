import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, Mail, LogIn } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import logo from '../assets/logo.jpg';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!identifier.trim()) { setError('Please enter your email address.'); return; }
    if (!password)           { setError('Please enter your password.'); return; }
    setLoading(true);
    const result = await login(identifier.trim(), password);
    setLoading(false);
    if (result.ok) {
      navigate('/dashboard', { replace: true });
    } else {
      setError(result.error ?? 'Unable to sign in.');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-950 via-primary-900 to-primary-800 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Brand */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-white flex items-center justify-center mx-auto mb-4 shadow-lg overflow-hidden">
            <img src={logo} alt="TimeLogic" className="w-14 h-14 object-contain" />
          </div>
          <h1 className="text-3xl font-black text-white">TimeLogic</h1>
          <p className="text-primary-300 text-sm mt-1">Admin Desktop Panel</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-3xl p-8 shadow-2xl">
          <h2 className="text-xl font-bold text-slate-900 mb-1">Welcome back</h2>
          <p className="text-sm text-slate-500 mb-6">
            Sign in with the admin email provided during registration.
          </p>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-100 rounded-xl text-sm text-red-700">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                Admin Email Address
              </label>
              <div className="relative">
                <Mail size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={identifier}
                  onChange={(e) => { setIdentifier(e.target.value); setError(''); }}
                  placeholder="admin@company.com"
                  autoComplete="username"
                  className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 bg-slate-50 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Password</label>
              <div className="relative">
                <Lock size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setError(''); }}
                  placeholder="Enter your password"
                  autoComplete="current-password"
                  className="w-full pl-10 pr-10 py-3 rounded-xl border border-slate-200 bg-slate-50 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 bg-primary-700 hover:bg-primary-800 text-white font-bold py-3 rounded-xl transition disabled:opacity-60 mt-2"
            >
              {loading
                ? <span className="animate-spin border-2 border-white border-t-transparent rounded-full w-4 h-4" />
                : <LogIn size={17} />
              }
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

          <div className="mt-5 p-3 bg-primary-50 rounded-xl text-xs text-primary-700 space-y-1">
            <p><strong>Your credentials</strong> were set by the Super Admin when your organization was registered.</p>
            <p className="text-primary-400">Use your <strong>work email</strong> or <strong>admin code</strong> (e.g. ADM001) + your password.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
