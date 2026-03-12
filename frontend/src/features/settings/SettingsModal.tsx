import React from 'react';
import { useAppStore } from '../../store/useAppStore';
import { X, Sun, Moon, Languages, Monitor } from 'lucide-react';

export const SettingsModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
    const { theme, setTheme, lang, setLang } = useAppStore();

    const t = {
        zh: { title: "系统设置", appearance: "外观主题", light: "明亮", dark: "暗黑", language: "语言" },
        en: { title: "Settings", appearance: "Appearance", light: "Light", dark: "Dark", language: "Language" }
    }[lang];

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm">
            <div className="w-[400px] bg-white dark:bg-[#1c2128] rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden anime-fade-in">
                <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-[#22272e]">
                    <h2 className="text-sm font-bold flex items-center gap-2 dark:text-gray-200">
                        <Monitor size={16} /> {t.title}
                    </h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-white transition-colors">
                        <X size={18} />
                    </button>
                </div>

                <div className="p-6 space-y-6">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-blue-600">
                                {theme === 'light' ? <Sun size={18} /> : <Moon size={18} />}
                            </div>
                            <span className="text-sm font-medium dark:text-gray-300">{t.appearance}</span>
                        </div>
                        <select 
                            value={theme} 
                            onChange={(e) => setTheme(e.target.value as any)}
                            className="bg-white dark:bg-[#2d333b] border border-gray-200 dark:border-gray-600 rounded-md px-3 py-1.5 text-xs outline-none focus:ring-2 focus:ring-blue-500/50"
                        >
                            <option value="light">{t.light}</option>
                            <option value="dark">{t.dark}</option>
                        </select>
                    </div>

                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-purple-50 dark:bg-purple-900/20 rounded-lg text-purple-600">
                                <Languages size={18} />
                            </div>
                            <span className="text-sm font-medium dark:text-gray-300">{t.language}</span>
                        </div>
                        <select 
                            value={lang} 
                            onChange={(e) => setLang(e.target.value as any)}
                            className="bg-white dark:bg-[#2d333b] border border-gray-200 dark:border-gray-600 rounded-md px-3 py-1.5 text-xs outline-none focus:ring-2 focus:ring-blue-500/50"
                        >
                            <option value="zh">简体中文</option>
                            <option value="en">English</option>
                        </select>
                    </div>
                </div>
            </div>
        </div>
    );
};