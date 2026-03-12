// internal/models/rule.go
package models

// RuleFrontmatter 映射 YAML 头信息，严格对齐 Sentinel ScheduledAlertRule 的 Properties
type RuleFrontmatter struct {
	ID                  string   `yaml:"id"`   // Sentinel Rule ARM ID
	Etag                string   `yaml:"etag"` // 乐观并发控制锁
	DisplayName         string   `yaml:"displayName"`
	Description         string   `yaml:"description"`
	Severity            string   `yaml:"severity"` // High, Medium, Low, Informational
	Enabled             bool     `yaml:"enabled"`
	Tactics             []string `yaml:"tactics"`
	Techniques          []string `yaml:"techniques"`
	QueryFrequency      string   `yaml:"queryFrequency"`  // ISO 8601, e.g., PT1H
	QueryPeriod         string   `yaml:"queryPeriod"`     // ISO 8601
	TriggerOperator     string   `yaml:"triggerOperator"` // GreaterThan, Equal 等
	TriggerThreshold    int      `yaml:"triggerThreshold"`
	SuppressionEnabled  bool     `yaml:"suppressionEnabled"`
	SuppressionDuration string   `yaml:"suppressionDuration,omitempty"`
}

// LocalRule 表示解析后的本地 Markdown 规则完整结构
type LocalRule struct {
	Metadata RuleFrontmatter
	Topology string // 存放 Mermaid 逻辑拓扑文本
	KQL      string // 纯净的 Kusto 查询语句
}
