package main

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	"github.com/google/uuid"
	"github.com/wailsapp/wails/v2/pkg/runtime"

	"sentinel-workspace/internal/azure"
	"sentinel-workspace/internal/gitops"
	"sentinel-workspace/internal/models"
	"sentinel-workspace/internal/parser"

	"github.com/Azure/azure-sdk-for-go/sdk/azcore"
	"github.com/Azure/azure-sdk-for-go/sdk/azcore/arm"
	"github.com/Azure/azure-sdk-for-go/sdk/azcore/cloud"
	"github.com/Azure/azure-sdk-for-go/sdk/azcore/policy"
	"github.com/Azure/azure-sdk-for-go/sdk/azidentity"
	"github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/resources/armsubscriptions"
)

type App struct {
	ctx            context.Context
	authenticator  *azure.Authenticator
	resourceMgr    *azure.ResourceManager
	sentinelClient *azure.SentinelClient
	queryEngine    *azure.QueryEngine

	currentCloudConfig cloud.Configuration
	currentTenantID    string
	baseCred           *azidentity.InteractiveBrowserCredential
}

// 🚀 核心修正：去除 UserName，恢复 4 层结构
type LocalContext struct {
	TenantName    string `json:"tenantName"`
	Subscription  string `json:"subscription"`
	ResourceGroup string `json:"resourceGroup"`
	Workspace     string `json:"workspace"`
}

func NewApp() *App {
	return &App{
		authenticator: azure.NewAuthenticator(),
	}
}

func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
}

func sanitizePath(name string) string {
	replacer := strings.NewReplacer("/", "_", "\\", "_", ":", "_", "*", "_", "?", "_", "\"", "_", "<", "_", ">", "_", "|", "_")
	return replacer.Replace(name)
}

func extractUserFromToken(tokenString string) string {
	parts := strings.Split(tokenString, ".")
	if len(parts) < 2 {
		return "admin"
	}
	payload, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return "admin"
	}
	var claims map[string]interface{}
	if err := json.Unmarshal(payload, &claims); err != nil {
		return "admin"
	}
	if upn, ok := claims["upn"].(string); ok && upn != "" {
		return strings.Split(upn, "@")[0]
	}
	if email, ok := claims["email"].(string); ok && email != "" {
		return strings.Split(email, "@")[0]
	}
	if name, ok := claims["name"].(string); ok && name != "" {
		return strings.ReplaceAll(strings.ToLower(name), " ", ".")
	}
	return "admin"
}

var cloudEnvMap = map[string]cloud.Configuration{
	"Global": cloud.AzurePublic,
	"China":  cloud.AzureChina,
	"USGov":  cloud.AzureGovernment,
}

func (a *App) ConnectCloud(env string) (map[string]interface{}, error) {
	a.baseCred = nil
	a.authenticator = azure.NewAuthenticator()
	a.resourceMgr = nil
	a.sentinelClient = nil

	cloudCfg, ok := cloudEnvMap[env]
	if !ok {
		cloudCfg = cloud.AzurePublic
	}
	a.currentCloudConfig = cloudCfg

	opts := &azidentity.InteractiveBrowserCredentialOptions{
		ClientOptions: azcore.ClientOptions{Cloud: cloudCfg},
	}
	cred, err := azidentity.NewInteractiveBrowserCredential(opts)
	if err != nil {
		return nil, fmt.Errorf("构建交互式凭证失败: %w", err)
	}
	a.baseCred = cred

	tokenOpts := policy.TokenRequestOptions{Scopes: []string{cloudCfg.Services[cloud.ResourceManager].Endpoint + "/.default"}}
	tk, err := cred.GetToken(context.Background(), tokenOpts)
	userProfile := "admin"
	if err == nil {
		userProfile = extractUserFromToken(tk.Token)
	}

	clientFactory, err := armsubscriptions.NewClientFactory(cred, &arm.ClientOptions{
		ClientOptions: azcore.ClientOptions{Cloud: cloudCfg},
	})
	if err != nil {
		return nil, err
	}

	tenantClient := clientFactory.NewTenantsClient()
	pager := tenantClient.NewListPager(nil)
	var tenants []map[string]string
	for pager.More() {
		page, _ := pager.NextPage(context.Background())
		for _, t := range page.Value {
			id, tenantId, displayName := "", "", ""
			if t.ID != nil {
				id = *t.ID
			}
			if t.TenantID != nil {
				tenantId = *t.TenantID
			}
			if t.DisplayName != nil {
				displayName = *t.DisplayName
			}
			tenants = append(tenants, map[string]string{"id": id, "tenantId": tenantId, "displayName": displayName})
		}
	}
	return map[string]interface{}{"tenants": tenants, "userProfile": userProfile}, nil
}

