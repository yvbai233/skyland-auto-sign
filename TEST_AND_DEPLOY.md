# Cloudflare Worker 本地测试与部署指南

本文说明如何添加森空岛 Token、在本地执行真实测试，以及把项目部署到 Cloudflare Workers。

> 本地测试和定时任务测试都会访问森空岛接口，并可能执行真实签到。请勿把 Token、`.dev.vars` 内容或 `WORKER_AUTH` 发给他人，也不要提交到 Git。

## 一、准备环境

需要：

- Node.js 当前 LTS 版本
- npm
- Cloudflare 账号（部署时需要）

在项目根目录打开 PowerShell：

```powershell
cd cf-worker
node --version
npm --version
npm ci
```

检查代码能否通过 TypeScript 编译：

```powershell
npm run check
```

## 二、获取森空岛 Token

### 方法一：使用本地短信验证码工具

这个工具只在本地运行，不会被打包或部署到 Cloudflare Worker。

先安装原 Python 项目的依赖：

```powershell
python -m pip install -r ..\requirements.txt
```

如果 Windows 上使用 `py` 启动器：

```powershell
py -3 -m pip install -r ..\requirements.txt
```

然后运行：

```powershell
python scripts\get_token_by_sms.py
```

或者：

```powershell
py -3 scripts\get_token_by_sms.py
```

按提示输入鹰角通行证手机号和收到的短信验证码。登录成功后，工具会显示 Token，并询问是否写入 `cf-worker/.dev.vars`。如果文件中已有 Token，可以选择追加为多账号、覆盖或取消写入。

如果鹰角接口返回人机验证或发送频率限制，需要稍后重试，或者改用下面的浏览器方式。

### 方法二：从已登录的网页获取

1. 在浏览器中登录森空岛网页版。
2. 登录成功后访问：<https://web-api.skland.com/account/info/hg>
3. 页面会显示一段 JSON，找到其中的 `data.content`。
4. 复制 `data.content` 的值，这就是推荐填写的 Token。

Worker 也能解析完整 JSON，但只复制 `data.content` 更不容易遇到引号和 dotenv 转义问题。

Token 相当于账号登录凭证，请勿放入 README、截图、Issue 或 Git 提交中。

## 三、添加本地 Token

先复制本地变量模板：

```powershell
Copy-Item .dev.vars.example .dev.vars
```

打开 `cf-worker/.dev.vars`，填写：

```dotenv
TOKEN="你的森空岛Token"
WORKER_AUTH="一段足够长的随机字符串"
```

`WORKER_AUTH` 是手动调用 Worker 时使用的密码。可以在 PowerShell 中生成：

```powershell
$authBytes = [byte[]]::new(32)
[System.Security.Cryptography.RandomNumberGenerator]::Fill($authBytes)
[Convert]::ToHexString($authBytes).ToLowerInvariant()
```

把输出的 64 位字符串复制到 `WORKER_AUTH`。

### 多账号

多个 Token 使用英文逗号分隔：

```dotenv
TOKEN="第一个Token,第二个Token,第三个Token"
WORKER_AUTH="你的随机字符串"
```

不要在 Token 两边添加多余空格。程序也支持换行分隔，但 `.dev.vars` 中使用逗号最简单。

### 可选推送配置

需要哪个就取消对应注释并填写：

```dotenv
SC3_SENDKEY="Server酱SendKey"
SC3_UID="Server酱UID，可留空"
QMSG_KEY="Qmsg Key"
PUSHPLUS_KEY="PushPlus Token"
```

