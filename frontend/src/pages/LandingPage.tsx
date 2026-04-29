import React, { useEffect, useState, useRef } from 'react';
import { ArrowRight, Calendar, Mail, CheckSquare, Sparkles, Shield, Zap, MessageSquare, Sun, Moon, MessageCircle, Phone, Video, MoreVertical, Plus, Mic, Check, Briefcase, Coffee, Home, FileText } from 'lucide-react';

interface LandingPageProps {
  onGetStarted: () => void;
  onLogin: () => void;
  theme: 'light' | 'dark';
  toggleTheme: () => void;
}

const ProductivityLogo = ({ className = "w-full h-full" }: { className?: string }) => (
  <svg viewBox="0 0 100 100" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="lpLogoOuter" x1="0" y1="0" x2="100" y2="100" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#06b6d4" />
        <stop offset="100%" stopColor="#0891b2" />
      </linearGradient>
      <linearGradient id="lpLogoInner" x1="30" y1="30" x2="70" y2="70" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#a5f3fc" />
        <stop offset="100%" stopColor="#22d3ee" />
      </linearGradient>
      <filter id="lpLogoGlow" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation="3" result="blur" />
        <feComposite in="SourceGraphic" in2="blur" operator="over" />
      </filter>
    </defs>
    
    <circle cx="50" cy="50" r="48" fill="url(#lpLogoOuter)" />
    <circle cx="50" cy="50" r="24" fill="url(#lpLogoInner)" filter="url(#lpLogoGlow)" />
    <circle cx="50" cy="50" r="48" stroke="white" strokeOpacity="0.1" strokeWidth="1" />
  </svg>
);

const IntegrationLogo = ({ type }: { type: string }) => {
  // Simplified SVG icons for integration logos
  const getPath = () => {
    switch(type) {
      case 'WhatsApp': return <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" fill="#25D366"/>;
      case 'Gmail': return <path d="M24 5.457v13.909c0 .904-.732 1.636-1.636 1.636h-3.819V11.73L12 16.64l-6.545-4.91v9.273H1.636A1.636 1.636 0 0 1 0 19.366V5.457c0-2.023 2.309-3.178 3.927-1.964L5.455 4.64 12 9.548l6.545-4.91 1.528-1.145C21.69 2.28 24 3.434 24 5.457z" fill="#EA4335"/>;
      case 'Calendar': return <path d="M19 4h-1V2h-2v2H8V2H6v2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V10h14v10zm0-12H5V6h14v2z" fill="#4285F4"/>;
      case 'Outlook': return <path d="M1 12.5L12 8v8L1 11.5v1zm0-7.5l11 3.5v-8L1 4v1zm11 10.5l11 4.5V4L12 8v7.5z" fill="#0078D4"/>;
      case 'Slack': return <path d="M5.042 15.123a2.52 2.52 0 0 1 2.52-2.52h2.52v2.52a2.52 2.52 0 0 1-5.04 0zm5.88-2.52a2.52 2.52 0 0 1 2.52-2.52V7.563a2.52 2.52 0 0 1-2.52 2.52h-2.52v2.52zm2.52 5.88a2.52 2.52 0 0 1 2.52 2.52v2.52a2.52 2.52 0 0 1-5.04 0v-2.52h2.52zm2.52-5.88a2.52 2.52 0 0 1 2.52 2.52h2.52a2.52 2.52 0 0 1-2.52-2.52v-2.52h-2.52z" fill="#E01E5A"/>;
      case 'Zoom': return <path d="M19.99 4H4.01C1.8 4 0 5.8 0 8.01v7.98C0 18.2 1.8 20 4.01 20h15.98c2.21 0 4.01-1.8 4.01-4.01V8.01C24 5.8 22.2 4 19.99 4zM15 15l-4-2.5V7.5L15 5v10z" fill="#2D8CFF"/>;
      default: return <circle cx="12" cy="12" r="10" fill="#CBD5E1"/>;
    }
  }
  return (
    <svg viewBox="0 0 24 24" className="w-8 h-8 md:w-10 md:h-10 transition-all hover:scale-110">
      {getPath()}
    </svg>
  );
}

const DEMO_SCENARIOS = [
  {
    user: "Find a time for me to meet with Sarah next week, and email her the Q4 report.",
    model: (
      <>
        I've found a slot on <strong>Tuesday at 2:00 PM</strong>.
        <br/><br/>
        I also drafted the email to Sarah with the <span className="text-blue-500 cursor-pointer hover:underline">Q4_Report.pdf</span> attached. Should I send the invite and the email?
      </>
    ),
    actions: ["Yes, do it", "Change time"],
    time: "10:42 AM"
  },
  {
    user: "What's on my plate for today?",
    model: (
      <>
        You have <strong>3 meetings</strong> remaining:
        <br/>
        • Product Sync (1:00 PM)
        <br/>
        • Client Call (3:30 PM)
        <br/>
        • Gym (6:00 PM)
        <br/><br/>
        Should I block some focus time before the Client Call?
      </>
    ),
    actions: ["Block 1 hour", "Remind me later"],
    time: "12:15 PM"
  },
  {
    user: "Remind me to buy milk and coffee beans when I leave work.",
    model: (
      <>
        Done. I've added "Buy milk and coffee beans" to your <strong>Groceries</strong> list.
        <br/><br/>
        I've set a location-based reminder for when you leave the office.
      </>
    ),
    actions: ["View List", "Add more items"],
    time: "4:50 PM"
  }
];

