import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Lock, ArrowRight, ArrowLeft, AlertCircle } from 'lucide-react';
import { isValidPhoneNumber } from 'libphonenumber-js';
import { api } from '../lib/api';
import { PhoneInput } from '../components/PhoneInput';
import { useCountry } from '../contexts/CountryContext';
import ProductivitySpinner from '../components/ui/ProductivitySpinner';

interface LoginPageProps {
  onLogin: () => void;
  onNavigateToSignup: () => void;
  onBack: () => void;
}

const ProductivityLogoLarge = () => (
  <svg viewBox="0 0 100 100" className="w-24 h-24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="outerGradLg" x1="0" y1="0" x2="100" y2="100" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#06b6d4" />
        <stop offset="100%" stopColor="#0891b2" />
      </linearGradient>
      <linearGradient id="innerGradLg" x1="30" y1="30" x2="70" y2="70" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#a5f3fc" />
        <stop offset="100%" stopColor="#22d3ee" />
      </linearGradient>
      <filter id="glowLg" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation="3" result="blur" />
        <feComposite in="SourceGraphic" in2="blur" operator="over" />
      </filter>
    </defs>

    <circle cx="50" cy="50" r="48" fill="url(#outerGradLg)" />
    <circle cx="50" cy="50" r="24" fill="url(#innerGradLg)" filter="url(#glowLg)" />
    <circle cx="50" cy="50" r="48" stroke="white" strokeOpacity="0.1" strokeWidth="1" />
  </svg>
);

const GoogleLogo = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24">
    <path
      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      fill="#4285F4"
    />
    <path
      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      fill="#34A853"
    />
    <path
      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.84z"
      fill="#FBBC05"
    />
    <path
      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      fill="#EA4335"
    />
  </svg>
);

const MicrosoftLogo = () => (
  <svg className="w-5 h-5" viewBox="0 0 23 23">
    <path fill="#f35325" d="M1 1h10v10H1z" />
    <path fill="#81bc06" d="M12 1h10v10H12z" />
    <path fill="#05a6f0" d="M1 12h10v10H1z" />
    <path fill="#ffba08" d="M12 12h10v10H12z" />
  </svg>
);