`.dev.vars` 已被 `.gitignore` 排除，不要强制提交它。Cloudflare 官方也建议只在本地通过 `.dev.vars` 或 `.env` 提供开发 Secrets：[Secrets 文档](https://developers.cloudflare.com/workers/configuration/secrets/)。

## 四、本地运行和测试

启动本地 Worker：

```powershell
npm run dev
```

Wrangler 通常会显示：

```text
Ready on http://localhost:8787
```

如果显示了其他端口，请把下面命令中的 `8787` 换成实际端口。

### 测试 HTTP 手动签到

再打开一个 PowerShell 窗口，把 `WORKER_AUTH` 替换成 `.dev.vars` 中的实际值：

```powershell
curl.exe -X POST "http://localhost:8787/" `
  -H "Authorization: Bearer 你的WORKER_AUTH"
```

成功响应示例：

```json
{
  "ok": true,
  "logs": [
    "[明日方舟]角色示例角色(官服)签到成功，获得了物品×1"
  ]
}
```

如果 Token 已失效，HTTP 请求仍可能返回 `ok: true`，但 `logs` 中会写明对应账号的失败原因。

### 测试 Cron 定时任务

保持 `npm run dev` 正在运行，然后在另一个窗口执行：

```powershell
curl.exe "http://localhost:8787/cdn-cgi/handler/scheduled?format=json"
```

该请求会真实执行一次定时签到。正常的调度结果类似：

```json
{"outcome":"ok","noRetry":false}
```

Cloudflare 官方的本地 Cron 测试入口也是 `/cdn-cgi/handler/scheduled`：[Cron Triggers 文档](https://developers.cloudflare.com/workers/configuration/cron-triggers/#test-cron-triggers-locally)。

测试结束后，在运行 Wrangler 的窗口按 `Ctrl+C`。

## 五、部署到 Cloudflare Workers

### 1. 登录 Cloudflare

```powershell
npx wrangler login
```

浏览器会打开 Cloudflare 授权页面，选择正确账号并允许 Wrangler 访问。

### 2. 首次部署并上传 Secrets

如果本地 `.dev.vars` 中已经填写了生产环境要使用的 Token 和 `WORKER_AUTH`，可以一次性上传代码和 Secrets：

```powershell
npx wrangler deploy --secrets-file .dev.vars
```

Cloudflare 官方支持在部署时通过 `--secrets-file` 上传 `.env` 格式的 Secrets；没有出现在文件中的旧 Secret 会被保留：[Secrets 部署说明](https://developers.cloudflare.com/workers/configuration/secrets/#upload-secrets-alongside-code)。

部署完成后，Wrangler 会输出类似地址：

```text
https://skyland-auto-sign.<你的-workers-dev-子域>.workers.dev
```

### 3. 后续单独更新 Token

Token 变化时不需要修改源码：

```powershell
npx wrangler secret put TOKEN
```

根据提示粘贴新 Token。多账号仍使用英文逗号分隔。

更新 HTTP 调用密码：

```powershell
npx wrangler secret put WORKER_AUTH
```

添加可选推送 Secret：

```powershell
npx wrangler secret put SC3_SENDKEY
npx wrangler secret put SC3_UID
npx wrangler secret put QMSG_KEY
npx wrangler secret put PUSHPLUS_KEY
```

只需要执行实际使用的推送服务。`wrangler secret put` 输入的值不会直接显示在 Cloudflare 控制台中。

### 4. 后续更新部署

如果只修改了 TypeScript、Cron 或文档，先检查再部署：

```powershell
npm run check
npm run deploy
```

普通代码部署不会删除已有 Secrets。修改 [wrangler.toml](./wrangler.toml) 中的 Cron 后，也使用这组命令。

如果只更新 Token 或其他 Secret，不需要重新部署代码：

```powershell
npx wrangler secret put TOKEN
```

如果代码和 `.dev.vars` 中的 Secrets 都发生了变化，可以一起发布：

```powershell
npx wrangler deploy --secrets-file .dev.vars
```

## 六、验证线上 Worker

### 手动触发并查看实时日志

先确认本地代码已经部署。如果刚更新过代码：

```powershell
npm run deploy
```

打开第一个 PowerShell 窗口，在 `cf-worker` 目录启动实时日志：

```powershell
npx wrangler tail
```

保持这个窗口运行。然后打开第二个 PowerShell 窗口，执行：

```powershell
curl.exe -X POST "https://skyland-auto-sign.<你的子域>.workers.dev/" `
  -H "Authorization: Bearer 你的WORKER_AUTH"
```

把 URL 换成 Wrangler 部署时输出的实际 `workers.dev` 地址，把 `你的WORKER_AUTH` 换成 `.dev.vars` 中配置的值。

第二个窗口会直接返回签到结果，例如：

```json
{
  "ok": true,
  "logs": ["角色签到成功……"]
}
```

第一个 `wrangler tail` 窗口会同时显示请求状态、每个角色的签到结果和运行异常。查看完成后按 `Ctrl+C` 退出日志监听。

不要省略 `Authorization`，也不要使用浏览器直接 GET 访问；Worker 只接受带鉴权的 POST 请求。手动触发会执行真实签到和推送，同一天重复执行时可能返回“已经签到”。

也可以在当前请求中临时传入 Token。该值只用于本次请求，不会被保存：

```powershell
$env:SKLAND_TOKEN = "你的森空岛Token"
$env:WORKER_AUTH = "你的WORKER_AUTH"
$body = @{ token = $env:SKLAND_TOKEN } | ConvertTo-Json -Compress

curl.exe -X POST "https://skyland-auto-sign.<你的子域>.workers.dev/" `
  -H "Authorization: Bearer $env:WORKER_AUTH" `
  -H "Content-Type: application/json" `
  --data-binary $body
```

请求体未提供 `token` 时，Worker 使用 Cloudflare `TOKEN` Secret。临时 Token 支持用英文逗号分隔多个账号；Cron 定时任务始终使用 Cloudflare `TOKEN` Secret。

也可以在 Cloudflare 控制台进入：

```text
Workers & Pages → skyland-auto-sign → Logs → Live
```

打开实时日志后，再执行上面的 POST 请求。

## 七、定时执行时间

当前 [wrangler.toml](./wrangler.toml) 配置为：

```toml
[triggers]
crons = ["0 23 * * *"]
```

Cloudflare Cron 使用 UTC，因此它表示：

- UTC：每天 23:00
- 北京时间：每天 07:00（次日）

修改 Cron 后重新运行 `npm run deploy`。Cloudflare 提示 Cron Trigger 变更最多可能需要约 15 分钟传播到全球网络。

## 八、常见问题

### 返回 `401 Unauthorized`

请求中的 `Authorization` 与 Cloudflare 上的 `WORKER_AUTH` 不一致。重新执行：

```powershell
npx wrangler secret put WORKER_AUTH
```

### 返回 `503 WORKER_AUTH is not configured`

线上尚未设置调用密码：

```powershell
npx wrangler secret put WORKER_AUTH
```

### 返回 `405 Method Not Allowed`

你使用了 GET。请使用 POST。

### 日志显示 Token 或登录失效

重新登录森空岛，访问 `account/info/hg` 获取新的 `data.content`，然后更新本地 `.dev.vars` 或线上 `TOKEN` Secret。

### 提示已经签到

本地 HTTP 测试、Cron 测试和线上手动调用都会执行真实请求。同一天重复测试时出现“已经签到”属于正常情况。

### 修改了 `.dev.vars`，线上却没有变化

`.dev.vars` 默认只供本地开发使用。需要重新执行以下任一命令：

```powershell
npx wrangler secret put TOKEN
```

或者：

```powershell
npx wrangler deploy --secrets-file .dev.vars
```
