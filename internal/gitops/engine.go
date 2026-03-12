// internal/gitops/engine.go
package gitops

import (
	"fmt"
	"os"
	"time"

	"github.com/go-git/go-git/v5"
	"github.com/go-git/go-git/v5/plumbing/object"
)

type GitEngine struct {
	baseDir string
	repo    *git.Repository
}

// NewGitEngine 初始化或打开一个现有的 Git 仓库
func NewGitEngine(baseDir string) (*GitEngine, error) {
	// 确保基础目录存在
	if err := os.MkdirAll(baseDir, 0755); err != nil {
		return nil, fmt.Errorf("无法创建仓库目录: %w", err)
	}

	var repo *git.Repository
	var err error

	// 尝试打开现有仓库
	repo, err = git.PlainOpen(baseDir)
	if err != nil {
		// 如果仓库不存在，则初始化一个新仓库 (git init)
		if err == git.ErrRepositoryNotExists {
			repo, err = git.PlainInit(baseDir, false)
			if err != nil {
				return nil, fmt.Errorf("初始化 Git 仓库失败: %w", err)
			}
		} else {
			return nil, fmt.Errorf("打开 Git 仓库失败: %w", err)
		}
	}

	return &GitEngine{
		baseDir: baseDir,
		repo:    repo,
	}, nil
}

// CommitAll 相当于执行 git add . && git commit -m "..."
func (g *GitEngine) CommitAll(commitMsg string, authorName string, authorEmail string) (string, error) {
	worktree, err := g.repo.Worktree()
	if err != nil {
		return "", fmt.Errorf("获取工作区失败: %w", err)
	}

	// git add .
	err = worktree.AddWithOptions(&git.AddOptions{All: true})
	if err != nil {
		return "", fmt.Errorf("添加文件到暂存区失败: %w", err)
	}

	// 检查是否有变更需要提交 (git status)
	status, err := worktree.Status()
	if err != nil {
		return "", fmt.Errorf("获取仓库状态失败: %w", err)
	}
	if status.IsClean() {
		return "工作区干净，没有需要提交的变更", nil
	}

	// git commit
	commitStr, err := worktree.Commit(commitMsg, &git.CommitOptions{
		Author: &object.Signature{
			Name:  authorName,
			Email: authorEmail,
			When:  time.Now(),
		},
	})
	if err != nil {
		return "", fmt.Errorf("提交变更失败: %w", err)
	}

	return fmt.Sprintf("已创建提交: %s", commitStr.String()[:7]), nil
}