const LoginPage: React.FC<LoginPageProps> = ({ onLogin, onNavigateToSignup, onBack }) => {
  const { detectedCountryCode } = useCountry();
  const [countryCode, setCountryCode] = useState(detectedCountryCode);

  // Sync with detected country when it loads
  useEffect(() => {
    setCountryCode(detectedCountryCode);
  }, [detectedCountryCode]);

  const [searchParams] = useSearchParams();

  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [isMicrosoftLoading, setIsMicrosoftLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const err = searchParams.get('error');
    if (err) {
      if (err === 'google_auth_cancelled') setError('Google authentication was cancelled.');
      else if (err === 'microsoft_auth_cancelled') setError('Microsoft authentication was cancelled.');
      else if (err === 'auth_failed') setError('Authentication failed. Please try again.');
      else setError(err.replace(/_/g, ' '));
    }
  }, [searchParams]);

  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const fullPhone = `${countryCode}${phone.replace(/[^\d]/g, '')}`;
    if (!isValidPhoneNumber(fullPhone)) {
      setError('Invalid phone number');
      return;
    }

    setIsLoading(true);

    try {
      // Send phone in E.164 format
      await api.post('/auth/login', { username: fullPhone, password });
      onLogin();
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Login failed';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleLogin = () => {
    setIsGoogleLoading(true);
    window.location.href = `${import.meta.env.VITE_API_URL}/auth/google?service=AUTH`;
  };

  const handleMicrosoftLogin = () => {
    setIsMicrosoftLoading(true);
    window.location.href = `${import.meta.env.VITE_API_URL}/auth/microsoft?service=AUTH`;
  };

  return (
    <div className="min-h-screen w-full bg-slate-50 dark:bg-dark-bg flex items-center justify-center p-4 relative overflow-hidden transition-colors duration-300">
      {/* Background Effects */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
        <div className="absolute -top-[20%] -right-[10%] w-[600px] h-[600px] rounded-full bg-productivity-500/10 blur-3xl" />
        <div className="absolute -bottom-[20%] -left-[10%] w-[600px] h-[600px] rounded-full bg-violet-500/10 blur-3xl" />
      </div>

      <div className="w-full max-w-md bg-white dark:bg-dark-surface border border-slate-200 dark:border-dark-border rounded-3xl shadow-2xl p-8 relative z-10 animate-in fade-in zoom-in duration-300">

        <button
          onClick={onBack}
          className="absolute top-6 left-6 p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
          title="Back to Home"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>

        <div className="flex flex-col items-center mb-8 mt-4">
          <div className="mb-6 drop-shadow-xl transform hover:scale-105 transition-transform duration-300">
            <ProductivityLogoLarge />
          </div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-2">Welcome Back</h1>
          <p className="text-slate-500 dark:text-slate-400 text-center">
            Sign in to access Productivity.
          </p>
        </div>

        {error && (
          <div className="mb-6 p-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 flex items-center gap-3 text-red-600 dark:text-red-400 animate-in slide-in-from-top-2">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <p className="text-sm font-medium">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">

          {/* WhatsApp Form */}
          <div className="space-y-5 animate-in fade-in slide-in-from-left-4 duration-300">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300 ml-1">WhatsApp Number</label>
              <PhoneInput
                countryCode={countryCode}
                phone={phone}
                onCountryChange={setCountryCode}
                onPhoneChange={setPhone}
                placeholder="Phone number"
                required
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300 ml-1">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl py-3 pl-10 pr-4 text-slate-900 dark:text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-productivity-500/50 focus:border-productivity-500 transition-all"
                />
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between text-sm">
            <label className="flex items-center gap-2 cursor-pointer text-slate-600 dark:text-slate-400">
              <input type="checkbox" className="w-4 h-4 rounded border-slate-300 text-productivity-600 focus:ring-productivity-500" />
              Remember me
            </label>
            <button type="button" className="text-productivity-600 dark:text-productivity-400 hover:text-productivity-700 font-medium">
              Forgot password?
            </button>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className={`w-full font-semibold py-3.5 rounded-xl shadow-lg transition-all hover:scale-[1.02] disabled:opacity-70 disabled:hover:scale-100 flex items-center justify-center gap-2 bg-productivity-600 hover:bg-productivity-500 text-white shadow-productivity-500/25`}
          >
            {isLoading ? (
              <>
                <ProductivitySpinner size="sm" />
                Signing In...
              </>
            ) : (
              <>
                Sign In
                <ArrowRight className="w-5 h-5" />
              </>
            )}
          </button>
        </form>

        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-slate-200 dark:border-slate-700"></div>
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-2 bg-white dark:bg-dark-surface text-slate-500 dark:text-slate-400">Or continue with</span>
          </div>
        </div>

        <button
          onClick={handleGoogleLogin}
          disabled={isLoading || isGoogleLoading}
          className="w-full py-3.5 rounded-xl border border-slate-200 dark:border-dark-border hover:bg-slate-50 dark:hover:bg-slate-800 transition-all flex items-center justify-center gap-3 text-slate-700 dark:text-white font-medium mb-3"
        >
          {isGoogleLoading ? <ProductivitySpinner size="sm" /> : <GoogleLogo />}
          {isGoogleLoading ? 'Connecting...' : 'Google'}
        </button>

        <button
          onClick={handleMicrosoftLogin}
          disabled={isLoading || isGoogleLoading || isMicrosoftLoading}
          className="w-full py-3.5 rounded-xl border border-slate-200 dark:border-dark-border hover:bg-slate-50 dark:hover:bg-slate-800 transition-all flex items-center justify-center gap-3 text-slate-700 dark:text-white font-medium"
        >
          {isMicrosoftLoading ? <ProductivitySpinner size="sm" /> : <MicrosoftLogo />}
          {isMicrosoftLoading ? 'Connecting...' : 'Microsoft'}
        </button>

        <div className="mt-8 pt-6 border-t border-slate-100 dark:border-slate-800 text-center">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Don't have an account?{' '}
            <button
              onClick={onNavigateToSignup}
              className="text-productivity-600 dark:text-productivity-400 font-semibold hover:text-productivity-700"
            >
              Create Account
            </button>
          </p>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
