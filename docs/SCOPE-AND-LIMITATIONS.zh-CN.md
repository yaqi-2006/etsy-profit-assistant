> **关于本文档**：这是项目开发期的原始 README，从原工作区逐字保留（仅修正了相对链接）。
> 其中的相对路径原指开发工作区；本归档未包含演示视频、交付 ZIP、扩展构建产物与录屏素材，
> 这类链接已退化为纯文本，其余已重映射到 [`../evidence/`](../evidence)。
> 当前的项目说明请看 [README.md](../README.md) 与 [README.zh-CN.md](../README.zh-CN.md)。

# Etsy 订单利润助手 · 本地首版 V0.1

**这是可操作的功能演示，不是正式财务产品。** 要回答的问题：把费用来源、未知成本和未归因事件摆在前面，是否比只显示一个利润数字更好理解？目前尚无真实 Etsy 导出验证或真实卖家试用。

## 最终交付入口

- 全英文演示视频：92.1 秒，1920×1080，恒定 30fps，英文合成旁白与 27 段英文字幕，真实本地扩展录屏。
- 完整英文交付包：字幕版／无字幕版视频、离线网页、扩展 ZIP、字幕、英文指南、合成样例和 SHA-256 清单。
- 英文使用入口：从本目录可直接打开；转交他人时请先完整解压交付包，再打开此入口。
- [成片独立验收](<../evidence/video-verification.json>)：平均帧率与标称帧率均为 30/1；全片解码无警告，响度 -15.89 LUFS，峰值 -1.09 dBTP，字幕无重叠，FastStart 通过。已查看关键帧，未进行外部目标用户听审。
- [交付入口实测](<../evidence/delivery-verification.json>)：相对链接、英文文案、最终离线应用重算和 MP4 本地播放器载入／跳转均通过。

## 最快打开方式

直接双击同目录的 首版单文件，用现代 Edge / Chrome 打开。页面默认显示合成案例，不用账号、联网或安装依赖。

默认界面及报告已改为英文，面向美国卖家；这份说明保留中文供经营者使用。建议先点 `EP-1002` 的 `Details / costs`，填写实际运费与包装成本并确认直接费用范围；观察 `Needs inputs` 变为 `Estimated contribution`。合成事件始终标为估算，不会变成真实记录。

**英文公开演示已更新（2026-10-12）：https://profit-pilot-etsy-demo.netlify.app/**。已按经营者确认同步验收后的新版界面，并上传 92.1 秒英文旁白／字幕视频；推荐分享 [视频展示页](https://profit-pilot-etsy-demo.netlify.app/watch/)，观看后可直接试玩。无需登录，沿用 Netlify 免费项目，未购买域名或启用付费服务。当前发布候选见 新版公开入口 与 [固定白名单发布清单](<../evidence/public-video-online-media.json>)；旧 首版入口 保留为历史记录。线上匿名复测 **22 项应用检查 + 5 项媒体检查通过**，见 [应用结果](<../evidence/public-video-online-app.json>)、[视频结果](<../evidence/public-video-online-media.json>)。各公开文件与审核包一致（HTML 只允许 Netlify 的固定托管说明注释），MP4 支持 HTTP Range，手动播放时非静音音轨实际解码。推广标题、YouTube 说明与邀请草稿见 [推广发布草稿](<推广发布草稿.md>)；尚未向外部平台发帖或投放广告。

## 已实现

- 期间财务事件分类，以及五个互斥分类组成的金额桥接。
- 单一 USD 账本；订单按最早销售日归属，后续调整按核对截止日纳入。
- 订单级商品、包装和外部物流总成本输入；空白保留为未知，确认没有该项才填 0。
- 有关联物流事件时只使用事件金额，不叠加手填运费。退款不自动恢复商品成本。
- 确认直接费用范围后，才在必需成本齐全时给出订单贡献；不把它叫企业净利。
- 通用事件可追溯到事件 ID、源文件、记账日和行号；原生月结单保留来源行号而不制造事件 ID。手填成本与合成估算分开标识。
- CSV 选择或粘贴、表头映射、类型／日期／币种／正负方向校验；错误整批拒绝。
- 稳定事件 ID 去重；同 ID 财务值变化整批拒绝。日期和金额相同的不同 ID 不会被误删。
- 主动导出含期间分类／桥接／订单／来源的静态 HTML 报告、订单 CSV 与合成模板；清空本次内存数据。

## Etsy 月结单原生格式模拟导入

点 `Try Etsy-format sample` 可直接试用，或点 `Download synthetic Etsy CSV` 下载虚构文件，再在 `Import CSV` 选择／粘贴并预览。`Auto-detect` 识别指定表头，无需手动规范化事件类型或映射字段。内置10行虚构样例的已知 Net 小计为 **$14.28**，有1行提现 Net 缺失；这是测试基线，不是完整余额或利润。

无需卖家账号或真实财务样本即可验证此路径。测试文件只模拟公开文档显示的结构与异常，不复制卖家私有交易。

