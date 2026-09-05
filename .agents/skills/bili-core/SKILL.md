---
name: bili-core
description: "Operate the local bili-core project to fetch Bilibili creator video lists, export metadata, filter JSON or CSV selections by title, download selected videos or audio, organize collection and multi-P downloads, and batch-sync a whitelist of creators. Use when a user mentions bili-core, a Bilibili UID or BVID, UP creator lists, list/export files, keyword filtering, collections, multi-P videos, batch media downloads, or whitelist sync."
---

# Bili Core

Use the checked-out `bili-core` project as the execution engine. Translate the user's request into the smallest reliable combination of the local CLI and existing scripts.

## Work From The Repository

- Run commands from the repository root containing `package.json`, `bin/bili.js`, and `src/`.
- Prefer `node bin/bili.js <command>` so the checked-out project code is used.
- Run `npm install` only when dependencies are missing and the user permits installation.
- Run `npm run build` before using `bin/bili.js` when `dist/` is missing or source changes have not been compiled.
- Run `node bin/bili.js check-login` before a download workflow. Use `npm run get-cookie` only when login is invalid and interactive login is appropriate.
- `lookup` does not require login — it directly calls the Bilibili search API.
- Do not modify project source code merely to complete a fetch, filter, or download request.

## Route The Request

- **首选**：`list`、`export`、`batch` 均支持 `--name <name>` 直接按 UP 主名称操作（如 `list --name "示例UP主" --limit 5`），一步完成名称解析与命令执行，无需先跑 `lookup`。
- **批量同步白名单**：`sync <file>` 根据白名单文件批量导出多个 UP 主视频元数据。白名单每行一个 UP 主名称（`#` 开头为注释）。支持 `--concurrency <N>`、`--delay <N>`、`--concurrency-up <N>` 参数控制并发。
- **后备**：仍可用 `lookup <keyword>` 先查 UID 再传入 `<uid>` 参数。精确匹配返回 UID，模糊匹配列出候选。
- Preview a UP creator's videos with `list <uid>` and an explicit `--limit`. Can use `--name <name>` instead of `<uid>` to resolve by name automatically.
- Save the complete structured list (JSON + CSV) with `export <uid>`. Can use `--name <name>` instead of `<uid>`. This produces `data/{upName}/{uid}.json` and `data/{upName}/{uid}.csv` with full metadata including like/coin/favorite statistics and, in JSON, collection metadata.
- Inspect one video with `info <bvid>`.
- Download one video with `download <bvid>`; add `--audio` only when the user requests audio-only output.
- Download the first N videos from an UP creator with `batch <uid> --limit <N>`; can use `--name <name>` instead of `<uid>`. Add `--audio` for audio-only output.
- For keywords, user-edited selections, or JSON/CSV input files, select BVIDs before downloading. Use `export` as the primary data source.
- Use `scripts/download-artist.mjs` only when its hard-coded data source and audio-only behavior match the request exactly. Do not silently edit it for another UID.

## Exported JSON schema

`export` and `sync` write a JSON object with these top-level fields:

- `upName` (string): UP 主名称。
- `uid` (number): UP 主 UID。
- `updatedAt` (string): 导出时间，ISO 8601 格式。
- `videos` (object): 以 BVID 为键的视频详情。每个视频包含 `bvid`、`aid`、`title`、`cover`、`description`、`duration`（秒）、`created`（Unix 秒时间戳）、`tid`、`tname`、`stat`、`cid` 和 `pages`。
- `collections` (object): 以合集 ID（字符串）为键的合集详情；没有合集时为空对象。

`videos[<bvid>].pages` 是同一个 BVID 下的分 P，数组项为 `{ cid, part }`。`stat` 包含 `view`、`like`、`coin`、`favorite`、`share`、`danmaku`、`reply` 统计字段。属于合集的视频会额外有 `collection: { id, title, index, total }`，其中 `index` 从 1 开始。

`collections[<id>]` 包含 `id`、`title`、`cover`、`intro`、`episodeCount` 和 `sections`。每个 section 有 `title` 与 `episodes`；episode 包含 `bvid`、`aid`、`cid`、`title`、`cover`、`duration` 和 `created`。合集 episode 是独立视频 BVID，不是分 P。导出会从 `ugc_season` 发现合集，并补抓空间列表中缺失的 episode；下载命令目前仍按单个 BVID/分 P 工作，没有整合集合下载命令。

## 下载编排与目录结构

下载命令只负责一个 BVID 的一个分 P。不要为多个视频或整个合集新增、修改或依赖专用批量下载脚本；由 Agent 根据用户筛选结果，重复调用现有单视频命令，并在每次成功后整理文件。

