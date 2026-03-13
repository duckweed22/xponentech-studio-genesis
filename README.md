# Studio Genesis Clone

本项目复刻了 `studio-genesis` 的核心页面与两段式生图流程：

1. 上传产品图并填写 brief
2. 先生成 `design_specs + images[]` 蓝图
3. 再把蓝图转成英文长 prompt
4. 最后调用豆包 `doubao-seedream-4-0-250828` 生图

## 运行

```bash
ARK_API_KEY=你的火山引擎ArkKey node server.js
```

打开 [http://localhost:3000](http://localhost:3000)。

## 自动化浏览器脚本

如果你要模拟人工操作页面，可以用 Playwright 脚本自动：

1. 打开页面
2. 上传产品图
3. 填写 brief
4. 点击分析
5. 点击生成
6. 等待结果完成
7. 自动下载生成图片到桌面文件夹

运行示例：

```bash
npm run autofill -- \
  --url=https://xponentech.zeabur.app/ \
  --image=/absolute/path/to/mug.png \
  --targetLanguage=中文 \
  --ratio='4:5 竖版' \
  --resolution='2K 高清' \
  --count='6 张' \
  --outputDir=/Users/leizi/Desktop/XponenTech-outputs \
  --headless=false
```

参数说明：

- `--image` 必填，必须是本机绝对路径
- `--brief` 不填时会保持“组图描述”为空
- `--outputDir` 不填时，会自动在桌面创建一个带时间戳的新文件夹
- `--headless=false` 会打开真实浏览器，方便看执行过程
- 第一次运行会自动安装缺少的 `npm` 依赖；如果本机没有 Chrome，也会尝试自动安装 Playwright Chromium
- 其他参数都可以不填，脚本会用默认值

## Zeabur 部署

这个项目可以直接从 GitHub 导入到 Zeabur。

1. 在 Zeabur 新建 Project
2. 选择 GitHub 仓库：`duckweed22/xponentech-studio-genesis`
3. 让 Zeabur 自动识别为 Node.js 服务
4. 添加环境变量：

```bash
ARK_API_KEY=你的火山引擎 Ark Key
```

可选环境变量：

```bash
ARK_TEXT_MODEL=doubao-1-5-pro-32k-250115
ARK_VISION_MODEL=doubao-seed-1-6-vision-250815
ARK_IMAGE_MODEL=doubao-seedream-4-0-250828
MAX_CONCURRENCY=2
```

说明：

- 服务默认监听 `0.0.0.0:$PORT`，可直接运行在 Zeabur 容器内
- 启动命令已固定为 `node server.js`
- 不要把 `.env` 提交到 GitHub，把密钥只放在 Zeabur 环境变量里
- 部署完成后，Zeabur 会分配一个公网域名

## 当前默认模型

- 视觉分析: `doubao-seed-1-6-vision-250815`
- 文本规划: `doubao-1-5-pro-32k-250115`
- 生图模型: `doubao-seedream-4-0-250828`

可通过环境变量覆盖：

```bash
ARK_TEXT_MODEL=...
ARK_VISION_MODEL=...
ARK_IMAGE_MODEL=...
```

## 说明

- 前端页面结构和交互流程对齐 `studio-genesis`，但实现是一个本地最小版本。
- 后端保留了 PicSet 的“蓝图 -> prompt -> 生图”逻辑。
- `Seedream 4.0` 已验证可走 `POST /api/v3/images/generations` 返回直链图片。
- 当前这版对上传产品图的“精确参考还原”是通过视觉模型先做产品理解，再把分析结果写入 prompt。
- 如果你希望把上传图片真正以图生图方式喂给 `Seedream 4.0`，还需要额外补一层“把产品图上传为外网可访问 URL”的步骤。
