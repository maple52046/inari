# Inari

Manage S3-compatible object storage.

Inari 是一個 standalone Web 服務，用於管理 S3-compatible object storage。核心
功能使用標準 S3 API，避免綁定特定 provider；MinIO 相關能力保留為未來 plugin
擴充。

Server 以 Rust + Axum 實作，前端是 React SPA，兩者編譯成**單一 executable**：
production 不需要安裝 Node.js、npm 或 container runtime。

**所有 S3 操作都在 server 端執行。** Browser 從不持有 access key，也不直接用
credentials 呼叫 S3 API。

## 功能

- 以只有 server 能解密的 sealed cookie session 保存 S3 連線資訊，Secret 不寫入
  browser `localStorage`。
- 列出 buckets、prefixes 與 objects。
- Object browser 支援 prefix navigation、pagination、size/date filter、
  sort、multi-select 與 batch delete。
- Object move / rename，跨 bucket 亦可；超過 5 GiB 的來源自動改走 multipart
  copy。
- Cleanup Planner (`/cleanup`) 可跨 bucket 掃描候選清理檔案，依
  `lastModified ASC, size DESC, bucket ASC, key ASC` 排序，預估可釋放空間，
  並在確認後依 bucket 分組刪除。
- Bucket 首頁 (`/buckets`) 內建 usage 掃描，以 S3 list scan 估算 bucket/object
  usage，並以圓餅圖呈現各 bucket 佔比。掃描一律手動觸發，結果存於
  `sessionStorage`，關閉 tab 即清除。
- Dark theme 預設，支援 light/system theme。
- Responsive UI 與 lucide icons。

## 技術棧

### Server

