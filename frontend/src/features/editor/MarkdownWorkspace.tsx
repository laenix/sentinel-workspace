import React, { useState, useEffect } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { RuleViewer } from '../sync/RuleViewer';
import { SaveLocalRuleMarkdown } from '../../../wailsjs/go/main/App';
import { Save, SplitSquareHorizontal } from 'lucide-react';
import Editor from '@monaco-editor/react';
import { extractKqlFromMarkdown } from '../../lib/utils';

export const MarkdownWorkspace: React.FC = () => {
    const store = useAppStore();
    
    // 使用本地状态来实现"所见即所得"，不污染全局状态直到点击保存
    const [draftContent, setDraftContent] = useState("");
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        setDraftContent(store.rawMarkdown);
    }, [store.rawMarkdown, store.selectedFile]);

    const handleSave = async () => {
        if (!store.selectedFile || !store.localSub || !store.repoPath) {
            alert("Please select a file from Explorer first.");
            return;
        }

        setSaving(true);
        try {
            await SaveLocalRuleMarkdown(
                store.repoPath, store.localTenant, store.localSub, store.localRg, store.localWs, 
                store.selectedFile, draftContent
            );
            
            // 同步更新全局状态
            store.setRawMarkdown(draftContent);
            store.setBaselineKql(extractKqlFromMarkdown(draftContent));
            
            alert("Markdown 文档保存成功！");
        } catch (err) {
            alert(`保存失败: ${err}`);
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="flex flex-col h-full bg-[#0d1117] text-gray-300">
            {/* 顶部工具栏 */}
            <div className="h-10 border-b border-gray-800 flex items-center justify-between px-4 bg-[#161b22]/50 shrink-0">
                <div className="flex items-center space-x-2 text-gray-400">
                    <SplitSquareHorizontal size={16} className="text-purple-400" />
                    <span className="text-[10px] font-bold uppercase tracking-widest">Markdown Split Editor</span>
                    <span className="text-gray-600 px-2">|</span>
                    <span className="text-xs text-purple-300 font-mono">{store.selectedFile || "No file selected"}</span>
                </div>
                
                <button 
                    onClick={handleSave} 
                    disabled={saving || !store.selectedFile || draftContent === store.rawMarkdown}
                    className="flex items-center space-x-1.5 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-1.5 rounded text-xs font-bold transition-all shadow-lg shadow-purple-900/20"
                >
                    <Save size={14} />
                    <span>{saving ? "SAVING..." : "SAVE DOCS"}</span>
                </button>
            </div>

            {/* 左右分栏工作区 (已对调) */}
            <div className="flex-1 flex overflow-hidden">
                
                {/* [左侧]：实时渲染预览区 (Preview) */}
                <div className="w-1/2 border-r border-gray-800 flex flex-col bg-[#0d1117]">
                    <div className="h-7 bg-[#161b22] border-b border-gray-800 flex items-center px-3 text-[10px] text-gray-500 font-bold tracking-widest uppercase">
                        Preview / Read
                    </div>
                    <div className="flex-1 overflow-y-auto custom-scrollbar relative">
                        <RuleViewer content={draftContent} />
                    </div>
                </div>

                {/* [右侧]：源码编辑区 (Source/Editor) */}
                <div className="w-1/2 flex flex-col bg-[#010409]">
                    <div className="h-7 bg-[#161b22] border-b border-gray-800 flex items-center px-3 text-[10px] text-gray-500 font-bold tracking-widest uppercase">
                        Markdown Source
                    </div>
                    <div className="flex-1 pt-2">
                        <Editor
                            height="100%"
                            language="markdown"
                            theme="vs-dark"
                            value={draftContent}
                            onChange={(val) => setDraftContent(val || "")}
                            options={{
                                minimap: { enabled: false },
                                wordWrap: 'on',
                                fontSize: 13,
                                fontFamily: "'JetBrains Mono', 'Fira Code', Consolas, monospace",
                                padding: { top: 16 }
                            }}
                        />
                    </div>
                </div>

            </div>
        </div>
    );
};