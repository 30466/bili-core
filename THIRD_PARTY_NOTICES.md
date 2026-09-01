# 第三方来源与许可证说明

## Bilibili-Evolved

`bili-core` 的下载相关实现不是 Bilibili 官方 SDK。WBI 请求签名、视频信息与播放地址接口调用、DASH 音视频流选择、分 P 处理、音视频下载及 FFmpeg 合并等整体实现思路和接口处理方式，参考了浏览器用户脚本项目 [Bilibili-Evolved](https://github.com/the1812/Bilibili-Evolved) 的[“下载视频”组件](https://github.com/the1812/Bilibili-Evolved/tree/master/registry/lib/components/video/download)及相关实现。

Bilibili-Evolved 的源代码依据 [MIT License](https://github.com/the1812/Bilibili-Evolved/blob/master/LICENCE.md) 发布。其许可证文件还包含完整脚本再发布时的附加条件；如实际复制、修改或再发布 Bilibili-Evolved 的代码，必须同时遵守原项目许可证及其附加条件。

本仓库仅保留上述项目的来源和许可证说明，并不声称与 Bilibili-Evolved、Bilibili 或其维护者存在隶属、授权、赞助或官方合作关系。除明确标注的第三方内容外，`bili-core` 自有代码以仓库根目录 [`LICENSE`](LICENSE) 中的 GNU Affero General Public License v3.0 or later（AGPL-3.0-or-later）发布。
