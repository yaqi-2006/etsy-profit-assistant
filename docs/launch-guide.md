> **关于本文档**：项目开发期的历史记录，从原工作区逐字保留（仅修正相对链接）。
> 其中引用的演示视频、交付 ZIP、扩展构建产物与发布目录未纳入本归档，相关链接已退化为纯文本；
> 验收证据已重映射到 [`../evidence/`](../evidence)。项目说明见 [README.md](../README.md)。

# 英文首版：从本地演示到客户试用

> 当前阶段：英文样例演示已于 2026-10-12 同步验收后的新版界面与 92.1 秒英文视频。试玩入口 https://profit-pilot-etsy-demo.netlify.app/ ，推荐对外分享 [视频页](https://profit-pilot-etsy-demo.netlify.app/watch/) 。仍是未经真实 Etsy 导出验证的早期演示。沿用 Netlify Free 项目，昵称 Profit Pilot；未启用付费服务、未对外发帖或收费。英文 UI 与报告用于卖家，这份指南供经营者使用。最新 [推广文案草稿](<推广发布草稿.md>) 已备好，尚未发布。

## 1 先决定让客户做什么

**现在能邀请的：**不用登录、不上传财务文件，打开合成样例，用 2 分钟看清缺失成本、亏损单、期间支出和提现不是利润。邀请对方反馈是否易懂、哪一步没法继续。

**现在不能承诺的：**“直接丢入 Etsy CSV，自动算出真实净利。”通用事件字段仍需文件先规范化；原生月结单的指定格式现可自动读取，但只能解释源净额，不提供完整订单利润。不要为了宣传让客户手工改一整份表，也不要把浏览量当成分析成功。

**已补充原生格式模拟路径：**首版现在支持英文／USD 月结单的指定8列表头，自动识别而不需要手动字段映射，合成数据测试包含源 Net 不重复扣费、未知金额、相似重复费用和异常拒绝。点 `Try Etsy-format sample` 可直接试玩。依据与边界见 [使用说明](<../README.md>)。

模拟测试不需要先拿私有卖家文件。后续若用户选择试用，可用合法、经同意脱敏样本验证当前地区／版本差异；不要把这一后续检查变成模拟开发的前置阻塞。原生月结单当前只有期间视图，不推测订单关联或真实净利，Orders／Items／Payments 独立导出未支持。

## 2 先给一个别人能打开的链接

`http://127.0.0.1:5957` 只通向访问者自己的电脑，不能发给远程客户。给外部用户需公开 HTTPS 托管；不必先买域名、建服务器或接付款。

推荐只用 Netlify Drop，官方依据：

