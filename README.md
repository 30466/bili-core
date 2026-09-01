# bili-core

Bilibili UP 主视频列表抓取、元数据导出与音视频下载 CLI 工具。工作流程分为两部分：先按 UP 主 UID 或名称抓取账号全部视频，并导出包含分 P、统计数据和合集信息的 JSON + CSV；再根据登录账号具备的权限下载所选视频或音频，大会员账号可获取 Hi-Res FLAC、Dolby Atmos、4K/8K 等高质量 DASH 流。

## 功能

- **Hi-Res FLAC 无损音频下载** — 需大会员，获取 DASH FLAC 音轨
- **Dolby Atmos EAC3 / AC-3 音频下载** — 需大会员，获取杜比全景声/杜比数字音轨
- **AAC 标准音频下载** — 登录即可，获取 192K 标准音频
- **最高画质视频下载** — 需大会员，自动选择最高分辨率 DASH 视频流（含 4K、8K）
- **视频+音频 ffmpeg 无损合并** — 下载后自动合并（FLAC 音频合入 MKV，其余合入 MP4）
- **批量下载** — 按 UP 主 UID 批量下载视频
- **视频元数据导出** — 导出 UP 主全部视频信息到 JSON（包含分P、播放量、点赞、投币、收藏及合集信息等）
- **按关键词批量下载脚本** — `scripts/download-artist.mjs` 支持按标题关键词筛选下载，并发+跳过已有
- **白名单批量同步** — `sync` 命令根据白名单文件批量导出多个 UP 主视频元数据（JSON + CSV）

## 来源、许可证与免责声明

本项目以 **GNU Affero General Public License v3.0 or later（AGPL-3.0-or-later）** 开源。任何人都可以使用、研究、修改和再分发本项目，也可以在遵守许可证的前提下用于商业场景；向他人分发本项目或修改版时，必须依照 AGPL 提供对应源码。若修改后作为网络服务供用户交互，也必须向这些用户提供正在运行版本的对应源码。转载、修改和分发时还应保留版权、许可证及第三方来源说明。完整条款见 [`LICENSE`](LICENSE)。

本项目维护者仅以非商业目的开发、研究和公开本项目源码，不通过本项目提供收费下载、数据出售或其他商业化服务。项目在使用者本地运行，维护者不参与、不控制，也不代表 Bilibili 或任何第三方对本项目的下载、修改、部署或使用；第三方实施的行为属于其独立行为，相应责任由实施者依法自行承担。

