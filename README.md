# Inari

Manage S3-compatible object storage.

Inari 是一個 standalone TypeScript SSR Web 服務，用於管理
S3-compatible object storage。核心功能使用標準 S3 API，避免綁定特定
provider；MinIO 相關能力保留為未來 plugin 擴充。

## 功能

- 以 server-side encrypted session 保存 S3 連線資訊，Secret 不寫入
  browser `localStorage`。
- 列出 buckets、prefixes 與 objects。
- Object browser 支援 prefix navigation、pagination、size/date filter、
  sort、multi-select 與 batch delete。
- Cleanup Planner (`/cleanup`) 可跨 bucket 掃描候選清理檔案，依
  `lastModified ASC, size DESC, bucket ASC, key ASC` 排序，預估可釋放空間，
  並在確認後依 bucket 分組刪除。
- Usage dashboard (`/admin/usage`) 以 S3 list scan 估算 bucket/object usage。
- Dark theme 預設，支援 light/system theme。
- Responsive UI 與 lucide icons。

## 技術棧

- Next.js App Router
- React Server Components / Server Actions
- TypeScript strict mode
- AWS SDK for JavaScript v3 (`@aws-sdk/client-s3`)
- Tailwind CSS
- `iron-session`
- `zod`
- Vitest

## 架構

專案遵循 Clean Architecture dependency rule：

```text
src/
  domain/          # domain-owned models, errors, ports
  application/     # use cases
  adapters/        # AWS SDK / session / plugin adapters
  infrastructure/  # composition root and config
  app/             # Next.js routes and server actions
  components/      # UI components
  lib/             # pure utilities
```

React components 不直接呼叫 AWS SDK。S3 操作都透過 application use case 與
domain ports，在 server side 執行。

## 本機開發

需求：

- Node.js 24+
- npm

安裝依賴：

```bash
npm ci
```

建立本機環境檔：

```bash
cp .env.example .env.local
```

至少設定：

```bash
SESSION_SECRET=<at-least-32-characters>
DEFAULT_S3_ENDPOINT=https://s3.example.com
```

啟動：

```bash
npm run dev
```

開啟 <http://localhost:3000>。

### 內部 CA / TLS

`npm run dev` 與 `npm run start` 會用 `NODE_OPTIONS=--use-system-ca`，讓 Node
使用 host OS trust store。若 S3 endpoint 使用公司內部 CA，建議把 CA 安裝進
系統信任庫。

Debian/Ubuntu 範例：

```bash
sudo cp your-ca.pem /usr/local/share/ca-certificates/your-ca.crt
sudo update-ca-certificates
```

若只想針對單一 PEM 啟動：

```bash
NODE_EXTRA_CA_CERTS=/path/to/ca.pem npm run dev
```

不要用 `NODE_TLS_REJECT_UNAUTHORIZED=0` 或關閉 TLS verification 作為長期方案。

## Scripts

```bash
npm run dev           # Next.js dev server, using system CA
npm run build         # Production build
npm run start         # Start production server, using system CA
npm run lint          # ESLint
npm run typecheck     # tsc --noEmit
npm run format        # Prettier write
npm run format:check  # Prettier check
npm run test          # Vitest
```

## Docker image

Image 使用 multi-stage build，final stage 為 distroless：

```bash
ts=$(date +%Y%m%d-%H%M%S)
docker build \
  --build-arg VERSION="$ts" \
  -t "ghcr.io/maple52046/inari:$ts" .
```

執行：

```bash
ts=20260630-205811
docker run -d -p 3000:3000 \
  -e SESSION_SECRET=<at-least-32-characters> \
  -e DEFAULT_S3_ENDPOINT=https://s3.example.com \
  "ghcr.io/maple52046/inari:$ts"
```

Distroless image 只包含 public CA。若要信任內部 CA，請掛載 CA 並設定：

```bash
-e NODE_EXTRA_CA_CERTS=/etc/inari-ca/ca.crt
```

Dockerfile 會輸出 standalone Next.js server，並使用 `docker/start.mjs` 在
container 內強制 server bind 到 `0.0.0.0`。

## Kubernetes

Kubernetes manifests 與部署說明在 [`deploy/k8s/`](deploy/k8s/)：

- `namespace.yaml`
- `secret.example.yaml`
- `configmap-ca.example.yaml`
- `deployment.yaml`
- `service.yaml` (`ClusterIP`)
- `service-nodeport.yaml` (`NodePort` 32591)
- `README.md`

快速部署範例：

```bash
kubectl apply -f deploy/k8s/namespace.yaml
kubectl -n inari create secret generic inari-env --from-env-file=.env.local
kubectl -n inari create configmap inari-ca \
  --from-file=ca.crt=/usr/local/share/ca-certificates/amd-com-issuing-ca.crt
kubectl apply -f deploy/k8s/deployment.yaml
kubectl apply -f deploy/k8s/service-nodeport.yaml
kubectl -n inari rollout status deploy/inari
```

詳細設定請見 [`deploy/k8s/README.md`](deploy/k8s/README.md)。

## 環境變數

| Name                             | Required     | Description                                        |
| -------------------------------- | ------------ | -------------------------------------------------- |
| `SESSION_SECRET`                 | Yes          | 用於 sealing `iron-session` cookie，至少 32 字元。 |
| `DEFAULT_S3_ENDPOINT`            | No           | `/connect` 頁面預設 S3 endpoint。                  |
| `SERVER_ACTIONS_ALLOWED_ORIGINS` | Proxy 時需要 | 允許 Server Actions CSRF check 的 host 清單。      |

`ALLOWED_DEV_ORIGINS` 只用於 Next.js dev server，不應用於 production image。

## 安全注意事項

- S3 Secret 只保存在 server-side encrypted session，不寫入 DB 或 browser
  storage。
- `.env.local` 被 `.gitignore` 忽略，不要提交真實 secrets。
- Delete action 一律需要使用者確認並輸入 `DELETE`。
- Cleanup Planner 會先產生 candidates 與可釋放空間估算，不會自動刪除。
- Usage 與 Cleanup 都基於標準 S3 list API scan，可能不包含 provider-specific
  overhead、object versions、delete markers 或 incomplete multipart uploads。

## License

MIT. See [`LICENSE`](LICENSE).
