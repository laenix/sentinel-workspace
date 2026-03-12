package gitops

import (
	"context"
	"encoding/csv"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"sync"

	"sentinel-workspace/internal/azure"
	"sentinel-workspace/internal/models"

	"github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/securityinsights/armsecurityinsights"
	"github.com/google/uuid"
)

// PullWatchlistsToLocal 拉取监视列表并实施"元数据与数据分离"落盘
// PullWatchlistsToLocal 拉取监视列表 (引入高并发 Worker Pool 与限流机制)
func PullWatchlistsToLocal(ctx context.Context, client *azure.SentinelClient, targetDir string, subID, rgName, wsName string, logCb func(string)) ([]string, []error) {
	var successes []string
	var errorsList []error

	if logCb != nil {
		logCb("[API] 正在获取云端 Watchlist 目录树...")
	}

	// 1. 获取所有 Watchlist 元数据 (表头)
	watchlists, err := client.ListWatchlists(ctx, subID, rgName, wsName)
	if err != nil {
		return nil, append(errorsList, fmt.Errorf("拉取 Watchlist 元数据失败: %w", err))
	}

	watchlistsRoot := filepath.Join(targetDir, "watchlists")
	os.MkdirAll(watchlistsRoot, os.ModePerm)

	if logCb != nil {
		logCb(fmt.Sprintf("[调度] 发现 %d 个 Watchlist，准备启动并发引擎...", len(watchlists)))
	}

	// ==========================================
	// 🚀 核心架构：并发池与限流器 (Semaphore)
	// ==========================================
	var wg sync.WaitGroup
	var mu sync.Mutex // 用于保护 successes 和 errorsList 的并发写入

	// 设定最大并发数为 3 (绝对安全阈值，防止 Azure 报 429 Too Many Requests)
	maxWorkers := 3
	semaphore := make(chan struct{}, maxWorkers)

	for _, wl := range watchlists {
		if wl.Properties == nil || wl.Properties.WatchlistAlias == nil {
			continue
		}

		// 必须在循环内捕获变量，防止 Goroutine 闭包陷阱
		currentWl := wl
		alias := *currentWl.Properties.WatchlistAlias

		wg.Add(1)

		// 启动并发协程
		go func(aliasName string, wlData *armsecurityinsights.Watchlist) {
			defer wg.Done()

			// 申请工人配额：如果当前已经有 3 个在跑，这里会阻塞排队
			semaphore <- struct{}{}
			// 完工后释放配额
			defer func() { <-semaphore }()

			if logCb != nil {
				logCb(fmt.Sprintf("[⚡ 开始] 分配 Worker 处理: %s", aliasName))
			}

			// 2. 为每个 Watchlist 创建独立的专属目录
			wlDir := filepath.Join(watchlistsRoot, aliasName)
			os.MkdirAll(wlDir, os.ModePerm)

			// 3. 构建并写入 metadata.json
			meta := models.WatchlistMetadata{
				WatchlistID: stringPtr(wlData.Name),
				Alias:       aliasName,
				DisplayName: stringPtr(wlData.Properties.DisplayName),
				Provider:    stringPtr(wlData.Properties.Provider),
				Source:      stringPtr((*string)(wlData.Properties.Source)),
				Description: stringPtr(wlData.Properties.Description),
				SearchKey:   stringPtr(wlData.Properties.ItemsSearchKey),
				Etag:        stringPtr(wlData.Etag),
			}

			metaBytes, _ := json.MarshalIndent(meta, "", "  ")
			err := os.WriteFile(filepath.Join(wlDir, "metadata.json"), metaBytes, 0644)
			if err != nil {
				mu.Lock()
				errorsList = append(errorsList, fmt.Errorf("[%s] 元数据落盘失败: %v", aliasName, err))
				mu.Unlock()
				return // 发生错误，当前协程提前结束
			}

			// 4. 拉取具体的 Items 数据 (此时是在各自独立的协程中跑分页循环，互不干扰)
			items, err := client.ListWatchlistItems(ctx, subID, rgName, wsName, aliasName, logCb)
			if err != nil {
				mu.Lock()
				errorsList = append(errorsList, fmt.Errorf("[%s] 获取数据条目失败: %v", aliasName, err))
				mu.Unlock()
				return
			}

			// 5. 内存统一对齐表头并生成 CSV (一波流落盘，保证数据完美)
			err = writeItemsToCSV(filepath.Join(wlDir, "data.csv"), items)
			if err != nil {
				mu.Lock()
				errorsList = append(errorsList, fmt.Errorf("[%s] CSV 生成失败: %v", aliasName, err))
				mu.Unlock()
				return
			}

			// 记录成功状态
			mu.Lock()
			successes = append(successes, aliasName)
			mu.Unlock()

			if logCb != nil {
				logCb(fmt.Sprintf("✅ [落盘] %s 处理完毕，CSV 已生成！", aliasName))
			}

		}(alias, currentWl)
	}

	// 阻塞等待所有派发出去的工人(协程)全部完工
	wg.Wait()

	if logCb != nil {
		logCb("[API] 所有并发同步任务已结束。")
	}

	return successes, errorsList
}

