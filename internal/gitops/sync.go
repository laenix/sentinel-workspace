// internal/gitops/sync.go
package gitops

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"

	"sentinel-workspace/internal/azure"
	"sentinel-workspace/internal/models"
	"sentinel-workspace/internal/parser"

	"github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/securityinsights/armsecurityinsights"
)

type SyncEngine struct {
	baseDir string
	git     *GitEngine // 注入 Git 引擎
}

// NewSyncEngine 实例化同步引擎，并初始化 Git 仓库
func NewSyncEngine(baseDir string) (*SyncEngine, error) {
	gitEngine, err := NewGitEngine(baseDir)
	if err != nil {
		return nil, fmt.Errorf("加载 Git 引擎失败: %w", err)
	}

	return &SyncEngine{
		baseDir: baseDir,
		git:     gitEngine,
	}, nil
}

// PullRulesToLocal 批量将云端规则写入本地 Markdown，并自动 Commit
func (e *SyncEngine) PullRulesToLocal(targetDir string, rules []*armsecurityinsights.ScheduledAlertRule) error {
	rulesDir := filepath.Join(targetDir, "rules", "scheduled")
	if err := os.MkdirAll(rulesDir, 0755); err != nil {
		return fmt.Errorf("创建规则目录失败: %w", err)
	}

	var wg sync.WaitGroup
	errCh := make(chan error, len(rules))
	sem := make(chan struct{}, 10) // 限制并发数为 10
	for _, r := range rules {
		wg.Add(1)
		sem <- struct{}{}
		go func(rule *armsecurityinsights.ScheduledAlertRule) {
			defer wg.Done()
			defer func() { <-sem }()

			localRule := mapAzureRuleToLocal(rule)
			markdownBytes, err := parser.GenerateMarkdown(localRule)
			if err != nil {
				errCh <- fmt.Errorf("生成规则失败: %w", err)
				return
			}
			safeName := localRule.Metadata.DisplayName
			if safeName == "" {
				// 兜底：如果没名字，提取 ID 的最后一段(即纯净的 UUID)
				parts := strings.Split(localRule.Metadata.ID, "/")
				safeName = parts[len(parts)-1]
			}
			// 清理 Windows/Linux 文件系统不允许的特殊字符
			replacer := strings.NewReplacer("/", "_", "\\", "_", ":", "_", "*", "_", "?", "_", "\"", "_", "<", "_", ">", "_", "|", "_")
			safeName = replacer.Replace(safeName)
			if len(safeName) > 150 {
				safeName = strings.TrimSpace(safeName[:150])
			}

			fileName := fmt.Sprintf("%s.md", safeName)
			filePath := filepath.Join(rulesDir, fileName)

			// ==========================================
			// 🛡️ 智能防覆盖 & Markdown 缝合合并机制
			// ==========================================
			if existingBytes, err := os.ReadFile(filePath); err == nil {
				existingStr := string(existingBytes)

				if existingRule, parseErr := parser.ParseMarkdown(existingBytes); parseErr == nil {
					// 1. ETag 校验：如果云端根本没改过，直接跳过，保护你本地的草稿
					if existingRule.Metadata.Etag == localRule.Metadata.Etag {
						fmt.Printf("🛡️ [跳过] 云端无变化，保留本地修改: %s\n", fileName)
						return
					}
				}

				// 2. 智能合并：云端有更新，我们需要覆盖 KQL 和 YAML，但保留用户的拓展笔记！
				// 我们定位本地文件中 KQL 代码块的结束位置
				kqlStartIdx := strings.Index(existingStr, "```kql")
				if kqlStartIdx != -1 {
					// 从 ```kql 往后找，寻找代码块的结束符 ```
					kqlEndIdx := strings.Index(existingStr[kqlStartIdx+6:], "```")
					if kqlEndIdx != -1 {
						// 计算出老文件里 KQL 结束的绝对位置
						absoluteEndIdx := kqlStartIdx + 6 + kqlEndIdx + 3

						// 提取出原来 KQL 块下方的所有内容（比如你的 Mermaid 图和测试说明）
						customNotes := strings.TrimSpace(existingStr[absoluteEndIdx:])

						if len(customNotes) > 0 {
							// 将提取出来的自定义笔记，完美拼接到新拉取的 Markdown 尾部！
							markdownBytes = append(markdownBytes, []byte("\n\n"+customNotes+"\n")...)
						}
					}
				}
			}
			// ==========================================

			// 执行最终的落盘写入（此时的 markdownBytes 已经是缝合后的完美体了）
			if err := os.WriteFile(filePath, markdownBytes, 0644); err != nil {
				errCh <- fmt.Errorf("写入文件失败 (%s): %w", fileName, err)
			}
		}(r)
	}
	wg.Wait()
	close(errCh)
	for err := range errCh {
		if err != nil {
			fmt.Printf("Sync Warning: %v\n", err)
		}
	}
	// 所有文件写入完毕后，触发自动提交
	commitResult, err := e.git.CommitAll("Auto sync Sentinel rules from Azure", "VSentry Bot", "bot@vsentry.local")
	if err != nil {
		return fmt.Errorf("规则落盘成功, 但 Git 提交失败: %w", err)
	}
	fmt.Printf("GitOps: %s\n", commitResult)
	return nil
}