- Rust + [Axum](https://github.com/tokio-rs/axum)
- AWS SDK for Rust (`aws-sdk-s3`)
- `rustls` + `rustls-native-certs`（使用 OS trust store，無 OpenSSL 相依）
- 以 AES-256-GCM 加密的 session cookie，金鑰由 `SESSION_SECRET` 經 HKDF 導出
- `ts-rs` 由 Rust 型別產生 TypeScript wire types，避免前後端漂移

### Web

- React 19 + TypeScript strict mode
- Chakra UI v3 (`@chakra-ui/react`, `@emotion/react`)
- React Router
- `next-themes` for light/dark colour mode
- Vite
- Vitest

## 架構

專案遵循 Clean Architecture dependency rule，dependency 一律向內：

```text
server/src/
  domain/          # entities、value objects、port traits；無 I/O
  application/     # use cases，只依賴 domain 與其 ports
  adapters/        # s3 / session / http，實作 ports
  infrastructure/  # config、runtime、embedded assets
  main.rs          # composition root

web/src/
  api/             # 與 server 對話的唯一位置（含 date revival）
  app/             # routes、session context、pages
  components/      # UI components
  domain/          # 共用型別
  lib/             # pure utilities
  theme/           # Chakra design tokens
```

前端只透過 `web/src/api` 呼叫 server，不直接接觸任何 S3 SDK。

## 本機開發

需求：

- Rust 1.96+
- Node.js 24+
- 選用：[`just`](https://github.com/casey/just)、`watchexec`

建立本機環境檔：

```bash
cp .env.example .env
```

至少設定 `SESSION_SECRET`（至少 32 字元）。

啟動：

```bash
just dev          # Rust API + Vite（含 HMR）
```

開啟 <http://localhost:5173>。Vite 會把 `/api` proxy 到 Rust server，因此
browser 只看到單一 origin，session cookie 的行為與 production 完全一致。

不使用 `just` 時：

```bash
cd server && cargo run          # API，預設 :3000
cd web && npm run dev           # SPA，:5173
```

Debug build 的 server 會在 request 時從 `web/dist` 讀取前端資源，所以重新
build 前端後不需要重啟 server。

### 內部 CA / TLS

Server 使用 OS trust store 驗證 S3 endpoint 憑證。若使用公司內部 CA，安裝進
系統信任庫即可：

```bash
sudo cp your-ca.pem /usr/local/share/ca-certificates/your-ca.crt
sudo update-ca-certificates
```

不想動系統信任庫時，用 `INARI_EXTRA_CA_CERTS` 指向單一 PEM 即可；該憑證會
**附加**到平台既有的 roots，不會取代它們。檔案不存在或格式錯誤會在啟動時失敗，
而不是在每個 request 才冒出難解的 TLS 錯誤。

`/connect` 頁面另有「skip TLS verification」選項，但那會讓連線失去身分驗證
保證，只應作為最後手段。

## Commands

```bash
just dev          # API + Vite dev server
just test         # cargo test + vitest
just lint         # cargo fmt/clippy + eslint + tsc
just build        # debug build（前後端）
just release      # production build，前端資源嵌入 binary
just bindings     # 重新產生 web/src/api/types.ts
just minio-up     # 起一個測試用 MinIO 在 :9100
```

## Production build

```bash
just release
```

產物是單一 executable，前端資源已嵌入其中：

```bash
cd server && SESSION_SECRET=<at-least-32-characters> ./target/release/inari-server
```

Idle RSS 約 14 MiB，執行 exhaustive bucket scan 時維持持平——listing 一律
分頁，cleanup scan 只保留最終會回傳的候選。

## Docker image

Multi-stage build，final stage 為 `scratch`，只含 binary 與 CA bundle
（約 10 MB）：

```bash
ts=$(date +%Y%m%d-%H%M%S)
docker build --build-arg VERSION="$ts" -t "ghcr.io/maple52046/inari:$ts" .
```

執行：

```bash
docker run -d -p 3000:3000 \
  -e SESSION_SECRET=<at-least-32-characters> \
  -e DEFAULT_S3_ENDPOINT=https://s3.example.com \
  "ghcr.io/maple52046/inari:$ts"
```

要信任內部 CA，掛載 PEM 並指向它。該憑證是**附加**到 image 內建的 public
bundle，不是取代它，所以連線到 public endpoint 仍然正常：

```bash
-v /path/to/ca.crt:/etc/inari-ca/ca.crt:ro \
-e INARI_EXTRA_CA_CERTS=/etc/inari-ca/ca.crt
```

Container 不需要寫入權限，可以搭配 `readOnlyRootFilesystem: true` 與
non-root user 執行。

## systemd

不使用 container 時，[`deploy/inari.service`](deploy/inari.service) 提供
sandbox 完整的 unit，設定範例見
[`deploy/config.example.env`](deploy/config.example.env)：

```bash
sudo install -m 0755 inari-server /usr/local/bin/inari-server
sudo install -d -m 0750 /etc/inari
sudo install -m 0640 deploy/config.example.env /etc/inari/config.env
sudo install -m 0644 deploy/inari.service /etc/systemd/system/inari.service
sudo systemctl daemon-reload && sudo systemctl enable --now inari
```

## Kubernetes

Manifests 與說明在 [`deploy/k8s/`](deploy/k8s/)。快速部署：

```bash
kubectl apply -f deploy/k8s/namespace.yaml
kubectl -n inari create secret generic inari-env --from-env-file=.env
kubectl -n inari create configmap inari-ca --from-file=ca.crt=/path/to/ca.crt
kubectl apply -f deploy/k8s/deployment.yaml
kubectl apply -f deploy/k8s/service-nodeport.yaml
kubectl -n inari rollout status deploy/inari
```

## 環境變數

| Name                       | Required | Description                                                        |
| -------------------------- | -------- | ------------------------------------------------------------------ |
| `SESSION_SECRET`           | Yes      | Sealing session cookie 的秘密，至少 32 字元。                      |
| `HOST` / `PORT`            | No       | 綁定位址，預設 `0.0.0.0:3000`。                                    |
| `INARI_ENV`                | No       | `development` 會放寬 cookie Secure 預設並允許 Vite origin。        |
| `DEFAULT_S3_ENDPOINT`      | No       | `/connect` 頁面預設 S3 endpoint。                                  |
| `BASE_PATH`                | No       | 整個 app 掛載的 URL 前綴，例如 `/dashboard`。                      |
| `SESSION_COOKIE_SECURE`    | No       | 覆寫 cookie 的 `Secure` 屬性。                                     |
| `INARI_EXTRA_CA_CERTS`     | No       | 額外信任的 CA PEM 路徑，附加於 OS trust store 之上。               |
| `INARI_WORKER_THREADS`     | No       | Tokio worker 數；未設定時使用單執行緒 runtime。                    |
| `INARI_REQUEST_BODY_LIMIT` | No       | 最大 request body，預設 1 MiB。                                    |
| `RUST_LOG`                 | No       | Log filter，例如 `inari_server=debug`。                            |

## URL 前綴 (base path)

設定 `BASE_PATH` 後，SPA 與 API 都移到該前綴底下，reverse proxy 可以直接把帶
前綴的 path 原樣轉發，不需要 rewrite：

```nginx
location /dashboard/ {
    proxy_pass http://inari:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

前綴在**啟動時**套用：router 掛載到該前綴、cookie path 跟著縮限，並在
`index.html` 注入對應的 `<base href>`，讓 bundle 內的相對資源路徑從掛載點解析。
因此**同一份 build 可以跑在任何前綴底下**，不需要重新編譯，也不需要在啟動時
改寫 build 產物。

Health probe 刻意留在 root，不受前綴影響：

```bash
curl http://localhost:3000/healthz   # liveness，不呼叫 S3
curl http://localhost:3000/readyz    # readiness
```

## 安全注意事項

- S3 Secret 只保存在 sealed cookie session（`HttpOnly`、`SameSite=Lax`，以
  `SESSION_SECRET` 導出的金鑰加密），不寫入 DB，也不寫入 browser 可讀取的
  storage。
- 所有 S3 操作在 server 端執行；browser 只透過 JSON API 取得結果。
- 變更類 request 會檢查 `Origin`，搭配 `SameSite=Lax` 阻擋跨站提交。
- `.env` 被 `.gitignore` 忽略，不要提交真實 secrets。
- Error response 只帶穩定的 error code 與安全訊息；SDK 細節只進 log。
- Delete action 一律需要使用者確認並輸入 `DELETE`。
- Cleanup Planner 會先產生 candidates 與可釋放空間估算，不會自動刪除。
- Usage 與 Cleanup 都基於標準 S3 list API scan，可能不包含 provider-specific
  overhead、object versions、delete markers 或 incomplete multipart uploads。

## License

MIT. See [`LICENSE`](LICENSE).
