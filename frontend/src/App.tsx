import React, { useEffect } from 'react';
import { useAppStore } from './store/useAppStore';
import { GetDefaultLocalPath, ScanLocalContexts, GetGitStatus } from '../wailsjs/go/main/App';
import { Settings as SettingsIcon } from 'lucide-react';

import { Header } from './components/layout/Header';
import { Sidebar } from './components/layout/Sidebar';
import { ConnectionWizard } from './components/auth/ConnectionWizard';

import { Explorer } from './features/explorer/Explorer';
import { DiffPanel } from './features/diff/DiffPanel';
import { GitSidebar } from './features/sync/GitSidebar';
import { SyncManager } from './features/sync/SyncManager';
import { MarkdownWorkspace } from './features/editor/MarkdownWorkspace';
import { MigrateManager } from './features/migrate/MigrateManager';
import { WatchlistWorkspace } from './features/editor/WatchlistWorkspace';

function App() {
    const store = useAppStore();

    // 1. 初始化 Git 根目录
    useEffect(() => {
        const initLocalPath = async () => {
            if (store.repoPath === "C:\\sentinel-rules" || store.repoPath === "") {
                const defaultPath = await GetDefaultLocalPath();
                store.setRepoPath(defaultPath);
            }
        };
        initLocalPath();
    }, []);

    // 2. 扫描本地 4 层上下文 (Tenant/Sub/RG/WS)
    useEffect(() => {
        const scanLocal = async () => {
            if (!store.repoPath) return;
            try {
                const contexts = await ScanLocalContexts(store.repoPath);
                store.setLocalContexts(contexts || []);
                if (contexts && contexts.length > 0 && !store.localWs) {
                    store.setLocalContext(contexts[0].tenantName, contexts[0].subscription, contexts[0].resourceGroup, contexts[0].workspace);
                }
            } catch (err) { console.error("Failed to scan local contexts:", err); }
        };
        scanLocal();
    }, [store.repoPath, store.refreshKey]);

    // 3. 全局监听 Git 状态变化
    useEffect(() => {
        const fetchGitStatus = async () => {
            if (store.activeTab === 'sync' && store.repoPath) {
                try {
                    const changes = await GetGitStatus(store.repoPath);
                    store.setGitChanges(changes || []);
                } catch (err) { console.error("Git Status Error:", err); }
            }
        };
        fetchGitStatus();
    }, [store.activeTab, store.repoPath, store.gitRefreshKey]);

    return (
        <div className={`flex flex-col w-screen h-screen overflow-hidden ${store.theme === 'dark' ? 'dark bg-[#0d1117] text-gray-300' : 'bg-white text-gray-800'}`}>
            {/* 注入悬浮模态框 */}
            <ConnectionWizard />

            {/* 顶部导航控制台 */}
            <Header />

            {/* 下方核心工作区 */}
            <div className="flex-1 flex overflow-hidden">
                {/* 极简侧边栏 */}
                <Sidebar />

                {/* 🚀 资源管理器侧边栏 (在 Editor / Markdown 模式下显示) */}
                {(store.activeTab === 'editor' || store.activeTab === 'markdown') && <Explorer />}

                {/* 🚀 Git 变更控制侧边栏 (极其优雅的一行代码) */}
                <GitSidebar />

                {/* 右侧主工作区 */}
                <main className={`flex-1 overflow-hidden relative ${store.theme === 'dark' ? 'bg-[#010409]' : 'bg-white'}`}>
                    {store.activeTab === 'editor' && store.explorerTab === 'rules' && <DiffPanel workspaceID={store.selectedWorkspace} />}
                    {store.activeTab === 'editor' && store.explorerTab === 'watchlists' && <WatchlistWorkspace />}
                    {store.activeTab === 'markdown' && <MarkdownWorkspace />}
                    {store.activeTab === 'sync' && <SyncManager />}
                    {store.activeTab === 'migrate' && <MigrateManager />}
                    {store.activeTab === 'settings' && (
                        <div className="absolute inset-0 p-8 overflow-y-auto">
                            <h2 className="text-2xl font-bold mb-6 flex items-center gap-2"><SettingsIcon /> Settings</h2>
                            <button onClick={() => store.setTheme(store.theme === 'dark' ? 'light' : 'dark')} className="px-4 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded text-sm transition-colors">
                                Toggle Theme (Current: {store.theme})
                            </button>
                        </div>
                    )}
                </main>
            </div>
        </div>
    );
}

export default App;