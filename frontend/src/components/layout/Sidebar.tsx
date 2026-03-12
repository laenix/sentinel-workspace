import React from 'react';
import { useAppStore } from '../../store/useAppStore';
import { LayoutGrid, BookOpen, RefreshCw, Rocket, Settings } from 'lucide-react';

const ActivityIcon = ({ icon, label, isActive, onClick }: any) => (
    <div className="group relative w-full flex justify-center py-2">
        <div onClick={onClick} className={`cursor-pointer p-2.5 rounded-xl transition-all ${isActive ? 'text-blue-500 border-l-2 border-blue-500 bg-blue-500/10' : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800/50'}`}>
            {icon}
        </div>
        <div className="absolute left-16 top-1/2 -translate-y-1/2 px-2.5 py-1.5 bg-gray-900 text-white text-[10px] font-bold rounded opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity whitespace-nowrap z-50 shadow-xl border border-gray-700">
            {label}
        </div>
    </div>
);

export const Sidebar = () => {
    const store = useAppStore();
    return (
        <aside className={`w-14 flex flex-col items-center py-3 shrink-0 border-r z-10 ${store.theme === 'dark' ? 'bg-[#010409] border-gray-800' : 'bg-gray-50 border-gray-200'}`}>
            <div className="flex-1 space-y-3 w-full flex flex-col items-center">
                <ActivityIcon icon={<LayoutGrid size={22} />} label="KQL Analysis" isActive={store.activeTab === 'editor'} onClick={() => store.setActiveTab('editor')} />
                <ActivityIcon icon={<BookOpen size={22} />} label="Markdown Docs" isActive={store.activeTab === 'markdown'} onClick={() => store.setActiveTab('markdown')} />
                <ActivityIcon icon={<RefreshCw size={22} />} label="GitOps Sync" isActive={store.activeTab === 'sync'} onClick={() => store.setActiveTab('sync')} />
                <ActivityIcon icon={<Rocket size={22} />} label="Tenant Migration" isActive={store.activeTab === 'migrate'} onClick={() => store.setActiveTab('migrate')} />
            </div>
            <div className="w-full flex flex-col items-center pb-2">
                <ActivityIcon icon={<Settings size={22} />} label="Settings" isActive={store.activeTab === 'settings'} onClick={() => store.setActiveTab('settings')} />
            </div>
        </aside>
    );
};