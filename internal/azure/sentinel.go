// internal/azure/sentinel.go
package azure

import (
	"context"
	"errors"
	"fmt"
	"io"
	"sentinel-workspace/internal/models"
	"strings"

	"github.com/Azure/azure-sdk-for-go/sdk/azcore"
	"github.com/Azure/azure-sdk-for-go/sdk/azcore/arm"
	"github.com/Azure/azure-sdk-for-go/sdk/azcore/cloud"
	"github.com/Azure/azure-sdk-for-go/sdk/azidentity"
	"github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/securityinsights/armsecurityinsights"
)

type SentinelClient struct {
	cred     *azidentity.InteractiveBrowserCredential
	cloudCfg cloud.Configuration // 🚀 新增：保存云环境配置
}

// 🚀 修改构造函数：接收 cloudCfg
func NewSentinelClient(cred *azidentity.InteractiveBrowserCredential, cloudCfg cloud.Configuration) *SentinelClient {
	return &SentinelClient{cred: cred, cloudCfg: cloudCfg}
}

// 🚀 新增辅助方法：动态生成带云端点的 Options
func (s *SentinelClient) getClientOpts() *arm.ClientOptions {
	return &arm.ClientOptions{
		ClientOptions: azcore.ClientOptions{
			Cloud: s.cloudCfg,
		},
	}
}

// ListScheduledRules 获取指定 Workspace 下的所有计划查询规则
func (s *SentinelClient) ListScheduledRules(ctx context.Context, subID, rgName, workspaceName string) ([]*armsecurityinsights.ScheduledAlertRule, error) {
	if s.cred == nil {
		return nil, fmt.Errorf("未授权，请先登录")
	}

	// 🚀 注入 getClientOpts() 替代 nil
	clientFactory, err := armsecurityinsights.NewClientFactory(subID, s.cred, s.getClientOpts())
	if err != nil {
		return nil, fmt.Errorf("创建 Sentinel Client 失败: %w", err)
	}

	pager := clientFactory.NewAlertRulesClient().NewListPager(rgName, workspaceName, nil)
	var rules []*armsecurityinsights.ScheduledAlertRule

	for pager.More() {
		page, err := pager.NextPage(ctx)
		if err != nil {
			return nil, fmt.Errorf("获取规则页失败: %w", err)
		}
		for _, rule := range page.Value {
			if scheduledRule, ok := rule.(*armsecurityinsights.ScheduledAlertRule); ok {
				rules = append(rules, scheduledRule)
			}
		}
	}
	return rules, nil
}

// CreateOrUpdateScheduledRule 将本地解析的规则安全地推送至 Azure
func (s *SentinelClient) CreateOrUpdateScheduledRule(ctx context.Context, subID, rgName, workspaceName string, rule models.LocalRule) error {
	clientFactory, err := armsecurityinsights.NewClientFactory(subID, s.cred, s.getClientOpts())
	if err != nil {
		return err
	}
	client := clientFactory.NewAlertRulesClient()

	parts := strings.Split(rule.Metadata.ID, "/")
	ruleUUID := parts[len(parts)-1]

	etag := strings.TrimSpace(rule.Metadata.Etag)
	if etag == "" || etag == `""` {
		etag = "*"
	} else if !strings.HasPrefix(etag, "\"") {
		etag = fmt.Sprintf(`"%s"`, etag)
	}

	severity := armsecurityinsights.AlertSeverity(rule.Metadata.Severity)
	if string(severity) == "" {
		severity = armsecurityinsights.AlertSeverityMedium
	}
	supEnabled := rule.Metadata.SuppressionEnabled
	supDuration := rule.Metadata.SuppressionDuration

	if supDuration == "" {
		supDuration = "PT1D"
	}

	props := &armsecurityinsights.ScheduledAlertRuleProperties{
		DisplayName:         toPtr(rule.Metadata.DisplayName),
		Enabled:             toPtr(rule.Metadata.Enabled),
		Query:               toPtr(rule.KQL),
		Severity:            toPtr(severity),
		SuppressionEnabled:  toPtr(supEnabled),
		SuppressionDuration: toPtr(supDuration),
	}

	if rule.Metadata.Description != "" {
		props.Description = toPtr(rule.Metadata.Description)
	}
	if rule.Metadata.QueryFrequency != "" {
		props.QueryFrequency = toPtr(rule.Metadata.QueryFrequency)
	}
	if rule.Metadata.QueryPeriod != "" {
		props.QueryPeriod = toPtr(rule.Metadata.QueryPeriod)
	}

	if rule.Metadata.TriggerOperator != "" {
		props.TriggerOperator = toPtr(armsecurityinsights.TriggerOperator(rule.Metadata.TriggerOperator))
		props.TriggerThreshold = toPtr(int32(rule.Metadata.TriggerThreshold))
	}

	var tactics []*armsecurityinsights.AttackTactic
	for _, t := range rule.Metadata.Tactics {
		val := armsecurityinsights.AttackTactic(t)
		tactics = append(tactics, &val)
	}
	if len(tactics) > 0 {
		props.Tactics = tactics
	}

	armRule := armsecurityinsights.ScheduledAlertRule{
		Etag:       toPtr(etag),
		Kind:       toPtr(armsecurityinsights.AlertRuleKindScheduled),
		Properties: props,
	}

	_, err = client.CreateOrUpdate(ctx, rgName, workspaceName, ruleUUID, &armRule, nil)

	if err != nil {
		var respErr *azcore.ResponseError
		if errors.As(err, &respErr) {
			body, _ := io.ReadAll(respErr.RawResponse.Body)
			return fmt.Errorf("Azure 拒绝请求 [%s]: %s", respErr.ErrorCode, string(body))
		}
		return fmt.Errorf("推送 API 异常: %w", err)
	}

	return nil
}

