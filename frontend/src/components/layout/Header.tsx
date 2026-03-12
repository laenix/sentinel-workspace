import React from 'react';
import { useAppStore } from '../../store/useAppStore';
import { SearchableSelect } from '../ui/SearchableSelect';
import { WindowMinimise, WindowToggleMaximise, Quit } from '../../../wailsjs/runtime/runtime';
import { Shield, HardDrive, Cloud, Globe, Settings, Minus, Square, X, UserCircle2 } from 'lucide-react';

export const Header = () => {
    const store = useAppStore();

    // 🚀 回归 4 层联动逻辑
    const handleLocalTenantChange = (tenant: string) => {
        const subs = Array.from(new Set(store.localContexts.filter(c => c.tenantName === tenant).map(c => c.subscription)));
        handleLocalSubChange(tenant, subs[0] || "");
    };

    const handleLocalSubChange = (tenant: string, sub: string) => {
        const rgs = Array.from(new Set(store.localContexts.filter(c => c.tenantName === tenant && c.subscription === sub).map(c => c.resourceGroup)));
        handleLocalRgChange(tenant, sub, rgs[0] || "");
    };

    const handleLocalRgChange = (tenant: string, sub: string, rg: string) => {
        const wss = Array.from(new Set(store.localContexts.filter(c => c.tenantName === tenant && c.subscription === sub && c.resourceGroup === rg).map(c => c.workspace)));
        store.setLocalContext(tenant, sub, rg, wss[0] || "");
    };

    const localTenants = Array.from(new Set(store.localContexts.map(c => c.tenantName))).map(t => ({ label: t, value: t }));
    const localSubs = Array.from(new Set(store.localContexts.filter(c => c.tenantName === store.localTenant).map(c => c.subscription))).map(s => ({ label: s, value: s }));
    const localRgs = Array.from(new Set(store.localContexts.filter(c => c.tenantName === store.localTenant && c.subscription === store.localSub).map(c => c.resourceGroup))).map(rg => ({ label: rg, value: rg }));
    const localWss = Array.from(new Set(store.localContexts.filter(c => c.tenantName === store.localTenant && c.subscription === store.localSub && c.resourceGroup === store.localRg).map(c => c.workspace))).map(ws => ({ label: ws, value: ws }));
    const activeTenantName = store.tenants.find(t => t.tenantId === store.selectedTenant)?.displayName || "Unknown Tenant";

    return (
        <header className={`h-12 flex items-center justify-between shrink-0 select-none ${store.theme === 'dark' ? 'bg-[#010409] border-b border-gray-800' : 'bg-gray-100 border-b border-gray-200'}`} style={{ '--wails-draggable': 'drag' } as any}>
            <div className="flex items-center px-4 gap-2 w-48 shrink-0">
                <Shield size={18} className="text-blue-500" />
                <span className="text-[11px] font-bold tracking-widest uppercase opacity-90">VSentry Space</span>
            </div>

            <div className="flex-1 flex items-center justify-center gap-4 min-w-0 px-4">
                
                {/* 🚀 单排 4 层 Git 沙盒指示器 */}
                <div className="flex items-center bg-purple-500/10 px-2 py-1.5 rounded-lg border border-purple-500/20 shadow-sm min-w-0">
                    <HardDrive size={14} className="text-purple-400 shrink-0 mx-1.5" />
                    
                    <SearchableSelect value={store.localTenant} options={localTenants} onChange={handleLocalTenantChange} placeholder="Tenant" widthClass="w-32" />
                    <span className="text-purple-500/50 text-[10px] mx-1">{'>'}</span>
                    
                    <SearchableSelect value={store.localSub} options={localSubs} onChange={(s: string) => handleLocalSubChange(store.localTenant, s)} placeholder="Sub" widthClass="w-32" />
                    <span className="text-purple-500/50 text-[10px] mx-1">{'>'}</span>
                    
                    <SearchableSelect value={store.localRg} options={localRgs} onChange={(rg: string) => handleLocalRgChange(store.localTenant, store.localSub, rg)} placeholder="RG" widthClass="w-28" />
                    <span className="text-purple-500/50 text-[10px] mx-1">{'>'}</span>
                    
                    <SearchableSelect value={store.localWs} options={localWss} onChange={(ws: string) => store.setLocalContext(store.localTenant, store.localSub, store.localRg, ws)} placeholder="Workspace" widthClass="w-32" />
                </div>

                <div className="h-5 w-px bg-gray-800 shrink-0" />

                {/* Azure Cloud 环境指示器 */}
                <div className="flex items-center min-w-0">
                    {!store.isLoggedIn || !store.selectedWorkspace ? (
                        <button style={{ '--wails-draggable': 'no-drag' } as any} onClick={() => store.setConnectionModalOpen(true)} className="flex items-center gap-1.5 bg-blue-600/20 hover:bg-blue-600/40 border border-blue-500/50 text-[10px] font-bold text-blue-400 px-3 py-1.5 rounded transition-all shrink-0">
                            <Cloud size={14} /> CONNECT AZURE WIZARD
                        </button>
                    ) : (
                        <div style={{ '--wails-draggable': 'no-drag' } as any} onClick={() => store.setConnectionModalOpen(true)} className="flex items-center gap-2 bg-[#161b22] hover:bg-[#21262d] border border-gray-700 hover:border-blue-500 px-3 py-1.5 rounded-lg cursor-pointer transition-all shadow-sm min-w-0 group">
                            <Globe size={14} className={store.cloudEnv === 'China' ? 'text-red-500' : store.cloudEnv === 'USGov' ? 'text-blue-300' : 'text-blue-500'} />
                            <div className="flex items-center gap-1.5 text-[10px] font-mono min-w-0">
                                <span className="text-gray-400 font-bold truncate max-w-[100px]" title={activeTenantName}>{activeTenantName}</span>
                                <span className="text-gray-600">/</span>
                                <span className="text-blue-300 truncate max-w-[120px]" title={store.subscriptions.find(s=>s.id===store.selectedSub)?.name}>{store.subscriptions.find(s=>s.id===store.selectedSub)?.name || 'Sub'}</span>
                                <span className="text-gray-600">/</span>
                                <span className="text-green-400 font-bold truncate max-w-[100px]" title={store.workspaces.find(w=>w.id===store.selectedWorkspace)?.name}>{store.workspaces.find(w=>w.id===store.selectedWorkspace)?.name || 'WS'}</span>
                            </div>
                            <Settings size={12} className="text-gray-600 opacity-0 group-hover:opacity-100 transition-opacity ml-1" />
                        </div>
                    )}
                </div>
            </div>

            <div className="flex h-full items-center shrink-0" style={{ '--wails-draggable': 'no-drag' } as any}>
                {/* 🚀 动态显示登录的真实用户名 */}
                {store.isLoggedIn && store.activeUserProfile && (
                    <div className="flex items-center gap-1.5 px-3 border-r border-gray-800 h-full text-blue-400">
                        <UserCircle2 size={14} />
                        <span className="text-[10px] font-bold font-mono tracking-wider">{store.activeUserProfile}</span>
                    </div>
                )}
                <div className="flex h-full text-gray-400">
                    <button onClick={WindowMinimise} className="px-4 hover:bg-gray-800 transition-colors"><Minus size={14} /></button>
                    <button onClick={WindowToggleMaximise} className="px-4 hover:bg-gray-800 transition-colors"><Square size={12} /></button>
                    <button onClick={Quit} className="px-4 hover:bg-red-500 hover:text-white transition-colors"><X size={14} /></button>
                </div>
            </div>
        </header>
    );
};