import React, { useState, useEffect, useRef } from 'react';
import { Search, ChevronDown, Check } from 'lucide-react';

export const SearchableSelect = ({ value, options, onChange, placeholder, widthClass = "w-32", themeColor = "purple", disabled = false }: any) => {
    const [isOpen, setIsOpen] = useState(false);
    const [search, setSearch] = useState("");
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (ref.current && !ref.current.contains(event.target as Node)) {
                setIsOpen(false);
                setSearch("");
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const filteredOptions = options.filter((o: any) =>
        o.label.toLowerCase().includes(search.toLowerCase())
    );

    const selectedLabel = options.find((o: any) => o.value === value)?.label;

    const t = themeColor === 'blue' ? {
        border: 'border-blue-500', text: 'text-blue-400', bg: 'bg-blue-900/20', focus: 'focus:border-blue-500'
    } : themeColor === 'orange' ? {
        border: 'border-orange-500', text: 'text-orange-400', bg: 'bg-orange-900/20', focus: 'focus:border-orange-500'
    } : {
        border: 'border-purple-500', text: 'text-purple-400', bg: 'bg-purple-900/20', focus: 'focus:border-purple-500'
    };

    return (
        <div ref={ref} className={`relative ${widthClass} min-w-[70px] ${disabled ? 'opacity-50 cursor-not-allowed pointer-events-none' : ''}`} style={{ '--wails-draggable': 'no-drag' } as any}>
            <div
                onClick={() => setIsOpen(!isOpen)}
                className={`flex items-center justify-between bg-[#161b22] hover:bg-[#21262d] border text-[10px] text-gray-300 px-2.5 py-1.5 rounded cursor-pointer transition-colors shadow-sm ${isOpen ? t.border : 'border-gray-700'}`}
            >
                <span className={`truncate pr-2 ${!selectedLabel ? 'text-gray-500' : 'font-bold'}`}>
                    {selectedLabel || placeholder}
                </span>
                <ChevronDown size={12} className={`text-gray-500 transition-transform ${isOpen ? `rotate-180 ${t.text}` : ''}`} />
            </div>

            {isOpen && (
                <div className="absolute top-full left-0 mt-1 w-full min-w-[180px] bg-[#161b22] border border-gray-700 rounded shadow-2xl z-50 flex flex-col overflow-hidden">
                    <div className="p-1.5 border-b border-gray-700 bg-[#0d1117] shrink-0">
                        <div className="relative">
                            <input
                                type="text" autoFocus value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search..."
                                className={`w-full bg-[#010409] text-gray-300 text-[10px] pl-6 pr-2 py-1.5 rounded border border-gray-800 outline-none transition-colors ${t.focus}`}
                            />
                            <Search size={10} className="absolute left-2.5 top-2.5 text-gray-500" />
                        </div>
                    </div>
                    
                    {/* 🚀 核心修改：加入了 min-h-[160px]，无论数据多少，下拉菜单都会保持一个优雅的基准高度 */}
                    <div className="min-h-[160px] max-h-48 overflow-y-auto custom-scrollbar flex flex-col">
                        {filteredOptions.length === 0 ? (
                            <div className="flex-1 flex items-center justify-center text-[10px] text-gray-600 p-3 italic">
                                No results found
                            </div>
                        ) : (
                            filteredOptions.map((o: any) => (
                                <div
                                    key={o.value}
                                    onClick={() => { onChange(o.value); setIsOpen(false); setSearch(""); }}
                                    className={`flex items-center justify-between px-3 py-2 text-[10px] cursor-pointer transition-colors ${value === o.value ? `${t.text} ${t.bg} font-bold` : 'text-gray-400 hover:bg-[#21262d] hover:text-gray-200'}`}
                                >
                                    <span className="truncate" title={o.label}>{o.label}</span>
                                    {value === o.value && <Check size={12} className="shrink-0 ml-2" />}
                                </div>
                            ))
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};