// writeItemsToCSV 动态提取表头并写入纯净 CSV
func writeItemsToCSV(filePath string, items []*armsecurityinsights.WatchlistItem) error {
	if len(items) == 0 {
		// 如果没数据，写一个空文件
		return os.WriteFile(filePath, []byte(""), 0644)
	}

	file, err := os.Create(filePath)
	if err != nil {
		return err
	}
	defer file.Close()

	writer := csv.NewWriter(file)
	defer writer.Flush()

	// 1. 动态收集所有可能存在的列名 (应对有些行缺字段的情况)
	keysMap := make(map[string]bool)
	for _, item := range items {
		if item.Properties != nil && item.Properties.ItemsKeyValue != nil {
			// ItemsKeyValue 底层是 map[string]any
			if kvMap, ok := item.Properties.ItemsKeyValue.(map[string]any); ok {
				for k := range kvMap {
					keysMap[k] = true
				}
			}
		}
	}

	// 2. 强制对表头进行字母排序！(GitOps 防雪崩极其关键的一步)
	var headers []string
	for k := range keysMap {
		headers = append(headers, k)
	}
	sort.Strings(headers)

	// 写入表头
	if err := writer.Write(headers); err != nil {
		return err
	}

	// 3. 逐行写入数据
	for _, item := range items {
		var row []string
		if item.Properties != nil && item.Properties.ItemsKeyValue != nil {
			if kvMap, ok := item.Properties.ItemsKeyValue.(map[string]any); ok {
				for _, h := range headers {
					val, exists := kvMap[h]
					if !exists || val == nil {
						row = append(row, "")
					} else {
						// 强转为字符串，防止由于数据类型不同导致 panic
						row = append(row, fmt.Sprintf("%v", val))
					}
				}
			}
		}
		if err := writer.Write(row); err != nil {
			return err
		}
	}

	return nil
}

// 辅助函数：安全解包指针
func stringPtr(ptr *string) string {
	if ptr == nil {
		return ""
	}
	return *ptr
}

