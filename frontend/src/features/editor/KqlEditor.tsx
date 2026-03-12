// frontend/src/features/editor/KqlEditor.tsx
import React, { useRef, useEffect } from 'react';
import Editor, { useMonaco, Monaco } from '@monaco-editor/react';
import { getKustoWorker } from '@kusto/monaco-kusto';

interface KqlEditorProps {
    value: string;
    onChange?: (value: string | undefined) => void;
    readOnly?: boolean;
    height?: string;
}

export const KqlEditor: React.FC<KqlEditorProps> = ({ 
    value, 
    onChange, 
    readOnly = false,
    height = "100%" 
}) => {
    const monaco = useMonaco();
    const editorRef = useRef<any>(null);

    useEffect(() => {
        if (monaco) {
            // 1. 注册 KQL 语言支持
            // @kusto/monaco-kusto 默认劫持了 monaco 实例，我们需要触发它的初始化
            import('@kusto/monaco-kusto').then((kustoModule) => {
                // 设置 KQL 语言的基本配置
                monaco.languages.setLanguageConfiguration('kusto', {
                    comments: {
                        lineComment: '//',
                    },
                    brackets: [
                        ['{', '}'],
                        ['[', ']'],
                        ['(', ')'],
                    ],
                    autoClosingPairs: [
                        { open: '{', close: '}' },
                        { open: '[', close: ']' },
                        { open: '(', close: ')' },
                        { open: '"', close: '"' },
                        { open: "'", close: "'" },
                    ],
                });

                // 如果后续你需要实现表字段补全 (IntelliSense)，可以在这里注入 Schema
                // getKustoWorker().then((workerAccessor) => {
                //     const model = monaco.editor.getModels()[0];
                //     workerAccessor(model.uri).then((worker) => {
                //         worker.setSchemaFromShowSchema(...);
                //     });
                // });
            });
        }
    }, [monaco]);

    const handleEditorDidMount = (editor: any, monacoInstance: Monaco) => {
        editorRef.current = editor;
        
        // 强制使用深色主题，符合安全工程师审美
        monacoInstance.editor.setTheme('vs-dark');
    };

    return (
        <div className="h-full border border-gray-700 rounded overflow-hidden shadow-inner">
            <Editor
                height="100%"
                language="kusto"
                value={value}
                onChange={onChange}
                onMount={handleEditorDidMount}
                options={{
                    readOnly: readOnly,
                    automaticLayout: true,
                    minimap: { enabled: false }, // 关掉小地图，节省规则编辑器的空间
                    scrollBeyondLastLine: false,
                    fontSize: 14,
                    fontFamily: "'JetBrains Mono', 'Fira Code', Consolas, monospace",
                    wordWrap: 'on',
                    lineNumbersMinChars: 3,
                    renderLineHighlight: 'all',
                    padding: { top: 12, bottom: 12 },
                }}
            />
        </div>
    );
};