- [拖放静态网页说明](https://docs.netlify.com/start/quickstarts/netlify-drop-quickstart/)
- [Free 价格与额度](https://www.netlify.com/pricing/)
- [Free 硬上限与无自动充值](https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/credit-based-pricing-plans/)
- [站点公开设置](https://docs.netlify.com/manage/security/secure-access-to-sites/project-visibility/)

截至 2026-10-11 官方文档：Free 为 $0/月，300 credits/月硬上限，不自动充值；用尽额度会暂停站点，不自动变成付费套餐。默认 `netlify.app` 子域及 HTTPS 免费。不是无限访问保证；不要选升级、额外域名或付费功能。

### 经营者的一次性操作

1. 自己注册／登录 Netlify，确认 Free 计划；自己完成任何人机或身份验证。
2. 打开 https://app.netlify.com/drop 。
3. 后续更新先核对版本并测试，再上传已审核的发布包。当前线上对应 新版公开入口、视频展示页 及媒体；本次发布 ZIP 仅含 6 个白名单文件。首版入口 是历史版本，不能再当作当前线上版本。**只上传已审核的干净发布包，不上传整个源码目录**；不得包含卖家 CSV、测试浏览器配置或私人资料。
4. 等生产发布完成；检查站点可见性，必要时点 `Make public`。匿名先上传的 URL 可能有临时密码保护，需要账户认领，不能假定拖完即公开。
5. 复制实际的 `https://....netlify.app` 生产链接，用未登录窗口或另一设备检查：无登录门槛、英文样例正常、补成本／下载可用。

**新版部署已按经营者授权完成。** 沿用此前核对的 Netlify Free 项目，未更改套餐或购买服务，站点仍公开匿名访问。新版复测 **22 项应用检查 + 5 项视频页检查全部通过**，覆盖导入／导出、补成本、错误不覆盖、390px 布局、刷新清空与媒体手动播放／音轨解码／跳转。视频点击前不预加载整片，不自动播放；所有页面与媒体均来自本站，没有外部分析脚本或 CSV 上传。各公开文件与审核清单一致，HTML 只多了已知 Netlify 托管说明注释。证据见 [新版应用检查](<../evidence/public-video-online-app.json>)、[媒体检查](<../evidence/public-video-online-media.json>) 与 发布清单。此前首版与套餐记录留在 [历史发布记录](<../evidence/deployment.public.json>)。这是合成数据验收，不是当前真实卖家文件兼容性或客户需求证据。

### 隐私文案别说过头

可以说 “Your CSV contents are processed in your browser; this demo does not upload them.” 不要说 “We collect absolutely nothing”：公开网页主机可能接收 IP、设备信息与访问日志，见 [Netlify 隐私政策](https://www.netlify.com/privacy/)。保持无分析脚本、无自动上传、无默认存储，刷新会清空；如果以后加表单／统计需更新说明和数据处理方式。

## 3 推广只先做一组轻动作

**不是马上找大量流量，而是找到愿意完成一个任务的卖家。** 首轮容量例如 3–5 个自愿试玩者只是方便安排，不是新的及格门槛。

1. 已完成并上线 [92.1 秒英文演示](https://profit-pilot-etsy-demo.netlify.app/watch/)，不展示真实订单：选择 EP-1002，填运费 4.50、包装 0.50，勾选费用范围，出现 $10.05 预计贡献；再指出亏损单 EP-1003。无需再录制才能开始这一轮反馈邀请。
2. 在自己可用、已登录的平台发布一次演示；标题围绕问题，不以“精确算 Etsy 真净利”作为标题。自己的帖子可以让别人看到，但发布本身不保证有卖家流量。
3. 如要进入卖家社区，只在当前规则明确允许工具演示／反馈的位置发布一次。已有证据显示 r/EtsySellers 禁卖家工具反馈／研究，不在那里投放。r/Etsy 的历史许可只涉及指定线程，不代表当前任意发帖；其他群同样核对现规则。不要注册多个平台、抓成员名单或批量私信来抢速度。
4. 自愿回复者在原交流位置反馈即可，暂不搭登录、邮箱名单、问卷系统或付费广告。没有主动同意不转成持续营销。

没有可用账户或合适受众时，公开托管解决的是“可访问”，不是“已招到客户”。先完成发布，再选一个实际可用渠道；不要编造触达量或已验证转化。

## 4 可直接使用的英文文案（草稿，未发布）

### 演示介绍

> See where an order's money goes — before calling it profit.
>
> I’m building an independent, local-first demo for Etsy sellers. It separates revenue, direct fees, order costs and shared expenses, and flags missing inputs instead of treating them as zero.
>
> Try the synthetic sample in your browser: https://profit-pilot-etsy-demo.netlify.app/
>
> No account or file upload is needed to try the sample. An English/USD monthly-statement profile is tested with synthetic files, not real shop exports. It summarizes source Net, not order profit. This is not a tax report or an Etsy-endorsed product.
>
> In order EP-1002, add shipping of $4.50 and packaging of $0.50, then confirm the direct-fee scope. Was the result easy to understand? What is the first thing that would stop you from using this with your own workflow?

已替换为核验过的生产 URL，这份英文文案仍是未发送草稿。不要伪装 Etsy 员工、卖家用户或客户推荐，也不把公开帖子原话当产品背书。

### 30–45 秒演示旁白

> A payout is not profit. And a missing cost is not zero.
>
> This is an early demo with synthetic orders. This order needs shipping and packaging costs, so it does not show a finished contribution figure yet.
>
> Add those costs and confirm the direct-fee scope. Now you can see the estimated contribution and trace the amounts to their sources.
>
> Shared advertising, unlinked fees and cash movements stay separate. Try the sample and tell me which part is unclear.

### 三个反馈问题

> 1. Could you explain why EP-1002 started with “Needs inputs”?
> 2. Which number or step was unclear?
> 3. How do you handle this in your own spreadsheet or tool today?

先问可理解性与现流程，不先问“你愿不愿花 $9.99”。真正解决问题与付费仍需后续真实使用证据。

## 5 简单记录，避免把热闹当需求

- 收到自愿回复后再分配匿名代号；不要把姓名、邮箱、店铺链接写进研究笔记。
- 分开记录：看了演示、完成样例任务、尝试真实兼容导入、再次使用、实际付费。当前都没有客户证据。
- 重点记哪一步卡住、哪一笔看不懂、现工具是否已解决，保留无需求和拒绝的反馈。
- 只试玩过合成数据：称“演示反馈”，不称“真实店铺利润验证”。

**最小下一动作：**免费公开链接已完成；由经营者选择一个允许演示的实际渠道，邀请少量自愿卖家试玩合成样例。尚未自动发帖、私信或推广。若客户希望导入实际文件，再经同意核验脱敏样本与原生格式差异，而不是先买广告、增加库存系统或做扩展上架。
