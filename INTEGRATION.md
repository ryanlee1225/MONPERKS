# 接入说明

## 广告与积分来源

| 渠道 | 当前实现 | 正式接入条件 | 可提现积分 |
| --- | --- | --- | --- |
| Google AdSense / Ad Manager | 禁用的展示广告适配器 | 发布商审核、广告位、适用地区的 CMP 与站点审核 | 不因观看或点击发放 |
| Meta | 保留渠道状态与配置 | 先确认 Audience Network 发布商资格与支持的网页/App 库存；广告投放账户不是发布商变现账户 | 默认禁用 |
| TikTok / Pangle | 保留渠道状态与配置 | 确认发布商资格、地区和网页/App 库存；TikTok Pixel 只做追踪，不产生展示收入 | 默认禁用 |
| 自有品牌素材 | 8 秒演示 + 发现星 | 自有/获授权素材，明确奖励条件 | 发现星不可兑换 |
| 商家联盟返佣 | 优惠导入与合作回调接入接口 | 联盟合同、订单归因、退货窗口、商家确认 | 审核后才可记入正式积分 |
| 直签合作任务 | HMAC 事件接收接口 | 合作方明确允许此类激励，服务端验证且完成反作弊 | 审核后才可记入正式积分 |

Google 官方政策：https://support.google.com/adsense/answer/9121589?hl=en-gb

Meta 当前发布商产品：https://www.facebook.com/audiencenetwork/monetize

TikTok Ad Network 格式：https://ads.tiktok.com/resources/help/article/available-ad-formats-for-pangle

本项目不会模拟真实 Meta/TikTok 广告 SDK、把 Pixel 当广告收入，或将三家广告点击作为提现奖励来源。

Google 适配器供后续正式页面使用：在独立展示容器设置 `data-display-slot`；配置经过审核的 client/slot，并提供 `window.MONPERKS_AD_CONSENT` 异步函数，从真正的 CMP 获取合法处理权限。当前 demo 模式强制不加载；仅打开演示偏好不能启动广告。正式部署需相应调整 CSP。供应商账户资格、版位审核和 CMP 不能由代码替代。

## API 本地启动

Node.js 24+ 内置 SQLite，启动时创建本地 schema。此接入工程当前仅用于演示及集成验证，不是经过生产加固的结算服务。

```sh
node --env-file=.env api/server.mjs
```

先复制 `.env.example` 为 `.env` 并填写独立随机 secret。`.env`、SQLite 文件及 node_modules 已排除提交。`APP_ORIGIN` 必须与浏览器实际 origin 完全一致，默认 http://localhost:4173 。不读取或信任客户端余额。

| 方法与地址 | 请求 | 行为 |
| --- | --- | --- |
| GET /api/status | 无 | 返回 demo、测试网和广告配置状态 |
| POST /api/demo/session | JSON {}，同源 Origin | HttpOnly/SameSite Cookie，生成演示账户 |
| GET /api/demo/account | Session Cookie | 独立后端账本余额和明细 |
| POST /api/demo/checkin | Cookie、同源 Origin、JSON {} | 每日一次积分，数据库唯一约束 |
| POST /api/demo/redeem | Cookie、Origin、Idempotency-Key、JSON points/address | 原子扣减和幂等演示记录，不发币 |
| GET /api/coupons | 无 | 返回尚未过期的授权导入优惠；初始为空 |
| POST /api/admin/coupons | Bearer ADMIN_API_TOKEN，JSON offers[] | 全批校验，事务导入，最多 100 个 |
| POST /api/partner/events | HMAC 请求头及 JSON | 幂等保存 pending_review，不直接计分 |
| POST /api/redeem | 无 | 503 LIVE_DISABLED，真实结算不可用 |

### 授权优惠导入

使用联盟 API、商家 feed 或取得授权的数据。当前不爬取其他优惠站，也不绕过其访问限制。导入请求示例：