// PushWatchlistsToAzure 智能对比并推送监视列表 (完全支持增删改及跨租户迁移)
func PushWatchlistsToAzure(ctx context.Context, client *azure.SentinelClient, targetDir string, subID, rgName, wsName string, logCb func(string)) ([]string, []error) {
	var successes []string
	var errorsList []error

	watchlistsRoot := filepath.Join(targetDir, "watchlists")
	dirs, err := os.ReadDir(watchlistsRoot)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil // 没有 watchlists 目录，直接跳过
		}
		return nil, []error{fmt.Errorf("读取 watchlists 目录失败: %v", err)}
	}

	for _, dir := range dirs {
		if !dir.IsDir() {
			continue
		}
		alias := dir.Name()
		wlDir := filepath.Join(watchlistsRoot, alias)

		// 1. 读取并解析本地 Metadata
		metaBytes, err := os.ReadFile(filepath.Join(wlDir, "metadata.json"))
		if err != nil {
			errorsList = append(errorsList, fmt.Errorf("[%s] 缺失 metadata.json: %v", alias, err))
			continue
		}
		var meta models.WatchlistMetadata
		json.Unmarshal(metaBytes, &meta)

		// 2. 将 Watchlist "壳子"推送到云端 (不存在则新建，存在则更新表头)
		err = client.CreateOrUpdateWatchlist(ctx, subID, rgName, wsName, alias, meta)
		if err != nil {
			errorsList = append(errorsList, fmt.Errorf("[%s] 创建表头失败: %v", alias, err))
			continue
		}

		// 3. 拉取云端条目，构建带数据的 "缓存映射图"
		existingItems, _ := client.ListWatchlistItems(ctx, subID, rgName, wsName, alias, logCb)

		// 改造：不仅存 UUID，还要把云端原本的数据存下来用于 Diff
		type AzureCache struct {
			ItemID string
			Data   map[string]any
		}
		azureItemMap := make(map[string]AzureCache)
		azureSeenTracker := make(map[string]bool)

		for _, item := range existingItems {
			if item.Name == nil || item.Properties == nil || item.Properties.ItemsKeyValue == nil {
				continue
			}
			itemID := *item.Name
			if kvMap, ok := item.Properties.ItemsKeyValue.(map[string]any); ok {
				if searchVal, exists := kvMap[meta.SearchKey]; exists {
					keyStr := fmt.Sprintf("%v", searchVal)
					azureItemMap[keyStr] = AzureCache{
						ItemID: itemID,
						Data:   kvMap,
					}
					azureSeenTracker[itemID] = false
				}
			}
		}

		// 4. 读取并解析本地 CSV (代码与之前相同)
		file, err := os.Open(filepath.Join(wlDir, "data.csv"))
		if err != nil {
			errorsList = append(errorsList, fmt.Errorf("[%s] 读取 data.csv 失败: %v", alias, err))
			continue
		}
		csvReader := csv.NewReader(file)
		records, err := csvReader.ReadAll()
		file.Close()

		if err != nil || len(records) < 1 {
			continue
		}

		headers := records[0]
		searchKeyIndex := -1
		for i, h := range headers {
			if h == meta.SearchKey {
				searchKeyIndex = i
				break
			}
		}

		if searchKeyIndex == -1 {
			errorsList = append(errorsList, fmt.Errorf("[%s] CSV 缺少 SearchKey 列", alias))
			continue
		}

		// ==========================================
		// 5. 逐行 Diff 比对并打入云端 (精细化: 增/删/改/不动)
		// ==========================================
		for i := 1; i < len(records); i++ {
			row := records[i]
			if len(row) != len(headers) {
				continue
			}

			rowData := make(map[string]any)
			for j, val := range row {
				rowData[headers[j]] = val
			}

			keyValue := row[searchKeyIndex]

			var itemID string
			isModified := true // 默认假设需要上传

			if cache, ok := azureItemMap[keyValue]; ok {
				itemID = cache.ItemID
				azureSeenTracker[itemID] = true
				delete(azureItemMap, keyValue)

				// 🚀 核心逻辑：比对数据是否真正发生改变 (不动则跳过)
				isModified = false
				// 长度不一样，肯定变了
				if len(rowData) != len(cache.Data) {
					isModified = true
				} else {
					// 逐个字段对比 (将 Azure 的 any 安全转为 string 与 CSV 对比)
					for k, localVal := range rowData {
						azureVal, exists := cache.Data[k]
						if !exists {
							isModified = true
							break
						}
						azureValStr := fmt.Sprintf("%v", azureVal)
						if fmt.Sprintf("%v", localVal) != azureValStr {
							isModified = true
							break
						}
					}
				}

				if !isModified {
					// 数据完全一致，触发"不动"机制，直接跳过 API 调用！
					continue
				}
			} else {
				itemID = uuid.New().String() // 新增的行
			}

			// 只有发生了“修改”或“新增”，才发起极其珍贵的 API 调用
			if isModified {
				err = client.CreateOrUpdateWatchlistItem(ctx, subID, rgName, wsName, alias, itemID, rowData)
				if err != nil {
					errorsList = append(errorsList, fmt.Errorf("[%s] 行 %s 写入失败: %v", alias, keyValue, err))
				}
			}
		}

		// 6. 清理门户 (Delete)：删除在本地 CSV 里已经被删掉的云端条目
		for itemID, isAlive := range azureSeenTracker {
			if !isAlive {
				_ = client.DeleteWatchlistItem(ctx, subID, rgName, wsName, alias, itemID)
			}
		}

		successes = append(successes, alias)
	}

	return successes, errorsList
}