本项目的下载相关实现并非 Bilibili 官方 SDK。下载部分的整体实现思路与接口处理方式，包括 WBI 请求签名、视频信息与播放地址接口调用、DASH 音视频流选择、分 P 处理、音视频下载及 FFmpeg 合并，参考了浏览器用户脚本项目 [Bilibili-Evolved](https://github.com/the1812/Bilibili-Evolved) 的[“下载视频”组件](https://github.com/the1812/Bilibili-Evolved/tree/master/registry/lib/components/video/download)及相关实现。`bili-core` 与 Bilibili-Evolved 没有隶属、授权或官方合作关系。第三方来源及许可证说明见 [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md)。

本项目仅供学习、研究和技术参考。该表述说明项目定位，不构成对 AGPL 已授予权利的额外用途限制。使用者应自行确认账号权限和内容权利，遵守 Bilibili 用户协议、版权、所在地区法律法规及其他适用要求；不得将本项目用于侵犯版权、绕过访问控制、规避平台风控或其他违法用途。

本软件按“现状”提供，不附带任何明示或默示担保。在适用法律允许的最大范围内，使用、修改、部署或分发本项目所产生的登录、账号限制、数据损失、合规、法律及其他风险由使用者自行判断和承担。维护者不对用户行为或由此造成的损失负责，也不排除适用法律规定的不可免责责任。

## 前置条件

- **Node.js** >= 18（ESM 模块支持）
- **Playwright Chromium** — 获取 Cookie 和 UP 主空间数据需要。安装：`npx playwright install chromium`
- **ffmpeg**（可选，视频合并需要。安装：`brew install ffmpeg`）
- **Bilibili 大会员账号**（FLAC / 4K / Dolby / Hi-Res 下载必需）

## 安装

```bash
git clone <repo-url>
cd bili-core
npm install
npm run build         # TypeScript 编译（必需，脚本依赖 dist/）
```

CLI 运行方式：

```bash
npx bili <command>        # 通过 npm bin 运行（推荐）
npm start                 # 等同于 node bin/bili.js
node bin/bili.js <command>
```

## AI Skill

项目内置 [Bili Core Skill](.agents/skills/bili-core/SKILL.md)，用于让支持 Agent Skills 的 AI 根据自然语言需求选择 CLI 或现有脚本，完成视频列表抓取、JSON/CSV 导出、关键词筛选以及音视频下载。Skill 只负责编排项目已有能力，不会为了执行普通抓取任务而修改业务代码。

在 Codex 等支持项目级 Skill 的环境中，可以显式调用：

```text
Use $bili-core to get all videos for UID <UID> and save JSON and CSV.
Use $bili-core to filter titles containing 关键词A or 关键词B, then download audio only.
Use $bili-core to download the BVIDs selected in data/selected.csv.
Use $bili-core to sync the whitelist in up-list.txt.
```

Skill 会优先调用本地 `node bin/bili.js` CLI；只有当现有 CLI 无法直接表达筛选或自选列表流程时，才组合 JSON/CSV 处理和单视频下载命令。完整路由、输入、筛选和安全规则见 [Bili Core Skill](.agents/skills/bili-core/SKILL.md)。

## 使用

### 1. 获取 Cookie

首次使用需要登录 Bilibili 获取 Cookie（需先安装 Playwright Chromium：`npx playwright install chromium`）：

```bash
npm run get-cookie
```

这会打开一个浏览器窗口，扫码登录后自动提取 Cookie 写入 `.env` 文件。

验证 Cookie 是否有效：

```bash
npx bili check-login
```

> **注意**：除 `lookup`（按名称查找 UID）外，其余命令在未登录时会自动打开浏览器引导扫码登录。`lookup` 无需 Cookie，直调 B站搜索 API。

### 2. 查找 UP 主 UID

如果不知道 UID，用名字搜索。**无需登录**，直调 B站搜索 API：

```bash
npx bili lookup <关键词>
npx bili lookup <UP主名称>
# <UID>
```

精确匹配时直接输出 UID；无精确匹配时列出候选。

拿到 UID 后传给 `list`、`export`、`batch`、`sync` 命令。这些命令也支持 `--name <名称>` 选项（`sync` 除外，它从白名单文件读取），可直接按 UP 主名称操作，跳过 `lookup` 步骤。

### 3. 查看 UP 主视频列表

```bash
npx bili list <UID>
npx bili list <UID> --limit 10                    # 只显示前 10 个
npx bili list <UID> --json                        # JSON 格式打印到终端
npx bili list --name "示例UP主" --limit 10       # 直接按名称查找，跳过 lookup
```

视频列表通过 Playwright 浏览器抓取 `x/space/wbi/arc/search` 接口获取。终端预览仅显示标题、播放量、时长等基本信息，完整元数据（点赞、投币、收藏等）请使用 `export` 命令导出。

### 4. 查看视频信息

```bash
npx bili info BV1nJBLBuEWQ
npx bili info BV1nJBLBuEWQ --json          # JSON 格式输出
```

显示视频标题、UP 主、时长、分P、可用视频流（分辨率/编码/码率）和音频流（FLAC/Dolby/AAC）。

### 5. 下载

**下载单个视频（视频+音频合并）：**

```bash
npx bili download BV1nJBLBuEWQ
```

仅下载音频：

```bash
npx bili download BV1nJBLBuEWQ --audio
```

指定分P：

```bash
npx bili download BV1nJBLBuEWQ --page 2
```

**批量下载 UP 主视频：**

```bash
npx bili batch <UID>                              # 默认下载前 10 个
npx bili batch <UID> --audio                      # 仅下载音频
npx bili batch <UID> --limit 50                   # 下载前 50 个
npx bili batch --name "示例UP主" --limit 20      # 按名称批量下载，跳过 lookup
```

下载的文件保存在 `downloads/{ownerName}/` 目录下。

### 6. 导出元数据

```bash
# 导出 UP 主所有视频信息到 data/{upName}/ 目录（每次全量刷新）
npx bili export <UID>
npx bili export <UID> --concurrency 10           # 并发数（默认 20）
npx bili export <UID> --delay 100                # 每批间隔毫秒（默认 50）
npx bili export --name "示例UP主"               # 按名称导出，跳过 lookup
```

`export` 分两步：先通过 Playwright 翻页获取全部视频列表（同 `list`），再逐个调用视频详情 API 获取完整 stat。详情接口返回合集（`ugc_season`）时，还会解析合集中的独立 BVID，并补抓空间列表中没有的合集视频。每次运行全量刷新，覆盖旧文件。864 个视频约需 32 秒。

**CSV 列含义：**

| 列 | 含义 |
|----|------|
| `bvid` | 视频 BVID |
| `aid` | 视频 AID |
| `title` | 标题 |
| `duration` | 时长（秒） |
| `created` | 发布时间（ISO 8601） |
| `view` | 播放量 |
| `like` | 点赞数 |
| `coin` | 投币数 |
| `favorite` | 收藏数 |
| `share` | 分享数 |
| `danmaku` | 弹幕数 |
| `reply` | 评论数 |
| `url` | 视频链接 |

导出的 JSON 结构如下：

```json
{
  "upName": "UP主名称",
  "uid": 0,
  "updatedAt": "2025-07-16T...",
  "videos": {
    "BVxxx": {
      "bvid": "BVxxx",
      "aid": 123,
      "title": "视频标题",
      "cover": "https://...",
      "description": "...",
      "duration": 240,
      "created": 1700000000,
      "stat": { "view": 10000, "like": 500, "coin": 200, "favorite": 100, "share": 50, "danmaku": 30, "reply": 20 },
      "cid": 12345,
      "pages": [{ "cid": 12345, "part": "P1标题" }],
      "collection": { "id": 0, "title": "合集名称", "index": 3, "total": 26 }
    }
  },
  "collections": {
    "0": {
      "id": 0,
      "title": "合集名称",
      "cover": "https://...",
      "intro": "合集简介",
      "episodeCount": 26,
      "sections": [{
        "title": "默认分区",
        "episodes": [{
          "bvid": "BVyyy",
          "aid": 456,
          "cid": 45678,
          "title": "第 1 集",
          "cover": "https://...",
          "duration": 180,
          "created": 1700000000
        }]
      }]
    }
  }
}
```

#### JSON 字段说明

顶层字段：

| 字段 | 类型 | 含义 |
|------|------|------|
| `upName` | string | UP 主名称，用于输出目录名 |
| `uid` | number | UP 主 UID |
| `updatedAt` | string | 本次导出的时间，ISO 8601 格式 |
| `videos` | object | 视频详情表，键是 BVID，值是 `VideoEntry` |
| `collections` | object | 合集详情表，键是合集 ID（字符串形式），值是 `CollectionInfo`；没有合集时为空对象 |

`videos` 中每个视频字段：

| 字段 | 类型 | 含义 |
|------|------|------|
| `bvid` | string | 视频的 BVID，也是 `videos` 的键 |
| `aid` | number | 视频的 AV 号 |
| `title` | string | 视频标题 |
| `cover` | string | 视频封面 URL |
| `description` | string | 视频简介 |
| `duration` | number | 视频总时长，单位为秒 |
| `created` | number | 发布时间，Unix 时间戳（秒） |
| `tid` | number | Bilibili 分区 ID |
| `tname` | string | Bilibili 分区名称 |
| `stat` | object | 视频统计数据，字段见下表 |
| `cid` | number | 默认播放分 P 的 CID |
| `pages` | array | 分 P 列表；同一个 BVID 的多个 P 都在这里 |
| `collection` | object（可选） | 所属合集的简要信息；不属于合集时省略 |

`stat` 统计字段：

| 字段 | 含义 |
|------|------|
| `view` | 播放量 |
| `like` | 点赞数 |
| `coin` | 投币数 |
| `favorite` | 收藏数 |
| `share` | 分享数 |
| `danmaku` | 弹幕数 |
| `reply` | 评论数 |

`pages` 中每项字段：

| 字段 | 类型 | 含义 |
|------|------|------|
| `cid` | number | 该分 P 的 CID，下载该 P 时使用 |
| `part` | string | 该分 P 的标题 |

`collection` 中每项字段：

| 字段 | 类型 | 含义 |
|------|------|------|
| `id` | number | 合集 ID，对应顶层 `collections` 的键 |
| `title` | string | 合集名称 |
| `index` | number | 当前视频在合集中的顺序，从 1 开始 |
| `total` | number | 合集视频总数 |

`collections` 中每个合集字段：

| 字段 | 类型 | 含义 |
|------|------|------|
| `id` | number | 合集 ID |
| `title` | string | 合集名称 |
| `cover` | string | 合集封面 URL |
| `intro` | string | 合集简介 |
| `episodeCount` | number | Bilibili 返回的合集视频数 |
| `sections` | array | 合集分组列表 |

`sections` 中每项有 `title`（分组名称）和 `episodes`（合集视频列表）。`episodes` 中每个视频字段为 `bvid`、`aid`、`cid`、`title`、`cover`、`duration`、`created`，含义分别与视频字段中的同名字段相同。合集中的每个 episode 都是独立视频 BVID，不是同一个视频的分 P。

需要注意：当前 JSON 导出支持合集元数据；CSV 仍是平铺字段，不包含合集列。`download <bvid> --page <N>` 仍然下载一个独立 BVID 的某个分 P，尚未提供“一次下载整个合集”的 CLI 命令。

### 7. 按关键词批量下载脚本

`scripts/download-artist.mjs` 是基于导出数据的批量下载脚本，支持按标题关键词筛选、并发控制、跳过已有文件。

> **前提**：需要先运行 `npm run build` 编译 TypeScript，脚本从 `dist/` 导入模块。

```bash
# 第一步：导出 UP 主所有视频元数据
npx bili export <UID>

# 第二步：按关键词批量下载音频
node scripts/download-artist.mjs --data data/<UID>.json  # 默认匹配“关键词”
node scripts/download-artist.mjs --keyword 其他关键词     # 匹配其他关键词
node scripts/download-artist.mjs --concurrency 3          # 并发数（默认 5）
node scripts/download-artist.mjs --delay 1000             # 批间延迟毫秒（默认 200）
node scripts/download-artist.mjs --force                  # 强制重新下载（默认跳过已有）
node scripts/download-artist.mjs --limit 10               # 限制下载数量
```

下载的音频文件保存在 `downloads/{upName}/` 目录下。

### 8. 批量同步白名单 UP 主数据

根据白名单文件批量同步多个 UP 主的视频元数据（查找 UID → 导出 JSON + CSV）：

```bash
node bin/bili.js sync <file>
node bin/bili.js sync /path/to/up-list.txt
```

白名单文件每行一个 UP 主名称，`#` 开头的行为注释。

参数：

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `--concurrency <N>` | 每个 UP 主内部视频并发数 | 20 |
| `--delay <N>` | 每批间隔毫秒 | 50 |
| `--concurrency-up <N>` | 同时处理的 UP 主数量 | 3 |

流程：读取白名单 → 逐一 lookup UID → 跳过未找到的 → 并发导出视频元数据到 `data/{upName}/` 目录。

## 音频格式映射

Bilibili DASH 接口返回的音频流编码与文件扩展名对应关系：

| codecs | 编码格式 | 文件扩展名 | 说明 |
|--------|---------|-----------|------|
| `fLaC` | FLAC (Hi-Res 无损) | `.flac` | 需大会员，最高音质 |
| `mp4a.*` | AAC | `.m4a` | 标准音频，MP4 容器 |
| `ec-3` | Dolby Digital Plus (EAC3) | `.eac3` | 需大会员，杜比全景声 |
| `ac-3` | Dolby Digital (AC3) | `.ac3` | 需大会员 |

音频流选择优先级：**FLAC → Dolby EAC3 → AAC**（按音质从高到低，同级按码率降序）。

注意：`.eac3` 和 `.ac3` 文件需要播放器支持相应解码器（VLC、IINA 等可播，macOS QuickTime/Apple Music 不支持）。

## 项目结构

```
src/
├── cli.ts             # CLI 入口，commander 命令定义
├── index.ts           # 模块导出（供外部引用）
├── session.ts         # Cookie 会话管理（从 .env 加载）
├── wbi.ts             # WBI 签名算法（MD5 + mixin key）
├── scraper.ts         # Playwright 浏览器拦截 WBI 接口获取 UP 主视频列表
├── downloader.ts      # 文件下载（axios stream）+ ffmpeg 合并
├── export.ts          # 视频元数据批量导出（并发，全量刷新）
└── api/
    ├── client.ts      # Axios 客户端、登录检查、WBI 密钥获取、请求重试
    ├── playurl.ts     # 视频信息获取、DASH 流解析、音视频流选取
    ├── space.ts       # UP 主空间视频列表（Playwright 抓取）
    └── search.ts      # UP 主搜索（直调搜索 API，无需登录）

scripts/
├── get-cookie.mjs     # Playwright 浏览器登录 + Cookie 自动提取
└── download-artist.mjs # 按关键词批量下载音频（需先 build + export）

bin/
└── bili.js            # CLI 入口脚本（加载 dist/cli.js）

data/                  # 导出的元数据（data/{upName}/{uid}.json + {uid}.csv）
downloads/             # 下载文件输出目录（downloads/{ownerName}/）
```

## API 说明

使用的 Bilibili 接口：

| 接口 | 用途 | 认证 |
|------|------|------|
| `x/web-interface/wbi/search/type` | 搜索 UP 主 / 视频 | 无需登录（WBI 签名） |
| `x/web-interface/nav` | 登录状态检查 + WBI 密钥获取（img_key / sub_key） | Cookie |
| `x/web-interface/view` | 视频信息（标题、分P、统计等） | Cookie（无需 WBI 签名） |
| `x/player/wbi/playurl` | DASH 音视频流地址（含 FLAC/Dolby/4K/8K） | Cookie + WBI 签名 |
| `x/space/wbi/arc/search` | UP 主空间视频列表（WBI 签名版） | Cookie + WBI 签名（Playwright 浏览器拦截） |

DASH 参数：

- `fnval=4048`：启用 DASH + HDR + 4K + 杜比音频 + 杜比视界 + 8K + AV1（Hi-Res 模式）
- `fnval=16`：仅 DASH 格式（普通模式）
- `fourk=1`：请求 4K 视频流

## 常见问题

**Cookie 过期**

运行 `npm run get-cookie` 重新登录即可。也可用 `npx bili check-login` 随时验证状态。

**ECONNRESET / ETIMEDOUT / 网络错误**

自动重试 3 次（指数退避：2s → 4s → 6s），无需人工干预。

**"啥都木有" API 错误**

BVN 对应的 CID 不匹配，Bilibili 的 CID 会变化，重新获取视频信息即可。

**UP 主视频列表获取失败**

视频列表通过 Playwright 浏览器抓取 `x/space/wbi/arc/search` 接口。确保已安装 Chromium：

```bash
npx playwright install chromium
```

**播不了 EAC3 / AC3 文件**

`.eac3`（Dolby Digital Plus）和 `.ac3`（Dolby Digital）在 macOS 上没有内置解码器。使用 VLC 或 IINA 播放，或者用 ffmpeg 转码：

```bash
# EAC3/AC3 → AAC 320k（通用）
ffmpeg -i input.eac3 -c:a aac -b:a 320k output.m4a

# 或者转为无损 FLAC
ffmpeg -i input.eac3 -c:a flac output.flac
```

**`scripts/download-artist.mjs` 报 import 错误**

该脚本从 `../dist/` 目录导入编译后的模块，请先运行 `npm run build`。

## 技术要点

- **WBI 签名**：Bilibili WBI 鉴权使用 MD5 签名，`img_key` 和 `sub_key` 从 `/x/web-interface/nav` 接口获取后通过 mixin key 表（64 位置换）混淆生成 32 位 key，对所有参数按 key 排序后拼接 query + mixin key 做 MD5
- **Promise 去重**：`checkLogin()` 和 `fetchWbiKeys()` 使用 Promise 缓存（分别有 60s 和 600s TTL），多个并发请求共享同一个 API 调用，避免重复请求
- **重试机制**：`fetchWithRetry()` 对 ECONNRESET / ETIMEDOUT / socket 错误自动重试 3 次，指数退避
- **容器 vs 编码**：DASH 音频流的 `.m4s` 文件实际是 MP4 容器（ISO Base Media），文件扩展名根据内部编码类型决定（`.flac` / `.m4a` / `.eac3` / `.ac3`）
- **ffmpeg 合并**：FLAC 音频流合并输出 MKV 容器（MP4 不支持 FLAC），其余编码输出 MP4；合并参数 `-c copy` 无损，不解码重编码
- **全量刷新**：`export` 命令每次运行都重新获取全部视频详情，JSON 和 CSV 完全覆盖，确保数据最新
- **视频列表获取**：空间视频列表通过 Playwright 浏览器访问 UP 主页，拦截 `x/space/wbi/arc/search` 响应获取完整列表，自动翻页滚动加载