func (a *App) SelectTenant(tenantId string) ([]models.AzureSubscription, error) {
	if a.baseCred == nil {
		return nil, fmt.Errorf("凭证未就绪")
	}
	a.currentTenantID = tenantId
	opts := &azidentity.InteractiveBrowserCredentialOptions{
		ClientOptions: azcore.ClientOptions{Cloud: a.currentCloudConfig},
		TenantID:      tenantId,
	}
	boundCred, err := azidentity.NewInteractiveBrowserCredential(opts)
	if err != nil {
		return nil, err
	}

	a.authenticator.Cred = boundCred
	a.resourceMgr = azure.NewResourceManager(boundCred, a.currentCloudConfig)
	a.sentinelClient = azure.NewSentinelClient(boundCred, a.currentCloudConfig)
	a.queryEngine, _ = azure.NewQueryEngine(boundCred, a.currentCloudConfig)

	return a.resourceMgr.GetSubscriptions(context.Background())
}

func (a *App) LoginAzure() (string, error)                           { return "Deprecated", nil }
func (a *App) GetSubscriptions() ([]models.AzureSubscription, error) { return nil, nil }
func (a *App) GetWorkspaces(subID string) ([]models.AzureWorkspace, error) {
	if a.resourceMgr == nil {
		return nil, fmt.Errorf("请先连接 Azure")
	}
	return a.resourceMgr.GetWorkspaces(context.Background(), subID)
}

func (a *App) SelectLocalRepoPath() string {
	path, err := runtime.OpenDirectoryDialog(a.ctx, runtime.OpenDialogOptions{Title: "选择 Sentinel 规则本地根目录"})
	if err != nil {
		return ""
	}
	return path
}

func (a *App) GetDefaultLocalPath() string {
	cwd, _ := os.Getwd()
	return filepath.Join(cwd, "SentinelRules")
}

// 🚀 核心修正：扫描本地目录，直接从 Tenant 开始的 4 层结构
func (a *App) ScanLocalContexts(baseDir string) ([]LocalContext, error) {
	var contexts []LocalContext
	if baseDir == "" {
		return contexts, nil
	}

	tenantDirs, err := os.ReadDir(baseDir)
	if err != nil {
		return contexts, nil
	}

	for _, tenantDir := range tenantDirs {
		if !tenantDir.IsDir() || strings.HasPrefix(tenantDir.Name(), ".") {
			continue
		}
		tenantName := tenantDir.Name()

		subDirs, _ := os.ReadDir(filepath.Join(baseDir, tenantName))
		for _, subDir := range subDirs {
			if !subDir.IsDir() || strings.HasPrefix(subDir.Name(), ".") {
				continue
			}
			subName := subDir.Name()

			rgDirs, _ := os.ReadDir(filepath.Join(baseDir, tenantName, subName))
			for _, rgDir := range rgDirs {
				if !rgDir.IsDir() || strings.HasPrefix(rgDir.Name(), ".") {
					continue
				}
				rgName := rgDir.Name()

				wsDirs, _ := os.ReadDir(filepath.Join(baseDir, tenantName, subName, rgName))
				for _, wsDir := range wsDirs {
					if !wsDir.IsDir() || strings.HasPrefix(wsDir.Name(), ".") {
						continue
					}
					wsName := wsDir.Name()

					wsPath := filepath.Join(baseDir, tenantName, subName, rgName, wsName)
					rulesPath := filepath.Join(wsPath, "rules", "scheduled")
					wlPath := filepath.Join(wsPath, "watchlists")

					hasRules, _ := os.Stat(rulesPath)
					hasWl, _ := os.Stat(wlPath)

					if (hasRules != nil && hasRules.IsDir()) || (hasWl != nil && hasWl.IsDir()) {
						contexts = append(contexts, LocalContext{
							TenantName:    tenantName,
							Subscription:  subName,
							ResourceGroup: rgName,
							Workspace:     wsName,
						})
					}
				}
			}
		}
	}
	return contexts, nil
}

// 🚀 核心修正：所有业务函数的签名回归 4 层参数 (Tenant/Sub/RG/WS)

