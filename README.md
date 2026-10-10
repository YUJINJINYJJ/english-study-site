# 英语场景学习手册（本地静态网站）

纯 HTML / CSS / JavaScript 静态站点，双击 `index.html` 即可离线使用，也可免费部署到 GitHub Pages。

## 目录结构

```
english-study-site/
├── index.html            # 唯一入口（双击打开）
├── css/style.css         # 全部样式
├── js/
│   ├── app.js            # 路由：首页部分 → 部分章节目录 → 章精读（章内各板块同页连续）
│   ├── annotate.js       # 整页批注画布、工具栏、PNG 导出
│   └── data/site.js      # 全部学习内容（由工具脚本从 Markdown 生成）
└── tools/build_site.py   # Markdown → site.js 的生成脚本（改源文件后重跑）
```

## 使用

1. 双击打开 `index.html`（推荐 Edge / Chrome）。
2. **首页**并列显示 3 个部分：**第五部分 · 固定搭配**、**第六部分 · 高频句型**、**第七部分 · 场景实战与高频句型**（7.1–7.30 的场景实战课与高频句型讲义已合并进第七部分）。
3. 点一个**部分**，进入该部分的**章节目录**；再点某一章，进入该章精读页。
   章内的“一、词汇预习 / 二、情景对话拆解 / 三、对话原文 / 四、总结 / 五、课后练习及答案”等，以及“精读文章 1 / 精读文章 2”下的“文章精读 / 精读分析 / 复习要点”，是**同一章的不同板块**，在同一页从上到下连续阅读，不再拆成“下一篇”。页首“本课内容”索引可快速跳到各板块；页面底部用**上一章 / 下一章**在相邻章之间连通，并标明具体章名。
4. 课文页悬浮工具栏（画布覆盖**整个界面**，纸张内外、左右页边留白都能画）：
   - **画笔 / 荧光笔 / 橡皮擦**：在整个页面涂画；
   - **选择**：画布穿透，可选中、复制英文原文，可点页面链接与上一章/下一章；
   - **删改文字**：直接在正文上增、删、改文字。改动只保存在本机浏览器，**不会改动 Markdown 原文件**；可一键“还原原文”；导出 PNG 会带上修改后的内容；
   - **粗细 / 颜色**：调节画笔；
   - **撤销 / 重做 / 清空**；
   - 按住工具栏空白处可把它拖到任意位置（滚动时始终悬浮）；
   - **导出 PNG**：一键下载“整课原文 + 手绘批注（含文字删改）”合并的长图。
5. 学习进度按**章**标记（标记学完），工具栏位置、文字删改都保存在本机浏览器，不上传任何数据、不改动源文件。

## 更新内容后重新生成

修改桌面 `English Language study` 目录里的 Markdown 源文件后：

```powershell
python tools/build_site.py
```

会重新生成 `js/data/site.js`，刷新页面即可（若浏览器缓存，按 Ctrl+F5）。

## 部署到 GitHub Pages（免费）

### 方法一：网页上传（不需要装 Git）

1. 注册并登录 GitHub，右上角 **+ → New repository**，仓库名例如 `english-study`，点 **Create repository**。
2. 在新仓库页面点 **uploading an existing file**，把 `english-study-site` **文件夹里的全部内容**（`index.html`、`css`、`js`，注意不要多套一层文件夹）拖进去，下方点 **Commit changes**。
3. 仓库顶部 **Settings → Pages**：
   - **Source** 选 `Deploy from a branch`；
   - **Branch** 选 `main`、文件夹选 `/ (root)`，点 **Save**。
4. 等约 1 分钟，Pages 页会显示网址，形如：
   `https://你的用户名.github.io/english-study/`
   打开即可，手机、电脑都能访问。

以后更新：在对应文件页面点铅笔图标修改，或重新拖拽覆盖，再 Commit，Pages 会自动更新。

### 方法二：Git 命令行（本项目仓库已建好，日常更新用）

本项目已初始化仓库并配置好远程，日常更新只需：

```powershell
cd english-study-site
git add -A
git commit -m "说明本次改动"
git push origin main
```

只有在一台全新电脑上从零部署时，才需要 `git init`、`git remote add origin git@github.com:YUJINJINYJJ/english-study-site.git` 等初始化步骤。推送后同方法一第 3、4 步在 **Settings → Pages** 开启 Pages。

> 说明：本站用 `#/` 形式的页内路由，且 CSS/JS 全部是相对路径，
> 部署在 `用户名.github.io/仓库名/` 这类子路径下也能直接工作，无需额外配置。
> 导出 PNG、批注、进度均在浏览器本地完成，GitHub Pages 只负责托管静态文件。
