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
