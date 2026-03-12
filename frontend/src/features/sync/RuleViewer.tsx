import React, { useEffect, useState, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import mermaid from 'mermaid';

// 1. 初始化配置：关闭自动寻找 DOM，改为纯 API 驱动
mermaid.initialize({ startOnLoad: false, theme: 'dark' });

// ==========================================
// 2. 封装专属的高阶 Mermaid 渲染块
// ==========================================
const MermaidBlock = ({ code }: { code: string }) => {
    const [svg, setSvg] = useState<string>('');
    const [hasError, setHasError] = useState(false);
    
    // 为每个图表生成唯一的 ID，防止 React 渲染冲突
    const containerId = useRef(`mermaid-${Math.random().toString(36).substring(2, 9)}`);

    useEffect(() => {
        let isMounted = true;

        const renderMermaid = async () => {
            try {
                setHasError(false);
                // 异步调用原生 render API
                const { svg } = await mermaid.render(containerId.current, code);
                if (isMounted) {
                    setSvg(svg);
                }
            } catch (err) {
                // 静默拦截 Mermaid 报错，不让控制台爆红
                if (isMounted) setHasError(true);
            }
        };

        // 【核心】：加入 300ms 的防抖！
        // 当用户正在疯狂敲击键盘时，不去频繁调用解析引擎
        const timer = setTimeout(() => {
            if (code.trim()) {
                renderMermaid();
            }
        }, 300);

        return () => {
            isMounted = false;
            clearTimeout(timer);
        };
    }, [code]);

    if (hasError) {
        // 优雅的降级报错态：不要炸弹，用极客风的提示框
        return (
            <div className="bg-[#2d1114]/50 border border-red-900/50 p-4 rounded-lg my-4 flex items-center gap-3">
                <span className="text-lg opacity-80">⚠️</span>
                <div className="text-xs text-red-400 font-mono italic">
                    Syntax error in Mermaid chart. Keep typing...
                </div>
            </div>
        );
    }

    return (
        <div 
            className="flex justify-center bg-[#161b22] p-4 rounded-lg border border-gray-800 my-4"
            dangerouslySetInnerHTML={{ __html: svg }} 
        />
    );
};

// ==========================================
// 3. 主视图组件
// ==========================================
export const RuleViewer: React.FC<{ content: string }> = ({ content }) => {
    
    // 【删除了原来的 useEffect(() => mermaid.contentLoaded(), ...)】

    return (
        <div className="prose prose-invert prose-sm max-w-none p-6 bg-[#0d1117] h-full overflow-y-auto custom-scrollbar">
            {content ? (
                <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                        code({ node, inline, className, children, ...props }: any) {
                            const match = /language-(\w+)/.exec(className || '');
                            const isMermaid = match && match[1] === 'mermaid';

                            if (isMermaid) {
                                // 使用刚才封装的智能组件
                                return <MermaidBlock code={String(children).replace(/\n$/, '')} />;
                            }

                            return !inline ? (
                                <div className="rounded-md border border-gray-800 overflow-hidden my-4">
                                    <div className="bg-[#161b22] px-4 py-1 text-[10px] text-gray-500 font-mono border-b border-gray-800">
                                        {match?.[1] || 'text'}
                                    </div>
                                    <pre className="!m-0 !bg-[#010409] !p-4">
                                        <code className={className} {...props}>
                                            {children}
                                        </code>
                                    </pre>
                                </div>
                            ) : (
                                <code className="bg-[#161b22] text-blue-300 px-1.5 py-0.5 rounded text-xs font-mono border border-gray-800" {...props}>
                                    {children}
                                </code>
                            );
                        }
                    }}
                >
                    {content}
                </ReactMarkdown>
            ) : (
                <div className="flex h-full items-center justify-center text-gray-600 italic">
                    Select a rule from the Explorer to preview its Markdown source.
                </div>
            )}
        </div>
    );
};