func (a *App) RunPullSync(localRoot, tenantName, subID, subName, rgName, wsName string) (string, error) {
	if a.sentinelClient == nil {
		return "", fmt.Errorf("Sentinel Client 未初始化")
	}
	targetDir := filepath.Join(localRoot, sanitizePath(tenantName), sanitizePath(subName), sanitizePath(rgName), sanitizePath(wsName))
	syncEngine, err := gitops.NewSyncEngine(localRoot)
	if err != nil {
		return "", err
	}

	runtime.EventsEmit(a.ctx, "sync_log", "[Azure] Fetching scheduled rules...")
	rules, err := a.sentinelClient.ListScheduledRules(context.Background(), subID, rgName, wsName)
	if err != nil {
		return "", err
	}

	err = syncEngine.PullRulesToLocal(targetDir, rules)
	if err != nil {
		return "", err
	}

	msg := fmt.Sprintf("成功同步 %d 条规则", len(rules))
	runtime.EventsEmit(a.ctx, "sync_log", "[DONE] "+msg)
	return msg, nil
}

func (a *App) GetLocalRulesList(localRoot, tenantName, subName, rgName, wsName string) ([]string, error) {
	targetDir := filepath.Join(localRoot, sanitizePath(tenantName), sanitizePath(subName), sanitizePath(rgName), sanitizePath(wsName), "rules", "scheduled")
	files, _ := filepath.Glob(filepath.Join(targetDir, "*.md"))
	var names []string
	for _, f := range files {
		names = append(names, filepath.Base(f))
	}
	return names, nil
}

func (a *App) GetLocalRuleContent(localRoot, tenantName, subName, rgName, wsName, fileName string) (string, error) {
	path := filepath.Join(localRoot, sanitizePath(tenantName), sanitizePath(subName), sanitizePath(rgName), sanitizePath(wsName), "rules", "scheduled", fileName)
	content, err := os.ReadFile(path)
	return string(content), err
}

func (a *App) SaveLocalRuleKql(localRoot, tenantName, subName, rgName, wsName, fileName, newKql string) error {
	path := filepath.Join(localRoot, sanitizePath(tenantName), sanitizePath(subName), sanitizePath(rgName), sanitizePath(wsName), "rules", "scheduled", fileName)
	content, _ := os.ReadFile(path)
	localRule, _ := parser.ParseMarkdown(content)
	localRule.KQL = newKql
	newContent, _ := parser.GenerateMarkdown(localRule)
	return os.WriteFile(path, newContent, 0644)
}

func (a *App) SaveLocalRuleMarkdown(localRoot, tenantName, subName, rgName, wsName, fileName, content string) error {
	path := filepath.Join(localRoot, sanitizePath(tenantName), sanitizePath(subName), sanitizePath(rgName), sanitizePath(wsName), "rules", "scheduled", fileName)
	return os.WriteFile(path, []byte(content), 0644)
}

func (a *App) PushRulesToAzure(localRoot, tenantName, subName, subID, rgName, wsName string) (map[string]interface{}, error) {
	targetDir := filepath.Join(localRoot, sanitizePath(tenantName), sanitizePath(subName), sanitizePath(rgName), sanitizePath(wsName))
	successes, errs := gitops.PushLocalRulesToAzure(context.Background(), a.sentinelClient, targetDir, subID, rgName, wsName)
	var errMsgs []string
	for _, e := range errs {
		errMsgs = append(errMsgs, e.Error())
	}
	return map[string]interface{}{"successCount": len(successes), "errors": errMsgs}, nil
}

func (a *App) PushSingleRuleToAzure(localRoot, tenantName, subName, subID, rgName, wsName, fileName, newKql string) error {
	a.SaveLocalRuleKql(localRoot, tenantName, subName, rgName, wsName, fileName, newKql)
	path := filepath.Join(localRoot, sanitizePath(tenantName), sanitizePath(subName), sanitizePath(rgName), sanitizePath(wsName), "rules", "scheduled", fileName)
	content, _ := os.ReadFile(path)
	localRule, _ := parser.ParseMarkdown(content)
	return a.sentinelClient.CreateOrUpdateScheduledRule(context.Background(), subID, rgName, wsName, *localRule)
}

type MigrationResult struct {
	Successes []string `json:"successes"`
	Errors    []string `json:"errors"`
}

