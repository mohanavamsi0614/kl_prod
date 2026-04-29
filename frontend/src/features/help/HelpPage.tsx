import React from 'react';
import { LifeBuoy } from 'lucide-react';

const HelpPage: React.FC = () => {
  return (
    <div className="flex flex-col items-center justify-center h-full text-slate-500 dark:text-slate-400">
      <div className="bg-slate-100 dark:bg-slate-800 p-4 rounded-full mb-4">
        <LifeBuoy className="w-8 h-8 text-slate-400 dark:text-slate-500" />
      </div>
      <h2 className="text-xl font-semibold text-slate-700 dark:text-slate-200 mb-2">Help & Feedback Coming Soon</h2>
      <p>Support resources and feedback tools are on the way.</p>
    </div>
  );
};

export default HelpPage;
