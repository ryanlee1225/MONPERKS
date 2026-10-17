# GitHub 提交与网页展示

仓库根目录应直接包含 README.md、package.json、dist/、api/、contracts/ 和 tests/，不要把 node_modules 或本机数据库上传。

## 源码提交

提交包含前端演示、Node/SQLite 接入工程、奖励合约与自动化测试。不包含真实广告密钥、私钥或资金。`.openai/` 是本机 Sites 身份配置，已排除在 GitHub 提交之外；普通静态构建不依赖它。

`.github/workflows/ci.yml` 在 main 分支推送或 PR 时进行语法、交互、HTTP、账本、合约编译和静态构建检查。

## GitHub Pages

Pages 只托管 `dist/` 静态演示，不运行 `api/server.mjs`，不提供多人社区或真实提现。

1. 在仓库 Settings → Pages → Build and deployment 中选择 GitHub Actions。
2. 打开 Actions → Publish demo to GitHub Pages → Run workflow。
3. 工作流成功后，使用 deployment 返回的 page_url 作为展示链接，不使用 localhost 链接提交。

资源使用相对路径，支持仓库子目录形式的 Pages 地址。Pages 支持情况取决于仓库可见性和 GitHub 计划；不要仅为启用 Pages 自动改变仓库可见性。

部署流程参考：https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages
