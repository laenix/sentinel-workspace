import React, { useState } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { SearchableSelect } from '../ui/SearchableSelect';
import { ConnectCloud, SelectTenant, GetWorkspaces } from '../../../wailsjs/go/main/App';
import { Globe, X, RefreshCw, Shield, Building, Target, Check, ChevronRight } from 'lucide-react';

const extractRgFromId = (id: string) => {
    const match = id?.match(/resourcegroups\/([^\/]+)/i);
    return match ? match[1] : "";
};

export const ConnectionWizard = () => {
    const store = useAppStore();
    const [loading, setLoading] = useState(false);

    if (!store.isConnectionModalOpen) return null;

    const handleConnectCloud = async () => {
        setLoading(true);
        try {
            const response: any = await ConnectCloud(store.cloudEnv);
            const rawTenants = response.tenants || [];
            const activeProfile = response.userProfile || "admin";

            const formattedTenants = rawTenants.map((t: any) => ({
                id: t.id || "", tenantId: t.tenantId || "", displayName: t.displayName || ""
            }));

            store.setTenants(formattedTenants);
            store.setActiveUserProfile(activeProfile); 

            if (formattedTenants.length > 0) store.setSelectedTenant(formattedTenants[0].tenantId);
        } catch (err) { 
            alert(`Authentication Failed: ${err}`);
        } finally { 
            setLoading(false); 
        }
    };

    const handleTenantChange = async (tenantId: string) => {
        store.setSelectedTenant(tenantId);
        setLoading(true);
        try {
            const subs = await SelectTenant(tenantId);
            store.setSubscriptions(subs || []);
        } catch (err) {
            alert(`Failed to load subscriptions for tenant: ${err}`);
        } finally { setLoading(false); }
    };

    const handleSubChange = async (subId: string) => {
        store.setSelectedSub(subId);
        store.setSelectedAzureRg("");
        store.setSelectedWorkspace("");
        if (subId) {
            const wsList = await GetWorkspaces(subId);
            store.setWorkspaces(wsList || []);
        } else {
            store.setWorkspaces([]);
        }
    };

    const handleAzureRgChange = (rg: string) => {
        store.setSelectedAzureRg(rg);
        store.setSelectedWorkspace(""); 
    };

    const tenantOptions = store.tenants.map(t => ({ label: `${t.displayName} (${t.tenantId.substring(0,8)}...)`, value: t.tenantId }));
    const azureSubsOptions = store.subscriptions.map(s => ({ label: s.name, value: s.id }));
    const rawAzureRgs = Array.from(new Set(store.workspaces.map(w => w.resourceGroup || extractRgFromId(w.id))));
    const azureRgOptions = rawAzureRgs.filter(Boolean).map(rg => ({ label: rg, value: rg }));
    const filteredAzureWs = store.workspaces.filter(w => !store.selectedAzureRg || (w.resourceGroup === store.selectedAzureRg || extractRgFromId(w.id) === store.selectedAzureRg));
    const azureWsOptions = filteredAzureWs.map(w => ({ label: w.name, value: w.id }));
    const activeTenantName = store.tenants.find(t => t.tenantId === store.selectedTenant)?.displayName || "Unknown Tenant";

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[999] flex items-center justify-center" style={{ '--wails-draggable': 'no-drag' } as any}>
            
            {/* 🚀 修改 1：加入了 h-[580px] 和 w-[650px]，让弹窗尺寸彻底锁定，不再跳动 */}
            <div className="bg-[#0d1117] border border-gray-800 rounded-xl w-[650px] h-[580px] shadow-2xl overflow-hidden flex flex-col transform transition-all animate-in fade-in zoom-in-95 duration-200">
                <div className="h-12 border-b border-gray-800 bg-[#010409] flex items-center justify-between px-6 shrink-0">
                    <div className="flex items-center gap-2 text-blue-400">
                        <Globe size={18} />
                        <span className="text-sm font-bold tracking-widest uppercase">Azure Connection Wizard</span>
                    </div>
                    <button onClick={() => store.setConnectionModalOpen(false)} className="text-gray-500 hover:text-white transition-colors"><X size={18} /></button>
                </div>
                
                {/* 🚀 修改 2：加入了 pb-40，给最底部的 Workspace 下拉框预留极其充足的展开空间 */}
                <div className="p-6 flex flex-col gap-8 flex-1 overflow-y-auto custom-scrollbar pb-40">
                    <div className="space-y-3">
                        <div className="flex items-center gap-2 text-xs font-bold text-gray-400 uppercase tracking-widest">
                            <span className="w-5 h-5 rounded-full bg-blue-900/50 text-blue-400 flex items-center justify-center border border-blue-900">1</span> Select Cloud Environment
                        </div>
                        <div className="grid grid-cols-4 gap-2">
                            {[
                                { id: 'Global', label: '🌐 Global', sub: 'Public Cloud' },
                                { id: 'China', label: '🇨🇳 China', sub: '世纪互联' },
                                { id: 'USGov', label: '🏛️ US Gov', sub: 'Government' },
                                { id: 'Custom', label: '⚙️ Custom', sub: 'environments.json' }
                            ].map(env => (
                                <div key={env.id} onClick={() => store.setCloudEnv(env.id as any)} className={`p-3 rounded-lg border cursor-pointer transition-all flex flex-col items-center justify-center gap-1 ${store.cloudEnv === env.id ? 'bg-blue-600/20 border-blue-500 text-blue-400 shadow-inner' : 'bg-[#161b22] border-gray-800 text-gray-500 hover:border-gray-600'}`}>
                                    <span className="text-sm font-bold">{env.label}</span>
                                    <span className="text-[9px] opacity-70">{env.sub}</span>
                                </div>
                            ))}
                        </div>
                        <button onClick={handleConnectCloud} disabled={loading} className="w-full mt-2 py-2.5 bg-gray-800 hover:bg-blue-600 border border-gray-700 hover:border-blue-500 rounded text-xs font-bold text-gray-300 hover:text-white transition-all disabled:opacity-50 flex justify-center items-center gap-2">
                            {loading ? <RefreshCw size={14} className="animate-spin" /> : <Shield size={14} />}
                            {loading ? "AUTHENTICATING VIA BROWSER..." : "AUTHENTICATE"}
                        </button>
                    </div>

                    <div className={`space-y-3 transition-opacity duration-300 ${store.tenants.length > 0 ? 'opacity-100' : 'opacity-30 pointer-events-none'}`}>
                        <div className="flex items-center gap-2 text-xs font-bold text-gray-400 uppercase tracking-widest">
                            <span className="w-5 h-5 rounded-full bg-orange-900/50 text-orange-400 flex items-center justify-center border border-orange-900">2</span> Target Tenant
                        </div>
                        <div className="flex items-center gap-3">
                            <Building size={16} className="text-orange-500 shrink-0" />
                            <SearchableSelect themeColor="orange" value={store.selectedTenant} options={tenantOptions} onChange={handleTenantChange} placeholder="-- Select Tenant Directory --" widthClass="flex-1" />
                        </div>
                    </div>

                    <div className={`space-y-3 transition-opacity duration-300 ${store.subscriptions.length > 0 ? 'opacity-100' : 'opacity-30 pointer-events-none'}`}>
                        <div className="flex items-center gap-2 text-xs font-bold text-gray-400 uppercase tracking-widest">
                            <span className="w-5 h-5 rounded-full bg-green-900/50 text-green-400 flex items-center justify-center border border-green-900">3</span> Resource Context Lock
                        </div>
                        <div className="flex items-center gap-2 bg-[#161b22] border border-gray-800 p-3 rounded-lg">
                            <Target size={16} className="text-green-500 shrink-0" />
                            <SearchableSelect themeColor="blue" value={store.selectedSub} options={azureSubsOptions} onChange={handleSubChange} placeholder="Subscription" widthClass="flex-1" />
                            <ChevronRight size={12} className="text-gray-600 shrink-0" />
                            <SearchableSelect themeColor="blue" value={store.selectedAzureRg} options={azureRgOptions} onChange={handleAzureRgChange} placeholder="Res Group" widthClass="flex-1" />
                            <ChevronRight size={12} className="text-gray-600 shrink-0" />
                            <SearchableSelect themeColor="blue" value={store.selectedWorkspace} options={azureWsOptions} onChange={(val: string) => store.setSelectedWorkspace(val)} placeholder="Workspace" widthClass="flex-1" />
                        </div>
                    </div>
                </div>

                <div className="p-4 border-t border-gray-800 bg-[#010409] flex justify-end shrink-0">
                    <button 
                        onClick={() => {
                            store.setLoggedIn(true);
                            store.setConnectionModalOpen(false);
                            if (activeTenantName && store.selectedSub && store.selectedAzureRg && store.selectedWorkspace) {
                                store.setLocalContext(activeTenantName, store.selectedSub, store.selectedAzureRg, store.selectedWorkspace);
                            }
                        }}
                        disabled={!store.selectedTenant || !store.selectedSub || !store.selectedWorkspace}
                        className="px-6 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-800 disabled:text-gray-500 text-white text-xs font-bold rounded transition-all shadow-sm flex items-center gap-2"
                    >
                        <Check size={14} /> LOCK CONTEXT & START
                    </button>
                </div>
            </div>
        </div>
    );
};