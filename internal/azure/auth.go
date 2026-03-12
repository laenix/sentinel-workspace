package azure

import (
	"context"
	"fmt"

	"github.com/Azure/azure-sdk-for-go/sdk/azcore/policy"
	"github.com/Azure/azure-sdk-for-go/sdk/azidentity"
)

type Authenticator struct {
	Cred *azidentity.InteractiveBrowserCredential
}

func NewAuthenticator() *Authenticator {
	return &Authenticator{}
}

// Login 执行交互式登录并确保证书保存在内存中
func (a *Authenticator) Login(ctx context.Context) (string, error) {
	cred, err := azidentity.NewInteractiveBrowserCredential(nil)
	if err != nil {
		return "", fmt.Errorf("初始化凭据失败: %w", err)
	}

	scopes := []string{"https://management.azure.com/.default"}

	token, err := cred.GetToken(ctx, policy.TokenRequestOptions{Scopes: scopes})
	if err != nil {
		return "", fmt.Errorf("获取 Token 失败: %w", err)
	}

	a.Cred = cred
	return fmt.Sprintf("鉴权成功！Token 有效期至: %s", token.ExpiresOn.Local().Format("2006-01-02 15:04:05")), nil
}
