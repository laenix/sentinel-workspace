// internal/azure/query.go
package azure

import (
	"context"
	"fmt"

	"github.com/Azure/azure-sdk-for-go/sdk/azcore"
	"github.com/Azure/azure-sdk-for-go/sdk/azcore/cloud"
	"github.com/Azure/azure-sdk-for-go/sdk/azidentity"
	"github.com/Azure/azure-sdk-for-go/sdk/monitor/azquery"
)

type QueryEngine struct {
	client *azquery.LogsClient
}

// 🚀 构造函数注入
func NewQueryEngine(cred *azidentity.InteractiveBrowserCredential, cloudCfg cloud.Configuration) (*QueryEngine, error) {
	opts := &azquery.LogsClientOptions{
		ClientOptions: azcore.ClientOptions{Cloud: cloudCfg},
	}

	client, err := azquery.NewLogsClient(cred, opts)
	if err != nil {
		return nil, fmt.Errorf("创建 Logs Client 失败: %w", err)
	}
	return &QueryEngine{client: client}, nil
}

func (q *QueryEngine) ExecuteKql(ctx context.Context, resourceID string, kql string) ([]map[string]interface{}, error) {
	resp, err := q.client.QueryResource(ctx, resourceID, azquery.Body{
		Query: &kql,
	}, nil)

	if err != nil {
		return nil, fmt.Errorf("KQL 执行失败: %w", err)
	}

	if len(resp.Tables) == 0 {
		return []map[string]interface{}{}, nil
	}

	table := resp.Tables[0]
	var results []map[string]interface{}

	for _, row := range table.Rows {
		rowMap := make(map[string]interface{})
		for i, col := range table.Columns {
			rowMap[*col.Name] = row[i]
		}
		results = append(results, rowMap)
	}

	return results, nil
}
