package models

// AzureSubscription 表示一个 Azure 订阅
type AzureSubscription struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

// AzureWorkspace 表示一个 Log Analytics Workspace
type AzureWorkspace struct {
	ID            string `json:"id"`
	Name          string `json:"name"`
	ResourceGroup string `json:"resourceGroup"`
	Location      string `json:"location"`
}