func (a *App) MigrateSelectedRulesToAzure(localRoot, srcTenant, srcSub, srcRg, srcWs, targetSubID, targetRg, targetWs string, selectedFiles []string) (MigrationResult, error) {
	result := MigrationResult{Successes: []string{}, Errors: []string{}}
	sourceDir := filepath.Join(localRoot, sanitizePath(srcTenant), sanitizePath(srcSub), sanitizePath(srcRg), sanitizePath(srcWs), "rules", "scheduled")
	for _, fileName := range selectedFiles {
		content, err := os.ReadFile(filepath.Join(sourceDir, fileName))
		if err != nil {
			continue
		}
		localRule, _ := parser.ParseMarkdown(content)
		localRule.Metadata.ID = uuid.New().String()
		localRule.Metadata.Etag = ""
		err = a.sentinelClient.CreateOrUpdateScheduledRule(context.Background(), targetSubID, targetRg, targetWs, *localRule)
		if err != nil {
			result.Errors = append(result.Errors, fileName)
		} else {
			result.Successes = append(result.Successes, localRule.Metadata.DisplayName)
		}
	}
	return result, nil
}

// === Watchlists ===
func (a *App) GetLocalWatchlistsList(localRoot, tenantName, subName, rgName, wsName string) ([]string, error) {
	targetDir := filepath.Join(localRoot, sanitizePath(tenantName), sanitizePath(subName), sanitizePath(rgName), sanitizePath(wsName), "watchlists")
	entries, _ := os.ReadDir(targetDir)
	var names []string
	for _, entry := range entries {
		if entry.IsDir() {
			names = append(names, entry.Name())
		}
	}
	return names, nil
}

type WatchlistLocalData struct {
	Metadata string `json:"metadata"`
	CSV      string `json:"csv"`
}

func (a *App) GetLocalWatchlistData(localRoot, tenantName, subName, rgName, wsName, alias string) (WatchlistLocalData, error) {
	var result WatchlistLocalData
	wlDir := filepath.Join(localRoot, sanitizePath(tenantName), sanitizePath(subName), sanitizePath(rgName), sanitizePath(wsName), "watchlists", alias)
	metaBytes, _ := os.ReadFile(filepath.Join(wlDir, "metadata.json"))
	csvBytes, _ := os.ReadFile(filepath.Join(wlDir, "data.csv"))
	result.Metadata, result.CSV = string(metaBytes), string(csvBytes)
	return result, nil
}

func (a *App) SaveLocalWatchlistData(localRoot, tenantName, subName, rgName, wsName, alias, metaContent, csvContent string) error {
	wlDir := filepath.Join(localRoot, sanitizePath(tenantName), sanitizePath(subName), sanitizePath(rgName), sanitizePath(wsName), "watchlists", alias)
	os.MkdirAll(wlDir, os.ModePerm)
	os.WriteFile(filepath.Join(wlDir, "metadata.json"), []byte(metaContent), 0644)
	os.WriteFile(filepath.Join(wlDir, "data.csv"), []byte(csvContent), 0644)
	return nil
}

func (a *App) PullWatchlistsFromAzure(localRoot, tenantName, subName, subID, rgName, wsName string) (map[string]interface{}, error) {
	targetDir := filepath.Join(localRoot, sanitizePath(tenantName), sanitizePath(subName), sanitizePath(rgName), sanitizePath(wsName))
	logCb := func(msg string) { runtime.EventsEmit(a.ctx, "sync-log", msg) }
	successes, errs := gitops.PullWatchlistsToLocal(context.Background(), a.sentinelClient, targetDir, subID, rgName, wsName, logCb)
	var errMsgs []string
	for _, e := range errs {
		errMsgs = append(errMsgs, e.Error())
	}
	return map[string]interface{}{"successCount": len(successes), "errors": errMsgs}, nil
}

func (a *App) PushWatchlistsToAzure(localRoot, tenantName, subName, subID, rgName, wsName string) (map[string]interface{}, error) {
	targetDir := filepath.Join(localRoot, sanitizePath(tenantName), sanitizePath(subName), sanitizePath(rgName), sanitizePath(wsName))
	logCb := func(msg string) { runtime.EventsEmit(a.ctx, "sync-log", msg) }
	successes, errs := gitops.PushWatchlistsToAzure(context.Background(), a.sentinelClient, targetDir, subID, rgName, wsName, logCb)
	var errMsgs []string
	for _, e := range errs {
		errMsgs = append(errMsgs, e.Error())
	}
	return map[string]interface{}{"successCount": len(successes), "errors": errMsgs}, nil
}

