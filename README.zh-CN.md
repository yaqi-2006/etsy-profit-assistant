# Etsy Profit Assistant（中文说明）

**一个纯浏览器的 Etsy 对账工具：把月结单变成你能追问的数字。**

导入 Etsy 月结单 CSV（或通用事件 CSV），填入每单真实成本，然后并排看收入、直接费用、订单成本、缺失输入和未关联金额——每一个数字都能追溯到源文件的行。

全程在浏览器本地运行：无账号、不上传、无后端、无遥测。刷新即清空。

▶ **在线演示：** https://profit-pilot-etsy-demo.netlify.app/

> English README: [README.md](README.md)

---

## 状态：已归档，未商业化

这是一个**完成并验证过、但主动没有推向市场的原型**。公开它的目的是作品集与参考，不是产品。

原因见 **[docs/RETROSPECTIVE.zh-CN.md](docs/RETROSPECTIVE.zh-CN.md)**。三句话版本：

- 功能集合**已被免费工具覆盖**（复盘里有名单和链接）。
- Etsy 卖家聚集的渠道**明确禁止卖家工具推广，甚至禁止征集反馈**。
- 真正值得收费的能力（跨月历史、可交 CPA 的期间锁定、多店）**全都需要后端**，与「纯客户端」的前提直接冲突。

**它从未用真实 Etsy 导出验证过。** 解析器依据的是有据可查的历史 8 列月结单格式（`Date, Type, Title, Info, Currency, Amount, Fees & Taxes, Net`），并被多个独立第三方来源佐证，但没有任何真实卖家文件跑通过。**请把兼容性视为未证明。**

---

## 它做什么

**期间视图**

- 把每行流水归入五个互斥类别，构建从总量到余额的金额桥接。
- 买家支付的销售税/VAT 与真实费用分开统计。
- **不会**从 `Net` 里再扣一次 `Fees & Taxes`——月结单的 `Net` 已含行内费用与税。重复扣减是这类工具最常见的高估成本方式。

**订单视图**

- 用户填入商品、运费、包装成本后，给出订单贡献利润。
- 缺失成本保持**未知**，绝不静默填零；零表示你已确认该项不适用。
- 退款不会自动恢复商品成本。
- 未关联费用如实报告，不按猜测分摊到订单。

**导入**

- 自动识别原生 Etsy 月结单，或显式映射通用事件 schema。
- 稳定 ID 去重；同 ID 财务值发生变化时**整批拒绝**，不覆盖。
- 无效行导致整批拒绝，不做半截导入。
- 上限：2 MiB / 5,000 行 / 80 列；原生格式限单币种、单月。
- `Title`、`Info` 及额外买家字段被丢弃，不参与导出。

**输出**

- 静态 HTML 报告（期间分类 / 桥接 / 订单 / 来源）、订单 CSV、合成模板。
- 导出的报告明确**不是**会话备份。

## 它明确不声称什么

- 不是企业净利润；订单贡献不含公共开销与所得税。
- 不是税务报告，不构成会计建议。
- 不声称「已对账」——缺少来源完整性或余额时，只报告来源内的算术关系。
- 不自动同步 Etsy，与 Etsy 无关联，不主张其商标。

## 快速开始

两种方式，都不需要联网：

```bash
# 1. 构建单文件版，然后双击打开
node build.cjs          # 生成 etsy-profit-demo.html

# 2. 或本地起服务看多文件版
node server.cjs         # 只监听 127.0.0.1，打印实际空闲端口
```

打开后点 **Load synthetic demo** 或 **Try Etsy-format sample**。内置数据全部为合成数据。

## 验证

以下命令全部离线运行、只使用合成数据。

```bash
npm test              # 财务核心、解析器、原生格式安全、扩展打包
npm run test:browser  # 隔离无头 Chrome 驱动已构建的单文件
npm run test:extension# 在隔离 Chrome 中真实安装 MV3 扩展并驱动
npm run test:ui       # 界面定点回归
npm run build:extension
```

开发期间记录的验证数量：财务/解析/打包 76 项、离线浏览器 20 项、扩展交互 11 项、界面定点 4 项。原始结果保存在 [`evidence/`](evidence/)。

**环境要求。** Node ≥ 20（无 npm 依赖，只用 `node:*` 内置模块）。`build:extension` 与扩展测试套件额外需要 Python。浏览器套件需要 Chrome；非标准安装位置请设置 `ETSY_DEMO_CHROME`。`python` 不在 PATH 时设置 `ETSY_DEMO_PYTHON`。

## 目录结构

```
core.js  etsy.js  demo.js  app.js     财务核心、原生适配器、样例、界面逻辑
index.html  styles.css                界面
server.cjs  build.cjs                 本地服务；单文件打包
build-extension.cjs  extension-src/   Manifest V3 打包（严格文件白名单）
*.test.cjs                            Node 测试运行器套件
verify-*.cjs / verify-*.mjs           浏览器驱动的验证脚本
tools/                                上述脚本使用的最小 CDP 浏览器驱动
samples/                              测试使用的合成 CSV
docs/                                 范围说明、扩展指南、投放记录、复盘
evidence/                             开发期间的原始验证输出
MANIFEST.sha256                       每个受控文件的 SHA-256
```

[`MANIFEST.sha256`](MANIFEST.sha256) 记录了每个受控文件的 SHA-256，克隆后可用 `sha256sum -c MANIFEST.sha256` 校验。[`.gitattributes`](.gitattributes) 关闭了换行符转换，正是为了让这些哈希保持有效。

`docs/` 里是开发期的中文记录，逐字保留为历史产物（只重写了链接使其在归档内可解析）：

- [SCOPE-AND-LIMITATIONS.zh-CN.md](docs/SCOPE-AND-LIMITATIONS.zh-CN.md) —— 原始范围与限制说明
- [EXTENSION.md](docs/EXTENSION.md) —— 扩展指南与隐私架构
- [RELEASE-NOTES.txt](docs/RELEASE-NOTES.txt) —— v0.1 交付包说明
- [launch-guide.md](docs/launch-guide.md)、[上线记录.md](docs/上线记录.md)、[推广执行步骤.md](docs/推广执行步骤.md)、[推广发布草稿.md](docs/推广发布草稿.md) —— 上线记录与推广草稿；**其中的推广步骤从未执行**，所描述的发帖、视频上传或私信都没有发布过
- [BGM-使用与署名说明.txt](docs/BGM-使用与署名说明.txt) —— 音乐署名记录

这些文档引用的演示视频、交付 ZIP、扩展构建产物与录屏素材**不在本归档内**。

## 许可

[MIT](LICENSE)。与 Etsy, Inc. 无关联、未获其背书或赞助。「Etsy」是 Etsy, Inc. 的商标，此处仅用于描述兼容性。
