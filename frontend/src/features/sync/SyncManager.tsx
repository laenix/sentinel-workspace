import React, { useState, useEffect } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { CloudDownload, CloudUpload, GitPullRequest, GitCommit, FolderGit2, Save, FolderOpen, Database, ShieldAlert } from 'lucide-react';
import { 
    GitPull, GitPush, GetGitRemote, SetGitRemote, SelectLocalRepoPath, 
    RunPullSync, PushRulesToAzure, PullWatchlistsFromAzure, PushWatchlistsToAzure 
} from '../../../wailsjs/go/main/App'; 
import { EventsOn, EventsOff } from '../../../wailsjs/runtime/runtime';

export const SyncManager: React.FC = () => {
    const store = useAppStore();
    const [logs, setLogs] = useState<string>("Ready for operation.\n");
    const [syncing, setSyncing] = useState(false);
    const [remoteUrl, setRemoteUrl] = useState("");
    const [savingRemote, setSavingRemote] = useState(false);

    // 🚀 新增：控制当前 Azure 同步管线操作哪种资产
    const [syncType, setSyncType] = useState<'rules' | 'watchlists'>('rules');

    const appendLog = (msg: string) => {
        setLogs(prev => prev + `\n[${new Date().toLocaleTimeString()}] ${msg}`);
    };

    useEffect(() => {
        const fetchRemote = async () => {
            if (!store.repoPath) return;
            try {
                const url = await GetGitRemote(store.repoPath);
                setRemoteUrl(url || "");
            } catch (err) {
                console.error("Failed to fetch remote:", err);
            }
        };
        fetchRemote();
    }, [store.repoPath]);

    // 🚀 监听来自 Go 后端的实时进度流
    useEffect(() => {
        EventsOn("sync-log", (msg: string) => {
            appendLog(msg);
        });
        
        // 组件卸载时清理监听器，防止内存泄漏
        return () => {
            EventsOff("sync-log");
        };
    }, []);

    const getAzureContext = () => {
        const activeSub = store.subscriptions?.find(s => s.id === store.selectedSub);
        const subName = activeSub?.name || store.localSub || "DefaultSub";
        let rgName = store.localRg || "DefaultRG";
        let wsName = store.selectedWorkspace || store.localWs || "DefaultWS";

        const activeWs = store.workspaces?.find(w => w.name === store.selectedWorkspace || w.id === store.selectedWorkspace);
        if (activeWs) {
            if (activeWs.resourceGroup) rgName = activeWs.resourceGroup;
            else if (activeWs.id) {
                const rgMatch = activeWs.id.match(/resourcegroups\/([^\/]+)/i);
                if (rgMatch) rgName = rgMatch[1];
            }
            if (activeWs.name) wsName = activeWs.name;
        }
        return { subName, rgName, wsName };
    };

    const { subName, rgName, wsName } = getAzureContext();

    // ==========================================
    // 动作 1：Git 版本控制管线
    // ==========================================
    const handleBrowseDir = async () => {
        try {
            const dir = await SelectLocalRepoPath();
            if (dir) {
                store.setRepoPath(dir);
                appendLog(`[Git] 切换本地工作区根目录: ${dir}`);
            }
        } catch (err) { console.error(err); }
    };

    const handleSetRemote = async () => {
        if (!store.repoPath || !remoteUrl) {
            alert("Local Base Path and Remote URL cannot be empty.");
            return;
        }
        setSavingRemote(true);
        appendLog(`[Git] 正在配置远程仓库: ${remoteUrl}...`);
        try {
            await SetGitRemote(store.repoPath, remoteUrl);
            appendLog(`✅ [Git] 远程仓库配置成功!`);
        } catch (err) {
            appendLog(`❌ [Git] 远程仓库配置失败:\n${err}`);
        } finally {
            setSavingRemote(false);
        }
    };

    const handleGitPull = async () => {
        if (!store.repoPath) return;
        setSyncing(true);
        appendLog("[Git] 执行 'git pull' 拉取团队最新代码...");
        try {
            const result = await GitPull(store.repoPath);
            appendLog(`✅ [Git] 拉取成功:\n${result}`);
            store.triggerGitRefresh();
        } catch (err) {
            appendLog(`❌ [Git] 拉取失败:\n${err}`);
        } finally {
            setSyncing(false);
        }
    };

    const handleGitPush = async () => {
        if (!store.repoPath) return;
        setSyncing(true);
        appendLog("[Git] 正在提交本地修改并推送到远程仓库...");
        try {
            const result = await GitPush(store.repoPath, "VSentry: Auto-sync modifications");
            appendLog(`✅ [Git] 推送成功:\n${result}`);
            store.triggerGitRefresh(); 
        } catch (err) {
            appendLog(`❌ [Git] 推送失败:\n${err}`);
        } finally {
            setSyncing(false);
        }
    };

    // ==========================================
    // 动作 2：Azure 业务同步管线 (智能路由)
    // ==========================================
    const handleAzurePull = async () => {
        if (!store.selectedSub || !store.selectedWorkspace || !store.repoPath) {
            alert("❌ 请确保已连接 Azure 并选择了本地和云端工作空间！");
            return;
        }
        // 🚀 补全：检查 localUser 和 localTenant
        if (!store.localTenant) {
            alert("❌ 请在顶部确保已经有了 Tenant 上下文！");
            return;
        }

        setSyncing(true);
        appendLog(`[Azure] 开始从工作空间 (${wsName}) 拉取 ${syncType === 'rules' ? 'Alert Rules' : 'Watchlists'}...`);
        
        try {
            if (syncType === 'rules') {
                // 🚀 补全：需要 localUser 和 localTenant
                const result = await RunPullSync(store.repoPath, store.localTenant, store.selectedSub, subName, rgName, wsName);
                appendLog(`✅ [Azure] Rules 拉取完成。本地 Markdown 已生成/更新。\n${result || ''}`);
            } else {
                // 🚀 补全：需要 localUser 和 localTenant
                const result = await PullWatchlistsFromAzure(store.repoPath, store.localTenant, subName, store.selectedSub, rgName, wsName);
                const msg = `成功拉取 ${result.successCount} 个 Watchlist。` + (result.errors?.length ? `\n警告: ${result.errors.join('; ')}` : '');
                appendLog(`✅ [Azure] Watchlists 拉取完成。\n${msg}`);
            }
            store.triggerGitRefresh(); 
        } catch (err) {
            appendLog(`❌ [Azure] 拉取失败:\n${err}`);
        } finally {
            setSyncing(false);
        }
    };

    const handleAzurePush = async () => {
        if (!store.selectedSub || !store.selectedWorkspace || !store.repoPath) {
            alert("❌ 请确保已连接 Azure 并选择了本地和云端工作空间！");
            return;
        }
        // 🚀 补全：检查 localUser 和 localTenant
        if (!store.localTenant) {
            alert("❌ 请在顶部确保已经有了 Tenant 上下文！");
            return;
        }
        setSyncing(true);
        appendLog(`[Azure] 正在将本地 ${syncType === 'rules' ? 'Alert Rules' : 'Watchlists'} 部署到 (${wsName})...`);
        
        try {
            if (syncType === 'rules') {
                // 🚀 补全：需要 localUser 和 localTenant
                const result = await PushRulesToAzure(store.repoPath, store.localTenant, subName, store.selectedSub, rgName, wsName);
                const msg = `成功推送 ${result.successCount} 条 Rule。` + (result.errors?.length ? `\n警告: ${result.errors.join('; ')}` : '');
                appendLog(`✅ [Azure] Rules 部署完成。\n${msg}`);
            } else {
                // 🚀 补全：需要 localUser 和 localTenant
                const result = await PushWatchlistsToAzure(store.repoPath, store.localTenant, subName, store.selectedSub, rgName, wsName);
                const msg = `成功推送 ${result.successCount} 个 Watchlist。` + (result.errors?.length ? `\n警告: ${result.errors.join('; ')}` : '');
                appendLog(`✅ [Azure] Watchlists 部署完成。\n${msg}`);
            }
            store.triggerGitRefresh(); 
        } catch (err) {
            appendLog(`❌ [Azure] 部署失败:\n${err}`);
        } finally {
            setSyncing(false);
        }
    };

    return (
        <div className="flex flex-col h-full bg-[#0d1117] text-gray-300 p-6 overflow-hidden">
            <div className="flex items-center gap-3 mb-6 shrink-0">
                <FolderGit2 size={24} className="text-gray-400" />
                <h1 className="text-2xl font-bold text-gray-200 tracking-tight">GitOps & Azure Sync</h1>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 flex flex-col gap-6">
                
                {/* --- 板块 1：Git 版本控制 (保持不变) --- */}
                <section className="bg-[#010409] border border-gray-800 rounded-lg p-5 shadow-sm">
                    <div className="flex items-center gap-2 mb-4 border-b border-gray-800 pb-2">
                        <FolderGit2 size={16} className="text-purple-400" />
                        <h2 className="text-sm font-bold text-gray-200 uppercase tracking-widest">1. Version Control (Global Git)</h2>
                    </div>
                    
                    <div className="flex flex-col gap-4 mb-4">
                        <div>
                            <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1">Local Base Path (Git Root)</div>
                            <div className="flex gap-2">
                                <input readOnly value={store.repoPath} className="flex-1 bg-[#0d1117] border border-gray-800 p-2 rounded text-xs font-mono text-gray-400" />
                                <button onClick={handleBrowseDir} className="bg-gray-800 hover:bg-gray-700 text-gray-300 px-4 py-2 rounded text-xs font-bold transition-all border border-gray-700 flex items-center gap-2">
                                    <FolderOpen size={14} /> BROWSE
                                </button>
                            </div>
                        </div>

                        <div>
                            <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1">Git Remote Origin</div>
                            <div className="flex gap-2">
                                <input type="text" value={remoteUrl} onChange={(e) => setRemoteUrl(e.target.value)} placeholder="git@github.com:your-org/sentinel-rules.git" className="flex-1 bg-[#0d1117] border border-gray-800 p-2 rounded text-xs font-mono text-gray-300 focus:border-purple-500 outline-none" />
                                <button onClick={handleSetRemote} disabled={savingRemote || !remoteUrl} className="bg-gray-800 hover:bg-gray-700 text-gray-300 px-4 py-2 rounded text-xs font-bold transition-all border border-gray-700 flex items-center gap-2">
                                    <Save size={14} /> {savingRemote ? "SAVING..." : "SET REMOTE"}
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <ActionCard title="GIT PULL (From Remote)" desc="Fetch latest team changes to local." icon={<GitPullRequest className="text-purple-400" />} onClick={handleGitPull} disabled={syncing || !remoteUrl} hoverColor="hover:border-purple-500/50" />
                        <ActionCard title="GIT PUSH (To Remote)" desc="Commit all changes and push to Git." icon={<GitCommit className="text-orange-400" />} onClick={handleGitPush} disabled={syncing || !remoteUrl} hoverColor="hover:border-orange-500/50" />
                    </div>
                </section>

                {/* --- 板块 2：Azure 业务同步 --- */}
                <section className="bg-[#010409] border border-gray-800 rounded-lg p-5 shadow-sm">
                    <div className="flex items-center justify-between mb-4 border-b border-gray-800 pb-2">
                        <div className="flex items-center gap-2">
                            <Database size={16} className="text-blue-400" />
                            <h2 className="text-sm font-bold text-gray-200 uppercase tracking-widest">2. Azure Deployment (Target Context)</h2>
                        </div>
                        
                        {/* 🚀 资产类型选项卡 */}
                        <div className="flex bg-[#161b22] rounded border border-gray-800 p-1">
                            <button 
                                onClick={() => setSyncType('rules')}
                                className={`flex items-center gap-1.5 px-3 py-1 text-[10px] font-bold uppercase tracking-wider rounded transition-all ${syncType === 'rules' ? 'bg-purple-600/20 text-purple-400 shadow-sm' : 'text-gray-500 hover:text-gray-300'}`}
                            >
                                <ShieldAlert size={12} /> Rules
                            </button>
                            <button 
                                onClick={() => setSyncType('watchlists')}
                                className={`flex items-center gap-1.5 px-3 py-1 text-[10px] font-bold uppercase tracking-wider rounded transition-all ${syncType === 'watchlists' ? 'bg-blue-600/20 text-blue-400 shadow-sm' : 'text-gray-500 hover:text-gray-300'}`}
                            >
                                <Database size={12} /> Watchlists
                            </button>
                        </div>
                    </div>

                    <div className="bg-[#0d1117] border border-blue-900/30 rounded p-3 mb-4 flex gap-4 text-xs font-mono">
                        <div className="flex-1"><span className="text-gray-500 block mb-1">Target Subscription</span><span className="text-blue-300">{subName}</span></div>
                        <div className="flex-1"><span className="text-gray-500 block mb-1">Target Resource Group</span><span className="text-blue-300">{rgName}</span></div>
                        <div className="flex-1"><span className="text-gray-500 block mb-1">Target Workspace</span><span className="text-blue-300">{wsName}</span></div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <ActionCard 
                            title={`AZURE PULL (${syncType === 'rules' ? 'Rules' : 'Watchlists'})`} 
                            desc={`Fetch Azure ${syncType} and save to local disk.`} 
                            icon={<CloudDownload className="text-blue-400" />} 
                            onClick={handleAzurePull} 
                            disabled={syncing} 
                            hoverColor="hover:border-blue-500/50" 
                        />
                        <ActionCard 
                            title={`AZURE PUSH (${syncType === 'rules' ? 'Rules' : 'Watchlists'})`} 
                            desc={`Deploy local ${syncType} modifications back to Azure.`} 
                            icon={<CloudUpload className="text-emerald-400" />} 
                            onClick={handleAzurePush} 
                            disabled={syncing} 
                            hoverColor="hover:border-emerald-500/50" 
                        />
                    </div>
                </section>
            </div>

            {/* --- Console --- */}
            <div className="h-48 flex flex-col bg-[#010409] border border-gray-800 rounded-lg overflow-hidden shrink-0 mt-4">
                <div className="h-8 bg-[#161b22] border-b border-gray-800 flex items-center px-4 shrink-0">
                    <span className="text-[10px] font-bold text-gray-500 tracking-widest uppercase">SYNC CONSOLE</span>
                </div>
                <div className="flex-1 p-4 font-mono text-xs text-gray-400 overflow-y-auto custom-scrollbar whitespace-pre-wrap">
                    {logs}
                </div>
            </div>
        </div>
    );
};

const ActionCard = ({ title, desc, icon, onClick, disabled, hoverColor }: any) => (
    <button onClick={onClick} disabled={disabled} className={`flex flex-col text-left p-4 rounded bg-[#0d1117] border border-gray-800 transition-all ${disabled ? 'opacity-50 cursor-not-allowed' : `hover:bg-[#161b22] ${hoverColor}`}`}>
        <div className="flex items-center gap-3 mb-1">
            {icon}
            <span className="font-bold text-gray-200 text-sm">{title}</span>
        </div>
        <p className="text-xs text-gray-500 ml-7">{desc}</p>
    </button>
);