// frontend/src/lib/utils.ts

/**
 * 从 Markdown 文本中提取 KQL 代码块
 */
export const extractKqlFromMarkdown = (markdown: string): string => {
    // 匹配 ```kql ... ``` 之间的内容，使用 [\s\S]* 匹配包括换行符在内的任意字符
    const match = markdown.match(/```kql\s*([\s\S]*?)\n```/);
    if (match && match[1]) {
        return match[1].trim();
    }
    return ""; // 如果没有找到 KQL 代码块，返回空
};