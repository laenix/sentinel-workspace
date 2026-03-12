import React, { useState } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { 
    RefreshCw, GitCommit, FileText, ChevronDown, ChevronRight, 
    Check, MoreHorizontal, FilePlus, FileMinus, Trash2
} from 'lucide-react';
import { GetGitStatus, GitPush } from '../../../wailsjs/go/main/App';

export const GitSidebar: React.FC = () => {
    const store = useAppStore();
    
    // VS Code 风格的本地状态
    const [commitMsg, setCommitMsg] = useState("");
    const [isPushing, setIsPushing] = useState(false);
    const [isChangesExpanded, setIsChangesExpanded] = useState(true);

    if (store.activeTab !== 'sync') return null;

    // 手动刷新 Git 状态
    const handleRefresh = async () => {
        if (store.repoPath) {
            try {
                const changes = await GetGitStatus(store.repoPath);
                store.setGitChanges(changes || []);
            } catch (e) {
                console.error("Refresh Git Status Error:", e);
            }
        }
    };

    // 提交并推送
    const handleCommitAndPush = async () => {
        if (!store.repoPath || store.gitChanges.length === 0) return;
        setIsPushing(true);
        try {
            const msg = commitMsg.trim() || "Auto-sync rule changes via VSentry Space";
            await GitPush(store.repoPath, msg);
            setCommitMsg(""); // 提交成功后清空输入框
            await handleRefresh(); // 刷新状态列表
        } catch (err) {
            console.error("Push failed:", err);
            alert(`Push failed: ${err}`);
        } finally {
            setIsPushing(false);
        }
    };

    return (
        <section className={`w-72 flex flex-col shrink-0 border-r z-0 shadow-lg ${store.theme === 'dark' ? 'bg-[#181818] border-[#2b2b2b]' : 'bg-[#f3f4f6] border-gray-200'}`}>
            
            {/* === 顶部 Header (VS Code 风格) === */}
            <div className="h-9 px-4 flex items-center justify-between shrink-0 select-none">
                <span className="text-[11px] font-bold text-gray-300">SOURCE CONTROL</span>
                <div className="flex items-center gap-1 text-gray-400">
                    <button onClick={handleRefresh} className="p-1 hover:bg-[#323233] hover:text-gray-200 rounded transition-colors" title="Refresh">
                        <RefreshCw size={14} className={isPushing ? "animate-spin" : ""} />
                    </button>
                    <button className="p-1 hover:bg-[#323233] hover:text-gray-200 rounded transition-colors" title="Views and More Actions">
                        <MoreHorizontal size={14} />
                    </button>
                </div>
            </div>

            {/* === 提交信息输入区 === */}
            <div className="px-4 pb-3 pt-1 shrink-0 flex flex-col gap-2 border-b border-[#2b2b2b]">
                <div className="relative">
                    <textarea 
                        value={commitMsg}
                        onChange={(e) => setCommitMsg(e.target.value)}
                        placeholder="Message (Enter to commit and push)"
                        className="w-full bg-[#3c3c3c] text-gray-200 text-xs rounded-sm px-2 py-1.5 outline-none focus:border focus:border-[#007fd4] focus:bg-[#3c3c3c] placeholder-gray-500 resize-none h-16 custom-scrollbar"
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                                handleCommitAndPush();
                            }
                        }}
                    />
                </div>
                <button 
                    onClick={handleCommitAndPush}
                    disabled={isPushing || store.gitChanges.length === 0}
                    className="w-full bg-[#0e639c] hover:bg-[#1177bb] disabled:bg-[#4d4d4d] disabled:text-gray-400 text-white text-xs font-semibold py-1.5 rounded-sm transition-colors flex items-center justify-center gap-1.5"
                >
                    <Check size={14} /> {isPushing ? "Syncing..." : "Commit & Push"}
                </button>
            </div>

            {/* === 变更列表区 === */}
            <div className="flex-1 overflow-y-auto custom-scrollbar py-1 select-none">
                {/* 折叠标题行 */}
                <div 
                    className="flex items-center px-1 py-1 hover:bg-[#2a2d2e] cursor-pointer group"
                    onClick={() => setIsChangesExpanded(!isChangesExpanded)}
                >
                    <div className="text-gray-400 mr-1 transition-transform">
                        {isChangesExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    </div>
                    <span className="text-[11px] font-bold text-gray-300">Changes</span>
                    <span className="ml-2 bg-[#4d4d4d] text-gray-200 text-[10px] px-1.5 rounded-full font-mono">
                        {store.gitChanges.length}
                    </span>
                </div>
                
                {/* 文件列表 */}
                {isChangesExpanded && (
                    <div className="flex flex-col pb-2 mt-1">
                        {store.gitChanges.length === 0 ? (
                            <div className="px-6 py-2 text-xs text-gray-500 italic flex items-center gap-2">
                                <GitCommit size={14} /> No active changes.
                            </div>
                        ) : (
                            store.gitChanges.map((file, idx) => {
                                // 🚀 终极防弹解析：兼容 Wails 序列化差异，并同时支持 Windows(\) 和 Mac/Linux(/) 路径分割
                                const rawName = file.name || (file as any).Name || "Unknown_File";
                                const parts = rawName.split(/[/\\]/); 
                                const fileName = parts.pop() || rawName;
                                const dirPath = parts.join('/');

                                // VS Code 严谨配色与图标推导
                                let colorStr = "text-gray-300"; // 默认文件名颜色
                                let badgeColor = "text-gray-500";
                                let displayState = file.state;
                                let FileIcon = FileText;
                                
                                if (file.state.includes('M')) { 
                                    colorStr = "text-[#e2c08d]"; // VS Code 黄色
                                    badgeColor = "text-[#e2c08d]"; 
                                    displayState = "M"; 
                                } else if (file.state.includes('?') || file.state.includes('A')) { 
                                    colorStr = "text-[#73c991]"; // VS Code 绿色
                                    badgeColor = "text-[#73c991]"; 
                                    displayState = "U"; 
                                    FileIcon = FilePlus;
                                } else if (file.state.includes('D')) { 
                                    colorStr = "text-[#f14c4c]"; // VS Code 红色
                                    badgeColor = "text-[#f14c4c]"; 
                                    displayState = "D"; 
                                    FileIcon = FileMinus;
                                }

                                return (
                                    <div key={idx} className="group flex items-center justify-between px-6 py-[3px] hover:bg-[#2a2d2e] cursor-pointer transition-colors">
                                        <div className="flex items-baseline gap-2 overflow-hidden flex-1 pr-2">
                                            <FileIcon size={14} className={`${colorStr} shrink-0 translate-y-[2px]`} />
                                            {/* 文件名 */}
                                            <span className={`text-[13px] truncate ${colorStr}`} title={fileName}>
                                                {fileName}
                                            </span>
                                            {/* 极简内联路径 (紧贴在文件名右侧) */}
                                            {dirPath && (
                                                <span className="text-[11px] text-[#858585] truncate shrink" title={dirPath}>
                                                    {dirPath}
                                                </span>
                                            )}
                                        </div>
                                        
                                        {/* 右侧状态徽章与隐藏的快捷动作 (Hover显示) */}
                                        <div className="flex items-center shrink-0">
                                            {/* 🚀 修复 Lucide 图标报错：将 title 移至外层 button 容器 */}
                                            <div className="hidden group-hover:flex items-center gap-1 text-gray-400 mr-2">
                                                <button title="Discard Changes" className="hover:text-gray-200">
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>
                                            <span className={`text-[12px] font-bold w-4 text-right ${badgeColor}`}>
                                                {displayState}
                                            </span>
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                )}
            </div>
        </section>
    );
};