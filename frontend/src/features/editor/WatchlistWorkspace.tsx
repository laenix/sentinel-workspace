import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { GetLocalWatchlistData, SaveLocalWatchlistData } from '../../../wailsjs/go/main/App';
import { Save, Database, Settings, Plus, Trash2, SplitSquareHorizontal, Search } from 'lucide-react';
import { TableVirtuoso, TableVirtuosoHandle } from 'react-virtuoso';

// ==========================================
// 🛠️ 极其轻量级的 CSV 引擎
// ==========================================
const parseCSV = (csvStr: string): string[][] => {
    if (!csvStr) return [];
    const lines = csvStr.split(/\r?\n/).filter(line => line.trim() !== '');
    return lines.map(line => line.split(',').map(cell => cell.trim().replace(/^"|"$/g, '')));
};

const unparseCSV = (grid: string[][]): string => {
    return grid.map(row => 
        row.map(cell => {
            const escaped = (cell || '').replace(/"/g, '""');
            return /[,\"\n]/.test(escaped) ? `"${escaped}"` : escaped;
        }).join(',')
    ).join('\n');
};

// ==========================================
// 🚀 静态抽离：虚拟表格的基础组件 (加入严格的 Ref 泛型规避 TS 报错)
// ==========================================
const VirtuosoTableComponents = {
    Table: (props: any) => <table {...props} style={{ ...props.style, width: '100%', textAlign: 'left', borderCollapse: 'collapse' }} className="text-xs" />,
    TableHead: React.forwardRef<HTMLTableSectionElement, any>((props, ref) => <thead {...props} ref={ref} className="bg-[#161b22] border-b border-gray-800 shadow-sm z-10" />),
    TableRow: (props: any) => <tr {...props} className="border-b border-gray-800/50 hover:bg-[#161b22]/50 transition-colors group" />
};

// ==========================================
// 🚀 核心工作台组件
// ==========================================
export const WatchlistWorkspace: React.FC = () => {
    const store = useAppStore();
    
    // UI 状态
    const [isLoading, setIsLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    
    // 数据状态
    const [metadata, setMetadata] = useState<any>({});
    const [headers, setHeaders] = useState<string[]>([]);
    const [rows, setRows] = useState<string[][]>([]);

    // 搜索与虚拟滚动状态
    const [searchTerm, setSearchTerm] = useState("");
    const virtuosoRef = useRef<TableVirtuosoHandle>(null);

    // 1. 监听资源管理器选中项，拉取双文件数据
    useEffect(() => {
        const loadData = async () => {
            if (!store.selectedWatchlist || !store.repoPath || !store.localSub || !store.localWs) return;
            
            setIsLoading(true);
            setSearchTerm("");
            try {
                const data = await GetLocalWatchlistData(
                    store.repoPath,store.localTenant, store.localSub, store.localRg, store.localWs, store.selectedWatchlist
                );
                
                if (data.metadata) setMetadata(JSON.parse(data.metadata));
                if (data.csv) {
                    const grid = parseCSV(data.csv);
                    if (grid.length > 0) {
                        setHeaders(grid[0]);
                        setRows(grid.slice(1));
                    } else {
                        setHeaders([]);
                        setRows([]);
                    }
                }
            } catch (err) { console.error("加载 Watchlist 失败:", err); } 
            finally { setIsLoading(false); }
        };
        loadData();
    }, [store.selectedWatchlist, store.repoPath, store.localTenant, store.localSub, store.localRg, store.localWs]);

    // 2. 表格交互逻辑 (🚀 核心修复：安全浅拷贝，防止直接变异引发的性能灾难)
    const handleCellChange = (originalIndex: number, colIndex: number, value: string) => {
        const newRows = [...rows];
        const newRow = [...newRows[originalIndex]]; // 深一层拷贝当前行，完美触发 React 局部重绘
        newRow[colIndex] = value;
        newRows[originalIndex] = newRow;
        setRows(newRows);
    };

    const handleAddRow = () => {
        const newRow = new Array(headers.length).fill("");
        setRows([...rows, newRow]);
        
        setSearchTerm("");
        setTimeout(() => {
            virtuosoRef.current?.scrollToIndex({
                index: rows.length, 
                align: 'end',
                behavior: 'smooth'
            });
        }, 50);
    };

    const handleDeleteRow = (originalIndex: number) => {
        const newRows = rows.filter((_, idx) => idx !== originalIndex);
        setRows(newRows);
    };

    const handleSave = async () => {
        if (!store.selectedWatchlist || !store.repoPath || !store.localSub || !store.localWs) return;
        
        setIsSaving(true);
        try {
            const metaContent = JSON.stringify(metadata, null, 2);
            const csvContent = unparseCSV([headers, ...rows]);
            
            await SaveLocalWatchlistData(
                store.repoPath, store.localTenant,store.localSub, store.localRg, store.localWs, 
                store.selectedWatchlist, metaContent, csvContent
            );
            
            store.triggerGitRefresh();
            alert("Watchlist 保存成功！");
        } catch (err) { alert(`保存失败: ${err}`); } 
        finally { setIsSaving(false); }
    };

    // ==========================================
    // 🔍 数据过滤引擎 (🚀 核心修复：万级数据 useMemo 性能护航)
    // ==========================================
    const filteredRows = useMemo(() => {
        return rows
            .map((rowData, index) => ({ originalIndex: index, rowData }))
            .filter(item => {
                if (!searchTerm) return true;
                const term = searchTerm.toLowerCase();
                return item.rowData.some(cell => cell.toLowerCase().includes(term));
            });
    }, [rows, searchTerm]);

    if (!store.selectedWatchlist) {
        return (
            <div className="flex flex-col h-full bg-[#0d1117] items-center justify-center text-gray-500">
                <Database size={48} className="mb-4 opacity-20" />
                <p className="italic text-sm">Select a Watchlist from the Explorer to start editing.</p>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full bg-[#0d1117] text-gray-300">
            {/* 顶部工具栏 */}
            <div className="h-10 border-b border-gray-800 flex items-center justify-between px-4 bg-[#161b22]/50 shrink-0">
                <div className="flex items-center space-x-2 text-gray-400">
                    <SplitSquareHorizontal size={16} className="text-blue-400" />
                    <span className="text-[10px] font-bold uppercase tracking-widest">Watchlist Editor</span>
                    <span className="text-gray-600 px-2">/</span>
                    <span className="text-xs text-blue-300 font-mono font-bold">{store.selectedWatchlist}</span>
                </div>
                <button onClick={handleSave} disabled={isSaving || isLoading} className="flex items-center space-x-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-4 py-1.5 rounded text-xs font-bold transition-all shadow-sm">
                    <Save size={14} /><span>{isSaving ? "SAVING..." : "SAVE WATCHLIST"}</span>
                </button>
            </div>

            {isLoading ? (
                <div className="flex-1 flex items-center justify-center text-blue-400 text-sm animate-pulse">Loading dataset...</div>
            ) : (
                <div className="flex-1 flex flex-col overflow-hidden p-6 gap-6 custom-scrollbar overflow-y-auto">
                    
                    {/* 上半层：元数据控制台 */}
                    <section className="bg-[#010409] border border-gray-800 rounded-lg shadow-sm shrink-0">
                        <div className="px-4 py-2 border-b border-gray-800 bg-[#161b22]/30 flex items-center gap-2">
                            <Settings size={14} className="text-gray-400" />
                            <h2 className="text-[11px] font-bold tracking-widest uppercase text-gray-400">Metadata Configuration</h2>
                        </div>
                        <div className="p-4 grid grid-cols-2 lg:grid-cols-3 gap-4">
                            {['display_name', 'provider', 'source', 'search_key', 'description'].map(key => (
                                <div key={key} className="flex flex-col gap-1.5">
                                    <label className="text-[10px] uppercase font-bold text-gray-500 tracking-wider">
                                        {key.replace('_', ' ')}
                                        {key === 'search_key' && <span className="text-orange-500 ml-1" title="Primary Key for GitOps Sync">*</span>}
                                    </label>
                                    <input 
                                        type="text" value={metadata[key] || ''}
                                        onChange={(e) => setMetadata({...metadata, [key]: e.target.value})}
                                        className="bg-[#161b22] border border-gray-800 text-xs px-3 py-2 rounded outline-none focus:border-blue-500 transition-colors text-gray-200"
                                    />
                                </div>
                            ))}
                        </div>
                    </section>

                    {/* 下半层：支持虚拟滚动的超级数据网格 */}
                    <section className="flex-1 flex flex-col bg-[#010409] border border-gray-800 rounded-lg shadow-sm min-h-[400px] overflow-hidden">
                        
                        {/* Data Grid Header & Search Bar */}
                        <div className="px-4 py-2 border-b border-gray-800 bg-[#161b22]/30 flex items-center justify-between shrink-0">
                            <div className="flex items-center gap-4">
                                <div className="flex items-center gap-2">
                                    <Database size={14} className="text-gray-400" />
                                    <h2 className="text-[11px] font-bold tracking-widest uppercase text-gray-400">
                                        Dataset Grid ({filteredRows.length}{filteredRows.length !== rows.length ? ` / ${rows.length}` : ''} Rows)
                                    </h2>
                                </div>
                                
                                {/* 🔍 实时内联搜索框 */}
                                <div className="relative">
                                    <input 
                                        type="text" 
                                        placeholder="Search across all columns..."
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                        className="w-64 bg-[#010409] border border-gray-800 text-[10px] pl-7 pr-2 py-1.5 rounded outline-none focus:border-blue-500 transition-colors text-gray-300 shadow-inner"
                                    />
                                    <Search size={12} className="absolute left-2.5 top-2 text-gray-500" />
                                </div>
                            </div>
                            
                            <button 
                                onClick={handleAddRow}
                                className="flex items-center gap-1 text-[10px] font-bold text-green-400 hover:text-green-300 bg-green-900/20 px-2 py-1 rounded border border-green-900/50 transition-colors"
                            >
                                <Plus size={12} /> ADD ROW
                            </button>
                        </div>
                        
                        {/* 🚀 TableVirtuoso 虚拟滚动容器 (强制 as any 忽略泛型报错) */}
                        <div className="flex-1 w-full bg-[#010409]">
                            {rows.length === 0 ? (
                                <div className="flex items-center justify-center h-full text-gray-600 italic text-sm">No data rows found. Click 'Add Row' to start.</div>
                            ) : filteredRows.length === 0 ? (
                                <div className="flex items-center justify-center h-full text-gray-600 italic text-sm">No results match your search.</div>
                            ) : (
                                <TableVirtuoso
                                    ref={virtuosoRef}
                                    style={{ height: '100%', width: '100%' }}
                                    data={filteredRows}
                                    components={VirtuosoTableComponents as any}
                                    fixedHeaderContent={() => (
                                        <tr>
                                            <th className="w-12 p-2 text-center text-gray-600 font-mono bg-[#161b22]">#</th>
                                            {headers.map((h, i) => (
                                                <th key={i} className="p-2 font-bold text-gray-400 uppercase tracking-wider whitespace-nowrap bg-[#161b22]">
                                                    {h} {h === metadata.search_key && <span className="text-orange-500" title="Search Key">🔑</span>}
                                                </th>
                                            ))}
                                            <th className="w-12 p-2 text-center text-gray-500 font-mono bg-[#161b22]">ACT</th>
                                        </tr>
                                    )}
                                    itemContent={(index, item) => (
                                        <>
                                            <td className="p-2 text-center text-gray-600 font-mono border-r border-gray-800/30">
                                                {item.originalIndex + 1}
                                            </td>
                                            {item.rowData.map((cell, cIndex) => (
                                                <td key={cIndex} className="p-0 border-r border-gray-800/30 relative">
                                                    <input 
                                                        type="text" 
                                                        value={cell}
                                                        onChange={(e) => handleCellChange(item.originalIndex, cIndex, e.target.value)}
                                                        className="w-full bg-transparent text-gray-300 px-3 py-2 outline-none focus:bg-blue-900/20 focus:text-white transition-colors"
                                                    />
                                                </td>
                                            ))}
                                            <td className="p-0 text-center">
                                                <button 
                                                    onClick={() => handleDeleteRow(item.originalIndex)}
                                                    className="p-2 text-gray-600 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
                                                    title="Delete Row"
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            </td>
                                        </>
                                    )}
                                />
                            )}
                        </div>
                    </section>
                </div>
            )}
        </div>
    );
};