本次选择的是 Payment account **Monthly statement**，不是 Orders、Order items、Etsy Payments Sales 或 Deposits 独立导出。配置 `etsy-monthly-en-usd-v1`：英文精确表头 `Date,Type,Title,Info,Currency,Amount,Fees & Taxes,Net`，一个日历月、明确 USD、US 月／日／年或支持的英文／ISO 日期。是基于公开历史格式和官方金额说明的合成模拟，并不保证2026所有店铺／地区文件通用。

- 月结单 `Net` 已包含行内费用／税影响：只合计已知源 Net，不再扣 `Fees & Taxes`。空白金额保留未知；若部分行 Net 缺失，只报告已知小计及缺失数，不从描述推测金额。原金额关系不一致时标记，不覆盖源 Net。
- Sales 行净额不是扣费前卖家收入，不能拿它生成订单贡献；原生月结单使用单独期间视图，不按日期／金额猜订单关联，不制造事件 ID。订单成本功能仍在通用示例视图。
- 此格式缺乏共用稳定行 ID，导入**替换全部本次数据和成本，不追加**；同文件内相同的两行费用仍保留两笔。重复载入不会叠加成两个月。
- 只保留财务字段，不保留／导出 `Title`、`Info` 或额外买家资料；解析时它们仍短暂进入内存，请用合成或脱敏文件。未知 Type 仍保留为待分类行。
- 原生导出尚无真实店铺文件实测；文件不符合配置则明确拒绝，不猜测转换。