把合集与多 P 视为两级独立容器：合集由多个独立 BVID 组成，一个合集视频自身仍可能包含多个分 P。使用以下目录结构：

```text
downloads/{UP主名称}/
├── {普通单P视频标题}.{ext}
├── {普通多P视频标题}/
│   ├── {pages[0].part}.{ext}
│   ├── {pages[1].part}.{ext}
│   └── ...
└── {合集标题}/
    ├── {合集内单P视频标题}.{ext}
    └── {合集内多P视频标题}/
        ├── {pages[0].part}.{ext}
        ├── {pages[1].part}.{ext}
        └── ...
```

具体规则：

- 不属于合集且只有 1 P：文件直接放在 `downloads/{UP主名称}/`，使用视频标题。
- 不属于合集且有多个分 P：在 UP 主目录下创建以视频标题命名的文件夹，每个分 P 文件使用对应的 `pages[].part` 标题。
- 属于合集且只有 1 P：在 UP 主目录下创建以合集标题命名的文件夹，视频文件使用该独立视频的标题。
- 属于合集且有多个分 P：先进入合集标题文件夹，再创建以该独立视频标题命名的文件夹；其中每个分 P 文件使用对应的 `pages[].part` 标题。
- 合集标题优先取 `video.collection.title`；也可通过 `collections[*].sections[*].episodes[*].bvid` 映射。多 P 文件夹标题取独立视频的 `video.title`，分 P 文件名取 `video.pages[index].part`。
- 延续 CLI 的跨平台清理规则，将文件名中的 `/\\?%*:|"<>` 替换为 `_`。若两个原始标题清理后重名，只对冲突项追加 `_P{index}`，并在结果中报告；不要静默覆盖。
- CLI 对多 P 的临时输出通常是 `{视频标题}_P{N}.{ext}`。下载成功后立即移动到上述目标目录并改为分 P 原名；整理已有下载时优先移动现有文件，不要重新下载或覆盖完整文件。
- `?p=2`、`?p=3` 只是同一 BVID 的分 P 定位方式，不是独立视频；合集中的 episode 才是独立 BVID。
- 用户提供 `https://www.bilibili.com/video/<BVID>?p=N` 并只要求该分 P 时，提取 BVID 并调用 `download <bvid> --page <N>`；用户要求整个多 P 视频时，枚举并下载所有分 P，不要把 URL 中的起始 `p` 当作总范围。

## 分 P 发现、下载与核验

1. 先读取导出 JSON，并以程序方式计算 `video.pages.length`；不要凭截断的终端输出或人工目测计数。
2. 下载前运行 `node bin/bili.js info <bvid>` 获取当前分 P 总数。若实时数量与 JSON 不同，先刷新该 UP 主的导出，确保分 P 标题与数量同步，再下载。
3. 对同一 BVID 按 P1、P2、P3 的顺序逐个调用：`node bin/bili.js download <bvid> --page <N>`。每个分 P 成功后立即按目录规则整理。
4. 不要把普通接口错误、限流、超时或网络失败当作“已到最后一 P”。等待后重试；只有明确返回“不存在第 N P”时，才能在用户要求探测到末尾的流程中停止。
5. 已知总数时下载 P1 到 PN，结束后再次运行 `info`。若总数增加，刷新导出并继续新增分 P。用户明确要求“一直试到没有”为止时，可继续尝试 P(N+1)，但仍只接受明确的“不存在第 N P”作为终点。
6. 最终按 BVID 分别核验：实时 `info` 分 P 数、JSON `pages.length`、目标目录媒体文件数三者相等；逐项确认每个预期文件名存在、没有零字节文件、没有重名覆盖，并报告缺失、额外、失败与重试项目。

## Agent 并发策略

- 同一 BVID 的多个分 P 默认串行下载（并发 1），以保持顺序、降低限流概率并确保下载后命名对应正确。
- 多个独立 BVID（包括合集中的 episode）在用户未指定时默认并行 2 个；每个 BVID 内部的分 P 仍保持串行，因此默认总下载并发不超过 2。
- 用户明确指定并发数时按其要求编排，但要说明高并发更容易触发限流。没有特殊环境信息时建议 2，通常不要主动超过 4。
- 出现连续接口错误、限流或不稳定下载时，将独立 BVID 并发降到 1，并采用至少 30 秒退避后重试；不要因降并发而跳过项目。
- 下载前先向用户报告选中的独立视频数量、其中多 P 视频数量、总分 P 数及采用的并发数。下载后按独立 BVID 和总文件数汇总成功、跳过、失败及目录。

## Time contract

