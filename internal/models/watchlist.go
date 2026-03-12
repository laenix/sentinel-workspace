package models

// WatchlistMetadata 本地存储的元数据结构
type WatchlistMetadata struct {
	WatchlistID string `json:"watchlist_id"`
	Alias       string `json:"alias"`
	DisplayName string `json:"display_name"`
	Provider    string `json:"provider"`
	Source      string `json:"source"`
	Description string `json:"description"`
	SearchKey   string `json:"search_key"`
	Etag        string `json:"etag"`
}
