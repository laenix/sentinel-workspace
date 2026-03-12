import React, { useState, useEffect, useMemo } from 'react';
import { KqlEditor } from '../editor/KqlEditor';
import { DiffTable } from './DiffTable';
import { ExecuteKql, SaveLocalRuleKql, PushSingleRuleToAzure } from '../../../wailsjs/go/main/App';
import { Play, Columns, Table as TableIcon, Zap, Save, CloudUpload, ArrowRightLeft } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';

export const DiffPanel: React.FC<{ workspaceID: string }> = ({ workspaceID }) => {
    const store = useAppStore();
    
    const [oldKql, setOldKql] = useState("");
    const [newKql, setNewKql] = useState("");
    const [oldResult, setOldResult] = useState<any[]>([]);
    const [newResult, setNewResult] = useState<any[]>([]);
    
    const [loadingOld, setLoadingOld] = useState(false);
    const [loadingNew, setLoadingNew] = useState(false);
    
    // 【核心新增】：独立追踪两侧是否真正执行过查询
    const [hasRunOld, setHasRunOld] = useState(false);
    const [hasRunNew, setHasRunNew] = useState(false);

    const [saving, setSaving] = useState(false);
    const [deploying, setDeploying] = useState(false);

    // 切换规则文件时，彻底重置所有运行状态
    useEffect(() => {
        if (store.baselineKql) {
            setOldKql(store.baselineKql);
            setNewKql(store.baselineKql);
            setOldResult([]);
            setNewResult([]);
            setHasRunOld(false);
            setHasRunNew(false);
        }
    }, [store.baselineKql, store.selectedFile]);

    // ==========================================
    // 终极稳定版双向 Diff 引擎 (防 Null 崩溃 + 防乱序)
    // ==========================================
    
    const stableStringify = (val: any): string => {
        if (val === null) return "null";
        if (val === undefined) return "undefined";
        if (Array.isArray(val)) {
            return `[${[...val].map(stableStringify).sort().join(',')}]`;
        }
        if (typeof val === 'object') {
            return `{${Object.keys(val).sort().map(k => `"${k}":${stableStringify(val[k])}`).join(',')}}`;
        }
        return JSON.stringify(val) || "";
    };

    const leftDiffs = useMemo(() => {
        if (!oldResult.length) return [];
        // 如果右侧根本还没运行，就不做对比，正常显示
        if (!hasRunNew) return oldResult.map(d => ({ type: 'unchanged', data: d }));
        // 如果右侧运行了，但是查出 0 条数据，说明左侧的数据全被排除了 (全红)
        if (!newResult.length) return oldResult.map(d => ({ type: 'removed', data: d }));
        
        const newSet = new Set(newResult.map(d => stableStringify(d)));
        return oldResult.map(d => ({
            type: newSet.has(stableStringify(d)) ? 'unchanged' : 'removed',
            data: d
        }));
    }, [oldResult, newResult, hasRunNew]);

    const rightDiffs = useMemo(() => {
        if (!newResult.length) return [];
        // 如果左侧根本还没运行，就不做对比，正常显示
        if (!hasRunOld) return newResult.map(d => ({ type: 'unchanged', data: d }));
        // 如果左侧运行了，但是查出 0 条数据，说明右侧的数据全是新增的 (全绿)
        if (!oldResult.length) return newResult.map(d => ({ type: 'added', data: d }));
        
        const oldSet = new Set(oldResult.map(d => stableStringify(d)));
        return newResult.map(d => ({
            type: oldSet.has(stableStringify(d)) ? 'unchanged' : 'added',
            data: d
        }));
    }, [oldResult, newResult, hasRunOld]);

    // ==========================================
    // 操作逻辑
    // ==========================================

    const handleRunBaseline = async () => {
        if (!workspaceID) return;
        setLoadingOld(true);
        try {
            const res = await ExecuteKql(workspaceID, oldKql);
            setOldResult(res || []);
            setHasRunOld(true); // 运行成功后标记
        } catch (err) {
            alert(`Baseline 执行失败: ${err}`);
        } finally {
            setLoadingOld(false);
        }
    };

    const handleRunDraft = async () => {
        if (!workspaceID) return;
        setLoadingNew(true);
        try {
            const res = await ExecuteKql(workspaceID, newKql);
            setNewResult(res || []);
            setHasRunNew(true); // 运行成功后标记
        } catch (err) {
            alert(`Draft 执行失败: ${err}`);
        } finally {
            setLoadingNew(false);
        }
    };

    const handleCompare = () => {
        handleRunBaseline();
        handleRunDraft();
    };

    const handleSaveLocal = async () => {
        if (!store.selectedFile || !store.repoPath || !store.localSub) return;
        setSaving(true);
        try {
            await SaveLocalRuleKql(store.repoPath, store.localTenant, store.localSub, store.localRg, store.localWs, store.selectedFile, newKql);
            store.setBaselineKql(newKql);
            setOldKql(newKql);
            alert("✅ 成功保存至本地 Markdown 草稿！");
        } catch (err) {
            alert(`保存失败: ${err}`);
        } finally {
            setSaving(false);
        }
    };

    const handleDeployAzure = async () => {
        // 【核心修复】：前端 UI 级别的前置拦截
        if (!store.isLoggedIn || !store.selectedSub) {
            alert("❌ 无法推送：请先点击顶部 [CONNECT AZURE] 登录，并在右侧选择目标 Azure 订阅 (Sub)！");
            return;
        }

        if (!store.selectedFile || !store.repoPath || !store.localSub) return;
        if (!confirm("确定要将此 KQL 修改部署到 Azure Sentinel 吗？这将会覆盖云端对应的规则。")) return;
        
        setDeploying(true);
        try {
            const activeSub = store.subscriptions.find(s => s.id === store.selectedSub);
            await PushSingleRuleToAzure(
                store.repoPath, store.localTenant, store.localSub, activeSub?.id || "", store.localRg, store.localWs, 
                store.selectedFile, newKql
            );
            
            store.setBaselineKql(newKql);
            setOldKql(newKql);
            alert("🚀 成功部署到 Azure Sentinel！");
        } catch (err) {
            // 这里会直接抛出我们在 Go 后端写的 fmt.Errorf 提示
            alert(`部署失败: ${err}`);
        } finally {
            setDeploying(false);
        }
    };

    return (
        <div className={`flex flex-col h-full ${store.theme === 'dark' ? 'bg-[#0d1117] text-gray-300' : 'bg-gray-50 text-gray-800'}`}>
            <div className={`h-10 border-b flex items-center justify-between px-4 shrink-0 ${store.theme === 'dark' ? 'border-gray-800 bg-[#161b22]/50' : 'border-gray-200 bg-white'}`}>
                <div className="flex items-center space-x-2">
                    <Columns size={16} className="text-blue-500" />
                    <span className={`text-xs font-bold uppercase tracking-widest ${store.theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>KQL Analysis</span>
                </div>
                
                <div className="flex items-center gap-3">
                    <button onClick={handleCompare} disabled={loadingOld || loadingNew} className={`flex items-center space-x-1 px-3 py-1 rounded text-xs transition-all border ${store.theme === 'dark' ? 'text-gray-300 hover:bg-gray-800 border-transparent hover:border-gray-700' : 'text-gray-600 hover:bg-gray-200 border-transparent hover:border-gray-300'}`}>
                        <ArrowRightLeft size={14} /> <span>{loadingOld || loadingNew ? "RUNNING..." : "COMPARE BOTH"}</span>
                    </button>

                    <div className={`h-4 w-px ${store.theme === 'dark' ? 'bg-gray-700' : 'bg-gray-300'}`} />

                    <button onClick={handleSaveLocal} disabled={saving || !store.selectedFile || newKql === oldKql} className={`flex items-center space-x-1.5 px-3 py-1.5 rounded text-xs font-bold transition-all disabled:opacity-50 border ${store.theme === 'dark' ? 'bg-gray-800 hover:bg-gray-700 border-gray-700 text-gray-300' : 'bg-white hover:bg-gray-100 border-gray-300 text-gray-700 shadow-sm'}`}>
                        <Save size={14} /> <span>{saving ? "SAVING..." : "SAVE DRAFT"}</span>
                    </button>

                    <button onClick={handleDeployAzure} disabled={deploying || !store.selectedFile} className="flex items-center space-x-1.5 bg-green-600/20 text-green-600 hover:bg-green-600 hover:text-white border border-green-600/50 disabled:opacity-50 px-4 py-1.5 rounded text-xs font-bold transition-all shadow-lg shadow-green-900/10">
                        <CloudUpload size={14} /> <span>{deploying ? "DEPLOYING..." : "UPDATE AZURE RULE"}</span>
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-2 grid-rows-2 flex-grow overflow-hidden p-2 gap-2">
                <Panel label="Baseline Logic (Production)" isDark={store.theme === 'dark'} icon={<Zap size={12} className="text-gray-500"/>} action={
                    <button onClick={handleRunBaseline} disabled={loadingOld} className={`p-1 rounded shadow transition-colors ${store.theme === 'dark' ? 'text-gray-400 hover:text-blue-400 bg-gray-800 hover:bg-gray-700' : 'text-gray-500 hover:text-blue-500 bg-white border border-gray-200 hover:bg-gray-50'}`}>
                        <Play size={12} fill="currentColor"/>
                    </button>
                }>
                    <KqlEditor value={oldKql} onChange={(v) => setOldKql(v || "")} height="100%" />
                </Panel>
                
                <Panel label="Proposed Logic (Draft)" isDark={store.theme === 'dark'} icon={<Zap size={12} className="text-blue-400"/>} action={
                    <button onClick={handleRunDraft} disabled={loadingNew} className={`p-1 rounded shadow transition-colors ${store.theme === 'dark' ? 'text-blue-400 hover:text-green-400 bg-blue-900/30 border border-blue-800/50 hover:bg-blue-800/50' : 'text-blue-500 hover:text-green-600 bg-blue-50 border border-blue-200 hover:bg-blue-100'}`}>
                        <Play size={12} fill="currentColor"/>
                    </button>
                }>
                    <KqlEditor value={newKql} onChange={(v) => setNewKql(v || "")} height="100%" />
                </Panel>

                <Panel label="Baseline Dataset" isDark={store.theme === 'dark'} icon={<TableIcon size={12}/>}>
                    <DiffTable diffs={leftDiffs} hasRun={hasRunOld} />
                </Panel>
                
                <Panel label="Draft Dataset" isDark={store.theme === 'dark'} icon={<TableIcon size={12}/>}>
                    <DiffTable diffs={rightDiffs} hasRun={hasRunNew} />
                </Panel>
            </div>
        </div>
    );
};

const Panel = ({ children, label, icon, action, isDark }: any) => (
    <div className={`flex flex-col border rounded-lg overflow-hidden shadow-xl ${isDark ? 'border-gray-800 bg-[#010409]' : 'border-gray-200 bg-white'}`}>
        <div className={`h-8 flex items-center px-3 justify-between shrink-0 border-b ${isDark ? 'bg-[#161b22] border-gray-800' : 'bg-gray-100 border-gray-200'}`}>
            <div className="flex items-center space-x-2">
                <span className="text-gray-500">{icon}</span>
                <span className={`text-[10px] font-bold uppercase tracking-tighter ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>{label}</span>
            </div>
            {action && <div>{action}</div>}
        </div>
        <div className="flex-grow overflow-hidden relative">
            {children}
        </div>
    </div>
);