- `created` 是 Bilibili 返回的 Unix 秒时间戳，`updatedAt` 和 CSV 的发布时间是 UTC ISO 8601；这些都是绝对时刻，不要改写成无时区的北京时间字符串。
- `list` 的人类可见日期固定显示为 `Asia/Shanghai`。下游 fansite 合并脚本应原样保留 `created` 并按数值排序；页面统一转换为北京时间显示。
- 修改时间转换后运行 `npm test` 和 `npm run test:time`；后者必须在 `Asia/Shanghai`、`UTC`、`America/New_York` 下得到一致结果。

## 输入、筛选与下载规则

- `export` 和 `sync` 生成的 JSON、CSV，以及用户提供的 JSON、CSV 或每行一个 BVID 的文本，都可以作为下载选择来源。读取 CSV 时必须使用标准 CSV 解析器，不能直接按逗号切分；JSON 视频选择使用 `Object.values(videos)`。
- 关键词默认匹配 `title`，多个关键词默认按 OR 处理；明确的 `--limit` 应在筛选后应用。下载大量内容前，先报告原始数量、匹配数量和标题预览。
- 保留输入顺序并按 BVID 去重；不要覆盖用户编辑过的源 JSON/CSV，筛选结果另存为新文件。下载选择时逐个调用 `node bin/bili.js download <bvid>`（需要时加 `--audio`），单个失败后继续并记录 BVID、标题和错误。
- `scripts/download-artist.mjs` 只读取配置的数据文件，默认按关键词筛选并且只下载音频；除非请求完全符合脚本参数和行为，否则不要使用或静默修改它。
- Chromium 无法启动时，说明需要浏览器执行权限；登录失效时停止下载并提示运行 `npm run get-cookie`。完成导出或下载后核对数量、输出路径以及成功、跳过和失败记录。

## 来源、协议与使用声明

本项目以 **GNU Affero General Public License v3.0 or later（AGPL-3.0-or-later）** 开源。任何人都可以使用、研究、修改和再分发本项目，也可以在遵守许可证的前提下用于商业场景；分发本项目或修改版时，必须依照 AGPL 提供对应源码。项目“仅供学习、研究和技术交流”的表述是项目定位，不构成对 AGPL 已授予权利的额外用途限制。

下载实现不是 Bilibili 官方 SDK。其整体思路和接口处理方式，包括 WBI 签名、视频信息与播放地址接口、DASH 流选择、分 P 处理、媒体下载和 FFmpeg 合并，参考了浏览器用户脚本项目 [Bilibili-Evolved](https://github.com/the1812/Bilibili-Evolved) 的[“下载视频”组件](https://github.com/the1812/Bilibili-Evolved/tree/master/registry/lib/components/video/download)。Bilibili-Evolved 与 `bili-core` 没有隶属或官方背书关系。

Bilibili-Evolved 源代码依据 [MIT License](https://github.com/the1812/Bilibili-Evolved/blob/master/LICENCE.md) 发布，但许可证文件还包含再发布条件。这只是第三方来源说明，不会自动改变 `bili-core` 的 AGPL 许可；如实际复制、修改或再发布其代码，必须同时遵守原项目许可证及其附加条件。完整第三方说明见仓库根目录的 `THIRD_PARTY_NOTICES.md`。

用户必须自行负责遵守 Bilibili 用户协议、版权及其他适用法律法规，并自行承担登录、请求、下载、保存、传播和使用产生的全部风险、责任及后果。不得用于侵犯版权、绕过访问控制、规避平台风控或其他违法违规用途。项目按现状提供，不提供任何保证，作者不对用户行为或由此造成的损失负责。

## Execute Safely

1. Identify the UID or input file, selection rules, requested media type, and output limit from the request and available files.
2. Inspect structured input with an appropriate JSON or CSV parser. Never parse CSV by splitting on commas.
3. Preserve source order, remove duplicate BVIDs, and report the selected count before a large download.
4. If the user asked only for a list or filtered file, stop after producing and validating that artifact.
5. If the user explicitly requested downloads, invoke the CLI for the selected BVIDs and continue past individual failures while recording them.
   For `sync` (whitelist export without download), stop after all exports are verified — do not proceed to download.
6. Verify exported counts or downloaded files, then report output paths and success, skipped, and failed totals.

## Notes

- `export` always performs a full refresh — every run re-fetches all video details and overwrites `data/{upName}/{uid}.json` and `data/{upName}/{uid}.csv`.
- The `list` command is terminal-only preview and does not generate files.

## Preserve User Data

- Do not overwrite a user-edited JSON or CSV selection unless explicitly requested.
- Treat `data/` and `downloads/` as user data even though they are ignored by Git.
- Do not delete partial downloads or existing media unless explicitly requested.
- Do not describe terminal `--json` output as a complete saved list: it is display output and remains subject to `--limit`.
