import { create } from 'zustand';
import { models } from '../../wailsjs/go/models';

export interface LocalContext {
    tenantName: string;
    subscription: string;
    resourceGroup: string;
    workspace: string;
}

export interface AzureTenant {
    id: string;
    tenantId: string;
    displayName: string;
}

interface AppState {
    activeUserProfile: string; // 🚀 仅用于 UI 显示登录者，不参与文件路径
    setActiveUserProfile: (name: string) => void;

    isConnectionModalOpen: boolean;
    setConnectionModalOpen: (open: boolean) => void;
    
    cloudEnv: 'Global' | 'China' | 'USGov' | 'Custom';
    setCloudEnv: (env: 'Global' | 'China' | 'USGov' | 'Custom') => void;

    tenants: AzureTenant[];
    setTenants: (tenants: AzureTenant[]) => void;
    selectedTenant: string;
    setSelectedTenant: (id: string) => void;

    isLoggedIn: boolean;
    setLoggedIn: (status: boolean) => void;

    subscriptions: models.AzureSubscription[];
    selectedSub: string;
    workspaces: models.AzureWorkspace[];
    selectedAzureRg: string; 
    selectedWorkspace: string;

    setSubscriptions: (subs: models.AzureSubscription[]) => void;
    setSelectedSub: (id: string) => void;
    setSelectedAzureRg: (rg: string) => void;
    setWorkspaces: (ws: models.AzureWorkspace[]) => void;
    setSelectedWorkspace: (id: string) => void;

    activeTab: 'editor' | 'markdown' | 'sync' | 'settings' | 'migrate';
    setActiveTab: (tab: 'editor' | 'markdown' | 'sync' | 'settings' | 'migrate') => void;

    theme: 'light' | 'dark';
    lang: 'zh' | 'en';
    setTheme: (theme: 'light' | 'dark') => void;
    setLang: (lang: 'zh' | 'en') => void;

    selectedFile: string;
    setSelectedFile: (file: string) => void;
    baselineKql: string;
    setBaselineKql: (kql: string) => void;
    repoPath: string;
    setRepoPath: (path: string) => void;
    refreshKey: number;
    triggerRefresh: () => void;
    localContexts: LocalContext[];
    setLocalContexts: (ctxs: LocalContext[]) => void;

    // 🚀 核心修改：恢复 4 层本地状态
    localTenant: string;
    localSub: string;
    localRg: string;
    localWs: string;
    setLocalContext: (tenant: string, sub: string, rg: string, ws: string) => void;

    rawMarkdown: string;
    setRawMarkdown: (raw: string) => void;

    gitChanges: { state: string, name: string }[];
    setGitChanges: (changes: { state: string, name: string }[]) => void;
    gitRefreshKey: number; 
    triggerGitRefresh: () => void;

    explorerTab: 'rules' | 'watchlists';
    setExplorerTab: (tab: 'rules' | 'watchlists') => void;

    selectedWatchlist: string;
    setSelectedWatchlist: (alias: string) => void;
}

export const useAppStore = create<AppState>((set) => ({
    activeUserProfile: "",
    setActiveUserProfile: (name) => set({ activeUserProfile: name }),

    isConnectionModalOpen: false,
    setConnectionModalOpen: (open) => set({ isConnectionModalOpen: open }),
    cloudEnv: 'Global',
    setCloudEnv: (env) => set({ cloudEnv: env, tenants: [], selectedTenant: "", subscriptions: [], selectedSub: "", workspaces: [], selectedWorkspace: "", selectedAzureRg: "", isLoggedIn: false, activeUserProfile: "" }),
    tenants: [],
    setTenants: (tenants) => set({ tenants }),
    selectedTenant: "",
    setSelectedTenant: (id) => set({ selectedTenant: id, subscriptions: [], selectedSub: "", workspaces: [], selectedWorkspace: "", selectedAzureRg: "" }),

    isLoggedIn: false,
    subscriptions: [],
    selectedSub: "",
    workspaces: [],
    selectedAzureRg: "",
    selectedWorkspace: "",
    activeTab: 'editor',
    theme: 'dark',
    lang: 'en',

    selectedFile: "",
    baselineKql: "",

    setLoggedIn: (status) => set({ isLoggedIn: status }),
    setSubscriptions: (subs) => set({ subscriptions: subs }),
    setSelectedSub: (id) => set({ selectedSub: id, selectedWorkspace: "", workspaces: [], selectedAzureRg: "" }),
    setSelectedAzureRg: (rg) => set({ selectedAzureRg: rg, selectedWorkspace: "" }),
    setWorkspaces: (ws) => set({ workspaces: ws }),
    setSelectedWorkspace: (id) => set({ selectedWorkspace: id }),
    setActiveTab: (tab) => set({ activeTab: tab }),
    setTheme: (theme) => {
        set({ theme });
        if (theme === 'dark') document.documentElement.classList.add('dark');
        else document.documentElement.classList.remove('dark');
    },
    setLang: (lang) => set({ lang }),

    setSelectedFile: (file) => set({ selectedFile: file }),
    setBaselineKql: (kql) => set({ baselineKql: kql }),
    repoPath: "C:\\sentinel-rules", 
    refreshKey: 0,
    triggerRefresh: () => set((state) => ({ refreshKey: state.refreshKey + 1 })),
    setRepoPath: (path) => set({ repoPath: path }),
    localContexts: [],
    setLocalContexts: (ctxs) => set({ localContexts: ctxs }),

    // 🚀 核心修改
    localTenant: "",
    localSub: "",
    localRg: "",
    localWs: "",
    setLocalContext: (tenant, sub, rg, ws) => set({
        localTenant: tenant,
        localSub: sub,
        localRg: rg,
        localWs: ws
    }),
    
    rawMarkdown: "",
    setRawMarkdown: (raw) => set({ rawMarkdown: raw }),

    gitChanges: [],
    setGitChanges: (changes) => set({ gitChanges: changes }),
    gitRefreshKey: 0,
    triggerGitRefresh: () => set((state) => ({ gitRefreshKey: state.gitRefreshKey + 1 })),
    
    explorerTab: 'rules',
    setExplorerTab: (tab) => set({ explorerTab: tab }),

    selectedWatchlist: "",
    setSelectedWatchlist: (alias) => set({ selectedWatchlist: alias }),
}));