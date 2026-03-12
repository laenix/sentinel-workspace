// internal/gitops/diff.go
package gitops

import "fmt"

type DiffType string

const (
	DiffAdded     DiffType = "added"
	DiffRemoved   DiffType = "removed"
	DiffUnchanged DiffType = "unchanged"
)

type RowDiff struct {
	Type DiffType               `json:"type"`
	Data map[string]interface{} `json:"data"`
}

// CompareResults 对比两组查询结果
func CompareResults(oldRes, newRes []map[string]interface{}) []RowDiff {
	var diffs []RowDiff

	// 建立旧数据的索引（实际应用中建议使用更精确的 Hash 算法）
	oldMap := make(map[string]bool)
	for _, row := range oldRes {
		key := fmt.Sprintf("%v", row) // 简单实现：将整行转为字符串作为 Key
		oldMap[key] = true
	}

	newMap := make(map[string]bool)
	for _, row := range newRes {
		key := fmt.Sprintf("%v", row)
		newMap[key] = true

		if !oldMap[key] {
			diffs = append(diffs, RowDiff{Type: DiffAdded, Data: row})
		} else {
			diffs = append(diffs, RowDiff{Type: DiffUnchanged, Data: row})
		}
	}

	for _, row := range oldRes {
		key := fmt.Sprintf("%v", row)
		if !newMap[key] {
			diffs = append(diffs, RowDiff{Type: DiffRemoved, Data: row})
		}
	}

	return diffs
}
