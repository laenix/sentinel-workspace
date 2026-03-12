// internal/parser/markdown.go
package parser

import (
	"bytes"
	"fmt"
	"regexp"
	"strings"

	"sentinel-workspace/internal/models"

	"gopkg.in/yaml.v3"
)

var (
	// 匹配 KQL 代码块的正则
	kqlRegex = regexp.MustCompile("(?s)```kql\\s*(.*?)\\s*```")
	// 匹配 Mermaid 代码块的正则
	mermaidRegex = regexp.MustCompile("(?s)```mermaid\\s*(.*?)\\s*```")
)

// ParseMarkdown 解析本地的 Sentinel 规则 Markdown 文件
func ParseMarkdown(content []byte) (*models.LocalRule, error) {
	// 1. 分离 Frontmatter 和 Markdown 正文
	parts := bytes.SplitN(content, []byte("---"), 3)
	if len(parts) < 3 {
		return nil, fmt.Errorf("无效的文件格式: 缺失 YAML Frontmatter 分界线 '---'")
	}

	yamlContent := parts[1]
	markdownBody := string(parts[2])

	// 2. 反序列化 YAML
	var metadata models.RuleFrontmatter
	if err := yaml.Unmarshal(yamlContent, &metadata); err != nil {
		return nil, fmt.Errorf("解析 YAML 失败: %w", err)
	}

	// 3. 提取 KQL 源码
	kqlMatch := kqlRegex.FindStringSubmatch(markdownBody)
	kqlQuery := ""
	if len(kqlMatch) > 1 {
		kqlQuery = strings.TrimSpace(kqlMatch[1])
	} else {
		return nil, fmt.Errorf("未在文件中找到 ```kql 代码块")
	}

	// 4. 提取 Mermaid 拓扑 (可选)
	topology := ""
	mermaidMatch := mermaidRegex.FindStringSubmatch(markdownBody)
	if len(mermaidMatch) > 1 {
		topology = strings.TrimSpace(mermaidMatch[1])
	}

	return &models.LocalRule{
		Metadata: metadata,
		KQL:      kqlQuery,
		Topology: topology,
	}, nil
}

// GenerateMarkdown 将结构化数据序列化为标准的 GitOps Markdown 格式
func GenerateMarkdown(rule *models.LocalRule) ([]byte, error) {
	yamlBytes, err := yaml.Marshal(&rule.Metadata)
	if err != nil {
		return nil, fmt.Errorf("序列化 YAML 失败: %w", err)
	}

	var buf bytes.Buffer
	buf.WriteString("---\n")
	buf.Write(yamlBytes)
	buf.WriteString("---\n\n")

	buf.WriteString(fmt.Sprintf("# %s\n\n", rule.Metadata.DisplayName))
	buf.WriteString(fmt.Sprintf("%s\n\n", rule.Metadata.Description))

	if rule.Topology != "" {
		buf.WriteString("## 逻辑拓扑\n")
		buf.WriteString("```mermaid\n")
		buf.WriteString(rule.Topology)
		buf.WriteString("\n```\n\n")
	}

	buf.WriteString("## KQL 源码\n")
	buf.WriteString("```kql\n")
	buf.WriteString(rule.KQL)
	buf.WriteString("\n```\n")

	return buf.Bytes(), nil
}
