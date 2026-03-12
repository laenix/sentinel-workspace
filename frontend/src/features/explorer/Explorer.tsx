import React, { useState, useEffect } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { GetLocalRulesList, GetLocalRuleContent, ScanLocalContexts, GetLocalWatchlistsList } from '../../../wailsjs/go/main/App';
import { Virtuoso } from 'react-virtuoso';
import { FileCode, FolderGit2, BookOpen, ShieldAlert, Database, Search } from 'lucide-react';
import { extractKqlFromMarkdown } from '../../lib/utils';

export const Explorer: React.FC = () => {
    const store = useAppStore();
    
    // 我们把两个列表的数据都存在局部 state，根据 tab 切换显示
    const [ruleList, setRuleList] = useState<string[]>([]);
    const [watchlistList, setWatchlistList] = useState<string[]>([]);
    
    // 局部的搜索状态
    const [searchTerm, setSearchTerm] = useState("");

    // 1. 初始化扫描上下文
    useEffect(() => {
        const scanLocalDirs = async () => {
            if (!store.repoPath) return;
            try {
                const contexts = await ScanLocalContexts(store.repoPath);
                store.setLocalContexts(contexts || []);
                if (contexts && contexts.length > 0 && !store.localWs) {
                    store.setLocalContext(contexts[0].tenantName, contexts[0].subscription, contexts[0].resourceGroup, contexts[0].workspace);
                }
            } catch (err) { console.error("扫描本地目录失败:", err); }
        };
        scanLocalDirs();
    }, [store.repoPath, store.refreshKey]);

    // 2. 动态拉取当前选中环境的 Rules 和 Watchlists
    useEffect(() => {
        const fetchAssets = async () => {
            if (!store.localSub || !store.localRg || !store.localWs || !store.repoPath) {
                setRuleList([]);
                setWatchlistList([]);
                return;
            }
            try {
                // 并发拉取两个列表
                const [rules, watchlists] = await Promise.all([
                    GetLocalRulesList(store.repoPath,  store.localTenant, store.localSub, store.localRg, store.localWs),
                    GetLocalWatchlistsList(store.repoPath, store.localTenant, store.localSub, store.localRg, store.localWs)
                ]);
                setRuleList(rules || []);
                setWatchlistList(watchlists || []);
            } catch (err) {
                console.error("加载本地资产列表失败:", err);
            }
        };
        fetchAssets();
    }, [store.repoPath, store.localTenant, store.localSub, store.localRg, store.localWs, store.refreshKey]);

    // 3. 处理 Rule 的点击
    const handleRuleClick = async (fileName: string) => {
        if (!store.localSub || !store.localWs) return;
        try {
            const raw = await GetLocalRuleContent(store.repoPath,  store.localTenant, store.localSub, store.localRg, store.localWs, fileName);
            store.setRawMarkdown(raw);
            store.setSelectedFile(fileName);
            store.setSelectedWatchlist(""); // 互斥清理
            store.setBaselineKql(extractKqlFromMarkdown(raw));
        } catch (err) { console.error("读取文件失败:", err); }
    };

    // 4. 处理 Watchlist 的点击
    const handleWatchlistClick = (alias: string) => {
        store.setSelectedWatchlist(alias);
        store.setSelectedFile(""); // 互斥清理
        // 注意：这里不需要发请求，右侧的 WatchlistEditor 挂载后会自己去拉 JSON 和 CSV
    };

    // 动态过滤当前 Tab 的数据
    const currentData = store.explorerTab === 'rules' ? ruleList : watchlistList;
    const filteredData = currentData.filter(name => name.toLowerCase().includes(searchTerm.toLowerCase()));

    return (
        <section className={`w-64 flex flex-col shrink-0 border-r z-0 transition-colors ${store.theme === 'dark' ? 'bg-[#0d1117] border-gray-800' : 'bg-[#f3f4f6] border-gray-200'}`}>
            
            {/* === 顶部：极客风分段控制器 === */}
            <div className="p-3 border-b border-gray-800 bg-[#010409]">
                <div className="flex p-1 bg-[#161b22] rounded border border-gray-800">
                    <button 
                        onClick={() => { store.setExplorerTab('rules'); setSearchTerm(''); }}
                        className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded transition-all ${store.explorerTab === 'rules' ? 'bg-purple-600/20 text-purple-400 shadow-sm' : 'text-gray-500 hover:text-gray-300'}`}
                    >
                        <ShieldAlert size={12} /> Rules
                    </button>
                    <button 
                        onClick={() => { store.setExplorerTab('watchlists'); setSearchTerm(''); }}
                        className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded transition-all ${store.explorerTab === 'watchlists' ? 'bg-blue-600/20 text-blue-400 shadow-sm' : 'text-gray-500 hover:text-gray-300'}`}
                    >
                        <Database size={12} /> Watchlists
                    </button>
                </div>
            </div>

            {/* === 搜索框 === */}
            <div className="px-3 py-2 border-b border-gray-800 bg-[#0d1117]/50">
                <div className="relative">
                    <input 
                        type="text" 
                        placeholder={`Search ${store.explorerTab}...`}
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        className="w-full bg-[#161b22] border border-gray-800 text-[10px] rounded pl-7 pr-2 py-1.5 outline-none focus:border-purple-500 transition-colors text-gray-300"
                    />
                    <Search size={12} className="absolute left-2.5 top-2 text-gray-500" />
                </div>
            </div>

            {/* === 数据列表 === */}
            <div className="flex-1 overflow-y-auto custom-scrollbar relative">
                {currentData.length === 0 ? (
                    <div className="p-4 text-xs text-gray-600 text-center italic mt-4">
                        {store.explorerTab === 'rules' ? "No Rules found in this workspace." : "No Watchlists found in this workspace."}
                    </div>
                ) : filteredData.length === 0 ? (
                    <div className="p-4 text-xs text-gray-600 text-center italic mt-4">No results match your search.</div>
                ) : (
                    <Virtuoso
                        data={filteredData}
                        itemContent={(_, name) => {
                            const isRule = store.explorerTab === 'rules';
                            const isSelected = isRule ? store.selectedFile === name : store.selectedWatchlist === name;
                            
                            return (
                                <div 
                                    onClick={() => isRule ? handleRuleClick(name) : handleWatchlistClick(name)} 
                                    className={`px-4 py-1.5 cursor-pointer text-xs flex items-center gap-2 group border-l-2 transition-colors ${isSelected ? 'bg-[#161b22] border-purple-500' : 'border-transparent hover:bg-[#161b22]/50 hover:border-gray-700'}`}
                                >
                                    {isRule ? (
                                        <FileCode size={14} className={`shrink-0 ${isSelected ? 'text-purple-400' : 'text-gray-600 group-hover:text-purple-400'}`} />
                                    ) : (
                                        <Database size={14} className={`shrink-0 ${isSelected ? 'text-blue-400' : 'text-gray-600 group-hover:text-blue-400'}`} />
                                    )}
                                    <span className={`truncate ${isSelected ? 'text-white font-bold' : 'text-gray-400 group-hover:text-gray-200'}`}>
                                        {name}
                                    </span>
                                </div>
                            );
                        }}
                    />
                )}
            </div>
        </section>
    );
};