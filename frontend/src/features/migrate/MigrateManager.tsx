import React, { useState, useEffect } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { Rocket, ShieldAlert, ArrowRight, ArrowLeft, Database, FolderGit2, RefreshCw, Search } from 'lucide-react';
import { 
    GetLocalRulesList, 
    GetLocalWatchlistsList, 
    MigrateSelectedRulesToAzure, 
    MigrateSelectedWatchlistsToAzure 
} from '../../../wailsjs/go/main/App';

export const MigrateManager: React.FC = () => {
    const store = useAppStore();
    const [logs, setLogs] = useState<string>("Ready for cross-tenant migration.\n");
    const [isMigrating, setIsMigrating] = useState(false);

    // 🚀 控制当前迁移哪种资产
    const [migrateType, setMigrateType] = useState<'rules' | 'watchlists'>('rules');

    // 左侧：Source 状态
    const [srcSub, setSrcSub] = useState("");
    const [srcRg, setSrcRg] = useState("");
    const [srcWs, setSrcWs] = useState("");
    
    // 右侧：Target 状态 (脱离顶部导航栏，独立控制)
    const [tgtSubId, setTgtSubId] = useState("");
    const [tgtRg, setTgtRg] = useState("");
    const [tgtWsName, setTgtWsName] = useState("");
    
    const [availableFiles, setAvailableFiles] = useState<string[]>([]);
    const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
    const [searchTerm, setSearchTerm] = useState("");

    const appendLog = (msg: string) => setLogs(prev => prev + `\n[${new Date().toLocaleTimeString()}] ${msg}`);

    // 1. 监听 Source 上下文和 migrateType 变化，动态拉取列表 (基于 4 层架构)
    useEffect(() => {
        const fetchSourceFiles = async () => {
            // 🚀 核心修正：只依赖 localTenant，不再需要 localUser
            if (store.repoPath && store.localTenant && srcSub && srcRg && srcWs) {
                try {
                    let items: string[] = [];
                    if (migrateType === 'rules') {
                        items = await GetLocalRulesList(store.repoPath, store.localTenant, srcSub, srcRg, srcWs) || [];
                    } else {
                        items = await GetLocalWatchlistsList(store.repoPath, store.localTenant, srcSub, srcRg, srcWs) || [];
                    }
                    setAvailableFiles(items);
                    setSelectedFiles([]); 
                    setSearchTerm(""); 
                    appendLog(`[Source] Scanned ${items.length} ${migrateType} from local directory.`);
                } catch (err) {
                    console.error("Failed to load source files:", err);
                    setAvailableFiles([]);
                }
            } else {
                setAvailableFiles([]);
                setSelectedFiles([]);
            }
        };
        fetchSourceFiles();
    }, [store.repoPath, store.localTenant, srcSub, srcRg, srcWs, migrateType]);

    // 穿梭框交互逻辑
    const moveToSelected = (file: string) => {
        setAvailableFiles(prev => prev.filter(f => f !== file));
        setSelectedFiles(prev => [...prev, file].sort());
    };
    const moveToAvailable = (file: string) => {
        setSelectedFiles(prev => prev.filter(f => f !== file));
        setAvailableFiles(prev => [...prev, file].sort());
    };
    
    const filteredAvailable = availableFiles.filter(f => 
        f.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const moveAllToSelected = () => {
        const filesToMove = filteredAvailable;
        setSelectedFiles(prev => [...prev, ...filesToMove].sort());
        setAvailableFiles(prev => prev.filter(f => !filesToMove.includes(f)));
    };
    const moveAllToAvailable = () => {
        setAvailableFiles(prev => [...prev, ...selectedFiles].sort());
        setSelectedFiles([]);
    };

    // 2. 动态计算 Target 的可用 RG 和 WS
    const targetRgs = Array.from(new Set(
        (store.workspaces || [])
        .filter(w => !tgtSubId || w.id?.toLowerCase().includes(tgtSubId.toLowerCase()))
        .map(w => {
            const match = w.id?.match(/resourcegroups\/([^\/]+)/i);
            return match ? match[1] : w.resourceGroup;
        })
        .filter(Boolean) as string[]
    ));

    const targetWss = (store.workspaces || [])
        .filter(w => {
            const subMatch = !tgtSubId || w.id?.toLowerCase().includes(tgtSubId.toLowerCase());
            const rgMatch = !tgtRg || w.id?.toLowerCase().includes(`/resourcegroups/${tgtRg.toLowerCase()}/`) || w.resourceGroup?.toLowerCase() === tgtRg.toLowerCase();
            return subMatch && rgMatch;
        })
        .map(w => w.name)
        .filter(Boolean) as string[];

    // 3. 执行迁移核心逻辑
    const handleExecuteMigration = async () => {
        if (!store.repoPath) return alert("Please select Local Base Path in GitOps Sync tab first.");
        if (!store.localTenant) return alert("Please select a Local Tenant in the top navigation bar.");
        if (selectedFiles.length === 0) return alert(`Please select at least one ${migrateType} to migrate.`);
        if (!tgtSubId || !tgtRg || !tgtWsName) return alert("Please select complete Target destination (Sub, RG, WS).");

        const activeSub = store.subscriptions?.find(s => s.id === tgtSubId);
        const tgtSubName = activeSub?.name || tgtSubId;

        const confirmMsg = `Migrating ${selectedFiles.length} ${migrateType} to Target [${tgtWsName}].\nAre you sure you want to proceed?`;
        if (!window.confirm(confirmMsg)) return;

        setIsMigrating(true);
        appendLog(`🚀 STARTING MIGRATION (${migrateType.toUpperCase()})...`);
        appendLog(`[Source] Tenant: ${store.localTenant} | WS: ${srcWs}`);
        appendLog(`[Target] Azure Workspace: ${tgtWsName} (Sub: ${tgtSubName})`);

        try {
            let result: any;
            if (migrateType === 'rules') {
                // 🚀 核心修正：传入 4 层参数 (store.localTenant, srcSub, srcRg, srcWs)
                result = await MigrateSelectedRulesToAzure(
                    store.repoPath, store.localTenant, srcSub, srcRg, srcWs, 
                    tgtSubId, tgtRg, tgtWsName, 
                    selectedFiles
                );
            } else {
                // 🚀 核心修正：传入 4 层参数 (store.localTenant, srcSub, srcRg, srcWs)
                result = await MigrateSelectedWatchlistsToAzure(
                    store.repoPath, store.localTenant, srcSub, srcRg, srcWs, 
                    tgtSubName, tgtSubId, tgtRg, tgtWsName, 
                    selectedFiles
                );
            }

            if (result.successes && result.successes.length > 0) {
                appendLog(`✅ Successfully migrated ${result.successes.length} ${migrateType}.`);
            }
            if (result.errors && result.errors.length > 0) {
                appendLog(`❌ Migration finished with ${result.errors.length} errors:`);
                result.errors.forEach((e: string) => appendLog(`   - ${e}`));
            }
        } catch (err) {
            appendLog(`❌ FATAL EXCEPTION: ${err}`);
        } finally {
            setIsMigrating(false);
        }
    };

    return (
        <div className="flex flex-col h-full bg-[#0d1117] text-gray-300 p-6 overflow-hidden">
            <div className="flex items-center justify-between mb-6 shrink-0">
                <div className="flex items-center gap-3">
                    <Rocket size={24} className="text-purple-500" />
                    <h1 className="text-2xl font-bold text-gray-200 tracking-tight">Tenant Migration Hub</h1>
                </div>

                <div className="flex bg-[#161b22] rounded border border-gray-800 p-1">
                    <button 
                        onClick={() => setMigrateType('rules')}
                        className={`flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold uppercase tracking-wider rounded transition-all ${migrateType === 'rules' ? 'bg-purple-600/20 text-purple-400 shadow-sm' : 'text-gray-500 hover:text-gray-300'}`}
                    >
                        <ShieldAlert size={14} /> Rules
                    </button>
                    <button 
                        onClick={() => setMigrateType('watchlists')}
                        className={`flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold uppercase tracking-wider rounded transition-all ${migrateType === 'watchlists' ? 'bg-blue-600/20 text-blue-400 shadow-sm' : 'text-gray-500 hover:text-gray-300'}`}
                    >
                        <Database size={14} /> Watchlists
                    </button>
                </div>
            </div>

            <div className="flex flex-1 gap-6 overflow-hidden min-h-[400px]">
                <section className="flex-1 flex flex-col bg-[#010409] border border-gray-800 rounded-lg p-4 shadow-sm overflow-hidden relative">
                    <div className={`absolute top-0 left-0 w-full h-1 ${migrateType === 'rules' ? 'bg-purple-500/50' : 'bg-blue-500/50'}`}></div>
                    
                    <div className="flex items-center gap-2 mb-4 pb-2 border-b border-gray-800 shrink-0 mt-2">
                        <FolderGit2 size={16} className={migrateType === 'rules' ? "text-purple-400" : "text-blue-400"} />
                        <h2 className="text-xs font-bold text-gray-200 uppercase tracking-widest">1. Source (Local Data)</h2>
                    </div>
                    
                    <div className="flex flex-col gap-2 mb-4 shrink-0">
                        {/* 🚀 核心修正：只根据 store.localTenant 过滤 Source 下拉框选项 */}
                        <select className="bg-[#0d1117] border border-gray-800 text-xs p-2 rounded outline-none focus:border-purple-500" value={srcSub} onChange={e => { setSrcSub(e.target.value); setSrcRg(""); setSrcWs(""); }}>
                            <option value="">-- Select Source Sub --</option>
                            {Array.from(new Set(store.localContexts.filter(c => c.tenantName === store.localTenant).map(c => c.subscription))).map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                        <select className="bg-[#0d1117] border border-gray-800 text-xs p-2 rounded outline-none focus:border-purple-500" value={srcRg} onChange={e => { setSrcRg(e.target.value); setSrcWs(""); }}>
                            <option value="">-- Select Source RG --</option>
                            {Array.from(new Set(store.localContexts.filter(c => c.tenantName === store.localTenant && c.subscription === srcSub).map(c => c.resourceGroup))).map(rg => <option key={rg} value={rg}>{rg}</option>)}
                        </select>
                        <select className="bg-[#0d1117] border border-gray-800 text-xs p-2 rounded outline-none focus:border-purple-500" value={srcWs} onChange={e => setSrcWs(e.target.value)}>
                            <option value="">-- Select Source WS --</option>
                            {Array.from(new Set(store.localContexts.filter(c => c.tenantName === store.localTenant && c.subscription === srcSub && c.resourceGroup === srcRg).map(c => c.workspace))).map(ws => <option key={ws} value={ws}>{ws}</option>)}
                        </select>
                    </div>

                    <div className="flex items-center justify-between mb-2 shrink-0">
                        <div className="text-[10px] font-bold text-gray-500 uppercase">AVAILABLE {migrateType} ({filteredAvailable.length})</div>
                        <div className="relative w-48">
                            <input 
                                type="text" 
                                placeholder={`Search ${migrateType}...`} 
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                                className="w-full bg-[#161b22] border border-gray-800 text-xs rounded pl-7 pr-2 py-1 outline-none focus:border-purple-500 transition-colors"
                            />
                            <Search size={12} className="absolute left-2.5 top-1.5 text-gray-500" />
                        </div>
                    </div>

                    <div className="flex-1 border border-gray-800 bg-[#0d1117] rounded overflow-y-auto custom-scrollbar p-1">
                        {filteredAvailable.length === 0 ? (
                            <div className="text-center text-xs text-gray-600 mt-4 italic">
                                {store.localTenant ? 'No items found...' : 'Please select a Local Tenant in the top bar first.'}
                            </div>
                        ) : (
                            filteredAvailable.map(f => (
                                <div key={f} onClick={() => moveToSelected(f)} className="text-xs p-1.5 hover:bg-[#161b22] cursor-pointer truncate text-gray-400 hover:text-white transition-colors">
                                    {f}
                                </div>
                            ))
                        )}
                    </div>
                </section>

                <div className="w-16 flex flex-col items-center justify-center gap-4 shrink-0">
                    <button onClick={moveAllToSelected} disabled={filteredAvailable.length === 0} className="p-2 bg-[#161b22] border border-gray-800 hover:border-purple-500 disabled:opacity-30 rounded text-white transition-colors shadow-sm" title="Move All Visible">
                        <ArrowRight size={16} />
                    </button>
                    <button onClick={moveAllToAvailable} disabled={selectedFiles.length === 0} className="p-2 bg-[#161b22] border border-gray-800 hover:border-gray-500 disabled:opacity-30 rounded text-white transition-colors shadow-sm" title="Remove All">
                        <ArrowLeft size={16} />
                    </button>
                </div>

                <section className="flex-1 flex flex-col bg-[#010409] border border-gray-800 rounded-lg p-4 shadow-sm overflow-hidden relative">
                    <div className="absolute top-0 left-0 w-full h-1 bg-orange-500/50"></div>

                    <div className="flex items-center gap-2 mb-4 pb-2 border-b border-gray-800 shrink-0 mt-2">
                        <Database size={16} className="text-orange-400" />
                        <h2 className="text-xs font-bold text-gray-200 uppercase tracking-widest">2. Target (Azure Cloud)</h2>
                    </div>

                    <div className="flex flex-col gap-2 mb-4 shrink-0">
                        <select className="bg-[#0d1117] border border-gray-800 text-xs p-2 rounded outline-none focus:border-orange-500" value={tgtSubId} onChange={e => { setTgtSubId(e.target.value); setTgtRg(""); setTgtWsName(""); }}>
                            <option value="">-- Select Target Sub --</option>
                            {(store.subscriptions || []).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                        <select className="bg-[#0d1117] border border-gray-800 text-xs p-2 rounded outline-none focus:border-orange-500" value={tgtRg} onChange={e => { setTgtRg(e.target.value); setTgtWsName(""); }}>
                            <option value="">-- Select Target RG --</option>
                            {targetRgs.map(rg => <option key={rg} value={rg}>{rg}</option>)}
                        </select>
                        <select className="bg-[#0d1117] border border-gray-800 text-xs p-2 rounded outline-none focus:border-orange-500" value={tgtWsName} onChange={e => setTgtWsName(e.target.value)}>
                            <option value="">-- Select Target WS --</option>
                            {targetWss.map(ws => <option key={ws} value={ws}>{ws}</option>)}
                        </select>
                    </div>

                    <div className="text-[10px] font-bold text-gray-500 mb-2 mt-1 uppercase">SELECTED FOR MIGRATION ({selectedFiles.length})</div>
                    <div className="flex-1 border border-gray-800 bg-[#0d1117] rounded overflow-y-auto custom-scrollbar p-1">
                        {selectedFiles.map(f => (
                            <div key={f} onClick={() => moveToAvailable(f)} className="text-xs p-1.5 hover:bg-[#161b22] cursor-pointer truncate text-green-400 hover:text-green-300 transition-colors flex items-center gap-2">
                                <span className="text-[10px] bg-green-900/30 px-1 border border-green-900/50 rounded">READY</span> {f}
                            </div>
                        ))}
                    </div>
                </section>
            </div>

            <div className="mt-6 flex gap-4 h-48 shrink-0">
                <div className="flex-1 flex flex-col bg-[#010409] border border-gray-800 rounded-lg overflow-hidden">
                    <div className="h-8 bg-[#161b22] border-b border-gray-800 flex items-center px-4 shrink-0">
                        <span className="text-[10px] font-bold text-gray-500 tracking-widest uppercase">MIGRATION CONSOLE</span>
                    </div>
                    <div className="flex-1 p-4 font-mono text-xs text-gray-400 overflow-y-auto custom-scrollbar whitespace-pre-wrap">
                        {logs}
                    </div>
                </div>

                <div className="w-64 flex flex-col justify-end bg-[#010409] border border-gray-800 rounded-lg p-4 gap-4">
                    <div className="bg-[#161b22]/50 border border-gray-800 p-3 rounded text-[10px] text-gray-400 leading-relaxed font-mono">
                        {!tgtSubId || !tgtRg || !tgtWsName 
                            ? <span className="text-orange-400">⚠️ Target endpoint is incomplete. Please select Sub, RG, and WS.</span>
                            : <span className="text-green-400">✓ Target endpoint verified. Payload is ready to deploy.</span>}
                    </div>
                    <button 
                        onClick={handleExecuteMigration}
                        disabled={isMigrating || selectedFiles.length === 0 || !tgtSubId || !tgtRg || !tgtWsName}
                        className={`group relative w-full flex items-center justify-center gap-2 bg-[#161b22] disabled:bg-[#0d1117] disabled:border-gray-800 border ${migrateType === 'rules' ? 'hover:bg-purple-600 border-purple-900/50 hover:border-purple-500' : 'hover:bg-blue-600 border-blue-900/50 hover:border-blue-500'} disabled:opacity-50 disabled:cursor-not-allowed text-gray-300 hover:text-white py-3.5 rounded-lg font-bold transition-all shadow-sm active:scale-[0.98]`}
                    >
                        {isMigrating ? <RefreshCw size={16} className="animate-spin" /> : <ShieldAlert size={16} className="group-hover:text-white text-gray-400 transition-colors" />}
                        {isMigrating ? "DEPLOYING..." : "EXECUTE"}
                    </button>
                </div>
            </div>
        </div>
    );
};