// mapAzureRuleToLocal 数据清洗与结构映射
func mapAzureRuleToLocal(rule *armsecurityinsights.ScheduledAlertRule) *models.LocalRule {
	props := rule.Properties

	// 处理可能的 nil 值，避免 Panic
	safeString := func(s *string) string {
		if s == nil {
			return ""
		}
		return *s
	}

	etag := safeString(rule.Etag)
	// 去除 Etag 头尾的引号，以便后续比对
	if len(etag) > 2 && etag[0] == '"' && etag[len(etag)-1] == '"' {
		etag = etag[1 : len(etag)-1]
	}

	tactics := []string{}
	for _, t := range props.Tactics {
		tactics = append(tactics, string(*t))
	}

	frequency := ""
	if props.QueryFrequency != nil {
		frequency = string(*props.QueryFrequency)
	}

	period := ""
	if props.QueryPeriod != nil {
		period = string(*props.QueryPeriod)
	}

	operator := ""
	if props.TriggerOperator != nil {
		operator = string(*props.TriggerOperator)
	}

	threshold := 0
	if props.TriggerThreshold != nil {
		threshold = int(*props.TriggerThreshold)
	}
	// 提取抑制配置
	suppressionEnabled := false
	if props.SuppressionEnabled != nil {
		suppressionEnabled = *props.SuppressionEnabled
	}

	suppressionDuration := ""
	if props.SuppressionDuration != nil {
		suppressionDuration = string(*props.SuppressionDuration)
	}
	metadata := models.RuleFrontmatter{
		ID:               safeString(rule.ID),
		Etag:             etag,
		DisplayName:      safeString(props.DisplayName),
		Description:      safeString(props.Description),
		Severity:         string(*props.Severity),
		Enabled:          *props.Enabled,
		Tactics:          tactics,
		QueryFrequency:   frequency,
		QueryPeriod:      period,
		TriggerOperator:  operator,
		TriggerThreshold: threshold,
		// 存入结构体
		SuppressionEnabled:  suppressionEnabled,
		SuppressionDuration: suppressionDuration,
	}

	return &models.LocalRule{
		Metadata: metadata,
		KQL:      safeString(props.Query),
		Topology: "", // 初始拉取时拓扑为空，留给分析师后续在 Markdown 中手写
	}
}

// PushLocalRulesToAzure 扫描本地规则目录并批量推送到云端 (无状态独立函数)
func PushLocalRulesToAzure(ctx context.Context, client *azure.SentinelClient, targetDir string, subID, rgName, wsName string) ([]string, []error) {
	rulesDir := filepath.Join(targetDir, "rules", "scheduled")
	files, _ := filepath.Glob(filepath.Join(rulesDir, "*.md"))

	var successes []string
	var errorsList []error

	for _, file := range files {
		content, err := os.ReadFile(file)
		if err != nil {
			errorsList = append(errorsList, fmt.Errorf("读取文件 %s 失败: %w", filepath.Base(file), err))
			continue
		}

		// 使用 parser 解析 Markdown
		localRule, err := parser.ParseMarkdown(content)
		if err != nil {
			errorsList = append(errorsList, fmt.Errorf("解析文件 %s 失败: %w", filepath.Base(file), err))
			continue
		}

		// 执行推送
		err = client.CreateOrUpdateScheduledRule(ctx, subID, rgName, wsName, *localRule)
		if err != nil {
			// ==========================================
			// 🛡️ ETag 冲突保护机制 (精确捕获 412 Precondition Failed)
			// ==========================================
			errMsg := err.Error()
			if strings.Contains(errMsg, "412") || strings.Contains(errMsg, "PreconditionFailed") {
				// 拦截冲突：拒绝覆盖云端最新代码！
				conflictMsg := fmt.Errorf("⚠️ [冲突拦截] 规则 '%s' 在云端已被他人修改！请先执行 Azure PULL 进行合并，再尝试推送。", localRule.Metadata.DisplayName)
				errorsList = append(errorsList, conflictMsg)
			} else {
				errorsList = append(errorsList, fmt.Errorf("推送规则 '%s' 失败: %v", localRule.Metadata.DisplayName, err))
			}
		} else {
			successes = append(successes, localRule.Metadata.DisplayName)
		}
	}

	return successes, errorsList
}
