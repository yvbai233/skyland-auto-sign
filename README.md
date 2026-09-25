# 森空岛自动签到 · Cloudflare Workers

> 本项目已链接认可 [LINUX DO](https://linux.do) 社区。

[English](./README_EN.md) | 简体中文

将森空岛自动签到运行在 Cloudflare Workers 上，无需自建服务器。Worker 通过 Cron Trigger 每天自动执行签到，也提供带鉴权的 HTTP 接口用于手动触发。

<p align="center">
  <a href="https://deploy.workers.cloudflare.com/?url=https://github.com/xiaoyulejia/skyland-auto-sign-CFworker">
    <img src="https://deploy.workers.cloudflare.com/button" alt="Deploy to Cloudflare">
  </a>
</p>

如果使用一键部署，请按照下面的步骤获取森空岛的 `TOKEN` 和设置访问密码 `WORKER_AUTH`。

> [!IMPORTANT]
> 本项目是非官方工具，仅供学习和个人使用，与鹰角网络、森空岛及 Cloudflare 无关。账号 Token 等同于登录凭证，请自行评估使用风险，切勿将 Token 提交到 Git、粘贴到 Issue，或分享在日志和截图中。

> [!IMPORTANT]
> 本项目使用人工智能辅助完成, 特此提示

## 功能

- 支持《明日方舟》和《明日方舟：终末地》森空岛签到
- 支持多个森空岛账号
- 使用 Cloudflare Cron Trigger 定时执行
- 支持 Server酱³、Qmsg 和 PushPlus 结果通知
- 支持通过带 Bearer 鉴权的 HTTP `POST` 请求手动触发
- 支持在手动请求的 JSON 请求体中临时传入森空岛 Token
- 使用 Cloudflare Secrets 保存 Token，不在源码和 Wrangler 配置中保存敏感信息


## 获取森空岛 Token

1. 使用浏览器登录[森空岛官网](https://www.skland.com/)

  <p align="center"><img src="./assets/img1.png" alt="森空岛官网" width="70%"></p>


2. 保持登录状态，访问 <https://web-api.skland.com/account/info/hg>
3. 页面会返回 JSON。找到 `data.content` 字段，只复制它的字符串值(英文双引号直接的内容)，不要复制字段名、引号或整段 JSON
   
  <p align="center"><img src="./assets/img2.png" alt="复制 Token" width="70%"></p>

返回内容的结构大致如下，其中 `这里才是需要复制的Token` 是示例占位符：

```json
{
  "code": 0,
  "data": {
    "content": "这里才是需要复制的Token" // 不要复制双引号
  },
  "msg": "..."
}
```



## 部署

1. 按照上面指引获取好森空岛`TOKEN`并保存好
2. 设置呢自己的`WORKER_AUTH`密码, 请务必设置的长一些, 或者是使用[UUID生成](https://www.lddgo.net/string/uuid)并保存好
3. 点击[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/xiaoyulejia/skyland-auto-sign-CFworker) 按钮，登录自己的 Cloudflare 账号并按页面提示填写：
   - `TOKEN`：森空岛 Token。多个账号使用`英文逗号`分隔。
   - `WORKER_AUTH`：手动触发接口的独立密码，请使用随机字符串，不要与 `TOKEN` 相同。
   - `SC3_SENDKEY`、`SC3_UID`、`QMSG_KEY`、`PUSHPLUS_KEY`：可选的推送配置，不使用时留空。
   <p align="center"><img src="./assets/img3.png" alt="部署页面" width="50%"></p>
4. 点击部署, 等待部署完成即可

> [!IMPORTANT]
> 请不要把自己的 `TOKEN` 或 `WORKER_AUTH` 分享给其他人。

## 修改
1. 如果需要修改定时规则
   - CloudFlare这里使用的是UTC时间, 对于我们UTC+8时间需要自己换算哦
   - [定时器语法](https://developers.cloudflare.com/workers/configuration/cron-triggers/#supported-cron-expressions)
   - 字段顺序 `分钟 → 小时 → 日期 → 月份 → 周日期`
   - `* 23 * * *` 及代表每天 UTC时间晚上11点(UTC+8 即为早上7点)
   <p align="center"><img src="./assets/img4.png" alt="定时规则设置" width="50%"></p>
2. 如果需要开启链接签到可以在这里打开, 也可以选择绑定自己的CF域名
   <p align="center"><img src="./assets/img5.png" alt="绑定域名设置" width="50%"></p>




## 本地开发指引

> [!IMPORTANT]
> 如果需要拉取后部署, 请只在本地 `.dev.vars` 或 Cloudflare Secrets 中保存该值。不要将真实 Token 写入 `.dev.vars.example`、`wrangler.toml`、源代码或文档。


### 1. 获取代码并安装依赖

```bash
git clone https://github.com/xiaoyulejia/skyland-auto-sign-CFworker.git
cd skyland-auto-sign-CFworker
npm ci
npm run check
```

### 2. 创建本地 Secret 文件

Windows PowerShell：

```powershell
Copy-Item .dev.vars.example .dev.vars
```

macOS / Linux：

```bash
cp .dev.vars.example .dev.vars
```

编辑 `.dev.vars`：

```dotenv
TOKEN="你的森空岛Token"
WORKER_AUTH="一段足够长且随机的字符串"
```

默认的 Cron 定时签到需要同时配置 `TOKEN` 和 `WORKER_AUTH`：

- `TOKEN`：Cron 定时签到使用的森空岛登录凭证。如果只使用 HTTP 请求体临时传入 Token，可以不配置该 Secret。
- `WORKER_AUTH`：保护 HTTP 手动触发接口的独立密码，请勿与森空岛 Token 相同；使用 HTTP 接口时必须配置。

多账号可用英文逗号分隔：

```dotenv
TOKEN="第一个Token,第二个Token,第三个Token"
```

如需结果推送，可在 `.dev.vars` 中配置对应项目：

```dotenv
SC3_SENDKEY="Server酱³ SendKey"
SC3_UID="Server酱³ UID，可留空"
QMSG_KEY="Qmsg Key"
PUSHPLUS_KEY="PushPlus Token"
```

`.dev.vars` 已被 `.gitignore` 排除。提交前仍建议运行 `git status --short`，确认它没有出现在待提交文件中。

### 3. 本地测试

```bash
npm run dev
```

Wrangler 默认监听 `http://localhost:8787`。在另一个终端中手动触发：

```bash
curl -X POST "http://localhost:8787/" \
  -H "Authorization: Bearer 你的WORKER_AUTH"
```

测试定时任务：

```bash
curl "http://localhost:8787/cdn-cgi/handler/scheduled?format=json"
```

以上两种测试都会访问森空岛并可能执行真实签到。

### 4. 发布到 Cloudflare

登录 Cloudflare：

```bash
npx wrangler login
```

先做一次仅构建检查：

```bash
npx wrangler deploy --dry-run
```

首次发布时，将 `.dev.vars` 中的 Secret 与 Worker 一起安全上传：

```bash
npx wrangler deploy --secrets-file .dev.vars
```

部署完成后，Wrangler 会显示 Worker 的 `workers.dev` 地址。Secret 的值不会写入代码仓库或 `wrangler.toml`。

以后只更新某个 Secret 时，可使用交互式命令并按提示粘贴值：

```bash
npx wrangler secret put TOKEN
npx wrangler secret put WORKER_AUTH
```

可选推送服务同理，只设置实际使用的项目：

```bash
npx wrangler secret put SC3_SENDKEY
npx wrangler secret put SC3_UID
npx wrangler secret put QMSG_KEY
npx wrangler secret put PUSHPLUS_KEY
```

修改代码后重新发布：

```bash
npm run check
npm run deploy
```

## 验证线上部署

使用部署输出的地址发送带鉴权的 `POST` 请求：

```bash
curl -X POST "https://skyland-auto-sign.<你的子域>.workers.dev/" \
  -H "Authorization: Bearer 你的WORKER_AUTH"
```

查看实时日志：

```bash
npx wrangler tail
```

接口只接受 `POST`。缺少或错误的 `Authorization` 会返回 `401`；未配置 `WORKER_AUTH` 会返回 `503`。

### 使用 curl 临时传入 Token

也可以在 JSON 请求体中提供 `token`。该 Token 仅用于当前请求，不会被 Worker 保存或写入日志；请求体未提供 `token` 时，Worker 会继续使用 Cloudflare 中的 `TOKEN` Secret。

不建议把真实 Token 和 `WORKER_AUTH` 直接写进命令，因为它们可能保留在 Shell 历史中。先设置当前终端的环境变量：

Windows PowerShell：

```powershell
$env:SKLAND_TOKEN = "你的森空岛Token"
$env:WORKER_AUTH = "你的WORKER_AUTH"

$body = @{ token = $env:SKLAND_TOKEN } | ConvertTo-Json -Compress
curl.exe -X POST "https://skyland-auto-sign.<你的子域>.workers.dev/" `
  -H "Authorization: Bearer $env:WORKER_AUTH" `
  -H "Content-Type: application/json" `
  --data-binary $body
```

macOS / Linux（需要 `jq`）：

```bash
read -rsp "Skland Token: " SKLAND_TOKEN && echo
read -rsp "WORKER_AUTH: " WORKER_AUTH && echo
export SKLAND_TOKEN WORKER_AUTH

printf '%s' "$SKLAND_TOKEN" \
  | jq -Rs '{token: .}' \
  | curl -X POST "https://skyland-auto-sign.<你的子域>.workers.dev/" \
      -H "Authorization: Bearer ${WORKER_AUTH}" \
      -H "Content-Type: application/json" \
      --data-binary @-

unset SKLAND_TOKEN WORKER_AUTH
```

多个账号仍可在 `token` 字符串中用英文逗号分隔。线上必须配置 `WORKER_AUTH`；如果只使用这种手动调用方式，可以不配置 `TOKEN` Secret，但 Cron 定时签到仍然需要 `TOKEN` Secret。

## 定时任务

[wrangler.toml](./wrangler.toml) 默认配置：

```toml
[triggers]
crons = ["0 23 * * *"]
```

Cloudflare Cron 使用 UTC，因此该配置表示每天 UTC 23:00，即北京时间次日 07:00。修改 Cron 后重新运行 `npm run deploy`；配置传播可能需要几分钟。
