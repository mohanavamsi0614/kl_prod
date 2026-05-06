import React, { useState, useEffect } from 'react';
import { Lock, User, ArrowRight, CheckCircle2, Eye, EyeOff, Check, Star, ShieldCheck, ArrowLeft, AlertCircle } from 'lucide-react';
import { api } from '../lib/api';
import { useSearchParams } from 'react-router-dom';
import { isValidPhoneNumber } from 'libphonenumber-js';
import { PhoneInput } from '../components/PhoneInput';
import { useCountry } from '../contexts/CountryContext';
import ProductivitySpinner from '../components/ui/ProductivitySpinner';

interface CreateAccountPageProps {
    onLogin: () => void;
    onNavigateToLogin: () => void;
    onBack: () => void;
}

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

const CreateAccountPage: React.FC<CreateAccountPageProps> = ({ onLogin, onNavigateToLogin, onBack }) => {
    const [searchParams] = useSearchParams();
    const token = searchParams.get('token');

    const [step, setStep] = useState<'initial' | 'google_phone_input'>('initial');
    const [isLoading, setIsLoading] = useState(false);
    const [isGoogleLoading, setIsGoogleLoading] = useState(false);
    const [isMicrosoftLoading, setIsMicrosoftLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [showMergeOtp, setShowMergeOtp] = useState(false);
    const [showGoogleOtp, setShowGoogleOtp] = useState(false);
    const [otp, setOtp] = useState('');
    const [error, setError] = useState<string | null>(null);

    // Use country context for auto-detection
    const { detectedCountryCode } = useCountry();

    // Form Data
    const [name, setName] = useState('');
    const [whatsapp, setWhatsapp] = useState('');
    const [countryCode, setCountryCode] = useState(detectedCountryCode);
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');

    // Sync with detected country when it loads
    useEffect(() => {
        setCountryCode(detectedCountryCode);
    }, [detectedCountryCode]);

    useEffect(() => {
        if (token) {
            setStep('google_phone_input');
        }
    }, [token]);


    const handleManualSignup = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        // Validate phone number
        const fullPhone = `${countryCode}${whatsapp.replace(/[^\d]/g, '')}`;
        if (!isValidPhoneNumber(fullPhone)) {
            setError('Invalid phone number');
            return;
        }

        if (password !== confirmPassword) {
            setError("Passwords do not match!");
            return;
        }

        if (password.length < 8) {
            setError("Password must be at least 8 characters long");
            return;
        }

        setIsLoading(true);

        try {
            const nameParts = name.trim().split(/\s+/);
            const firstName = nameParts[0];
            const lastName = nameParts.slice(1).join(' ') || '';

            await api.post('/auth/register', {
                firstName,
                lastName,
                whatsappPhone: fullPhone, // E.164 format
                password
            });
            onLogin();
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : 'Registration failed';
            // Check for specific backend error message
            if (msg.includes('Phone number already registered')) {
                setShowMergeOtp(true);
                // toast.info("Phone number already registered. Enter OTP to merge accounts.");
                // In a real app, trigger OTP send here
            } else {
                setError(msg);
            }
        } finally {
            setIsLoading(false);
        }
    };

    const handleMergeAccount = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError(null);

        const fullPhone = `${countryCode}${whatsapp.replace(/[^\d]/g, '')}`;

        try {
            await api.post('/auth/merge', {
                whatsappPhone: fullPhone, // E.164 format
                otp,
                password // Update password if provided
            });
            onLogin();
        } catch (error: unknown) {
            setError(error instanceof Error ? error.message : 'Merge failed');
        } finally {
            setIsLoading(false);
        }
    };

    const handleSsoSignup = (provider: 'google' | 'microsoft') => {
        if (provider === 'google') {
            setIsGoogleLoading(true);
        } else {
            setIsMicrosoftLoading(true);
        }
        window.location.href = `${import.meta.env.VITE_API_URL}/auth/${provider}?service=AUTH`;
    };

    const handleGooglePhoneSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        const fullPhone = `${countryCode}${whatsapp.replace(/[^\d]/g, '')}`;
        if (!isValidPhoneNumber(fullPhone)) {
            setError('Invalid phone number');
            return;
        }

        setShowGoogleOtp(true);
        setOtp(''); // Reset OTP for the new input
    };

    const handleGoogleOtpSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!token) return;
        setError(null);
        setIsLoading(true);

        const fullPhone = `${countryCode}${whatsapp.replace(/[^\d]/g, '')}`;

        try {
            // In a real app, we might verify the OTP here first
            // For now, we proceed to link the account
            const provider = searchParams.get('provider') || 'GOOGLE';
            const endpoint = provider === 'MICROSOFT' ? '/auth/microsoft/link' : '/auth/google/link';

            await api.post(endpoint, {
                token,
                whatsappPhone: fullPhone // E.164 format
            });
            onLogin();
        } catch (error: unknown) {
            setError(error instanceof Error ? error.message : 'Failed to link account');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen w-full flex bg-white dark:bg-dark-bg transition-colors duration-300 relative">

            {showMergeOtp && (
                <div className="fixed top-0 left-0 right-0 z-[100] bg-blue-600 text-white px-6 py-4 shadow-xl animate-in slide-in-from-top-full duration-500 flex items-center justify-center gap-3">
                    <div className="bg-white/20 p-1.5 rounded-full">
                        <CheckCircle2 className="w-5 h-5" />
                    </div>
                    <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
                        <p className="font-semibold text-base">Account Exists!</p>
                        <p className="text-blue-100 text-sm">This phone number is already registered. Please enter the OTP to merge your accounts.</p>
                    </div>
                </div>
            )}

            {/* Left Panel - Value Proposition (Hidden on mobile) */}
            <div className="hidden lg:flex lg:w-1/2 bg-slate-900 relative overflow-hidden p-12 flex-col justify-between">
                {/* Background Gradients */}
                <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-productivity-500/20 rounded-full blur-3xl -translate-y-1/2 translate-x-1/4 pointer-events-none" />
                <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-violet-500/20 rounded-full blur-3xl translate-y-1/4 -translate-x-1/4 pointer-events-none" />

                {/* Logo Area */}
                <div className="relative z-10 flex items-center gap-3">
                    <div className="w-10 h-10">
                        <svg viewBox="0 0 100 100" className="w-full h-full" fill="none">
                            <circle cx="50" cy="50" r="50" fill="#0891b2" />
                            <circle cx="50" cy="50" r="25" fill="#22d3ee" />
                        </svg>
                    </div>
                    <span className="text-white font-bold text-2xl tracking-tight">Productivity</span>
                </div>

                {/* Main Content */}
                <div className="relative z-10 max-w-lg">
                    <h1 className="text-4xl font-bold text-white mb-6 leading-tight">
                        Unify your digital life in one conversation.
                    </h1>
                    <p className="text-lg text-slate-300 mb-10 leading-relaxed">
                        Join 10,000+ productive professionals who use Productivity to reclaim 10 hours every week. Connect your Calendar, Email, and WhatsApp instantly.
                    </p>

                    <div className="space-y-4 mb-12">
                        {[
                            "Unified Inbox & Smart Calendar",
                            "WhatsApp Voice Commands",
                            "Automated Meeting Prep",
                            "Bank-Level Security (SOC2)"
                        ].map((feature, i) => (
                            <div key={i} className="flex items-center gap-3">
                                <div className="w-6 h-6 rounded-full bg-green-500/20 flex items-center justify-center">
                                    <Check className="w-4 h-4 text-green-400" />
                                </div>
                                <span className="text-slate-200 font-medium">{feature}</span>
                            </div>
                        ))}
                    </div>

                    {/* Testimonial */}
                    <div className="bg-slate-800/50 backdrop-blur-md border border-slate-700 rounded-2xl p-6">
                        <div className="flex items-center gap-1 mb-3">
                            {[1, 2, 3, 4, 5].map(s => <Star key={s} className="w-4 h-4 text-yellow-400 fill-yellow-400" />)}
                        </div>
                        <p className="text-slate-300 italic mb-4">"I used to drown in emails and scheduling conflicts. Productivity handled it all in my first week. It feels like I hired a full-time assistant."</p>
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-violet-500 flex items-center justify-center text-white font-bold">SJ</div>
                            <div>
                                <div className="text-white font-bold text-sm">Sarah Jenkins</div>
                                <div className="text-slate-400 text-xs">Product Director @ TechCorp</div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="relative z-10 text-slate-500 text-sm">
                    © 2023 Productivity AI Inc.
                </div>
            </div>

            {/* Right Panel - Form */}
            <div className="w-full lg:w-1/2 flex items-center justify-center p-6 overflow-y-auto relative">

                {/* Back Button */}
                <button
                    onClick={onBack}
                    className="absolute top-6 left-6 lg:left-8 p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors z-20"
                    title="Back to Home"
                >
                    <ArrowLeft className="w-5 h-5" />
                </button>

                <div className="w-full max-w-md mt-10 lg:mt-0">
                    <div className="text-center mb-8 lg:text-left">
                        <h2 className="text-3xl font-bold text-slate-900 dark:text-white mb-2">Create your free account</h2>
                        <p className="text-slate-500 dark:text-slate-400">
                            Start your 14-day free trial. No credit card required.
                        </p>
                    </div>

                    {step === 'initial' ? (
                        <>
                            {error && (
                                <div className="mb-6 p-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 flex items-center gap-3 text-red-600 dark:text-red-400 animate-in slide-in-from-top-2">
                                    <AlertCircle className="w-5 h-5 flex-shrink-0" />
                                    <p className="text-sm font-medium">{error}</p>
                                </div>
                            )}
                            {showMergeOtp ? (
                                <form onSubmit={handleMergeAccount} className="space-y-4 animate-in fade-in slide-in-from-right-4">
                                    <div className="text-center mb-4">
                                        <span className="text-xs text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-3 py-1 rounded-full">
                                            Mock OTP: 123456
                                        </span>
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-sm font-medium text-slate-700 dark:text-slate-300 ml-1">OTP</label>
                                        <input
                                            type="text"
                                            required
                                            value={otp}
                                            onChange={(e) => setOtp(e.target.value)}
                                            placeholder="123456"
                                            className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl py-3 px-4 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-productivity-500/20 focus:border-productivity-500 transition-all"
                                        />
                                    </div>
                                    <button
                                        type="submit"
                                        disabled={isLoading}
                                        className="w-full font-bold py-4 rounded-xl shadow-lg bg-productivity-600 hover:bg-productivity-500 text-white shadow-productivity-500/25 transition-all hover:scale-[1.01] disabled:opacity-70 disabled:hover:scale-100 flex items-center justify-center gap-2"
                                    >
                                        {isLoading ? <ProductivitySpinner size="sm" /> : 'Verify & Merge'}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setShowMergeOtp(false)}
                                        className="w-full text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                                    >
                                        Cancel
                                    </button>
                                </form>
                            ) : (
                                <>
                                    <button
                                        onClick={() => handleSsoSignup('google')}
                                        disabled={isGoogleLoading || isMicrosoftLoading || isLoading}
                                        className="w-full py-3.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all flex items-center justify-center gap-3 text-slate-700 dark:text-white font-medium mb-3 group"
                                    >
                                        {isGoogleLoading ? <ProductivitySpinner size="sm" /> : <GoogleLogo />}
                                        <span className="group-hover:text-slate-900 dark:group-hover:text-white transition-colors">
                                            {isGoogleLoading ? 'Connecting...' : 'Google'}
                                        </span>
                                    </button>

                                    <button
                                        onClick={() => handleSsoSignup('microsoft')}
                                        disabled={isGoogleLoading || isMicrosoftLoading || isLoading}
                                        className="w-full py-3.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all flex items-center justify-center gap-3 text-slate-700 dark:text-white font-medium mb-6 group"
                                    >
                                        {isMicrosoftLoading ? <ProductivitySpinner size="sm" /> : <MicrosoftLogo />}
                                        <span className="group-hover:text-slate-900 dark:group-hover:text-white transition-colors">
                                            {isMicrosoftLoading ? 'Connecting...' : 'Microsoft'}
                                        </span>
                                    </button>

                                    <div className="relative mb-6">
                                        <div className="absolute inset-0 flex items-center">
                                            <div className="w-full border-t border-slate-200 dark:border-slate-700"></div>
                                        </div>
                                        <div className="relative flex justify-center text-sm">
                                            <span className="px-4 bg-white dark:bg-dark-bg text-slate-500 dark:text-slate-400">Or continue with email</span>
                                        </div>
                                    </div>

                                    <form onSubmit={handleManualSignup} className="space-y-4">
                                        <div className="space-y-1.5">
                                            <label className="text-sm font-medium text-slate-700 dark:text-slate-300 ml-1">Full Name</label>
                                            <div className="relative group">
                                                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 group-focus-within:text-productivity-500 transition-colors" />
                                                <input
                                                    type="text"
                                                    required
                                                    value={name}
                                                    onChange={(e) => setName(e.target.value)}
                                                    placeholder="e.g. Jane Doe"
                                                    className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl py-3 pl-10 pr-4 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-productivity-500/20 focus:border-productivity-500 transition-all"
                                                />
                                            </div>
                                        </div>

                                        <div className="space-y-1.5">
                                            <label className="text-sm font-medium text-slate-700 dark:text-slate-300 ml-1">WhatsApp Number</label>
                                            <PhoneInput
                                                countryCode={countryCode}
                                                phone={whatsapp}
                                                onCountryChange={setCountryCode}
                                                onPhoneChange={setWhatsapp}
                                                placeholder="Phone number"
                                                required
                                            />
                                        </div>

                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="space-y-1.5">
                                                <label className="text-sm font-medium text-slate-700 dark:text-slate-300 ml-1">Password</label>
                                                <div className="relative group">
                                                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 group-focus-within:text-productivity-500 transition-colors" />
                                                    <input
                                                        type={showPassword ? "text" : "password"}
                                                        required
                                                        value={password}
                                                        onChange={(e) => setPassword(e.target.value)}
                                                        placeholder="••••••"
                                                        className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl py-3 pl-10 pr-4 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-productivity-500/20 focus:border-productivity-500 transition-all"
                                                    />
                                                </div>
                                            </div>
                                            <div className="space-y-1.5">
                                                <label className="text-sm font-medium text-slate-700 dark:text-slate-300 ml-1">Confirm</label>
                                                <div className="relative group">
                                                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 group-focus-within:text-productivity-500 transition-colors" />
                                                    <input
                                                        type={showPassword ? "text" : "password"}
                                                        required
                                                        value={confirmPassword}
                                                        onChange={(e) => setConfirmPassword(e.target.value)}
                                                        placeholder="••••••"
                                                        className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl py-3 pl-10 pr-4 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-productivity-500/20 focus:border-productivity-500 transition-all"
                                                    />
                                                </div>
                                            </div>
                                        </div>

                                        <button type="button" onClick={() => setShowPassword(!showPassword)} className="text-xs text-slate-500 hover:text-productivity-600 dark:hover:text-productivity-400 flex items-center gap-1 ml-auto">
                                            {showPassword ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                                            {showPassword ? 'Hide' : 'Show'} Passwords
                                        </button>

                                        <button
                                            type="submit"
                                            disabled={isLoading}
                                            className="w-full font-bold py-4 rounded-xl shadow-lg bg-productivity-600 hover:bg-productivity-500 text-white shadow-productivity-500/25 transition-all hover:scale-[1.01] disabled:opacity-70 disabled:hover:scale-100 flex items-center justify-center gap-2 mt-4"
                                        >
                                            {isLoading ? <ProductivitySpinner size="sm" /> : <>Create Free Account <ArrowRight className="w-5 h-5" /></>}
                                        </button>

                                        <div className="text-center pt-2">
                                            <div className="flex items-center justify-center gap-2 text-xs text-slate-400 mb-4">
                                                <ShieldCheck className="w-3 h-3" />
                                                <span>Your data is encrypted and secure.</span>
                                            </div>
                                        </div>
                                    </form>
                                </>
                            )}
                        </>
                    ) : (
                        /* Google Auth Next Step: WhatsApp Input or OTP */
                        <>
                            {showGoogleOtp ? (
                                <form onSubmit={handleGoogleOtpSubmit} className="space-y-4 animate-in fade-in slide-in-from-right-4">
                                    {error && (
                                        <div className="mb-6 p-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 flex items-center gap-3 text-red-600 dark:text-red-400 animate-in slide-in-from-top-2">
                                            <AlertCircle className="w-5 h-5 flex-shrink-0" />
                                            <p className="text-sm font-medium">{error}</p>
                                        </div>
                                    )}
                                    <div className="text-center mb-4">
                                        <span className="text-xs text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-3 py-1 rounded-full">
                                            Mock OTP: 123456
                                        </span>
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-sm font-medium text-slate-700 dark:text-slate-300 ml-1">OTP</label>
                                        <input
                                            type="text"
                                            required
                                            value={otp}
                                            onChange={(e) => setOtp(e.target.value)}
                                            placeholder="123456"
                                            className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl py-3 px-4 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-productivity-500/20 focus:border-productivity-500 transition-all"
                                            autoFocus
                                        />
                                    </div>
                                    <button
                                        type="submit"
                                        disabled={isLoading}
                                        className="w-full font-bold py-4 rounded-xl shadow-lg bg-productivity-600 hover:bg-productivity-500 text-white shadow-productivity-500/25 transition-all hover:scale-[1.01] disabled:opacity-70 disabled:hover:scale-100 flex items-center justify-center gap-2"
                                    >
                                        {isLoading ? <ProductivitySpinner size="sm" /> : 'Verify & Complete'}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setShowGoogleOtp(false)}
                                        className="w-full text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                                    >
                                        Back
                                    </button>
                                </form>
                            ) : (
                                <form onSubmit={handleGooglePhoneSubmit} className="space-y-6 animate-in fade-in slide-in-from-right-8 duration-300">
                                    {error && (
                                        <div className="mb-6 p-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 flex items-center gap-3 text-red-600 dark:text-red-400 animate-in slide-in-from-top-2">
                                            <AlertCircle className="w-5 h-5 flex-shrink-0" />
                                            <p className="text-sm font-medium">{error}</p>
                                        </div>
                                    )}
                                    <div className="p-4 bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-900/20 rounded-xl flex items-center gap-3">
                                        <div className="w-8 h-8 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center text-green-600 dark:text-green-400">
                                            <CheckCircle2 className="w-5 h-5" />
                                        </div>
                                        <div>
                                            <p className="text-sm font-semibold text-green-800 dark:text-green-200">
                                                {searchParams.get('provider') === 'MICROSOFT' ? 'Microsoft' : 'Google'} Authenticated
                                            </p>
                                            <p className="text-xs text-green-600 dark:text-green-400">Please add a WhatsApp number to finish.</p>
                                        </div>
                                    </div>

                                    <div className="space-y-1.5">
                                        <label className="text-sm font-medium text-slate-700 dark:text-slate-300 ml-1">WhatsApp Number</label>
                                        <PhoneInput
                                            countryCode={countryCode}
                                            phone={whatsapp}
                                            onCountryChange={setCountryCode}
                                            onPhoneChange={setWhatsapp}
                                            placeholder="Phone number"
                                            required
                                            autoFocus
                                        />
                                    </div>

                                    <button
                                        type="submit"
                                        disabled={isLoading}
                                        className="w-full font-bold py-4 rounded-xl shadow-lg bg-productivity-600 hover:bg-productivity-500 text-white shadow-productivity-500/25 transition-all hover:scale-[1.02] disabled:opacity-70 disabled:hover:scale-100 flex items-center justify-center gap-2"
                                    >
                                        {isLoading ? <ProductivitySpinner size="sm" /> : 'Next'}
                                    </button>
                                </form>
                            )}
                        </>
                    )}

                    <div className="mt-8 text-center">
                        <p className="text-sm text-slate-500 dark:text-slate-400">
                            Already have an account?{' '}
                            <button
                                onClick={onNavigateToLogin}
                                className="text-productivity-600 dark:text-productivity-400 font-bold hover:text-productivity-700 dark:hover:text-productivity-300 hover:underline transition-all"
                            >
                                Sign In
                            </button>
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default CreateAccountPage;
