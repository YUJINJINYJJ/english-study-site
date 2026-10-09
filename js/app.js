/* ===== 英语场景学习手册 · 三级路由 ===== */
(function () {
  "use strict";
  var DATA = window.SITE_DATA || { categories: [] };
  var STORE_KEY = "english-study-site-v3";
  var app = document.getElementById("app");

  /* ---------- 进度存储（按“课/章”记录） ---------- */
  function loadStore() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY)) || { done: {} }; }
    catch (e) { return { done: {} }; }
  }
  var store = loadStore();
  function saveStore() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(store)); } catch (e) {}
  }
  function isDone(key) { return !!store.done[key]; }
  function toggleDone(key) {
    store.done[key] = !store.done[key];
    if (!store.done[key]) delete store.done[key];
    saveStore();
  }

  /* ---------- 索引 ---------- */
  var INDEX = {};        // aid -> {art, mod, cat, pos}
  var MOD_INDEX = {};    // mid -> {mod, cat}
  var CAT_INDEX = {};    // cid -> cat
  var TOTAL_MOD = 0;     // 课/章总数
  var TOTAL_SEC = 0;     // 知识板块（小节/部分）总数
  DATA.categories.forEach(function (cat) {
    if (cat.id) CAT_INDEX[cat.id] = cat;
    cat.modules.forEach(function (mod) {
      MOD_INDEX[mod.id] = { mod: mod, cat: cat };
      TOTAL_MOD++;
      mod.articles.forEach(function (art, i) {
        INDEX[art.id] = { art: art, mod: mod, cat: cat, pos: i };
        TOTAL_SEC++;
      });
    });
  });
  function firstAid(mod) { return mod.articles[0].id; }
  function modLearned(mod) { return isDone(mod.id); }
  function catModDone(cat) {
    return cat.modules.filter(function (m) { return modLearned(m); }).length;
  }
  function catSecs(cat) {
    return cat.modules.reduce(function (n, m) { return n + m.articles.length; }, 0);
  }
  function doneCount() { return Object.keys(store.done).length; }
  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  function modCode(cat, mod, i) {
    if (mod.code) return mod.code;
    return String(i + 1).padStart(2, "0");
  }

  // 卡片上的资料来源短标签（只作辨认，不做分区）
  function catShort(cat) {
    var n = cat.name || "";
    if (n.indexOf("第五") >= 0) return "固定搭配";
    if (n.indexOf("第六") >= 0) return "高频句型 · 六";
    if (n.indexOf("第七") >= 0) return "高频句型 · 七";
    return n.replace("场景课", "").replace(/^[·\s]+|[·\s]+$/g, "");
  }

  /* ---------- 顶部条 ---------- */
  function topbarHTML() {
    var pct = TOTAL_MOD ? Math.round(doneCount() / TOTAL_MOD * 100) : 0;
    return '<div class="topbar"><div class="topbar-in">' +
      '<a class="brand-badge" href="#/">A</a>' +
      '<div><div class="brand-name">英语场景学习手册</div></div>' +
      '<div class="topbar-right"><span class="brand-sub">场景对话 · 词汇句型 · 精读批注</span>' +
      '<span class="progress-pill"><span class="bar"><i style="width:' + pct + '%"></i></span>' +
      '<b>' + doneCount() + ' / ' + TOTAL_MOD + '</b></span>' +
      '</div></div></div>';
  }

  /* ---------- 首页：7 个源文件并列 ---------- */
  function renderHome() {
    var html = topbarHTML();
    html += '<div class="home"><div class="hero">' +
      '<div><h1>把每个场景的英语，<br><span class="accent">读透、画透、练透</span></h1>' +
      '<p>下面是全部学习文件，点开一个文件选择章节，进入后是一整课：词汇、对话、总结、练习答案在同一页连续阅读，可直接涂画批注、删改文字并导出笔记图片。</p></div>' +
      '<div class="hero-stats">' +
      '<div class="hero-stat"><div class="num">' + DATA.categories.length + '</div><div class="lbl">学习文件</div></div>' +
      '<div class="hero-stat"><div class="num">' + TOTAL_MOD + '</div><div class="lbl">精读章节</div></div>' +
      '<div class="hero-stat"><div class="num">' + TOTAL_SEC + '</div><div class="lbl">知识板块</div></div>' +
      '</div></div>';

    html += '<div class="file-list">';
    DATA.categories.forEach(function (cat, ci) {
      var nm = cat.modules.length, secs = catSecs(cat), dn = catModDone(cat);
      var pct = nm ? Math.round(dn / nm * 100) : 0;
      var allDone = dn === nm && nm > 0;
      html += '<a class="file-row' + (allDone ? ' done' : '') + '" href="#/c/' + encodeURIComponent(cat.id) + '">' +
        '<div class="file-badge">' + String(ci + 1).padStart(2, "0") + '</div>' +
        '<div class="file-main">' +
        '<div class="ftitle">' + esc(cat.title || cat.name) + '</div>' +
        (cat.range ? '<div class="fsub"><span class="frange">' + esc(cat.range) + '</span></div>' : '') +
        '<div class="file-progress"><span class="fp-bar"><i style="width:' + pct + '%"></i></span></div>' +
        '</div>' +
        '<div class="file-meta">' + (cat.single
          ? '<div class="fm-num">整本 <small>合订</small></div>'
          : '<div class="fm-num">' + nm + ' <small>章</small></div><div class="fm-num">' + secs + ' <small>板块</small></div>') +
        '<div class="file-go">' + (cat.single ? '开始阅读 ›' : '进入目录 ›') + '</div></div>' +
        '</a>';
    });
    html += '</div></div>';
    app.innerHTML = html;
  }

  /* ---------- 文件页：该文件的二级目录（章节模块） ---------- */
  function renderCategory(cid) {
    var cat = CAT_INDEX[decodeURIComponent(cid)];
    if (!cat) { location.hash = "#/"; return; }
    if (cat.modules.length === 1) { location.hash = "#/a/" + firstAid(cat.modules[0]); return; }
    var nm = cat.modules.length, secs = catSecs(cat), dn = catModDone(cat);
    var html = topbarHTML();
    html += '<div class="page">';
    html += '<nav class="crumb"><a href="#/">首页</a><span class="sep">/</span><span>' +
      esc(cat.title || cat.name) + '</span></nav>';
    html += '<div class="cat-hero">' +
      (cat.range ? '<div class="ch-range">' + esc(cat.range) + '</div>' : '') +
      '<h1>' + esc(cat.title || cat.name) + '</h1>' +
      '<div class="ch-sub">共 <b>' + nm + '</b> 章 · <b>' + secs + '</b> 个知识板块 · 已学完 <b>' + dn + '</b> 章；点击章节进入整课</div>' +
      '</div>';
    html += '<div class="mod-grid mod-grid-flat">';
    cat.modules.forEach(function (mod, mi) {
      var total = mod.articles.length;
      var learned = modLearned(mod);
      var pct = learned ? 100 : 0;
      html += '<a class="mod-card' + (learned ? ' done' : '') + '" href="#/a/' + firstAid(mod) + '">' +
        '<span class="tick">✓</span>' +
        '<div class="code">' + esc(modCode(cat, mod, mi)) + '</div>' +
        '<div class="mtitle">' + esc(mod.title) + '</div>' +
        '<div class="meta"><span>' + total + ' 板块</span><span class="mini-bar"><i style="width:' + pct + '%"></i></span>' +
        '<span>' + (learned ? "✓ 已学完" : "未开始") + '</span></div></a>';
    });
    html += '</div></div>';
    app.innerHTML = html;
  }

  /* ---------- 旧的章节目录地址：直接进入该章整课 ---------- */
  function renderModule(mid) {
    var entry = MOD_INDEX[decodeURIComponent(mid)];
    if (!entry) { location.hash = "#/"; return; }
    location.hash = "#/a/" + firstAid(entry.mod);
  }

  /* ---------- 文章页：一整课（各部分连续）+ 批注 ---------- */
  var readerCtrl = null;
  function renderArticle(aid) {
    var info = INDEX[aid];
    if (!info) { location.hash = "#/"; return; }
    var mod = info.mod, cat = info.cat, pos = info.pos;
    var done = isDone(mod.id);
    var mi = cat.modules.indexOf(mod);
    var nMod = cat.modules.length;
    function codeOf(m, idx) { return m.code || modCode(cat, m, idx); }
    function modLabel(m, idx) { return codeOf(m, idx) + " " + m.title; }
    var chapterPrev = mi > 0 ? cat.modules[mi - 1] : null;
    var chapterNext = mi < nMod - 1 ? cat.modules[mi + 1] : null;

    /* 合并该课所有板块：大节=部分(h2)，小节=h3，全文类不重复标题 */
    var parts = [];
    var bodyHtml = "";
    var lastSection = null;
    mod.articles.forEach(function (a) {
      var sec = a.section || "";
      var whole = (!sec || a.title === "全文");
      if (sec && sec !== lastSection) {
        lastSection = sec;
        parts.push({ id: "sec-" + a.id, name: sec });
        bodyHtml += '<h2 class="part-h" id="sec-' + a.id + '">' + esc(sec) + "</h2>";
      }
      if (!whole && a.title && a.title !== sec) {
        bodyHtml += '<h3 class="sub-h" id="part-' + a.id + '">' + esc(a.title) + "</h3>";
      }
      bodyHtml += '<div class="part-body">' +
        a.blocks.map(function (b) { return b.html; }).join("") + "</div>";
    });

    var tocHtml = "";
    if (parts.length > 1) {
      tocHtml = '<nav class="part-toc"><span class="pt-label">本课内容</span>';
      parts.forEach(function (pt) {
        tocHtml += '<a href="javascript:void(0)" data-to="' + pt.id + '">' + esc(pt.name) + "</a>";
      });
      tocHtml += "</nav>";
    }
    var textHtml = "<h1>" + esc((mod.code ? mod.code + " · " : "") + mod.title) + "</h1>" + tocHtml + bodyHtml;

    var html = topbarHTML();
    html += '<div class="reader-wrap" id="reader-wrap">';
    html += '<div class="reader-head"><nav class="rcrumb">' +
      '<a href="#/">首页</a><span class="sep">/</span>' +
      '<a href="#/c/' + encodeURIComponent(cat.id) + '">' + esc(cat.title || cat.name) + '</a><span class="sep">/</span>' +
      '<span>' + esc((mod.code ? mod.code + " " : "") + mod.title) + '</span>' +
      '</nav></div>';
    html += '<div class="annotate-stage"><div class="annotate-text">' + textHtml + "</div></div>";

    /* 上一章 / 下一章：连通到相邻的具体章节；整篇合订（仅 1 章）时不显示 */
    if (nMod > 1) {
      html += '<div class="chapter-nav">';
      html += chapterPrev
        ? '<a class="cn-side prev" href="#/a/' + firstAid(chapterPrev) + '"><span class="cn-dir">‹ 上一章</span><span class="cn-name">' + esc(modLabel(chapterPrev, mi - 1)) + '</span></a>'
        : '<span class="cn-side prev disabled"><span class="cn-dir">‹ 上一章</span><span class="cn-name">已是第一章</span></span>';
      html += '<span class="cn-now">第 ' + (mi + 1) + ' / ' + nMod + ' 章</span>';
      html += chapterNext
        ? '<a class="cn-side next" href="#/a/' + firstAid(chapterNext) + '"><span class="cn-dir">下一章 ›</span><span class="cn-name">' + esc(modLabel(chapterNext, mi + 1)) + '</span></a>'
        : '<span class="cn-side next disabled"><span class="cn-dir">下一章 ›</span><span class="cn-name">已是最后一章</span></span>';
      html += '</div>';
    }

    html += '<div class="reader-nav reader-nav-single"><div class="rnav-center">' +
      '<a class="btn-mod-back" href="' + (nMod === 1 ? '#/' : '#/c/' + encodeURIComponent(cat.id)) + '">' +
      (nMod === 1 ? '返回首页' : '返回章节目录') + '</a>' +
      '<button class="btn-learn' + (done ? ' is-done' : '') + '" id="btn-learn">' + (done ? "✓ 已学完" : "标记学完") + '</button>' +
      "</div></div>";
    html += "</div>";
    app.innerHTML = html;

    readerCtrl = window.AnnotateApp.mount(document.getElementById("app"), {
      exportName: mod.title,
      editKey: mod.id
    });

    app.querySelectorAll(".part-toc a[data-to]").forEach(function (a) {
      a.addEventListener("click", function (e) {
        e.preventDefault();
        var t = document.getElementById(a.getAttribute("data-to"));
        if (t) t.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });

    if (pos > 0) {
      var target = document.getElementById("part-" + aid) || document.getElementById("sec-" + aid);
      if (target) setTimeout(function () { target.scrollIntoView({ block: "start" }); }, 60);
    } else {
      window.scrollTo(0, 0);
    }

    document.getElementById("btn-learn").addEventListener("click", function () {
      toggleDone(mod.id);
      var dn = isDone(mod.id);
      this.classList.toggle("is-done", dn);
      this.textContent = dn ? "✓ 已学完" : "标记学完";
      var pill = document.querySelector(".progress-pill b");
      if (pill) pill.textContent = doneCount() + " / " + TOTAL_MOD;
      var bar = document.querySelector(".progress-pill .bar i");
      if (bar) bar.style.width = (TOTAL_MOD ? Math.round(doneCount() / TOTAL_MOD * 100) : 0) + "%";
    });
  }

  /* ---------- 路由 ---------- */
  function route() {
    if (readerCtrl) { try { readerCtrl.destroy(); } catch (e) {} readerCtrl = null; }
    var h = location.hash || "#/";
    var mc = h.match(/^#\/c\/(.+)$/);
    var mm = h.match(/^#\/m\/(.+)$/);
    var ma = h.match(/^#\/a\/(.+)$/);
    if (ma) renderArticle(decodeURIComponent(ma[1]));
    else if (mm) renderModule(decodeURIComponent(mm[1]));
    else if (mc) renderCategory(decodeURIComponent(mc[1]));
    else renderHome();
  }
  window.addEventListener("hashchange", route);
  route();
})();