依据：[Etsy 官方月结单下载及范围](https://help.etsy.com/hc/en-us/articles/360016389113-How-to-Calculate-Your-Etsy-Payments-Deposit-Amount)、[官方金额定义](https://help.etsy.com/hc/en-us/articles/115015747228-How-to-Manage-Your-Payment-Account)（正文通过同源公开 Help Center API 核对）；[公开历史8列表头及例外](https://web.archive.org/web/20241124025835/https://madeonthecommon.squarespace.com/blog/download-etsy-payments)。官方 Recent activities 的字段说明并非完整 CSV 表头规范，不把它说成2026正式 schema。

## 通用事件 CSV

其他财务来源仍可显式映射通用事件；**不能宣称直接导入 Etsy 的所有下载文件**。只支持明确标准类型，不从原生描述猜逐单成本。

| 通用列 | 含义 |
| :--- | :--- |
| `event_id` | 稳定且在这一账本内唯一的事件 ID；无稳定 ID 时不直接追加 |
| `date` | 实际记账日期，`YYYY-MM-DD` |
| `type` | 下表明确的标准类型，不自动猜分类 |
| `amount` | 最多两位小数的纯美元金额，收入正、支出负；不含货币符号和千位逗号 |
| `order_id` | 有确切关联证据的订单 ID；没有则留空，不靠日期金额近似匹配 |
| `currency` | `USD`；没映射该列时需明确确认整个文件是 USD |

### 类型和方向

- 非负：`sale` 卖家收入、`fee_credit` 平台费返还、`shipping_credit` 物流退款。
- 非正：`refund` 卖家收入退款、`fee` 平台直接费、`offsite_ad` 已关联站外广告费、`shipping` 实际物流费、`period_ad` 公共广告费、`listing` 刊登费、`expense` 其他经营支出。
- 保留原始资金方向：`tax` 代缴税、`deposit` 提现、`reserve` 预留资金、`unknown` 未知类型。
- `sale` 必须是**未扣平台费用且不含代缴税**的卖家收入；不得再同时导入总额、净额和重复明细。
- 收入中的买家运费，与实际物流成本是两种不同金额。
- 公共广告费用不伪造逐单归因；未知类型不参与确定贡献。

CSV 支持 UTF-8 BOM、引号内逗号／换行与双引号转义。单次不超过 2 MB、5,000 行和 80 列，本次分析累计最多 5,000 个事件。混合币种、无效日期、重复表头、行宽不一致、精度超过分均拒绝，不默默修正。

## 数据控制与限制

只处理你主动选择／粘贴的数据；没有账号登录、远程分析、上传、遥测、Cookie 或默认持久化。数据放在网页内存里，**刷新或关闭就清空**。下载由你主动点击触发，报告不是恢复用备份。

第一版请只用合成或脱敏财务数据。UI 不展示未映射客户字段，但文件解析时内容会短暂进入内存；不要导入不必要的姓名、地址、邮箱或自由文本。

未实现：经真实店铺文件验证的兼容保证、原生 Orders／Items／Payments 导入、原生月结单逐单关联、多店／多币种、SKU／变体／数量成本复用、生效日期成本、库存恢复、事件修订覆盖、持久化及会话恢复、期初期末余额核对、税务处理、订阅收款、扩展上架。

缺少来源完整性或余额时只报告来源内算术关系，不宣传已对账、真实净利、准确率或自动省时。当前尚无用户行为与付费验证。

## 开发运行

无第三方 npm 依赖，使用 Node.js 24 内置能力。

```powershell
node server.cjs
npm test
node build.cjs
node build-extension.cjs
node verify-browser.cjs
node verify-extension.mjs
node verify-ui-review.mjs
```

也可使用 `npm start`、`npm test`、`npm run build`。服务只监听 `127.0.0.1`，输出实际空闲端口，不影响本机其他服务。[构建脚本](<../build.cjs>) 将本地资源合并为可双击 HTML，无外部字体、CDN 或脚本。

本机 Node 未必在 PATH；请先确认 `node --version` 可用，再运行：

```powershell
node server.cjs
```

## 已完成的本地检查（2026-10-11）

- [核心回归](<../core.test.cjs>) 25 项通过，覆盖分值精度、未知与零、重复／冲突、税与提现排除、运费不重复扣、跨期、费用返还、币种／格式／安全范围和浏览器接口。
- [月结单回归](<../etsy.test.cjs>) 21 项与 [历史口径安全回归](<../etsy-native-safety.test.cjs>) 2 项通过：nullable Net、源金额差异、字节／行／列上限、单月／币种、未知类型、原样保留相同行、UMD及非财务字段丢弃。与核心25项合计 **48 项通过**。
- [隔离浏览器检查](<../verify-browser.cjs>) **20 项通过**，实际打开 `file:` 单文件并完成通用 CSV 和原生月结单自动识别、补成本、重复载入替换、异常不覆盖、未知金额、源Net差异及导出；390px 无页面横向溢出，安全整数极限附近金额仍精确到分，未发现页面脚本异常或远程资源请求。
- [检查结果](<../evidence/browser-verification.local.json>)、[通用视图截图](<../evidence/preview-orders.png>)、[月结单视图截图](<../evidence/preview-native.png>)。
- [扩展打包回归](<../extension.test.cjs>) **28 项通过**，验证 MV3、零网站权限、严格 CSP、12 文件白名单、ZIP 精确条目和复制前链接／junction 拦截；与财务及解析回归合计 **76 项通过**。
- [真实扩展验收](<../verify-extension.mjs>) 在隔离 Chrome 149 中 **11 项通过**：实际安装、工具栏启动、补成本、筛选、跨期退款、真实下载、原生样例、390px、刷新不保留输入以及无页面外网资源请求。证据见 [扩展结果](<../evidence/extension-verification.json>)。
- [界面定点回归](<../verify-ui-review.mjs>) **4 项通过**：跨截止日大额收入精确美分、金额桥接中间越界后相消、原生导航可见性和折叠来源／成本输入可达。先复现旧版失败再验证修复；证据见 [界面结果](<../evidence/ui-review-verification.json>)。
- 本地扩展的英文安装和隐私说明见 [扩展指南](<EXTENSION.md>)；解压 扩展 ZIP 后按指南加载。未发布应用商店，不能自动同步 Etsy。
- 上述全部合成数据检查，不等同于真实 Etsy 兼容性、会计审核或目标卖家验收。Edge 加载方式已说明，但未进行 Edge 扩展实测。

## 首版公开部署检查（2026-10-11，历史记录）

- 独立发布入口 100715 字节，SHA256 `3513662b311a92692b4420ff07e4eaf30cf8688b3c283915ce84abadefe7c7ac`；仅从已审核首版修复收入 KPI 和金额桥接两处 BigInt 汇总。源模型与原生适配未改，未覆盖本地并发界面／扩展工作。
- Netlify Free／Public，公开 HTTPS 匿名返回 200；关闭平台徽章后无外部脚本引用。托管仍插入静态说明注释，所以远端哈希与本地不同；移除该注释及其尾换行可精确恢复审核包。详见 [发布记录](<../evidence/deployment.public.json>)。
- [公开浏览器验收](<../verify-public.cjs>) **22 项全部通过**，包含两处精度问题先失败后通过、通用／原生 CSV 实际文件输入、成本重算、下载生成、错误不覆盖、390px 布局、注入安全、未知 Net 及刷新清空。证据见 [结果](<../evidence/browser-verification.public.json>)、[订单视图](<../evidence/preview-orders.png>)、[原生视图](<../evidence/preview-native.png>)。
- 隔离浏览器中除网页 HTML 与自动 favicon 请求外没有脚本／资源／CSV 上传请求，没有 Cookie 或默认 localStorage／sessionStorage。公开主机可能记录 IP、时间及访问元数据，不应声称“完全不收集任何信息”。
- 历史 `node verify-public.cjs --local` 仅用于旧首版，默认线上模式验证的是当时的公开站点。任何后续新版仍需先验收再上传。

## 下一步判断

实际试用结论待填写：能否清楚解释哪些钱属于费用、哪些成本缺失、什么不能当作利润？确认后再决定是否保留这个界面或替换；不要先扩库存、登录与付款。
