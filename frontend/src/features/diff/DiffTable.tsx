import React, { useMemo } from 'react';
import { useAppStore } from '../../store/useAppStore';

interface DiffTableProps {
    diffs: any[];
    hasRun?: boolean; // 新增：追踪是否真正执行过查询
}

export const DiffTable: React.FC<DiffTableProps> = ({ diffs, hasRun }) => {
    const store = useAppStore();
    const isDark = store.theme === 'dark';

    const columns = useMemo(() => {
        if (!diffs || diffs.length === 0) return [];
        const cols = new Set<string>();
        diffs.forEach(row => {
            if (row.data) Object.keys(row.data).forEach(key => cols.add(key));
        });
        return Array.from(cols);
    }, [diffs]);

    // 【智能空状态提示】
    if (!diffs || diffs.length === 0) {
        return (
            <div className={`h-full w-full flex items-center justify-center text-xs italic ${isDark ? 'text-gray-600 bg-[#010409]' : 'text-gray-400 bg-gray-50'}`}>
                {hasRun ? "No results found." : 'Ready. Click "Run" to execute the query and view results.'}
            </div>
        );
    }

    const bgMain = isDark ? 'bg-[#010409]' : 'bg-white';
    const bgHeader = isDark ? 'bg-[#161b22] border-gray-700' : 'bg-gray-200 border-gray-300';
    const textHeader = isDark ? 'text-gray-400' : 'text-gray-600';
    const borderCell = isDark ? 'border-gray-800/50' : 'border-gray-200';
    const textRow = isDark ? 'text-gray-300 hover:bg-[#161b22]/80' : 'text-gray-700 hover:bg-gray-100/80';
    const bgIndex = isDark ? 'bg-[#0d1117]/50' : 'bg-gray-50';

    return (
        <div className={`h-full w-full overflow-auto custom-scrollbar relative ${bgMain}`}>
            <table className="min-w-full border-collapse text-left text-[11px] font-mono whitespace-nowrap">
                <thead className={`sticky top-0 z-10 shadow-sm ${bgHeader}`}>
                    <tr>
                        <th className={`px-3 py-2 font-semibold border-r w-8 text-center ${borderCell} ${bgIndex} ${textHeader}`}>#</th>
                        {columns.map(col => (
                            <th key={col} className={`px-3 py-2 font-bold border-r tracking-wider ${borderCell} ${textHeader}`}>
                                {col}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {diffs.map((item, rowIndex) => {
                        let bgColor = textRow;
                        if (item.type === 'added') bgColor = isDark ? 'bg-green-900/20 text-green-400' : 'bg-green-100 text-green-700';
                        if (item.type === 'removed') bgColor = isDark ? 'bg-red-900/20 text-red-400' : 'bg-red-100 text-red-700';

                        const diffIndicator = item.type === 'added' ? '+' : item.type === 'removed' ? '-' : '';

                        return (
                            <tr key={rowIndex} className={`border-b transition-colors ${borderCell} ${bgColor}`}>
                                <td className={`px-2 py-1.5 border-r text-center select-none opacity-60 ${borderCell} ${bgIndex}`}>
                                    {diffIndicator || rowIndex + 1}
                                </td>
                                {columns.map(col => {
                                    let cellValue = item.data ? item.data[col] : "";
                                    if (typeof cellValue === 'object' && cellValue !== null) cellValue = JSON.stringify(cellValue);
                                    else if (cellValue === null || cellValue === undefined) cellValue = "";

                                    return (
                                        <td key={`${rowIndex}-${col}`} className={`px-3 py-1.5 border-r max-w-[300px] truncate ${borderCell}`} title={String(cellValue)}>
                                            {String(cellValue)}
                                        </td>
                                    );
                                })}
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
};