/* ============================================================
   批注模块（视口画布版，支持任意长页面）
   AnnotateApp.mount(containerEl, {exportName, editKey})
   - 画笔/荧光画布只覆盖纸张当前可视区域，随页面滚动同步移动并重绘；
     笔画一律按整篇（纸张）坐标保存，翻到任何位置都能写、不会被浏览器
     单张画布 32767px 边长上限截断。
   - 工具：画笔/荧光笔/橡皮/选择/删改文字/撤销/重做/清空/导出 PNG
   - 单指书写、双指滚动（鼠标=书写）；选择模式画布穿透可选中复制
   - 导出：整篇按 12000px 一段渲染为高清 PNG（短课仍为单张）
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
     挂载入口：两张画布都放进纸张（stage），随视口移动
     ============================================================ */
  function mount(container, opts) {
    opts = opts || {};
    var stageEl0 = container.querySelector(".annotate-stage");

    var hl = document.createElement("canvas");
    hl.id = "annotate-hl";
    if (stageEl0) stageEl0.insertBefore(hl, stageEl0.firstChild);
    else container.appendChild(hl);

    var canvas = document.createElement("canvas");
    canvas.id = "annotate-canvas";
    if (stageEl0) stageEl0.appendChild(canvas);
    else container.appendChild(canvas);

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
    addBtn("pen", "画笔");
    addBtn("highlight", "荧光笔");
    addBtn("eraser", "橡皮擦");
    addBtn("select", "选择", " active");
    addBtn("edit", "删改文字", " at-edit");

    tb.appendChild(el("span", "at-sep"));

    var sizeWrap = el("label", "at-ctl at-size");
    sizeWrap.title = "粗细";
    sizeWrap.appendChild(el("span", "", "粗细"));
    var range = el("input");
    range.type = "range"; range.min = "1"; range.max = "24"; range.value = "1";
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
     绘图核心（视口画布 + 整篇坐标）
     ============================================================ */
  function initDrawing(canvas, hlCanvas, container, tb, opts) {
    opts = opts || {};
    var exportName = opts.exportName || "article";
    var ctx = canvas.getContext("2d");
    var hlCtx = hlCanvas ? hlCanvas.getContext("2d") : null;
    /* 画布只覆盖一个视口，分辨率固定封顶 2 倍，不会随页面变高而膨胀 */
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var dprA = dpr, dprH = dpr;

    var strokes = [], redoStack = [];
    var SIZE_STORE = "english-annotate-pensize-v1";
    function readPenSize() {
      try { var v = parseInt(localStorage.getItem(SIZE_STORE), 10); if (v >= 1 && v <= 24) return v; } catch (e) {}
      return 1;
    }
    var mode = "select", penSize = readPenSize(), penColor = "#c4453c";
    var drawing = false, current = null;
    var sizeInput = tb.querySelector('[data-ctl="size"]');
    var colorInput = tb.querySelector('[data-ctl="color"]');
    sizeInput.value = penSize;

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
        setMode("select");
      });
      banner.querySelector(".eb-done").addEventListener("click", function () {
        saveEdit(); setMode("select");
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

    /* ---------- 视口几何：画布始终覆盖纸张在屏幕上的可见段 ---------- */
    var view = { x0: 0, y0: 0, x1: 0, y1: 0, w: 1, h: 1, sw: 1, sh: 1 };
    function stageOrigin() {
      var r = stageEl.getBoundingClientRect();
      return { x: r.left + stageEl.clientLeft + window.scrollX,
               y: r.top + stageEl.clientTop + window.scrollY };
    }
    function computeView() {
      var o = stageOrigin();
      var SW = stageEl.clientWidth, SH = stageEl.clientHeight;
      var lx = window.scrollX - o.x, ly = window.scrollY - o.y;
      var x0 = Math.max(0, Math.min(SW, lx));
      var x1 = Math.max(0, Math.min(SW, lx + window.innerWidth));
      var y0 = Math.max(0, Math.min(SH, ly));
      var y1 = Math.max(0, Math.min(SH, ly + window.innerHeight));
      if (x1 <= x0) { x0 = 0; x1 = SW; }
      if (y1 <= y0) { y0 = 0; y1 = Math.min(SH, Math.max(1, window.innerHeight)); }
      view = { x0: x0, y0: y0, x1: x1, y1: y1,
               w: Math.max(1, Math.round(x1 - x0)), h: Math.max(1, Math.round(y1 - y0)),
               sw: SW, sh: SH };
    }
    function placeCanvas(cv, w, h, dd) {
      var pw = Math.round(w * dd), ph = Math.round(h * dd);
      if (cv.width !== pw || cv.height !== ph) { cv.width = pw; cv.height = ph; }
      cv.style.position = "absolute";
      cv.style.right = "auto"; cv.style.bottom = "auto";
      cv.style.left = view.x0 + "px";
      cv.style.top = view.y0 + "px";
      cv.style.width = w + "px";
      cv.style.height = h + "px";
    }
    var lastKey = "";
    function syncCanvasSize() {
      if (!stageEl) return;
      computeView();
      var key = [view.x0, view.y0, view.w, view.h, view.sw, view.sh].join("_");
      placeCanvas(canvas, view.w, view.h, dprA);
      if (hlCanvas) placeCanvas(hlCanvas, view.w, view.h, dprH);
      if (key !== lastKey) { lastKey = key; redraw(); }
    }

    /* ---------- 坐标 / 变换 / 命中 ---------- */
    function getPos(e) {
      var o = stageOrigin();
      return { x: e.clientX + window.scrollX - o.x, y: e.clientY + window.scrollY - o.y };
    }
    function penT() { ctx.setTransform(dprA, 0, 0, dprA, -view.x0 * dprA, -view.y0 * dprA); }
    function hlT() { if (hlCtx) hlCtx.setTransform(dprH, 0, 0, dprH, -view.x0 * dprH, -view.y0 * dprH); }
    function extendBox(s, p) {
      var m = s.size / 2 + 2;
      if (!s.box) s.box = { x0: p.x - m, y0: p.y - m, x1: p.x + m, y1: p.y + m };
      else { s.box.x0 = Math.min(s.box.x0, p.x - m); s.box.y0 = Math.min(s.box.y0, p.y - m);
             s.box.x1 = Math.max(s.box.x1, p.x + m); s.box.y1 = Math.max(s.box.y1, p.y + m); }
    }
    function inView(box) {
      return box && !(box.x1 < view.x0 || box.x0 > view.x1 || box.y1 < view.y0 || box.y0 > view.y1);
    }
    function applyStyle(c2, s, erase) {
      c2.lineWidth = s.size; c2.lineCap = "round"; c2.lineJoin = "round";
      if (erase) { c2.globalCompositeOperation = "destination-out"; c2.strokeStyle = "rgba(0,0,0,1)"; c2.globalAlpha = 1; }
      else {
        c2.globalCompositeOperation = "source-over";
        c2.strokeStyle = s.color;
        c2.globalAlpha = s.type === "highlight" ? 0.5 : 1;
      }
    }
    function trace(c2, s) {
      if (s.points.length < 2) return;
      c2.beginPath();
      c2.moveTo(s.points[0].x, s.points[0].y);
      for (var i = 1; i < s.points.length; i++) c2.lineTo(s.points[i].x, s.points[i].y);
      c2.stroke();
    }
    function redraw() {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (hlCtx) { hlCtx.setTransform(1, 0, 0, 1, 0, 0); hlCtx.clearRect(0, 0, hlCanvas.width, hlCanvas.height); }
      penT(); if (hlCtx) hlT();
      strokes.forEach(function (s) {
        if (s.box && !inView(s.box)) return;
        if (s.type === "highlight") { paintHl(s, false); }
        else if (s.type === "eraser") { paintPen(s, true); paintHl(s, true); }
        else { paintPen(s, false); }
      });
    }
    function paintPen(s, erase) {
      ctx.save(); penT(); applyStyle(ctx, s, erase || s.type === "eraser"); trace(ctx, s); ctx.restore();
    }
    function paintHl(s, erase) {
      if (!hlCtx || !hlCanvas) return;
      hlCtx.save(); hlT(); applyStyle(hlCtx, s, erase || s.type === "eraser"); trace(hlCtx, s); hlCtx.restore();
    }
    /* 增量：每帧只画上一点→当前点 */
    function segPen(s, p0, p1, erase) {
      ctx.save(); penT(); applyStyle(ctx, s, erase || s.type === "eraser");
      ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y); ctx.stroke(); ctx.restore();
    }
    function segHl(s, p0, p1, erase) {
      if (!hlCtx || !hlCanvas) return;
      hlCtx.save(); hlT(); applyStyle(hlCtx, s, erase || s.type === "eraser");
      hlCtx.beginPath(); hlCtx.moveTo(p0.x, p0.y); hlCtx.lineTo(p1.x, p1.y); hlCtx.stroke(); hlCtx.restore();
    }
    function drawSegment(s, p0, p1) {
      if (s.type === "highlight") { segHl(s, p0, p1, false); }
      else if (s.type === "eraser") { segPen(s, p0, p1, true); segHl(s, p0, p1, true); }
      else { segPen(s, p0, p1, false); }
    }
    function setMode(m) {
      mode = m;
      var through = (m === "select" || m === "edit");
      canvas.style.pointerEvents = through ? "none" : "auto";
      canvas.style.cursor = (m === "eraser") ? "cell" : (through ? "text" : "crosshair");
      tb.querySelectorAll(".at-btn[data-action]").forEach(function (b) {
        b.classList.toggle("active", b.getAttribute("data-action") === m);
      });
      setEditing(m === "edit");
    }

    /* ============ 指针：单指书写 / 双指滚动（鼠标=书写） ============ */
    var pointers = new Map();
    var gesture = null;          // 'draw' | 'scroll'
    var drawId = null;
    var lastPt = null, pendingEvt = null, rafId = 0;
    var scrollLastMid = 0, scrollVel = 0, inertiaId = 0;

    function midY() {
      var ys = [];
      pointers.forEach(function (p) { ys.push(p.y); });
      if (ys.length < 2) return null;
      ys.sort(function (a, b) { return a - b; });
      var n = ys.length;
      return n % 2 ? ys[(n - 1) / 2] : (ys[n / 2 - 1] + ys[n / 2]) / 2;
    }
    function stopInertia() { if (inertiaId) { cancelAnimationFrame(inertiaId); inertiaId = 0; } }
    function startInertia(v0) {
      stopInertia();
      var v = v0;
      if (Math.abs(v) < 1.5) return;
      var step = function () {
        if (Math.abs(v) < 0.6) { inertiaId = 0; return; }
        window.scrollBy(0, v);
        v *= 0.92;
        inertiaId = requestAnimationFrame(step);
      };
      inertiaId = requestAnimationFrame(step);
    }
    function beginStroke(e) {
      current = {
        type: mode,
        color: mode === "highlight" ? "#ffe23d" : penColor,
        size: mode === "highlight" ? penSize * 4 : (mode === "eraser" ? penSize * 4 : penSize),
        points: [], box: null
      };
      var p0 = getPos(e);
      current.points.push(p0); extendBox(current, p0);
      strokes.push(current);
      redoStack = [];
      lastPt = p0;
    }
    function cancelCurrentStroke() {
      if (current && strokes[strokes.length - 1] === current) strokes.pop();
      current = null; drawing = false;
      redraw();
    }
    function coalesced(ev) {
      try {
        var list = ev.getCoalescedEvents && ev.getCoalescedEvents();
        if (list && list.length) return list;
      } catch (err) {}
      return [ev];
    }
    function flushDraw() {
      rafId = 0;
      var ev = pendingEvt; pendingEvt = null;
      if (!ev || !current) return;
      var list = coalesced(ev);
      for (var i = 0; i < list.length; i++) {
        var p = getPos(list[i]);
        current.points.push(p); extendBox(current, p);
        drawSegment(current, lastPt, p);
        lastPt = p;
      }
    }
    function finishDraw() {
      if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
      if (pendingEvt && current) {
        var ev = pendingEvt; pendingEvt = null;
        var list = coalesced(ev);
        for (var i = 0; i < list.length; i++) {
          var p = getPos(list[i]);
          current.points.push(p); extendBox(current, p);
          drawSegment(current, lastPt, p);
          lastPt = p;
        }
      }
      drawing = false; current = null; drawId = null; gesture = null;
    }

    canvas.addEventListener("pointerdown", function (e) {
      if (mode === "select" || mode === "edit") return;
      if (e.pointerType === "mouse" && e.button !== 0) return;
      stopInertia();
      try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
      e.preventDefault();
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 1) {
        gesture = "draw"; drawId = e.pointerId; drawing = true;
        beginStroke(e);
      } else if (pointers.size === 2) {
        if (gesture === "draw") { drawId = null; cancelCurrentStroke(); }
        gesture = "scroll";
        scrollLastMid = midY();
        scrollVel = 0;
        if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
        pendingEvt = null;
      }
    });
    canvas.addEventListener("pointermove", function (e) {
      if (!pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (gesture === "scroll" && pointers.size >= 2) {
        var mid = midY();
        if (mid != null) {
          var dy = scrollLastMid - mid;
          if (dy) { window.scrollBy(0, dy); scrollVel = dy; }
          scrollLastMid = mid;
        }
        e.preventDefault();
      } else if (gesture === "draw" && e.pointerId === drawId) {
        pendingEvt = e;
        if (!rafId) rafId = requestAnimationFrame(flushDraw);
        e.preventDefault();
      }
    });
    function endPointer(e) {
      var was = gesture;
      if (was === "draw" && e.pointerId === drawId) {
        finishDraw();
      }
      pointers.delete(e.pointerId);
      if (was === "scroll") {
        if (pointers.size === 0) {
          gesture = null;
          startInertia(scrollVel);
        }
      }
      try { canvas.releasePointerCapture && canvas.releasePointerCapture(e.pointerId); } catch (err) {}
    }
    canvas.addEventListener("pointerup", endPointer);
    canvas.addEventListener("pointercancel", endPointer);

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
        case "export": exportPNG(); break;
      }
    }
    tb.addEventListener("annotate-action", onAction);
    sizeInput.addEventListener("input", function () {
      penSize = parseInt(sizeInput.value, 10) || 1;
      try { localStorage.setItem(SIZE_STORE, String(penSize)); } catch (e) {}
    });
    colorInput.addEventListener("input", function () { penColor = colorInput.value; });

    /* 滚动 / 尺寸变化：移动视口画布并重绘可见段 */
    var scrollRaf = 0;
    function onScroll() {
      if (scrollRaf) return;
      scrollRaf = requestAnimationFrame(function () { scrollRaf = 0; syncCanvasSize(); });
    }
    window.addEventListener("scroll", onScroll, { passive: true });

    var ro = null;
    if (window.ResizeObserver) {
      ro = new ResizeObserver(function () { syncCanvasSize(); });
      ro.observe(container);
      if (stageEl) ro.observe(stageEl);
    }
    window.addEventListener("resize", syncCanvasSize);
    setTimeout(syncCanvasSize, 60);
    setTimeout(syncCanvasSize, 400);
    syncCanvasSize();
    setMode("select");

    /* ============ 导出：整篇分片高清 PNG ============ */
    var SLICE = 12000;   // 每片 CSS 像素高度（×dpr2 后 24000px，低于浏览器 32767 上限）

    function loadSVG(svg) {
      return new Promise(function (resolve, reject) {
        var img = new Image();
        img.onload = function () { resolve(img); };
        img.onerror = function () { reject(new Error("svg load error")); };
        img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
      });
    }
    function traceTo(c2, s, erase) {
      if (s.points.length < 2) return;
      applyStyle(c2, s, erase);
      c2.beginPath();
      c2.moveTo(s.points[0].x, s.points[0].y);
      for (var i = 1; i < s.points.length; i++) c2.lineTo(s.points[i].x, s.points[i].y);
      c2.stroke();
    }
    /* 把某一层（pen / highlight）在 [oy, oy+oh] 段内的笔画（含橡皮擦拭）画到离屏画布 */
    function renderLayer(c2, dd, oy, oh, cssW, kind) {
      function hit(s) {
        var b = s.box;
        if (!b) return true;
        return !(b.y1 < oy || b.y0 > oy + oh || b.x1 < 0 || b.x0 > cssW);
      }
      c2.setTransform(dd, 0, 0, dd, 0, -oy * dd);
      strokes.forEach(function (s) {
        if (!hit(s)) return;
        if (kind === "pen" && s.type === "pen") traceTo(c2, s, false);
        if (kind === "hl" && s.type === "highlight") traceTo(c2, s, false);
      });
      c2.globalCompositeOperation = "destination-out";
      strokes.forEach(function (s) {
        if (s.type === "eraser" && hit(s)) traceTo(c2, s, true);
      });
      c2.globalCompositeOperation = "source-over";
    }
    function download(url, fname) {
      var a = document.createElement("a");
      a.download = fname; a.href = url;
      document.body.appendChild(a); a.click(); a.remove();
    }
    function exportPNG() {
      var cssW = container.clientWidth;
      var cssH = Math.max(container.clientHeight, container.scrollHeight);

      var clone = buildClone(container);
      /* 测量整篇高度 */
      var measure = document.createElement("div");
      measure.style.cssText = "position:fixed;left:-99999px;top:0;visibility:hidden;width:" + cssW + "px;";
      measure.innerHTML = "<style>" + EXPORT_CSS + "</style>";
      measure.appendChild(clone);
      document.body.appendChild(measure);
      var contentH = measure.scrollHeight;
      document.body.removeChild(measure);
      var outH = Math.max(cssH, contentH);

      var inner = "<style>" + EXPORT_CSS + "</style>" + clone.outerHTML;
      var o = stageOrigin();
      var sW = stageEl.clientWidth, sH = stageEl.clientHeight;

      var ranges = [];
      for (var y = 0; y < outH; y += SLICE) ranges.push([y, Math.min(SLICE, outH - y)]);
      var total = ranges.length;
      if (total > 1) {
        alert("本篇较长，将连续下载 " + total + " 张高清 PNG（按从上到下顺序）；若浏览器询问是否允许下载多个文件，请点“允许”。");
      }

      var dd = Math.min(window.devicePixelRatio || 1, 2);
      var safeName = (exportName || "article").replace(/[\\/:*?"<>|]/g, "_");

      /* 整篇矢量只构造/排版一次，再按片用 drawImage 源矩形裁剪，
         避免每片都对超长克隆重新排版导致卡死 */
      var fullSvg =
        '<svg xmlns="http://www.w3.org/2000/svg" width="' + cssW + '" height="' + outH + '">' +
        "<foreignObject width='100%' height='100%'>" +
        '<div xmlns="http://www.w3.org/1999/xhtml" style="width:' + cssW + 'px;">' + inner + "</div>" +
        "</foreignObject></svg>";

      loadSVG(fullSvg).then(function (img) {
        /* 在导出按钮的同一次用户手势内连续触发下载，浏览器才允许多文件；
           每张的文件名在其 click 时即与内容绑定，编号即段落顺序 */
        ranges.forEach(function (rg, idx) {
          var sh0 = rg[0], sh = rg[1];
          var out = document.createElement("canvas");
          out.width = Math.round(cssW * dd);
          out.height = Math.round(sh * dd);
          var x = out.getContext("2d");
          x.setTransform(dd, 0, 0, dd, 0, -sh0 * dd);
          x.fillStyle = "#f7f4ec";
          x.fillRect(-2, sh0, cssW + 4, sh);
          /* 纸卡底（整条圆角矩形，画布自然裁出本片相交段） */
          x.fillStyle = "#fffdf6";
          roundRectPath(x, o.x, o.y, sW, sH, 14);
          x.fill();
          /* 荧光层（文字下方） */
          var hcv = document.createElement("canvas");
          hcv.width = out.width; hcv.height = out.height;
          renderLayer(hcv.getContext("2d"), dd, sh0, sh, cssW, "hl");
          x.drawImage(hcv, 0, sh0, cssW, sh);
          /* 版面原文：从整篇矢量源裁剪本片 */
          x.drawImage(img, 0, sh0, cssW, sh, 0, sh0, cssW, sh);
          /* 顶层画笔 */
          var pcv = document.createElement("canvas");
          pcv.width = out.width; pcv.height = out.height;
          renderLayer(pcv.getContext("2d"), dd, sh0, sh, cssW, "pen");
          x.drawImage(pcv, 0, sh0, cssW, sh);

          var fname = total === 1
            ? safeName + "-批注.png"
            : safeName + "-批注-" + String(idx + 1).padStart(2, "0") + "of" + String(total).padStart(2, "0") + ".png";
          download(out.toDataURL("image/png"), fname);
        });
      }).catch(function () { alert("导出失败，请重试"); });
    }

    return {
      destroy: function () {
        try { setEditing(false); } catch (e) {}
        tb.removeEventListener("annotate-action", onAction);
        window.removeEventListener("resize", syncCanvasSize);
        window.removeEventListener("scroll", onScroll);
        if (ro) ro.disconnect();
      }
    };
  }

  /* ============================================================
     导出克隆样式与克隆构造（保真排版）
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
      stage.style.background = "transparent";
    }

    /* 去掉编辑态痕迹（文字保留为删改后的内容） */
    var eb = clone.querySelector(".edit-banner");
    if (eb && eb.parentNode) eb.parentNode.removeChild(eb);
    var cn = clone.querySelector(".chapter-nav");
    if (cn && cn.parentNode) cn.parentNode.removeChild(cn);
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

  window.AnnotateApp = { mount: mount };
})();