const LandingPage: React.FC<LandingPageProps> = ({ onGetStarted, onLogin, theme, toggleTheme }) => {
  const [scrolled, setScrolled] = useState(false);
  
  // Chat Animation State
  const [scenarioIndex, setScenarioIndex] = useState(0);
  const [chatStep, setChatStep] = useState(0); // 0: empty, 1: user, 2: model
  const chatContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    // Reset step when scenario changes
    setChatStep(0);

    const t1 = setTimeout(() => setChatStep(1), 500); // Show user msg
    const t2 = setTimeout(() => {
      setChatStep(2);
      // Scroll to bottom when model message appears
      if (chatContainerRef.current) {
        chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
      }
    }, 2000); // Show model msg
    
    const t3 = setTimeout(() => {
      setScenarioIndex((prev) => (prev + 1) % DEMO_SCENARIOS.length);
    }, 7000); // Next scenario

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [scenarioIndex]);

  // Auto-scroll effect for user message too
  useEffect(() => {
     if (chatContainerRef.current) {
        chatContainerRef.current.scrollTo({ top: chatContainerRef.current.scrollHeight, behavior: 'smooth' });
     }
  }, [chatStep]);

  const handleWhatsAppClick = () => {
      window.open('https://wa.me/15550109999?text=Hey%20Productivity,%20I%20need%20help%20organizing%20my%20schedule', '_blank');
  };

  const currentScenario = DEMO_SCENARIOS[scenarioIndex];

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-slate-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 text-slate-900 dark:text-white overflow-x-hidden font-sans selection:bg-productivity-500/30 transition-colors duration-500">
       {/* Grid Background Pattern */}
       <div className="fixed inset-0 pointer-events-none z-0 opacity-[0.03] dark:opacity-[0.05]" 
          style={{ 
            backgroundImage: `linear-gradient(90deg, currentColor 1px, transparent 1px), linear-gradient(currentColor 1px, transparent 1px)`,
            backgroundSize: '40px 40px'
          }} 
       />

      {/* Navigation */}
      <nav className={`fixed top-0 w-full z-50 transition-all duration-300 ${scrolled ? 'bg-white/80 dark:bg-slate-950/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 py-3 md:py-4' : 'bg-transparent py-4 md:py-6'}`}>
        <div className="container mx-auto px-4 md:px-6 flex justify-between items-center">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
            <div className="w-8 h-8">
                <ProductivityLogo />
            </div>
            <span className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">Productivity</span>
          </div>
          <div className="flex items-center gap-3 md:gap-6">
            <button 
              onClick={toggleTheme}
              className="p-2 rounded-full text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              aria-label="Toggle theme"
            >
              {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>
            <button onClick={onLogin} className="text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white font-medium transition-colors hidden sm:block">
              Log In
            </button>
            <button 
              onClick={onGetStarted}
              className="bg-slate-900 dark:bg-white text-white dark:text-slate-950 px-4 py-2 md:px-5 md:py-2.5 rounded-full font-bold text-sm md:text-base hover:bg-slate-800 dark:hover:bg-slate-200 transition-all transform hover:scale-105 shadow-[0_0_20px_rgba(0,0,0,0.1)] dark:shadow-[0_0_20px_rgba(255,255,255,0.3)]"
            >
              Start Free Trial
            </button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <header className="relative pt-28 pb-12 md:pt-32 md:pb-20 lg:pt-48 lg:pb-32 overflow-hidden">
        {/* Background Blobs */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[600px] bg-productivity-400/20 dark:bg-productivity-600/20 rounded-full blur-[120px] -z-10 pointer-events-none dark:mix-blend-screen" />
        <div className="absolute bottom-0 right-0 w-[800px] h-[600px] bg-violet-400/10 dark:bg-violet-600/10 rounded-full blur-[100px] -z-10 pointer-events-none" />

        <div className="container mx-auto px-4 md:px-6 text-center relative z-10">
          <div className="flex justify-center mb-6 md:mb-8">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 backdrop-blur-sm animate-in fade-in slide-in-from-bottom-4 duration-700 shadow-sm">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              <span className="text-xs md:text-sm font-medium text-slate-600 dark:text-slate-300">Productivity 2.0 is live • Try the new Voice Mode</span>
            </div>
          </div>
          
          <div className="relative inline-block mb-6">
             <div className="absolute inset-0 bg-gradient-to-r from-cyan-200 via-productivity-200 to-violet-200 dark:from-cyan-900/30 dark:via-productivity-900/30 dark:to-violet-900/30 blur-[50px] md:blur-[80px] mix-blend-multiply dark:mix-blend-normal opacity-50 dark:opacity-100 -z-10 rounded-full transform scale-150"></div>
             <h1 className="text-4xl md:text-6xl lg:text-8xl font-bold tracking-tight leading-[1.1] animate-in fade-in slide-in-from-bottom-8 duration-700 delay-100 text-slate-900 dark:text-white">
                Stop Juggling Apps. <br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-productivity-500 via-cyan-500 to-violet-500 dark:from-productivity-300 dark:via-cyan-200 dark:to-violet-300">
                Start Asking Productivity.
                </span>
             </h1>
          </div>
          
          <p className="text-lg md:text-xl lg:text-2xl text-slate-600 dark:text-slate-400 max-w-2xl mx-auto mb-8 md:mb-10 leading-relaxed animate-in fade-in slide-in-from-bottom-8 duration-700 delay-200 px-2">
            Your personal AI that unifies your Calendar, Email, Tasks, and Contacts into one seamless conversation on WhatsApp.
          </p>
          
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 animate-in fade-in slide-in-from-bottom-8 duration-700 delay-300 w-full sm:w-auto">
            <button 
              onClick={onGetStarted}
              className="w-full sm:w-auto px-8 py-4 bg-productivity-600 hover:bg-productivity-500 text-white text-lg font-bold rounded-full transition-all transform hover:scale-105 shadow-[0_0_40px_rgba(6,182,212,0.4)] flex items-center justify-center gap-2"
            >
              Get Started Free
              <ArrowRight className="w-5 h-5" />
            </button>
            
            <button 
              onClick={handleWhatsAppClick}
              className="w-full sm:w-auto px-8 py-4 bg-[#25D366] hover:bg-[#128C7E] text-white text-lg font-bold rounded-full transition-all transform hover:scale-105 shadow-lg flex items-center justify-center gap-2"
            >
              <MessageCircle className="w-5 h-5" />
              Ask on WhatsApp
            </button>
          </div>

          {/* Hero Graphic - WhatsApp Style */}
          <div className="mt-16 md:mt-20 relative mx-auto max-w-4xl animate-in fade-in zoom-in duration-1000 delay-500">
            <div className="absolute inset-0 bg-gradient-to-t from-slate-50 dark:from-slate-950 via-transparent to-transparent z-20 pointer-events-none" />
            
            {/* Container */}
            <div className="bg-slate-800 rounded-[2.5rem] p-3 shadow-2xl border-4 border-slate-200/50 dark:border-slate-800 relative overflow-hidden group">
               {/* Screen */}
               <div className="bg-[#efeae2] dark:bg-[#0b141a] rounded-[2rem] overflow-hidden aspect-[9/16] sm:aspect-[3/4] md:aspect-[16/9] flex flex-col relative transition-colors duration-500">
                  
                  {/* Header */}
                  <div className="bg-[#008069] dark:bg-[#202c33] px-4 py-3 flex items-center gap-3 text-white shadow-sm z-10 shrink-0">
                     <button className="mr-1"><ArrowRight className="w-5 h-5 rotate-180" /></button>
                     <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center overflow-hidden p-0.5">
                        <div className="w-full h-full bg-gradient-to-br from-productivity-400 to-productivity-600 rounded-full flex items-center justify-center">
                             <Sparkles className="w-5 h-5 text-white" />
                        </div>
                     </div>
                     <div className="flex-1 leading-tight text-left">
                        <div className="font-bold text-base">Productivity</div>
                        <div className="text-xs text-white/80">Business Account</div>
                     </div>
                     <div className="flex gap-5">
                         <Video className="w-5 h-5" />
                         <Phone className="w-5 h-5" />
                         <MoreVertical className="w-5 h-5" />
                     </div>
                  </div>

                  {/* Chat Body */}
                  <div 
                    ref={chatContainerRef}
                    className="flex-1 p-4 sm:p-6 overflow-y-auto flex flex-col gap-4 relative bg-opacity-10 bg-[radial-gradient(#cbd5e1_1px,transparent_1px)] dark:bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:16px_16px] scroll-smooth"
                  >
                     
                     <div className="flex justify-center mb-4">
                         <span className="bg-[#eef6fc] dark:bg-[#1e2a30] text-slate-600 dark:text-slate-300 text-xs font-medium px-3 py-1 rounded-lg shadow-sm border border-slate-100 dark:border-slate-800">
                            Today
                         </span>
                     </div>

                     {/* Dynamic Messages Wrapper */}
                     <div key={scenarioIndex} className="flex flex-col gap-4 w-full">
                         {chatStep >= 1 && (
                            <div className="flex justify-end animate-in slide-in-from-bottom-2 fade-in duration-500">
                                <div className="bg-[#d9fdd3] dark:bg-[#005c4b] text-slate-900 dark:text-white px-3 py-2 sm:px-4 sm:py-2 rounded-lg rounded-tr-none max-w-[85%] sm:max-w-md shadow-sm flex gap-2 items-end text-left">
                                <div className="text-sm sm:text-base">{currentScenario.user}</div>
                                <div className="flex items-center gap-1 shrink-0 mb-0.5">
                                    <span className="text-[10px] text-slate-500 dark:text-slate-300 opacity-70">{currentScenario.time}</span>
                                    <div className="flex -space-x-1">
                                        <Check className={`w-3 h-3 ${chatStep >= 2 ? 'text-[#53bdeb]' : 'text-slate-400'}`} />
                                        <Check className={`w-3 h-3 ${chatStep >= 2 ? 'text-[#53bdeb]' : 'text-slate-400'}`} />
                                    </div>
                                </div>
                                </div>
                            </div>
                         )}

                         {chatStep >= 2 && (
                            <div className="flex flex-col gap-2 animate-in slide-in-from-bottom-4 fade-in duration-500">
                                <div className="flex justify-start">
                                    <div className="bg-white dark:bg-[#202c33] text-slate-900 dark:text-white px-3 py-2 sm:px-4 sm:py-2 rounded-lg rounded-tl-none max-w-[85%] sm:max-w-md shadow-sm text-left">
                                        <div className="text-xs font-bold text-productivity-600 dark:text-productivity-400 mb-1">Productivity</div>
                                        <div className="text-sm sm:text-base mb-2">
                                            {currentScenario.model}
                                        </div>
                                        <div className="text-[10px] text-slate-500 dark:text-slate-400 text-right opacity-70">{currentScenario.time}</div>
                                    </div>
                                </div>

                                {/* Interactive Buttons */}
                                <div className="flex justify-start pl-2 animate-in fade-in duration-700 delay-150">
                                    <div className="flex flex-wrap gap-2">
                                        {currentScenario.actions.map((action, idx) => (
                                            <button key={idx} className="bg-white dark:bg-[#202c33] text-[#008069] dark:text-[#00a884] px-4 py-2 rounded-lg text-sm font-medium shadow-sm border border-slate-100 dark:border-slate-700 hover:bg-slate-50 transition-colors">
                                                {action}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                         )}
                     </div>
                  </div>

                  {/* Input Area */}
                  <div className="bg-[#f0f2f5] dark:bg-[#202c33] px-2 py-2 sm:px-4 sm:py-3 flex items-center gap-2 sm:gap-3 z-10 shrink-0">
                     <Plus className="w-6 h-6 text-slate-500 dark:text-slate-400 cursor-pointer" />
                     <div className="flex-1 bg-white dark:bg-[#2a3942] rounded-lg px-4 py-2 text-slate-400 text-sm flex items-center justify-between">
                        <span>Message</span>
                     </div>
                     <div className="w-10 h-10 rounded-full bg-[#008069] dark:bg-[#00a884] flex items-center justify-center shadow-sm cursor-pointer hover:scale-105 transition-transform">
                         <Mic className="w-5 h-5 text-white" />
                     </div>
                  </div>
               </div>
            </div>
          </div>
        </div>
      </header>

      {/* Social Proof */}
      <div className="border-y border-slate-200 dark:border-slate-800/50 bg-slate-100/50 dark:bg-slate-900/30">
        <div className="container mx-auto px-4 py-8 md:py-10">
          <p className="text-center text-xs md:text-sm text-slate-500 font-medium uppercase tracking-widest mb-6 md:mb-8">Connects with your favorite tools</p>
          <div className="flex flex-wrap justify-center gap-8 md:gap-12">
             <div className="grayscale hover:grayscale-0 transition-all opacity-60 hover:opacity-100 duration-300 flex items-center gap-2 text-slate-700 dark:text-slate-300 font-semibold text-sm md:text-base">
                <IntegrationLogo type="WhatsApp" /> WhatsApp
             </div>
             <div className="grayscale hover:grayscale-0 transition-all opacity-60 hover:opacity-100 duration-300 flex items-center gap-2 text-slate-700 dark:text-slate-300 font-semibold text-sm md:text-base">
                <IntegrationLogo type="Gmail" /> Gmail
             </div>
             <div className="grayscale hover:grayscale-0 transition-all opacity-60 hover:opacity-100 duration-300 flex items-center gap-2 text-slate-700 dark:text-slate-300 font-semibold text-sm md:text-base">
                <IntegrationLogo type="Calendar" /> Google Calendar
             </div>
             <div className="grayscale hover:grayscale-0 transition-all opacity-60 hover:opacity-100 duration-300 flex items-center gap-2 text-slate-700 dark:text-slate-300 font-semibold text-sm md:text-base">
                <IntegrationLogo type="Outlook" /> Outlook
             </div>
             <div className="grayscale hover:grayscale-0 transition-all opacity-60 hover:opacity-100 duration-300 flex items-center gap-2 text-slate-700 dark:text-slate-300 font-semibold text-sm md:text-base">
                <IntegrationLogo type="Slack" /> Slack
             </div>
             <div className="grayscale hover:grayscale-0 transition-all opacity-60 hover:opacity-100 duration-300 flex items-center gap-2 text-slate-700 dark:text-slate-300 font-semibold text-sm md:text-base">
                <IntegrationLogo type="Zoom" /> Zoom
             </div>
          </div>
        </div>
      </div>

      {/* Problem / Solution Section */}
      <section className="py-16 md:py-24 bg-white dark:bg-slate-950 relative overflow-hidden">
         <div className="container mx-auto px-4 md:px-6">
             <div className="flex flex-col lg:flex-row gap-12 lg:gap-24 items-center">
                 <div className="flex-1">
                     <h2 className="text-3xl md:text-4xl font-bold text-slate-900 dark:text-white mb-6">The Old Way vs. <span className="text-productivity-600 dark:text-productivity-400">The Productivity Way</span></h2>
                     <div className="space-y-8">
                         <div className="flex gap-4 items-start p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800 opacity-50 hover:opacity-100 transition-opacity">
                             <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                                 <span className="text-xl">😫</span>
                             </div>
                             <div>
                                 <h4 className="font-bold text-slate-900 dark:text-white">App Fatigue</h4>
                                 <p className="text-slate-600 dark:text-slate-400 text-sm mt-1">Switching between 5 different apps to schedule one meeting. Copy-pasting links manually.</p>
                             </div>
                         </div>
                         
                         <div className="flex gap-4 items-start p-6 rounded-2xl bg-productivity-50/50 dark:bg-productivity-900/10 border border-productivity-100 dark:border-productivity-500/20 shadow-lg ring-1 ring-productivity-500/20 transform scale-105">
                             <div className="w-10 h-10 rounded-full bg-productivity-100 flex items-center justify-center shrink-0">
                                 <Sparkles className="w-6 h-6 text-productivity-600" />
                             </div>
                             <div>
                                 <h4 className="font-bold text-slate-900 dark:text-white">One Conversation</h4>
                                 <p className="text-slate-600 dark:text-slate-400 text-sm mt-1">Just ask Productivity on WhatsApp. "Book a meeting with Dave." Productivity checks your calendar, emails Dave, and sends the invite.</p>
                             </div>
                         </div>
                     </div>
                 </div>
                 <div className="flex-1 relative">
                      {/* Decorative elements */}
                      <div className="absolute inset-0 bg-gradient-to-tr from-productivity-500/20 to-violet-500/20 rounded-full blur-3xl animate-pulse-slow"></div>
                      <div className="bg-slate-900 text-white p-6 md:p-8 rounded-3xl shadow-2xl relative border border-slate-800">
                          <h3 className="font-mono text-sm text-slate-400 mb-4 border-b border-slate-800 pb-2">PRODUCTIVITY_LOGS</h3>
                          <div className="space-y-4 font-mono text-sm">
                              <div className="flex gap-2">
                                  <span className="text-green-400">➜</span>
                                  <span>User: "Find 30m for a call with Marketing next week."</span>
                              </div>
                              <div className="flex gap-2 text-productivity-400">
                                  <span>⚡</span>
                                  <span>Productivity: Analyzing Calendar... Found 3 slots.</span>
                              </div>
                              <div className="flex gap-2 text-productivity-400">
                                  <span>⚡</span>
                                  <span>Productivity: Drafting email to marketing@team...</span>
                              </div>
                              <div className="flex gap-2 text-productivity-400">
                                  <span>⚡</span>
                                  <span>Productivity: Sent invites. Added to tasks.</span>
                              </div>
                              <div className="flex gap-2">
                                  <span className="text-green-400">✓</span>
                                  <span>Done in 4.2 seconds.</span>
                              </div>
                          </div>
                      </div>
                 </div>
             </div>
         </div>
      </section>

      {/* Features Grid */}
      <section className="py-16 md:py-24 relative bg-slate-50 dark:bg-slate-950">
        <div className="container mx-auto px-4 md:px-6 relative z-10">
            <div className="text-center max-w-3xl mx-auto mb-12 md:mb-16">
                <h2 className="text-3xl md:text-5xl font-bold mb-4 text-slate-900 dark:text-white">Your Entire Workflow,<br /> <span className="text-productivity-600 dark:text-productivity-400">One Interface.</span></h2>
                <p className="text-slate-600 dark:text-slate-400 text-lg">Connect your accounts and let Productivity handle the busy work. It's like having a personal assistant who never sleeps.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8">
                <div className="p-6 md:p-8 rounded-3xl bg-white/60 dark:bg-slate-900/60 backdrop-blur-md border border-slate-200 dark:border-slate-800 hover:border-productivity-500/50 transition-all group hover:-translate-y-1 shadow-lg dark:shadow-none">
                    <div className="w-12 h-12 rounded-2xl bg-productivity-50 dark:bg-slate-800 flex items-center justify-center mb-6 group-hover:bg-productivity-500/20 transition-colors">
                        <Calendar className="w-6 h-6 text-productivity-600 dark:text-productivity-400" />
                    </div>
                    <h3 className="text-xl font-bold mb-3 text-slate-900 dark:text-white">Smart Calendar</h3>
                    <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
                        "Schedule a meeting with John." Productivity finds the time, sends the invite, and even resolves conflicts automatically.
                    </p>
                </div>
                <div className="p-6 md:p-8 rounded-3xl bg-white/60 dark:bg-slate-900/60 backdrop-blur-md border border-slate-200 dark:border-slate-800 hover:border-violet-500/50 transition-all group hover:-translate-y-1 shadow-lg dark:shadow-none">
                    <div className="w-12 h-12 rounded-2xl bg-violet-50 dark:bg-slate-800 flex items-center justify-center mb-6 group-hover:bg-violet-500/20 transition-colors">
                        <Mail className="w-6 h-6 text-violet-600 dark:text-violet-400" />
                    </div>
                    <h3 className="text-xl font-bold mb-3 text-slate-900 dark:text-white">Your Email Bodyguard</h3>
                    <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
                        Productivity reads, summarizes, and drafts replies. Filter out the noise and focus on what actually matters.
                    </p>
                </div>
                <div className="p-6 md:p-8 rounded-3xl bg-white/60 dark:bg-slate-950/60 backdrop-blur-md border border-slate-200 dark:border-slate-800 hover:border-emerald-500/50 transition-all group hover:-translate-y-1 shadow-lg dark:shadow-none">
                    <div className="w-12 h-12 rounded-2xl bg-emerald-50 dark:bg-slate-800 flex items-center justify-center mb-6 group-hover:bg-emerald-500/20 transition-colors">
                        <CheckSquare className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <h3 className="text-xl font-bold mb-3 text-slate-900 dark:text-white">Actionable Tasks</h3>
                    <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
                        Turn conversations into to-do lists. "Remind me to buy milk" or "Add Q4 goals to my work list." Done.
                    </p>
                </div>
            </div>
        </div>
      </section>

      {/* Comparison Table */}
      <section className="py-16 md:py-24 bg-white dark:bg-slate-900">
          <div className="container mx-auto px-4 md:px-6">
              <h2 className="text-3xl md:text-4xl font-bold text-center mb-12 text-slate-900 dark:text-white">Why Smart Professionals Choose Productivity</h2>
              
              <div className="overflow-x-auto">
                  <table className="w-full max-w-4xl mx-auto text-left border-collapse min-w-[600px]">
                      <thead>
                          <tr className="border-b border-slate-200 dark:border-slate-800">
                              <th className="py-4 px-4 text-slate-500 font-medium w-1/3">Feature</th>
                              <th className="py-4 px-4 text-slate-900 dark:text-white font-bold text-lg w-1/3 bg-productivity-50/30 dark:bg-productivity-900/10 rounded-t-xl">Productivity AI</th>
                              <th className="py-4 px-4 text-slate-500 font-medium w-1/3">Human Assistant</th>
                          </tr>
                      </thead>
                      <tbody className="text-slate-600 dark:text-slate-300">
                          <tr className="border-b border-slate-100 dark:border-slate-800">
                              <td className="py-4 px-4 font-medium">Availability</td>
                              <td className="py-4 px-4 text-productivity-600 dark:text-productivity-400 font-bold bg-productivity-50/30 dark:bg-productivity-900/10">24/7 Instant</td>
                              <td className="py-4 px-4">9-5 Mon-Fri</td>
                          </tr>
                          <tr className="border-b border-slate-100 dark:border-slate-800">
                              <td className="py-4 px-4 font-medium">Response Time</td>
                              <td className="py-4 px-4 text-productivity-600 dark:text-productivity-400 font-bold bg-productivity-50/30 dark:bg-productivity-900/10">&lt; 2 Seconds</td>
                              <td className="py-4 px-4">Minutes to Hours</td>
                          </tr>
                          <tr className="border-b border-slate-100 dark:border-slate-800">
                              <td className="py-4 px-4 font-medium">Cost</td>
                              <td className="py-4 px-4 text-productivity-600 dark:text-productivity-400 font-bold bg-productivity-50/30 dark:bg-productivity-900/10">$29 / month</td>
                              <td className="py-4 px-4">$3,000+ / month</td>
                          </tr>
                          <tr className="border-b border-slate-100 dark:border-slate-800">
                              <td className="py-4 px-4 font-medium">Privacy</td>
                              <td className="py-4 px-4 text-productivity-600 dark:text-productivity-400 font-bold bg-productivity-50/30 dark:bg-productivity-900/10 rounded-b-xl">Encrypted & Private</td>
                              <td className="py-4 px-4">Human Error Risk</td>
                          </tr>
                      </tbody>
                  </table>
              </div>
          </div>
      </section>

      {/* Use Cases Section */}
      <section className="py-16 md:py-24 bg-slate-50 dark:bg-slate-950 border-y border-slate-200 dark:border-slate-800">
        <div className="container mx-auto px-4 md:px-6">
           <div className="text-center max-w-3xl mx-auto mb-12 md:mb-16">
              <h2 className="text-3xl md:text-5xl font-bold mb-4 text-slate-900 dark:text-white">Built for <span className="text-productivity-600 dark:text-productivity-400">Every Lifestyle</span></h2>
              <p className="text-slate-600 dark:text-slate-400 text-lg">Whether you're running a company or a household, Productivity adapts to your specific needs.</p>
           </div>

           <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 md:gap-8">
              {/* Executives */}
              <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 md:p-8 shadow-sm border border-slate-200 dark:border-slate-800 flex flex-col hover:border-slate-300 dark:hover:border-slate-700 transition-colors">
                 <div className="w-12 h-12 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400 mb-6">
                    <Briefcase className="w-6 h-6" />
                 </div>
                 <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">The Busy Executive</h3>
                 <p className="text-slate-600 dark:text-slate-400 mb-6 flex-1 text-sm leading-relaxed">
                    Reclaim your time between meetings. Get instant briefs on upcoming clients and delegate scheduling.
                 </p>
                 <ul className="space-y-3 text-sm text-slate-600 dark:text-slate-300">
                    <li className="flex items-center gap-2"><Check className="w-4 h-4 text-blue-500" /> Meeting prep summaries</li>
                    <li className="flex items-center gap-2"><Check className="w-4 h-4 text-blue-500" /> Auto-block focus time</li>
                    <li className="flex items-center gap-2"><Check className="w-4 h-4 text-blue-500" /> Priority email triage</li>
                 </ul>
              </div>

              {/* Freelancers */}
              <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 md:p-8 shadow-sm border border-slate-200 dark:border-slate-800 flex flex-col hover:border-slate-300 dark:hover:border-slate-700 transition-colors">
                 <div className="w-12 h-12 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center text-amber-600 dark:text-amber-400 mb-6">
                    <Coffee className="w-6 h-6" />
                 </div>
                 <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">The Freelancer</h3>
                 <p className="text-slate-600 dark:text-slate-400 mb-6 flex-1 text-sm leading-relaxed">
                    Manage multiple clients without losing your mind. Track invoices, deadlines, and follow-ups effortlessly.
                 </p>
                 <ul className="space-y-3 text-sm text-slate-600 dark:text-slate-300">
                    <li className="flex items-center gap-2"><Check className="w-4 h-4 text-amber-500" /> Project deadline tracking</li>
                    <li className="flex items-center gap-2"><Check className="w-4 h-4 text-amber-500" /> Automated client updates</li>
                    <li className="flex items-center gap-2"><Check className="w-4 h-4 text-amber-500" /> Quick expense logging</li>
                 </ul>
              </div>

              {/* Families */}
              <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 md:p-8 shadow-sm border border-slate-200 dark:border-slate-800 flex flex-col hover:border-slate-300 dark:hover:border-slate-700 transition-colors">
                 <div className="w-12 h-12 rounded-full bg-pink-100 dark:bg-pink-900/30 flex items-center justify-center text-pink-600 dark:text-pink-400 mb-6">
                    <Home className="w-6 h-6" />
                 </div>
                 <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">The Super Parent</h3>
                 <p className="text-slate-600 dark:text-slate-400 mb-6 flex-1 text-sm leading-relaxed">
                    Coordinate the chaos. From soccer practice to grocery lists, keep the whole family on the same page.
                 </p>
                 <ul className="space-y-3 text-sm text-slate-600 dark:text-slate-300">
                    <li className="flex items-center gap-2"><Check className="w-4 h-4 text-pink-500" /> Shared family calendar</li>
                    <li className="flex items-center gap-2"><Check className="w-4 h-4 text-pink-500" /> Grocery list sync</li>
                    <li className="flex items-center gap-2"><Check className="w-4 h-4 text-pink-500" /> Event reminders for all</li>
                 </ul>
              </div>

              {/* Researchers / Knowledge Workers */}
              <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 md:p-8 shadow-sm border border-slate-200 dark:border-slate-800 flex flex-col hover:border-slate-300 dark:hover:border-slate-700 transition-colors">
                 <div className="w-12 h-12 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center text-purple-600 dark:text-purple-400 mb-6">
                    <FileText className="w-6 h-6" />
                 </div>
                 <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">The Researcher</h3>
                 <p className="text-slate-600 dark:text-slate-400 mb-6 flex-1 text-sm leading-relaxed">
                    Centralize your knowledge. Upload PDFs, decks, and contracts, then ask Productivity to retrieve details instantly.
                 </p>
                 <ul className="space-y-3 text-sm text-slate-600 dark:text-slate-300">
                    <li className="flex items-center gap-2"><Check className="w-4 h-4 text-purple-500" /> Document search & chat</li>
                    <li className="flex items-center gap-2"><Check className="w-4 h-4 text-purple-500" /> Key insight extraction</li>
                    <li className="flex items-center gap-2"><Check className="w-4 h-4 text-purple-500" /> File organization</li>
                 </ul>
              </div>
           </div>
        </div>
      </section>

      {/* Feature Deep Dive / Security */}
      <section className="py-16 md:py-24 bg-white dark:bg-slate-900/50 border-y border-slate-200 dark:border-slate-800 relative overflow-hidden">
          <div className="container mx-auto px-4 md:px-6 relative z-10">
              <div className="flex flex-col lg:flex-row items-center gap-12 lg:gap-16">
                  <div className="flex-1 space-y-8">
                      <h2 className="text-3xl md:text-4xl font-bold text-slate-900 dark:text-white">Enterprise-Grade Security, <br/>Personal-Grade Simplicity.</h2>
                      
                      <div className="space-y-6">
                          <div className="flex gap-4">
                              <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0">
                                  <Shield className="w-6 h-6 text-green-500 dark:text-green-400" />
                              </div>
                              <div>
                                  <h4 className="text-lg font-bold text-slate-900 dark:text-white">Private by Design</h4>
                                  <p className="text-slate-600 dark:text-slate-400 mt-1">Your data is encrypted and never used to train public models without consent.</p>
                              </div>
                          </div>
                          <div className="flex gap-4">
                              <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0">
                                  <Zap className="w-6 h-6 text-yellow-500 dark:text-yellow-400" />
                              </div>
                              <div>
                                  <h4 className="text-lg font-bold text-slate-900 dark:text-white">Real-Time Sync</h4>
                                  <p className="text-slate-600 dark:text-slate-400 mt-1">Changes in Productivity reflect instantly in Google Calendar, Outlook, and your other tools.</p>
                              </div>
                          </div>
                          <div className="flex gap-4">
                              <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0">
                                  <MessageSquare className="w-6 h-6 text-blue-500 dark:text-blue-400" />
                              </div>
                              <div>
                                  <h4 className="text-lg font-bold text-slate-900 dark:text-white">WhatsApp Integration</h4>
                                  <p className="text-slate-600 dark:text-slate-400 mt-1">Talk to Productivity on the go via WhatsApp. Send voice notes to add tasks or check your schedule.</p>
                              </div>
                          </div>
                      </div>
                  </div>
                  
                  <div className="flex-1 relative w-full">
                      <div className="absolute inset-0 bg-gradient-to-br from-productivity-500/20 to-violet-500/20 blur-3xl rounded-full" />
                      <div className="relative bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 md:p-8 shadow-2xl">
                          <div className="flex justify-between items-center mb-6 border-b border-slate-100 dark:border-slate-800 pb-4">
                              <span className="text-sm font-medium text-slate-500">SECURITY_AUDIT_LOG</span>
                              <span className="text-xs text-green-500 font-mono">STATUS: SECURE</span>
                          </div>
                          <div className="space-y-3 font-mono text-sm">
                              <div className="flex justify-between">
                                  <span className="text-slate-500">Encryption</span>
                                  <span className="text-productivity-600 dark:text-productivity-400">AES-256</span>
                              </div>
                              <div className="flex justify-between">
                                  <span className="text-slate-500">Auth Provider</span>
                                  <span className="text-productivity-600 dark:text-productivity-400">OAuth 2.0</span>
                              </div>
                              <div className="flex justify-between">
                                  <span className="text-slate-500">Data Residency</span>
                                  <span className="text-productivity-600 dark:text-productivity-400">US-East-1</span>
                              </div>
                              <div className="flex justify-between">
                                  <span className="text-slate-500">SOC 2 Compliant</span>
                                  <span className="text-green-500 dark:text-green-400">Yes</span>
                              </div>
                          </div>
                          <div className="mt-8 pt-4 border-t border-slate-100 dark:border-slate-800 text-center">
                              <button className="text-sm text-slate-400 hover:text-slate-900 dark:hover:text-white flex items-center justify-center gap-2 mx-auto">
                                  Read Security Whitepaper <ArrowRight className="w-3 h-3" />
                              </button>
                          </div>
                      </div>
                  </div>
              </div>
          </div>
      </section>

      {/* FAQ Section */}
      <section className="py-16 md:py-24 bg-slate-50 dark:bg-slate-950">
          <div className="container mx-auto px-4 md:px-6">
              <h2 className="text-3xl font-bold text-center mb-12 text-slate-900 dark:text-white">Frequently Asked Questions</h2>
              <div className="max-w-3xl mx-auto space-y-4">
                  {[
                      { q: "Does Productivity work with my existing calendar?", a: "Yes! Productivity integrates seamlessly with Google Calendar, Outlook, and iCloud. You don't need to migrate anything." },
                      { q: "Is my data safe?", a: "Absolutely. We use AES-256 encryption and never sell your data. We are SOC 2 Type II compliant." },
                      { q: "Can I use Productivity for my team?", a: "Yes, Productivity Business plans allow you to share calendars and files with your team securely." },
                      { q: "How do I talk to Productivity?", a: "You can chat with Productivity right here on the dashboard, or connect your WhatsApp to send voice notes and texts on the go." }
                  ].map((item, i) => (
                      <div key={i} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6">
                          <h4 className="font-bold text-slate-900 dark:text-white mb-2">{item.q}</h4>
                          <p className="text-slate-600 dark:text-slate-400">{item.a}</p>
                      </div>
                  ))}
              </div>
          </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 relative">
          <div className="container mx-auto px-4 md:px-6 text-center relative z-10">
              <div className="max-w-4xl mx-auto bg-gradient-to-r from-productivity-100 to-violet-100 dark:from-productivity-900/50 dark:to-violet-900/50 border border-productivity-200 dark:border-productivity-500/30 p-8 md:p-12 rounded-3xl backdrop-blur-sm shadow-xl dark:shadow-none">
                  <h2 className="text-3xl md:text-4xl font-bold mb-6 text-slate-900 dark:text-white">Ready to organize your life?</h2>
                  <p className="text-lg md:text-xl text-slate-600 dark:text-slate-300 mb-8">Join thousands of early adopters reclaiming 10+ hours a week.</p>
                  <div className="flex flex-col sm:flex-row justify-center gap-4">
                    <button 
                        onClick={onGetStarted}
                        className="px-8 py-4 bg-slate-900 dark:bg-white text-white dark:text-slate-950 text-lg font-bold rounded-full hover:bg-slate-800 dark:hover:bg-productivity-50 transition-all transform hover:scale-105 shadow-xl"
                    >
                        Start 14-Day Free Trial
                    </button>
                  </div>
                  <p className="mt-4 text-sm text-slate-500">No credit card required for trial.</p>
              </div>
          </div>
      </section>

      {/* Footer */}
      <footer className="bg-slate-100 dark:bg-slate-950 border-t border-slate-200 dark:border-slate-900 py-12 text-sm text-slate-500">
          <div className="container mx-auto px-4 md:px-6 flex flex-col md:flex-row justify-between items-center gap-6 md:gap-0">
              <div className="flex items-center gap-2">
                  <div className="w-6 h-6">
                    <ProductivityLogo />
                  </div>
                  <span className="text-slate-900 dark:text-white font-bold text-lg">Productivity</span>
              </div>
              <div className="flex flex-wrap justify-center gap-6 md:gap-8">
                  <a href="#" className="hover:text-slate-900 dark:hover:text-white transition-colors">Features</a>
                  <a href="#" className="hover:text-slate-900 dark:hover:text-white transition-colors">Pricing</a>
                  <a href="#" className="hover:text-slate-900 dark:hover:text-white transition-colors">Privacy</a>
                  <a href="#" className="hover:text-slate-900 dark:hover:text-white transition-colors">Terms</a>
              </div>
              <div className="text-center md:text-right">
                  © 2023 Productivity AI Inc. All rights reserved.
              </div>
          </div>
      </footer>

    </div>
  );
};

export default LandingPage;