func (a *App) MigrateSelectedWatchlistsToAzure(localRoot, srcTenant, srcSub, srcRg, srcWs, tgtSubName, tgtSubId, tgtRg, tgtWsName string, selectedAliases []string) (map[string]interface{}, error) {
	sourceDir := filepath.Join(localRoot, sanitizePath(srcTenant), sanitizePath(srcSub), sanitizePath(srcRg), sanitizePath(srcWs))
	logCb := func(msg string) { runtime.EventsEmit(a.ctx, "sync-log", msg) }
	successes, errs := gitops.PushSelectedWatchlistsToAzure(context.Background(), a.sentinelClient, sourceDir, tgtSubId, tgtRg, tgtWsName, selectedAliases, logCb)
	var errMsgs []string
	for _, e := range errs {
		errMsgs = append(errMsgs, e.Error())
	}
	return map[string]interface{}{"successes": successes, "errors": errMsgs}, nil
}

// === Git 和查询引擎保持不变 ===
func (a *App) ExecuteKql(workspaceID, kql string) ([]map[string]interface{}, error) {
	return a.queryEngine.ExecuteKql(context.Background(), workspaceID, kql)
}

type FileChange struct {
	State string `json:"state"`
	Name  string `json:"name"`
}

func (a *App) GetGitStatus(repoPath string) ([]FileChange, error) {
	// 🚀 核心防御 1：强制关闭 Git 的中文/空格八进制转义，输出原始路径
	cmd := exec.Command("git", "-c", "core.quotepath=false", "status", "--porcelain")
	cmd.Dir = repoPath
	out, err := cmd.Output()
	if err != nil {
		return nil, err
	}

	var changes []FileChange
	// 🚀 核心防御 2：先统一把 Windows 的 \r\n 替换成 \n，再进行切割
	cleanOut := strings.ReplaceAll(string(out), "\r\n", "\n")
	lines := strings.Split(cleanOut, "\n")

	for _, line := range lines {
		if len(line) < 3 {
			continue
		}
		state := strings.TrimSpace(line[:2])
		name := strings.TrimSpace(line[2:])
		name = strings.Trim(name, `"`) // 去除残余的双引号

		if name != "" {
			changes = append(changes, FileChange{State: state, Name: name})
		}
	}
	return changes, nil
}

func (a *App) GitPull(repoPath string) (string, error) {
	cmdBranch := exec.Command("git", "branch", "--show-current")
	cmdBranch.Dir = repoPath
	branchOut, _ := cmdBranch.Output()
	branch := strings.TrimSpace(string(branchOut))
	if branch == "" {
		branch = "main"
	}
	cmd := exec.Command("git", "pull", "origin", branch, "--allow-unrelated-histories")
	cmd.Dir = repoPath
	out, err := cmd.CombinedOutput()
	if err != nil {
		cmd = exec.Command("git", "pull", "origin", "master", "--allow-unrelated-histories")
		cmd.Dir = repoPath
		out, err = cmd.CombinedOutput()
	}
	return string(out), err
}

func (a *App) GitPush(repoPath string, message string) (string, error) {
	cmdAdd := exec.Command("git", "add", ".")
	cmdAdd.Dir = repoPath
	cmdAdd.CombinedOutput()
	if message == "" {
		message = "Auto-sync rule changes via VSentry Space"
	}
	cmdCommit := exec.Command("git", "commit", "-m", message)
	cmdCommit.Dir = repoPath
	outCommit, _ := cmdCommit.CombinedOutput()
	cmdPush := exec.Command("git", "push", "-u", "origin", "HEAD")
	cmdPush.Dir = repoPath
	outPush, err := cmdPush.CombinedOutput()
	return string(outCommit) + "\n" + string(outPush), err
}

func (a *App) GetGitRemote(repoPath string) (string, error) {
	cmd := exec.Command("git", "config", "--get", "remote.origin.url")
	cmd.Dir = repoPath
	out, _ := cmd.Output()
	return strings.TrimSpace(string(out)), nil
}

func (a *App) SetGitRemote(repoPath string, remoteUrl string) error {
	cmdCheck := exec.Command("git", "rev-parse", "--is-inside-work-tree")
	cmdCheck.Dir = repoPath
	if err := cmdCheck.Run(); err != nil {
		exec.Command("git", "init").Run()
	}
	cmdCheckRemote := exec.Command("git", "remote", "get-url", "origin")
	cmdCheckRemote.Dir = repoPath
	if err := cmdCheckRemote.Run(); err != nil {
		exec.Command("git", "remote", "add", "origin", remoteUrl).Run()
	} else {
		exec.Command("git", "remote", "set-url", "origin", remoteUrl).Run()
	}
	return nil
}