func toPtr[T any](v T) *T {
	return &v
}

func (s *SentinelClient) ListWatchlists(ctx context.Context, subID, rgName, workspaceName string) ([]*armsecurityinsights.Watchlist, error) {
	if s.cred == nil {
		return nil, fmt.Errorf("未授权，请先登录")
	}

	clientFactory, err := armsecurityinsights.NewClientFactory(subID, s.cred, s.getClientOpts())
	if err != nil {
		return nil, fmt.Errorf("创建 ClientFactory 失败: %w", err)
	}

	client := clientFactory.NewWatchlistsClient()
	pager := client.NewListPager(rgName, workspaceName, nil)

	var watchlists []*armsecurityinsights.Watchlist
	for pager.More() {
		page, err := pager.NextPage(ctx)
		if err != nil {
			return nil, fmt.Errorf("获取 Watchlist 列表失败: %w", err)
		}
		watchlists = append(watchlists, page.Value...)
	}
	return watchlists, nil
}

func (s *SentinelClient) ListWatchlistItems(ctx context.Context, subID, rgName, workspaceName, watchlistAlias string, logCb func(string)) ([]*armsecurityinsights.WatchlistItem, error) {
	if s.cred == nil {
		return nil, fmt.Errorf("未授权，请先登录")
	}

	clientFactory, err := armsecurityinsights.NewClientFactory(subID, s.cred, s.getClientOpts())
	if err != nil {
		return nil, err
	}

	client := clientFactory.NewWatchlistItemsClient()
	pager := client.NewListPager(rgName, workspaceName, watchlistAlias, nil)

	var items []*armsecurityinsights.WatchlistItem
	pageCount := 0

	if logCb != nil {
		logCb(fmt.Sprintf("[API] 开始拉取 Watchlist 数据: %s", watchlistAlias))
	}

	for pager.More() {
		pageCount++
		if logCb != nil {
			logCb(fmt.Sprintf("[API] 正在拉取 %s 的第 %d 页数据 (每页100条)...", watchlistAlias, pageCount))
		}

		page, err := pager.NextPage(ctx)
		if err != nil {
			return nil, fmt.Errorf("获取 Watchlist Items 失败: %w", err)
		}
		items = append(items, page.Value...)
	}

	if logCb != nil {
		logCb(fmt.Sprintf("[API] %s 数据拉取完成！共计 %d 条记录。", watchlistAlias, len(items)))
	}

	return items, nil
}

func (s *SentinelClient) CreateOrUpdateWatchlist(ctx context.Context, subID, rgName, wsName string, alias string, meta models.WatchlistMetadata) error {
	clientFactory, err := armsecurityinsights.NewClientFactory(subID, s.cred, s.getClientOpts())
	if err != nil {
		return err
	}
	client := clientFactory.NewWatchlistsClient()

	wl := armsecurityinsights.Watchlist{
		Properties: &armsecurityinsights.WatchlistProperties{
			DisplayName:    toPtr(meta.DisplayName),
			Provider:       toPtr(meta.Provider),
			Source:         (*armsecurityinsights.Source)(toPtr(meta.Source)),
			Description:    toPtr(meta.Description),
			ItemsSearchKey: toPtr(meta.SearchKey),
		},
	}

	_, err = client.CreateOrUpdate(ctx, rgName, wsName, alias, wl, nil)
	return err
}

func (s *SentinelClient) CreateOrUpdateWatchlistItem(ctx context.Context, subID, rgName, wsName string, alias string, itemID string, rowData map[string]any) error {
	clientFactory, _ := armsecurityinsights.NewClientFactory(subID, s.cred, s.getClientOpts())
	client := clientFactory.NewWatchlistItemsClient()

	item := armsecurityinsights.WatchlistItem{
		Properties: &armsecurityinsights.WatchlistItemProperties{
			ItemsKeyValue: rowData,
		},
	}

	_, err := client.CreateOrUpdate(ctx, rgName, wsName, alias, itemID, item, nil)
	return err
}

func (s *SentinelClient) DeleteWatchlistItem(ctx context.Context, subID, rgName, wsName string, alias string, itemID string) error {
	clientFactory, _ := armsecurityinsights.NewClientFactory(subID, s.cred, s.getClientOpts())
	client := clientFactory.NewWatchlistItemsClient()

	_, err := client.Delete(ctx, rgName, wsName, alias, itemID, nil)
	return err
}