// PushSelectedWatchlistsToAzure 跨租户精确制导迁移 (带协程池与智能 Diff)
func PushSelectedWatchlistsToAzure(ctx context.Context, client *azure.SentinelClient, sourceDir string, tgtSubID, tgtRgName, tgtWsName string, selectedAliases []string, logCb func(string)) ([]string, []error) {
	var successes []string
	var errorsList []error
	var wg sync.WaitGroup
	var mu sync.Mutex

	watchlistsRoot := filepath.Join(sourceDir, "watchlists")

	if logCb != nil {
		logCb(fmt.Sprintf("[调度] 准备将 %d 个 Watchlist 跨租户并发迁移至目标环境...", len(selectedAliases)))
	}

	// 限制最大并发数为 3，绝对安全不熔断
	maxWorkers := 3
	semaphore := make(chan struct{}, maxWorkers)

	for _, alias := range selectedAliases {
		aliasName := alias // 闭包陷阱防御
		wg.Add(1)

		go func(aliasName string) {
			defer wg.Done()

			// 申请并发配额
			semaphore <- struct{}{}
			defer func() { <-semaphore }()

			if logCb != nil {
				logCb(fmt.Sprintf("[⚡ 迁移] 正在向目标环境注入: %s", aliasName))
			}

			wlDir := filepath.Join(watchlistsRoot, aliasName)

			// 1. 读取并解析本地 (源环境) 的 Metadata
			metaBytes, err := os.ReadFile(filepath.Join(wlDir, "metadata.json"))
			if err != nil {
				mu.Lock()
				errorsList = append(errorsList, fmt.Errorf("[%s] 缺失 metadata.json: %v", aliasName, err))
				mu.Unlock()
				return
			}
			var meta models.WatchlistMetadata
			json.Unmarshal(metaBytes, &meta)

			// 2. 将 Watchlist 表头打入【目标环境】
			err = client.CreateOrUpdateWatchlist(ctx, tgtSubID, tgtRgName, tgtWsName, aliasName, meta)
			if err != nil {
				mu.Lock()
				errorsList = append(errorsList, fmt.Errorf("[%s] 目标环境创建表头失败: %v", aliasName, err))
				mu.Unlock()
				return
			}

			// 3. 拉取【目标环境】现存的数据 (如果是全新环境，这里拿到的就是空)
			// 为了防止日志刷屏，这里的翻页回调传 nil
			existingItems, _ := client.ListWatchlistItems(ctx, tgtSubID, tgtRgName, tgtWsName, aliasName, nil)

			type AzureCache struct {
				ItemID string
				Data   map[string]any
			}
			azureItemMap := make(map[string]AzureCache)
			azureSeenTracker := make(map[string]bool)

			for _, item := range existingItems {
				if item.Name == nil || item.Properties == nil || item.Properties.ItemsKeyValue == nil {
					continue
				}
				itemID := *item.Name
				if kvMap, ok := item.Properties.ItemsKeyValue.(map[string]any); ok {
					if searchVal, exists := kvMap[meta.SearchKey]; exists {
						keyStr := fmt.Sprintf("%v", searchVal)
						azureItemMap[keyStr] = AzureCache{
							ItemID: itemID,
							Data:   kvMap,
						}
						azureSeenTracker[itemID] = false
					}
				}
			}

			// 4. 读取本地 (源环境) 的 CSV 数据
			file, err := os.Open(filepath.Join(wlDir, "data.csv"))
			if err != nil {
				mu.Lock()
				errorsList = append(errorsList, fmt.Errorf("[%s] 读取 data.csv 失败: %v", aliasName, err))
				mu.Unlock()
				return
			}
			csvReader := csv.NewReader(file)
			records, err := csvReader.ReadAll()
			file.Close()

			if err != nil || len(records) < 1 {
				return
			}

			headers := records[0]
			searchKeyIndex := -1
			for i, h := range headers {
				if h == meta.SearchKey {
					searchKeyIndex = i
					break
				}
			}

			if searchKeyIndex == -1 {
				mu.Lock()
				errorsList = append(errorsList, fmt.Errorf("[%s] CSV 缺少 SearchKey 列", aliasName))
				mu.Unlock()
				return
			}

			// 5. 逐行智能 Diff 并推送到【目标环境】
			for i := 1; i < len(records); i++ {
				row := records[i]
				if len(row) != len(headers) {
					continue
				}

				rowData := make(map[string]any)
				for j, val := range row {
					rowData[headers[j]] = val
				}

				keyValue := row[searchKeyIndex]
				var itemID string
				isModified := true

				if cache, ok := azureItemMap[keyValue]; ok {
					itemID = cache.ItemID
					azureSeenTracker[itemID] = true
					delete(azureItemMap, keyValue)

					isModified = false
					if len(rowData) != len(cache.Data) {
						isModified = true
					} else {
						for k, localVal := range rowData {
							azureVal, exists := cache.Data[k]
							if !exists {
								isModified = true
								break
							}
							if fmt.Sprintf("%v", localVal) != fmt.Sprintf("%v", azureVal) {
								isModified = true
								break
							}
						}
					}
					if !isModified {
						continue
					} // 数据完全一致，跳过 API 请求
				} else {
					// 目标环境没有这行数据，生成新 UUID 准备注入
					itemID = uuid.New().String()
				}

				if isModified {
					err = client.CreateOrUpdateWatchlistItem(ctx, tgtSubID, tgtRgName, tgtWsName, aliasName, itemID, rowData)
					if err != nil {
						mu.Lock()
						errorsList = append(errorsList, fmt.Errorf("[%s] 行写入失败: %v", aliasName, err))
						mu.Unlock()
					}
				}
			}

			// 6. 清理门户：删除目标环境里有，但源环境里没有的脏数据
			for itemID, isAlive := range azureSeenTracker {
				if !isAlive {
					_ = client.DeleteWatchlistItem(ctx, tgtSubID, tgtRgName, tgtWsName, aliasName, itemID)
				}
			}

			mu.Lock()
			successes = append(successes, aliasName)
			mu.Unlock()

			if logCb != nil {
				logCb(fmt.Sprintf("✅ [完工] %s 已完美同步至目标租户！", aliasName))
			}

		}(aliasName)
	}

	wg.Wait()

	if logCb != nil {
		logCb("[API] 所有跨租户并发迁移任务结束。")
	}

	return successes, errorsList
}
