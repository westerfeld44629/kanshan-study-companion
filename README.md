# 看山伴学

看山伴学把学习目标、资料检索、论文阅读、学后测评和错题订正串成一条学习路线。

## 本地安装

需要 Node.js 22.13 或以上版本。在安装包所在目录执行一次。

```powershell
npm install -g .\kanshan-study-companion-0.1.0.tgz
```

在包含已有 `.env.local` 的项目目录执行 `kanshan start`，打开终端显示的地址。默认是 [http://localhost:5173/](http://localhost:5173/)。按 Ctrl+C 停止。

```powershell
cd "你的配置目录"
kanshan start
```

## 从 Git 源码启动

下面的命令适用于已经公开的 Git 仓库。将 `OWNER` 替换为仓库所属账号。

```powershell
git clone https://github.com/OWNER/kanshan-study-companion.git
cd kanshan-study-companion
npm ci --include=dev
npm start
```

`npm ci` 会自动构建网页。也可以直接从 Git 仓库安装命令。

```powershell
npm install -g git+https://github.com/OWNER/kanshan-study-companion.git
kanshan start
```

## 知乎配置

知乎热榜、搜索、联网讲解和扫描件解析使用自己的知乎 Access Secret。配置文件由服务端读取。安装包内只有网页、程序和静态素材。

- 在当前目录有 `.env.local` 时，直接运行 `kanshan start`。
- 第一次配置时，复制源码里的 `.env.example` 为 `.env.local`，填写自己的 `ZHIHU_ACCESS_SECRET`。
- 已有其他位置的文件，可以用 `kanshan start --config "配置文件的完整路径"` 指定。
- 如需从任意目录直接启动，也可由用户把配置放到用户主目录下的 `.kanshan/.env.local`。当前目录的配置优先。

新配置使用 `ZHIHU_ACCESS_SECRET`，也支持已有的 `ZHIDA_DAILY_BUDGET`。缺少凭证时仍可打开网页并使用本地功能。默认端口被占用时会尝试邻近端口。浏览器学习记录跟随地址，继续原有记录请访问同一个端口。可用 `kanshan start --port 5173` 指定端口。

## 源码开发

```powershell
npm ci
npm run dev:full
npm pack
```

`npm run dev:full` 启动带热更新的开发服务。`npm pack` 构建并生成本地安装包。安装后的命令直接启动随包分发的页面与 API。
