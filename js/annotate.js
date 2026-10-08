/* ============================================================
   批注模块（整页挂载版）
   AnnotateApp.mount(containerEl, {exportName})
   - container 为整个阅读页（面包屑 + 纸张 + 底部导航）
   - 画布覆盖整个 container：画笔/荧光笔/橡皮/选择/撤销/重做/清空
   - 细窄悬浮工具栏：滚动固定、空白处可拖动、按钮不触发拖动
   - 选择模式画布穿透：可选中复制文字、点击页面链接
   - 导出：整页原文（foreignObject 保真排版）+ 批注叠加 → PNG
   ============================================================ */
(function () {
  "use strict";

  var TOOLBAR_STORE = "english-annotate-toolbar-v2";

  function el(tag, cls, html) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html !== undefined) n.innerHTML = html;
    return n;
  }

  var ICONS = {
    pen: '<svg viewBox="0 0 24 24"><path d="M3 21l3.5-1L19 7.5 16.5 5 4 17.5 3 21z"/><path d="M15 6.5l2.5 2.5"/></svg>',
    highlight: '<svg viewBox="0 0 24 24"><path d="M9 11l4 4M5 21l1.5-4.5L15 8l-3-3-8.5 8.5L5 21z"/><path d="M13.5 6.5l4 4M16 4l4 4"/></svg>',
    eraser: '<svg viewBox="0 0 24 24"><path d="M16 3l5 5-8 8H8l-5-5 8-8z"/><path d="M9 21h12"/></svg>',
    select: '<svg viewBox="0 0 24 24"><path d="M6 3l1.5 14 3.2-3.4 2 4.4 2.2-1-2-4.3H17z"/></svg>',
    edit: '<svg viewBox="0 0 24 24"><path d="M4 20h7"/><path d="M14.5 5.5l4 4L9 19l-4.5.5L5 15 14.5 5.5z"/></svg>',
    undo: '<svg viewBox="0 0 24 24"><path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 010 12h-3"/></svg>',
    redo: '<svg viewBox="0 0 24 24"><path d="M15 14l5-5-5-5"/><path d="M20 9H10a6 6 0 000 12h3"/></svg>',
    clear: '<svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg>',
    export: '<svg viewBox="0 0 24 24"><path d="M12 3v12m0 0l-4-4m4 4l4-4M5 21h14"/></svg>'
  };

  /* ============================================================
     挂载入口：canvas 覆盖整个 container
     ============================================================ */
  function mount(container, opts) {
    opts = opts || {};
    var canvas = document.createElement("canvas");
    canvas.id = "annotate-canvas";
    container.appendChild(canvas);

    // 荧光层高亮层：放进纸张内部、文字下方
    var hl = document.createElement("canvas");
    hl.id = "annotate-hl";
    var stageEl0 = container.querySelector(".annotate-stage");
    if (stageEl0) stageEl0.insertBefore(hl, stageEl0.firstChild);
    else container.appendChild(hl);

    var tb = buildToolbar();
    document.body.appendChild(tb);

    var api = initDrawing(canvas, hl, container, tb, opts);

    return {
      destroy: function () {
        api.destroy();
        if (tb.parentNode) tb.parentNode.removeChild(tb);
        if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
        if (hl.parentNode) hl.parentNode.removeChild(hl);
      }
    };
  }

  /* ============================================================
     工具栏
     ============================================================ */
  function buildToolbar() {
    var tb = el("div", "annotate-toolbar");
    tb.style.right = "24px";
    tb.style.bottom = "22px";

    function addBtn(action, label, extra) {
      var b = el("button", "at-btn" + (extra || ""), ICONS[action] + '<span class="lbl">' + label + "</span>");
      b.setAttribute("data-action", action);
      b.title = label;
      tb.appendChild(b);
    }
    addBtn("pen", "画笔", " active");
    addBtn("highlight", "荧光笔");
    addBtn("eraser", "橡皮擦");
    addBtn("select", "选择");
    addBtn("edit", "删改文字", " at-edit");

    tb.appendChild(el("span", "at-sep"));

    var sizeWrap = el("label", "at-ctl at-size");
    sizeWrap.title = "粗细";
    sizeWrap.appendChild(el("span", "", "粗细"));
    var range = el("input");
    range.type = "range"; range.min = "1"; range.max = "24"; range.value = "5";
    range.setAttribute("data-ctl", "size");
    sizeWrap.appendChild(range);
    tb.appendChild(sizeWrap);

    var colorWrap = el("label", "at-ctl");
    colorWrap.title = "颜色";
    colorWrap.appendChild(el("span", "", "颜色"));
    var colorInput = el("input");
    colorInput.type = "color"; colorInput.value = "#c4453c";
    colorInput.setAttribute("data-ctl", "color");
    colorWrap.appendChild(colorInput);
    tb.appendChild(colorWrap);

    tb.appendChild(el("span", "at-sep"));

    addBtn("undo", "撤销");
    addBtn("redo", "重做");
    addBtn("clear", "清空");
    addBtn("export", "导出 PNG", " at-export");

    /* 拖动：仅空白区域触发，按钮/控件不触发 */
    var drag = null;
    tb.addEventListener("pointerdown", function (e) {
      if (e.target.closest(".at-btn, .at-ctl")) return;
      var r = tb.getBoundingClientRect();
      drag = { id: e.pointerId, dx: e.clientX - r.left, dy: e.clientY - r.top };
      try { tb.setPointerCapture(e.pointerId); } catch (err) {}
      tb.classList.add("dragging");
      e.preventDefault();
    });
    tb.addEventListener("pointermove", function (e) {
      if (!drag) return;
      var x = e.clientX - drag.dx, y = e.clientY - drag.dy;
      x = Math.max(4, Math.min(x, window.innerWidth - tb.offsetWidth - 4));
      y = Math.max(4, Math.min(y, window.innerHeight - tb.offsetHeight - 4));
      tb.style.right = "auto"; tb.style.bottom = "auto";
      tb.style.left = x + "px"; tb.style.top = y + "px";
    });
    function endDrag(e) {
      if (drag && drag.id === e.pointerId) {
        drag = null;
        tb.classList.remove("dragging");
        try { localStorage.setItem(TOOLBAR_STORE, JSON.stringify({ x: tb.style.left, y: tb.style.top })); } catch (err) {}
      }
    }
    tb.addEventListener("pointerup", endDrag);
    tb.addEventListener("pointercancel", endDrag);

    try {
      var saved = JSON.parse(localStorage.getItem(TOOLBAR_STORE) || "null");
      if (saved && saved.x) {
        tb.style.right = "auto"; tb.style.bottom = "auto";
        tb.style.left = saved.x; tb.style.top = saved.y;
      }
    } catch (err) {}

    tb.addEventListener("click", function (e) {
      var btn = e.target.closest("button[data-action]");
      if (!btn) return;
      tb.dispatchEvent(new CustomEvent("annotate-action", { detail: { action: btn.getAttribute("data-action") } }));
    });
    return tb;
  }

  /* ============================================================
     绘图核心
     ============================================================ */
  function initDrawing(canvas, hlCanvas, container, tb, opts) {
    opts = opts || {};
    var exportName = opts.exportName || "article";
    var ctx = canvas.getContext("2d");
    var hlCtx = hlCanvas ? hlCanvas.getContext("2d") : null;
    var dpr = window.devicePixelRatio || 1;
    var strokes = [], redoStack = [];
    var mode = "pen", penSize = 5, penColor = "#c4453c";
    var drawing = false, current = null;
    var sizeInput = tb.querySelector('[data-ctl="size"]');
    var colorInput = tb.querySelector('[data-ctl="color"]');

    /* ---------- 文字删改（仅本机，不改原文件） ---------- */
    var EDIT_STORE = "english-lesson-edits-v2";
    var textEl = container.querySelector(".annotate-text");
    var stageEl = container.querySelector(".annotate-stage");
    var editKey = opts.editKey || exportName;
    var originalHtml = textEl ? textEl.innerHTML : "";
    var banner = null, saveTimer = null;

    function readEditStore() {
      try { return JSON.parse(localStorage.getItem(EDIT_STORE) || "{}"); } catch (e) { return {}; }
    }
    function writeEditStore(all) {
      try { localStorage.setItem(EDIT_STORE, JSON.stringify(all)); } catch (e) {}
    }
    function restoreEdit() {
      if (!textEl) return;
      var all = readEditStore();
      if (all[editKey]) textEl.innerHTML = all[editKey];
    }
    function saveEdit() {
      if (!textEl) return;
      var all = readEditStore();
      all[editKey] = textEl.innerHTML;
      writeEditStore(all);
    }
    function scheduleSave() {
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(saveEdit, 400);
    }
    function ensureBanner() {
      if (banner) return banner;
      banner = el("div", "edit-banner");
      banner.innerHTML =
        '<span class="eb-title">删改模式</span>' +
        '<span class="eb-tip">直接点击正文即可增、删、改文字；改动只保存在本机浏览器，<b>不会改动原文件</b>，导出 PNG 时会带上修改后的内容。</span>' +
        '<span class="eb-actions"><button type="button" class="eb-reset">还原原文</button>' +
        '<button type="button" class="eb-done">完成</button></span>';
      banner.querySelector(".eb-reset").addEventListener("click", function () {
        if (!textEl) return;
        textEl.innerHTML = originalHtml;
        var all = readEditStore(); delete all[editKey]; writeEditStore(all);
        setMode("pen");
      });
      banner.querySelector(".eb-done").addEventListener("click", function () {
        saveEdit(); setMode("pen");
      });
      if (stageEl && stageEl.parentNode) stageEl.parentNode.insertBefore(banner, stageEl);
      else container.appendChild(banner);
      return banner;
    }
    function setEditing(on) {
      if (!textEl) return;
      if (on) {
        textEl.setAttribute("contenteditable", "true");
        textEl.classList.add("editing");
        ensureBanner().style.display = "flex";
        textEl.addEventListener("input", scheduleSave);
      } else {
        textEl.removeAttribute("contenteditable");
        textEl.classList.remove("editing");
        textEl.removeEventListener("input", scheduleSave);
        if (banner) banner.style.display = "none";
        if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; saveEdit(); }
      }
    }
    restoreEdit();

    function cssWidth() { return container.clientWidth; }
    function cssHeight() { return Math.max(container.clientHeight, container.scrollHeight); }

    /* 荧光层在纸张坐标系中的文档偏移 */
    function hlOffset() {
      if (!hlCanvas) return { x: 0, y: 0 };
      var r = hlCanvas.getBoundingClientRect();
      return { x: r.left + window.scrollX, y: r.top + window.scrollY };
    }

    function syncCanvasSize() {
      var w = cssWidth(), h = cssHeight();
      if (w > 0 && h > 0) {
        canvas.style.width = w + "px";
        canvas.style.height = h + "px";
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
      }
      if (hlCanvas && stageEl) {
        var hw = stageEl.clientWidth, hh = stageEl.clientHeight;
        if (hw > 0 && hh > 0) {
          hlCanvas.style.width = hw + "px";
          hlCanvas.style.height = hh + "px";
          hlCanvas.width = Math.round(hw * dpr);
          hlCanvas.height = Math.round(hh * dpr);
        }
      }
      redraw();
    }
    function redraw() {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (hlCtx && hlCanvas) {
        hlCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
        hlCtx.clearRect(0, 0, hlCanvas.width, hlCanvas.height);
      }
      strokes.forEach(function (s) {
        if (s.type === "highlight") { paintHl(s, false); }
        else if (s.type === "eraser") { paintPen(s); paintHl(s, true); }
        else { paintPen(s); }
      });
    }
    /* 普通画笔 / 橡皮（顶层，文档坐标） */
    function paintPen(s) {
      if (s.points.length < 2) return;
      ctx.save();
      if (s.type === "eraser") {
        ctx.globalCompositeOperation = "destination-out";
        ctx.strokeStyle = "rgba(0,0,0,1)";
        ctx.globalAlpha = 1;
      } else {
        ctx.globalCompositeOperation = "source-over";
        ctx.strokeStyle = s.color;
        ctx.globalAlpha = 1;
      }
      ctx.lineWidth = s.size;
      ctx.lineCap = "round"; ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(s.points[0].x, s.points[0].y);
      for (var i = 1; i < s.points.length; i++) ctx.lineTo(s.points[i].x, s.points[i].y);
      ctx.stroke();
      ctx.restore();
    }
    /* 荧光（纸张内、文字下层）；isEraser 时在该层擦除 */
    function paintHl(s, isEraser) {
      if (!hlCtx || !hlCanvas || s.points.length < 2) return;
      var o = hlOffset();
      hlCtx.save();
      hlCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      hlCtx.translate(-o.x, -o.y);
      if (isEraser) {
        hlCtx.globalCompositeOperation = "destination-out";
        hlCtx.strokeStyle = "rgba(0,0,0,1)";
        hlCtx.globalAlpha = 1;
      } else {
        hlCtx.globalCompositeOperation = "source-over";
        hlCtx.strokeStyle = s.color;
        hlCtx.globalAlpha = 0.5;
      }
      hlCtx.lineWidth = s.size;
      hlCtx.lineCap = "round"; hlCtx.lineJoin = "round";
      hlCtx.beginPath();
      hlCtx.moveTo(s.points[0].x, s.points[0].y);
      for (var j = 1; j < s.points.length; j++) hlCtx.lineTo(s.points[j].x, s.points[j].y);
      hlCtx.stroke();
      hlCtx.restore();
    }
    function getPos(e) {
      var r = canvas.getBoundingClientRect();
      // rect 已随页面滚动变化，client 坐标减 rect 即画布内部坐标
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    }
    function setMode(m) {
      mode = m;
      var through = (m === "select" || m === "edit");
      // 选择/删改模式：画布穿透，文字可选中复制或直接编辑、链接可点
      canvas.style.pointerEvents = through ? "none" : "auto";
      canvas.style.cursor = (m === "eraser") ? "cell" : (through ? "text" : "crosshair");
      tb.querySelectorAll(".at-btn[data-action]").forEach(function (b) {
        b.classList.toggle("active", b.getAttribute("data-action") === m);
      });
      setEditing(m === "edit");
    }

    canvas.addEventListener("pointerdown", function (e) {
      if (mode === "select" || mode === "edit") return;
      drawing = true;
      current = {
        type: mode,
        color: mode === "highlight" ? "#ffe23d" : penColor,
        size: mode === "highlight" ? penSize * 4 : (mode === "eraser" ? penSize * 4 : penSize),
        points: [getPos(e)]
      };
      strokes.push(current);
      redoStack = [];
      try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
      e.preventDefault();
    });
    canvas.addEventListener("pointermove", function (e) {
      if (!drawing || !current) return;
      current.points.push(getPos(e));
      redraw();
    });
    function stopDraw() { drawing = false; current = null; }
    canvas.addEventListener("pointerup", stopDraw);
    canvas.addEventListener("pointercancel", stopDraw);

    function onAction(e) {
      switch (e.detail.action) {
        case "pen": case "highlight": case "eraser": case "select": case "edit": setMode(e.detail.action); break;
        case "undo":
          if (strokes.length) { redoStack.push(strokes.pop()); redraw(); }
          break;
        case "redo":
          if (redoStack.length) { strokes.push(redoStack.pop()); redraw(); }
          break;
        case "clear": strokes = []; redoStack = []; redraw(); break;
        case "export": exportPNG(canvas, container, exportName); break;
      }
    }
    tb.addEventListener("annotate-action", onAction);
    sizeInput.addEventListener("input", function () { penSize = parseInt(sizeInput.value, 10) || 5; });
    colorInput.addEventListener("input", function () { penColor = colorInput.value; });

    var ro = null;
    if (window.ResizeObserver) {
      ro = new ResizeObserver(function () { syncCanvasSize(); });
      ro.observe(container);
      if (stageEl) ro.observe(stageEl);
    }
    window.addEventListener("resize", syncCanvasSize);
    // 字体/内容渲染后再同步，保证整页高度准确
    setTimeout(syncCanvasSize, 60);
    setTimeout(syncCanvasSize, 400);
    syncCanvasSize();
    setMode("pen");

    return {
      destroy: function () {
        try { setEditing(false); } catch (e) {}
        tb.removeEventListener("annotate-action", onAction);
        window.removeEventListener("resize", syncCanvasSize);
        if (ro) ro.disconnect();
      }
    };
  }

  /* ============================================================
     导出：foreignObject 保真渲染整页原文 + 批注叠加
     ============================================================ */
  var EXPORT_CSS =
    "*{box-sizing:border-box;}" +
    ".xapp{background:transparent;font-family:-apple-system,'Segoe UI','Microsoft YaHei',sans-serif;}" +
    ".xtop{border-bottom:1px solid #e0d8c2;background:#f7f4ec;}" +
    ".xtop-in{max-width:1120px;margin:0 auto;padding:12px 28px;display:flex;align-items:center;gap:12px;}" +
    ".xbadge{width:34px;height:34px;border-radius:9px;background:#143d35;color:#f7f4ec;font:700 19px Georgia,'Times New Roman',serif;display:flex;align-items:center;justify-content:center;}" +
    ".xbrand{font:700 17px Georgia,'Times New Roman',serif;color:#143d35;}" +
    ".xbrand-sub{font-size:12px;color:#8a938c;margin-left:2px;}" +
    ".xreader{max-width:860px;margin:0 auto;padding:0 22px 90px;}" +
    ".xhead{padding:20px 4px 18px;}" +
    ".xcrumb{font-size:13px;color:#8a938c;display:flex;flex-wrap:wrap;gap:8px;align-items:center;}" +
    ".xcrumb a{color:#42504b;text-decoration:none;}" +
    ".xcrumb .sep{color:#c3baa4;}" +
    ".xstage{position:relative;background:transparent;border:1px solid #e0d8c2;border-radius:14px;padding:44px 52px 52px;}" +
    ".xkicker{font-size:13px;color:#b07d24;font-weight:600;margin:0 0 8px;letter-spacing:.04em;}" +
    ".xstage h1{font:700 30px Georgia,'Times New Roman','Songti SC',serif;color:#143d35;line-height:1.3;margin:0 0 24px;padding-bottom:16px;border-bottom:2px solid #e9d7ab;}" +
    ".xstage .part-h{font:700 23px Georgia,'Times New Roman','Songti SC',serif;color:#143d35;line-height:1.4;margin:34px 0 16px;padding:8px 0 8px 14px;border-left:4px solid #b07d24;}" +
    ".xstage .sub-h{font:700 17px -apple-system,'Segoe UI','Microsoft YaHei',sans-serif;color:#1e5b4f;line-height:1.5;margin:22px 0 10px;}" +
    ".xstage p{font:400 16.5px/1.95 -apple-system,'Segoe UI','Microsoft YaHei',sans-serif;margin:0 0 13px;color:#23302c;}" +
    ".xstage .ln-title{font-weight:700;color:#143d35;margin-top:20px;}" +
    ".xstage ul,.xstage ol{margin:4px 0 16px;padding-left:26px;}" +
    ".xstage li{font:400 16px/1.9 -apple-system,'Segoe UI','Microsoft YaHei',sans-serif;margin-bottom:7px;color:#23302c;}" +
    ".xstage ol li::marker{color:#b07d24;font-weight:700;}" +
    ".xstage strong{color:#143d35;}" +
    ".xstage .part-toc{display:flex;flex-wrap:wrap;align-items:center;gap:8px 10px;background:#f1ebdc;border:1px solid #e0d8c2;border-radius:10px;padding:12px 14px;margin:0 0 28px;}" +
    ".xstage .pt-label{font-size:12.5px;font-weight:700;color:#b07d24;letter-spacing:.05em;margin-right:2px;}" +
    ".xstage .part-toc a{font-size:13px;color:#143d35;background:#fffdf6;border:1px solid #e0d8c2;border-radius:999px;padding:4px 12px;white-space:nowrap;text-decoration:none;}" +
    ".xstage mark{background:#f3df9a;color:inherit;padding:0 2px;border-radius:2px;}" +
    ".xstage pre{font:14px/1.7 Consolas,'Courier New',monospace;white-space:pre-wrap;word-break:break-word;background:#f1ebdc;border-radius:8px;padding:14px 16px;margin:0 0 14px;}" +
    ".xstage .empty-note{color:#8a938c;font-style:italic;}" +
    ".xnav{display:grid;grid-template-columns:1fr auto 1fr;gap:14px;align-items:center;margin-top:26px;}" +
    ".xnavbtn{border:1px solid #e0d8c2;background:#fffdf6;border-radius:10px;padding:12px 16px;font-size:14px;color:#42504b;}" +
    ".xnavbtn.next{text-align:right;}" +
    ".xnavbtn .dir{display:block;font-size:11.5px;color:#8a938c;}" +
    ".xnavbtn .t{display:block;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}" +
    ".xnavcenter{display:flex;gap:10px;}" +
    ".xpill{border-radius:10px;padding:11px 18px;font-size:14px;font-weight:600;}" +
    ".xpill.back{border:1px solid #e0d8c2;background:#fffdf6;color:#42504b;}" +
    ".xpill.learn{background:#1e5b4f;color:#fff;}" +
    ".xpill.learn.done{background:#f1ebdc;color:#143d35;border:1px solid #d8cdb2;}";

  function buildClone(container) {
    var clone = container.cloneNode(true);
    var c = clone.querySelector("#annotate-canvas");
    if (c && c.parentNode) c.parentNode.removeChild(c);
    var hc = clone.querySelector("#annotate-hl");
    if (hc && hc.parentNode) hc.parentNode.removeChild(hc);
    clone.removeAttribute("id");
    clone.className = "xapp";

    /* 顶部条 */
    var top = clone.querySelector(".topbar");
    if (top) { top.classList.remove("topbar"); top.classList.add("xtop"); }
    var tin = clone.querySelector(".topbar-in");
    if (tin) { tin.classList.remove("topbar-in"); tin.classList.add("xtop-in"); }
    var tr = clone.querySelector(".topbar-right");
    if (tr && tr.parentNode) tr.parentNode.removeChild(tr);
    var badge = clone.querySelector(".brand-badge");
    if (badge) { badge.classList.remove("brand-badge"); badge.classList.add("xbadge"); }
    var bn = clone.querySelector(".brand-name");
    if (bn) { bn.classList.remove("brand-name"); bn.classList.add("xbrand"); }
    clone.querySelectorAll(".brand-sub").forEach(function (s) { s.classList.add("xbrand-sub"); });

    /* 阅读容器 */
    var rw = clone.querySelector(".reader-wrap");
    if (rw) { rw.classList.remove("reader-wrap"); rw.classList.add("xreader"); }
    var head = clone.querySelector(".reader-head");
    if (head) { head.classList.remove("reader-head"); head.classList.add("xhead"); }
    var crumb = clone.querySelector(".rcrumb");
    if (crumb) { crumb.classList.remove("rcrumb"); crumb.classList.add("xcrumb"); }
    var stage = clone.querySelector(".annotate-stage");
    if (stage) {
      stage.classList.add("xstage");
      // 纸张底色与荧光改由导出画布分层绘制，故克隆纸张背景透明，让下层荧光透出、文字压在其上
      stage.style.background = "transparent";
    }

    /* 去掉编辑态痕迹（文字保留为删改后的内容） */
    var eb = clone.querySelector(".edit-banner");
    if (eb && eb.parentNode) eb.parentNode.removeChild(eb);
    var cn = clone.querySelector(".chapter-nav");
    if (cn && cn.parentNode) cn.parentNode.removeChild(cn);
    // 保留 .part-toc（本课内容导航），否则克隆正文上移，荧光坐标会与文字错位
    var txt = clone.querySelector(".annotate-text");
    if (txt) { txt.removeAttribute("contenteditable"); txt.classList.remove("editing"); }

    var nav = clone.querySelector(".reader-nav");
    if (nav) { nav.classList.remove("reader-nav"); nav.classList.add("xnav"); }
    clone.querySelectorAll(".rnav-btn").forEach(function (b) {
      b.classList.remove("rnav-btn"); b.classList.add("xnavbtn");
    });
    var nc = clone.querySelector(".rnav-center");
    if (nc) { nc.classList.remove("rnav-center"); nc.classList.add("xnavcenter"); }
    clone.querySelectorAll(".btn-mod-back").forEach(function (b) {
      b.classList.remove("btn-mod-back"); b.classList.add("xpill", "back");
    });
    clone.querySelectorAll(".btn-learn").forEach(function (b) {
      b.classList.remove("btn-learn"); b.classList.add("xpill", "learn");
    });
    return clone;
  }

  function roundRectPath(c, x, y, w, h, r) {
    if (c.roundRect) { c.beginPath(); c.roundRect(x, y, w, h, r); return; }
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  function exportPNG(canvas, container, name) {
    var cssW = container.clientWidth;
    var cssH = Math.max(container.clientHeight, container.scrollHeight);

    var measure = document.createElement("div");
    measure.style.cssText = "position:fixed;left:-99999px;top:0;visibility:hidden;width:" + cssW + "px;";
    measure.innerHTML = "<style>" + EXPORT_CSS + "</style>";
    measure.appendChild(buildClone(container));
    document.body.appendChild(measure);
    var contentH = measure.scrollHeight;
    document.body.removeChild(measure);
    var outH = Math.max(cssH, contentH);

    var wrap = document.createElement("div");
    wrap.innerHTML = "<style>" + EXPORT_CSS + "</style>";
    wrap.appendChild(buildClone(container));
    var svg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="' + cssW + '" height="' + outH + '">' +
      "<foreignObject width='100%' height='100%'>" +
      '<div xmlns="http://www.w3.org/1999/xhtml">' + wrap.innerHTML + "</div>" +
      "</foreignObject></svg>";

    // data URI（非 blob）加载纯内联 SVG，不会污染导出画布
    var url = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
    var img = new Image();
    img.onload = function () {
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      var out = document.createElement("canvas");
      out.width = Math.round(cssW * dpr);
      out.height = Math.round(outH * dpr);
      var octx = out.getContext("2d");
      octx.setTransform(dpr, 0, 0, dpr, 0, 0);
      octx.fillStyle = "#f7f4ec";
      octx.fillRect(0, 0, cssW, outH);

      // 分层：纸卡底色 → 荧光（文字下方）→ 文字/版面（foreignObject）→ 顶层画笔
      var stg = container.querySelector(".annotate-stage");
      var hl0 = container.querySelector("#annotate-hl");
      if (stg) {
        var sr = stg.getBoundingClientRect();
        var sx = sr.left + window.scrollX, sy = sr.top + window.scrollY;
        octx.fillStyle = "#fffdf6";
        roundRectPath(octx, sx, sy, sr.width, sr.height, 14);
        octx.fill();
        if (hl0) {
          octx.drawImage(hl0, sx + 1, sy + 1, stg.clientWidth, stg.clientHeight);
        }
      }
      octx.drawImage(img, 0, 0, cssW, outH);
      var ch = canvas.clientHeight || cssH;
      octx.drawImage(canvas, 0, 0, canvas.clientWidth || cssW, ch);

      var fileName = (name || "article").replace(/[\\/:*?"<>|]/g, "_");
      var a = document.createElement("a");
      a.download = fileName + "-批注.png";
      a.href = out.toDataURL("image/png");
      document.body.appendChild(a);
      a.click();
      a.remove();
    };
    img.onerror = function () {
      alert("导出失败，请重试");
    };
    img.src = url;
  }

  window.AnnotateApp = { mount: mount };
})();
