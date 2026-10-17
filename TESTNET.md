# Monad 测试网完整流程

本轮新增钱包签名登录、服务端任务/积分、EIP-712 领奖凭证、测试奖励代币、浏览器部署工作台、交易确认及恢复、过期凭证安全释放、服务端共享社区与基础管理接口。

## 运行

需要 Node.js 24+：

```sh
npm ci
npm run setup:testnet
npm run build
npm run dev
```

默认 http://localhost:4173 。当前开发会话的新服务运行于 http://localhost:4174 ，避免覆盖先前演示进程。使用别的端口时同时设置 PORT 和 APP_ORIGIN。

`setup:testnet` 仅创建专门用于测试奖励凭证的随机签名者，保存到 gitignore 排除的 `api/testnet-signer.secret.json`，不读取用户钱包私钥。不要上传这个文件。重启会复用它，避免已部署合约与签名者不匹配。

## 浏览器部署

1. 在安装了 EVM 钱包的浏览器打开 `/#launch`，确认有少量测试 MON。
2. 连接钱包并切换 Monad Testnet，chain ID 10143。
3. 依次点击部署 DEMO 代币、部署奖励合约、充值 100 MPRK、启用奖励；每笔交易由用户钱包自行确认，使用测试 MON 支付 gas。
4. 下载部署配置。浏览器保存公开部署地址及待确认交易哈希，刷新后可继续检查，避免重复部署。
5. 运行核验脚本：

```sh
node scripts/configure-deployment.mjs <下载的部署配置 JSON 路径>
```

脚本检查实际 RPC chain ID、合约代码、奖励代币地址、签名者和暂停状态，再写入本机后台配置。运行中的服务会在签发时重新读取配置，无需重新生成签名密钥。

MPRK 是明确标注的测试代币，名称 MONPERKS DEMO - NO CASH VALUE，18 位精度，不是 USDT，不承诺现金价值。构造函数仅允许测试 chain ID 10143 / 1337 / 31337。

## 奖励领取

在 `/#testnet`：

1. 钱包签名登录。消息绑定本站域名、钱包地址、chain ID、随机 nonce 与 5 分钟有效期；nonce 一次性使用，并绑定浏览器挑战 Cookie。登录 Cookie 为 HttpOnly / SameSite，8 小时过期。
2. 完成服务端每日签到，每钱包每天获得 100 **测试积分**；浏览器离线积分不参与。
3. 领取 1 MPRK。后台检查链、合约、代币、签名者、暂停状态和奖励池容量，原子预留积分并签发 1 小时有效的凭证。重复请求使用同一幂等键，不重复扣分。
4. 钱包提交领取交易。后台只认成功回执里来自正确合约且 claimId、收款人、金额全部匹配的 Claimed 事件，至少等待两个区块确认。
5. 若已提交但确认中断，可粘贴凭证 ID 和交易哈希恢复记录。不会因刷新或网络错误直接退分再发奖。
6. 过期未领凭证仅在 finalized 区块时间超过截止时间且该 finalized 状态中 consumed=false 时释放预留积分；重复释放不会重复加分。RPC 无法提供足够证明时保持预留。

正式资金结算还需要审计、商家结算规则和适当的 Verified 状态确认。当前两块回执用于无现金价值的测试奖励演示，不将其描述为完成商用清算。

## 服务端共享社区

`/#shared` 使用 SQLite 持久化内容，同一后台的用户共享读取。发帖、评论、实用投票、撤回和举报需要签名登录。作者归属在服务端检查，投票按钱包去重，发帖有间隔限制；这些互动不发放积分。

原 `/#feed` 保留本机离线演示，不自动上传用户之前的内容。`/api/admin/community` 需要 ADMIN_API_TOKEN，GET 可查举报，POST JSON `{id}` 可下架内容。当前管理接口是基础能力，不能替代正式运营的完整审核流程。

## 生产托管

GitHub Pages 无法运行 Node/SQLite。静态网页中“测试网领奖/共享社区”会说明后端未启动，绝不退回浏览器余额发奖。要对外演示完整闭环，需托管同源的 Node 服务。

Dockerfile 已提供。生产模式必须设置：HTTPS APP_ORIGIN、至少 32 字符的 SESSION_SECRET 和 ADMIN_API_TOKEN；TESTNET_SIGNER_KEY 使用专用签名者密钥，TESTNET_TOKEN / TESTNET_DISTRIBUTOR 使用验证后的测试网地址。挂载 `/data` 持久卷保存 SQLite，终止 HTTPS 的反向代理与 APP_ORIGIN 保持一致。不要把 localhost 部署配置、测试私钥或数据库复制进镜像。

## 验证范围

自动化测试执行真正的本地 Cancun EVM 部署与交易：部署测试代币和奖励合约、充值、签名领取、事件对账，并验证错误收款人、金额篡改、过期、错误链签名、重复领取与过期安全退款。使用 Hardhat EDR，不能据此推断 Monad 的 gas 计价或替代实际 Monad 测试网验收。

实际 Monad 部署地址与交易记录以浏览器部署和 RPC 核验结果为准。尚未取得用户部署回执时，不声称已经在 Monad 上线。

## 已核验的 Monad Testnet 部署

2026-10-17 07:34 UTC，官方测试网 RPC 核验 chain ID 10143，观测区块 71762880：

- DEMO 代币：`0x0901e3034f389384a2411feE1Cfab85CB44922e5`。
- 奖励合约：`0x45103Cc85d30630452fE97737D3b33Be53aCca97`。
- 代币：MPRK，18 位精度，名称 MONPERKS DEMO - NO CASH VALUE。
- 奖励池：核验时 100 MPRK；已启用，单次上限 10 MPRK。
- 奖励签名者：`0x2897dB97134431306929978d12087ADD05709DeD`，与本机后台一致。

公开核验快照见 `deployments/monad-testnet.json`。余额和启用状态可能随交易改变。该记录是 RPC 状态核验，不代表区块浏览器源码验证或安全审计；用户实际领取交易仍待验收。

本机后台已登记上述地址。新部署后台必须管理自己的签名密钥，不能仅复制公开地址后直接签发；原合约只接受已配置签名者授权。需要更换签名者时，由 owner 在暂停状态下操作。
