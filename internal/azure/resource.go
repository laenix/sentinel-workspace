package azure

import (
	"context"
	"fmt"
	"strings"

	"sentinel-workspace/internal/models"

	"github.com/Azure/azure-sdk-for-go/sdk/azcore"
	"github.com/Azure/azure-sdk-for-go/sdk/azcore/arm"
	"github.com/Azure/azure-sdk-for-go/sdk/azcore/cloud"
	"github.com/Azure/azure-sdk-for-go/sdk/azidentity"
	"github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/operationalinsights/armoperationalinsights"
	"github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/subscription/armsubscription"
)

type ResourceManager struct {
	cred     *azidentity.InteractiveBrowserCredential
	cloudCfg cloud.Configuration // 🚀 新增
}

// 🚀 构造函数注入
func NewResourceManager(cred *azidentity.InteractiveBrowserCredential, cloudCfg cloud.Configuration) *ResourceManager {
	return &ResourceManager{cred: cred, cloudCfg: cloudCfg}
}

func (rm *ResourceManager) GetSubscriptions(ctx context.Context) ([]models.AzureSubscription, error) {
	if rm.cred == nil {
		return nil, fmt.Errorf("凭据为空，请先登录")
	}

	// 🚀 注入 Cloud 端点
	opts := &arm.ClientOptions{
		ClientOptions: azcore.ClientOptions{Cloud: rm.cloudCfg},
	}
	clientFactory, err := armsubscription.NewClientFactory(rm.cred, opts)
	if err != nil {
		return nil, fmt.Errorf("创建 Subscription Client 失败: %w", err)
	}

	pager := clientFactory.NewSubscriptionsClient().NewListPager(nil)
	var subs []models.AzureSubscription

	for pager.More() {
		page, err := pager.NextPage(ctx)
		if err != nil {
			return nil, fmt.Errorf("获取订阅页失败: %w", err)
		}
		for _, v := range page.Value {
			subs = append(subs, models.AzureSubscription{
				ID:   *v.SubscriptionID,
				Name: *v.DisplayName,
			})
		}
	}
	return subs, nil
}

func (rm *ResourceManager) GetWorkspaces(ctx context.Context, subID string) ([]models.AzureWorkspace, error) {
	if rm.cred == nil {
		return nil, fmt.Errorf("凭据为空，请先登录")
	}

	// 🚀 注入 Cloud 端点
	opts := &arm.ClientOptions{
		ClientOptions: azcore.ClientOptions{Cloud: rm.cloudCfg},
	}
	clientFactory, err := armoperationalinsights.NewClientFactory(subID, rm.cred, opts)
	if err != nil {
		return nil, fmt.Errorf("创建 Workspace Client 失败: %w", err)
	}

	pager := clientFactory.NewWorkspacesClient().NewListPager(nil)
	var workspaces []models.AzureWorkspace

	for pager.More() {
		page, err := pager.NextPage(ctx)
		if err != nil {
			return nil, fmt.Errorf("获取 Workspace 页失败: %w", err)
		}
		for _, w := range page.Value {
			rg := extractResourceGroup(*w.ID)
			workspaces = append(workspaces, models.AzureWorkspace{
				ID:            *w.ID,
				Name:          *w.Name,
				ResourceGroup: rg,
				Location:      *w.Location,
			})
		}
	}
	return workspaces, nil
}

func extractResourceGroup(armID string) string {
	parts := strings.Split(armID, "/")
	for i, part := range parts {
		if strings.ToLower(part) == "resourcegroups" && i+1 < len(parts) {
			return parts[i+1]
		}
	}
	return "Unknown"
}
