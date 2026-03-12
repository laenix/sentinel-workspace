# Sentinel Workspace

A cross-platform desktop application for managing Microsoft Sentinel rules, watchlists, and GitOps workflows.

## Features

- **Multi-Cloud Support** - Connect to Azure Public, China, and US Government clouds
- **Rule Management** - Pull/Push scheduled detection rules from/to Azure Sentinel
- **Watchlist Sync** - Manage and synchronize Sentinel watchlists between local and cloud
- **GitOps Workflow** - Local-first development with Git versioning and sync
- **KQL Query Engine** - Execute KQL queries directly from the desktop app
- **Migration Tools** - Copy rules/watchlists between different workspaces/tenants

## Tech Stack

- **Backend**: Go 1.24+, Azure SDK for Go
- **Frontend**: React 18 + TypeScript + Vite
- **Desktop**: Wails 2 (Go + WebView)
- **Authentication**: Azure AD (Interactive Browser Credential)

## Prerequisites

- Go 1.24+
- Node.js 18+
- Azure subscription with Microsoft Sentinel enabled
- Wails CLI (`go install github.com/wailsapp/wails/v2/cmd/wails@latest`)

## Getting Started

### 1. Clone & Install Dependencies

```bash
git clone https://github.com/yourusername/sentinel-workspace.git
cd sentinel-workspace
go mod download
cd frontend && npm install && cd ..
```

### 2. Run in Development Mode

```bash
wails dev
```

This will open the application in development mode with hot reload.

### 3. Build for Production

```bash
wails build
```

The built executable will be in `build/bin/`.

## Usage Guide

### Connecting to Azure

1. Launch the application
2. Click "Connect Cloud" and select your Azure environment (Global/China/US Gov)
3. A browser window will open for Azure AD authentication
4. Select the tenant you want to work with

### Syncing Rules

1. Select a local repository directory (or use the default `SentinelRules/`)
2. Choose the Tenant → Subscription → Resource Group → Workspace
3. Click "Pull" to download rules from Azure
4. Click "Push" to upload local rules to Azure

### Git Integration

The app integrates with Git for version control:
- View file changes with status indicators
- Pull latest changes from remote
- Commit and push local modifications

### KQL Queries

Execute KQL queries against any workspace:
1. Select a workspace
2. Enter your KQL query
3. View results in table format

## Project Structure

```
sentinel-workspace/
├── app.go                 # Main application logic
├── main.go                # Entry point
├── wails.json             # Wails configuration
├── internal/
│   ├── azure/             # Azure SDK wrappers
│   │   ├── auth.go       # Authentication
│   │   ├── query.go      # KQL query engine
│   │   ├── resource.go  # Azure resource management
│   │   └── sentinel.go   # Sentinel API client
│   ├── gitops/           # Git & sync operations
│   ├── models/           # Data models
│   └── parser/           # Markdown rule parser
├── frontend/             # React TypeScript frontend
└── SentinelRules/        # Local rules storage (gitignored)
```

## Local Rules Directory Structure

```
SentinelRules/
└── {TenantName}/
    └── {SubscriptionName}/
        └── {ResourceGroup}/
            └── {Workspace}/
                ├── rules/
                │   └── scheduled/
                │       └── *.md    # KQL rule files
                └── watchlists/
                    └── {WatchlistAlias}/
                        ├── metadata.json
                        └── data.csv
```

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

MIT License - see [LICENSE](LICENSE) for details.

## Acknowledgments

- [Wails](https://wails.io) - for the excellent desktop app framework
- [Azure SDK for Go](https://github.com/Azure/azure-sdk-for-go) - for Azure integration
