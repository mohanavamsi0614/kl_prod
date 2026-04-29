import React from 'react';
import { Users } from 'lucide-react';

const ChatPage: React.FC = () => {
  return (
    <div className="flex flex-col items-center justify-center h-full text-slate-500 dark:text-slate-400">
      <div className="bg-slate-100 dark:bg-slate-800 p-4 rounded-full mb-4">
        <Users className="w-8 h-8 text-slate-400 dark:text-slate-500" />
      </div>
      <h2 className="text-xl font-semibold text-slate-700 dark:text-slate-200 mb-2">Chats Coming Soon</h2>
      <p>Manage your professional network with Productivity soon.</p>
    </div>
  );
};

export default ChatPage;