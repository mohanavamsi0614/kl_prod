import React from 'react';
import { LogOut, User, Bell, Shield, Moon, Globe } from 'lucide-react';

interface SettingsPageProps {
  onLogout: () => void;
}

const SettingsPage: React.FC<SettingsPageProps> = ({ onLogout }) => {
  return (
    <div className="p-6 lg:p-10 h-full overflow-y-auto relative">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-2">Settings</h1>
        <p className="text-slate-500 dark:text-slate-400">Manage your account preferences and application settings.</p>
      </header>

      <div className="max-w-3xl space-y-6">
        {/* Account Section */}
        <div className="bg-white dark:bg-dark-surface rounded-2xl border border-slate-200 dark:border-dark-border p-6">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                <User className="w-5 h-5 text-productivity-500" /> Account
            </h2>
            <div className="space-y-4">
                <div className="flex items-center justify-between p-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 rounded-xl transition-colors cursor-pointer">
                    <div>
                        <p className="font-medium text-slate-900 dark:text-white">Profile Information</p>
                        <p className="text-sm text-slate-500">Update your name, email, and avatar</p>
                    </div>
                    <button className="text-sm text-productivity-600 font-medium">Edit</button>
                </div>
                <div className="flex items-center justify-between p-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 rounded-xl transition-colors cursor-pointer">
                    <div>
                        <p className="font-medium text-slate-900 dark:text-white">Password</p>
                        <p className="text-sm text-slate-500">Change your password</p>
                    </div>
                    <button className="text-sm text-productivity-600 font-medium">Update</button>
                </div>
            </div>
        </div>

        {/* Preferences Section */}
        <div className="bg-white dark:bg-dark-surface rounded-2xl border border-slate-200 dark:border-dark-border p-6">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                <Globe className="w-5 h-5 text-violet-500" /> Preferences
            </h2>
            <div className="space-y-4">
                <div className="flex items-center justify-between p-3">
                    <div className="flex items-center gap-3">
                        <Bell className="w-5 h-5 text-slate-400" />
                        <div>
                            <p className="font-medium text-slate-900 dark:text-white">Notifications</p>
                            <p className="text-sm text-slate-500">Manage email and push notifications</p>
                        </div>
                    </div>
                    <div className="relative inline-block w-12 mr-2 align-middle select-none transition duration-200 ease-in">
                        <input type="checkbox" name="toggle" id="toggle-notif" className="toggle-checkbox absolute block w-6 h-6 rounded-full bg-white border-4 appearance-none cursor-pointer"/>
                        <label htmlFor="toggle-notif" className="toggle-label block overflow-hidden h-6 rounded-full bg-gray-300 cursor-pointer"></label>
                    </div>
                </div>
                <div className="flex items-center justify-between p-3">
                    <div className="flex items-center gap-3">
                        <Moon className="w-5 h-5 text-slate-400" />
                        <div>
                            <p className="font-medium text-slate-900 dark:text-white">Dark Mode</p>
                            <p className="text-sm text-slate-500">Toggle application theme</p>
                        </div>
                    </div>
                    {/* Theme toggle is handled globally, this is just a placeholder/indicator */}
                    <span className="text-sm text-slate-400">System Default</span>
                </div>
            </div>
        </div>

        {/* Security Section */}
        <div className="bg-white dark:bg-dark-surface rounded-2xl border border-slate-200 dark:border-dark-border p-6">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                <Shield className="w-5 h-5 text-emerald-500" /> Security
            </h2>
            <div className="space-y-4">
                <div className="flex items-center justify-between p-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 rounded-xl transition-colors cursor-pointer">
                    <div>
                        <p className="font-medium text-slate-900 dark:text-white">Two-Factor Authentication</p>
                        <p className="text-sm text-slate-500">Add an extra layer of security</p>
                    </div>
                    <button className="text-sm text-productivity-600 font-medium">Enable</button>
                </div>
            </div>
        </div>

        {/* Danger Zone */}
        <div className="bg-red-50 dark:bg-red-900/10 rounded-2xl border border-red-100 dark:border-red-900/20 p-6">
            <h2 className="text-lg font-semibold text-red-700 dark:text-red-400 mb-4">Danger Zone</h2>
            <div className="flex items-center justify-between">
                <div>
                    <p className="font-medium text-slate-900 dark:text-white">Sign Out</p>
                    <p className="text-sm text-slate-500">Sign out of your account on this device</p>
                </div>
                <button 
                    onClick={onLogout}
                    className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-colors font-medium shadow-sm"
                >
                    <LogOut className="w-4 h-4" />
                    Sign Out
                </button>
            </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsPage;