```json
{"offers":[{"id":"merchant-offer-001","brand":"Example Merchant","title":"Authorized 10% off","url":"https://example.com/deal","code":"REAL-CODE-FROM-MERCHANT","expiresAt":"2027-01-01T00:00:00Z","source":"affiliate-contract-001"}]}
```

后续加入定时 feed 同步时记录授权来源、地区、库存、到期日、最后校验时间与联盟跳转链接；到期优惠默认不返回。导入数据尚未接入浏览器示例 catalog，生产前应将 catalog 数据源替换为该 API，并保持转义与链接校验。

### 合作方事件

事件：`{eventId, accountRef, offerId}`，可附加订单与状态字段。provider 仅接受 affiliate / direct-sponsor。验证通过只代表可信传输，不代表任务可结算。

请求头：

```text
X-Partner-Provider: affiliate
X-Event-Timestamp: <13 位 Unix 毫秒时间戳>
X-Event-Signature: sha256=<64 位小写十六进制>
```

签名：`HMAC-SHA256(PARTNER_WEBHOOK_SECRET, timestamp + '.' + 原始 JSON 请求体)`；窗口 ±5 分钟。重复 provider/eventId 不重复受理。按供应商官方验签方式实现各自适配，不能把此通用 HMAC 端点宣称为已接入所有广告供应商的回调协议。

生产审核必须核对订单、账户归因、活动资格、退款冲正和结算金额，建立不可变来源凭证与反作弊规则。金额不得取客户端自报值，广告发现星不能流入提现积分。最终审核信用操作尚未开放，当前端点不会计入真实积分。

## Monad 奖励合约

`RewardDistributor` 使用 OpenZeppelin 5.4.0 的 SafeERC20、EIP712、SignatureChecker、Ownable2Step、Pausable、ReentrancyGuard。

凭证结构：`Claim(bytes32 claimId,address recipient,uint256 amount,uint256 deadline)`，EIP-712 domain 名称 MONPERKS Rewards、版本 1，绑定 chainId 与合约地址。claimId 防重放，调用者必须等于 recipient，且金额、签名及期限有效。合约只做已签名奖励的领取，不读取浏览器积分。

owner 可在暂停时轮换签名者、调整单笔上限并提回奖励资金。生产 owner 应使用多签，并向用户披露托管与资金管理方式。rewardToken 固定，不假设任何代币都是 USDT，也不假设 decimals 为 6。配置前核对所选网络的官方代币名称、地址、decimals、字节码及合约实现；测试网可用明确标识的 mock token，不得将主网 USDT0 地址照搬到测试网。

已提供编译检查及 Foundry 测试源码。当前环境未安装 forge，Foundry 运行测试未执行；合约未部署、未验证、未审计。

Foundry 环境准备后可使用 npm 的固定 OpenZeppelin 依赖：

```sh
cd contracts
forge test --remappings @openzeppelin/contracts/=../node_modules/@openzeppelin/contracts/
```

当前测试关注暂停控制、有效领取、重放、改金额、收款者限制、跨链重放、过期及奖励池不足。生产前按官方当前 Foundry 说明启用 Monad execution network 并在测试网完成同等流程；普通 EVM 编译不代表已验证 Monad gas 行为。

真实上线依赖顺序：钱包签名登录 → 服务端归因与结算账本 → 原子预留积分 → 经审核的奖励签名服务 → 已充值的测试网合约 → 用户钱包实际领取 → 链上事件确认与对账。掉单通过 claimId 恢复，过期凭证释放预留须先证明链上未领取；不得在签名发出后直接无条件退还积分。金额使用代币最小单位整数，估算 gas 时避免过大缓冲。重大链下结算按官方文档等待适当的 Verified 状态。

没有钱包会话、发布商账户、联盟数据、部署地址和资金时，不应开启 live 模式。本交付保留真实结算关闭状态，符合本次先完成演示的范围。
