/* ============================================================
 * 就活ナビ — 大学生のための就職活動 情報収集・管理ツール
 * 依存ライブラリなし。データは localStorage に保存。
 * ============================================================ */
(function () {
  "use strict";

  const STORAGE_KEY = "shukatsu-navi.v1";

  // 選考ステータスの定義（順序がファネル表示の順になる）
  const STATUSES = [
    { key: "気になる",   color: "#64748b", bg: "#f1f5f9" },
    { key: "エントリー", color: "#0891b2", bg: "#cffafe" },
    { key: "ES提出",     color: "#2563eb", bg: "#dbeafe" },
    { key: "書類通過",   color: "#7c3aed", bg: "#ede9fe" },
    { key: "一次面接",   color: "#c026d3", bg: "#fae8ff" },
    { key: "二次面接",   color: "#db2777", bg: "#fce7f3" },
    { key: "最終面接",   color: "#d97706", bg: "#fef3c7" },
    { key: "内定",       color: "#16a34a", bg: "#dcfce7" },
    { key: "お見送り",   color: "#dc2626", bg: "#fee2e2" },
    { key: "辞退",       color: "#6b7280", bg: "#e5e7eb" },
  ];
  const REVIEW_CATEGORIES = ["選考体験", "社風・雰囲気", "待遇・福利厚生", "成長環境", "その他"];

  /* ---------- 状態管理 ---------- */
  let state = load();

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) {
      console.warn("データ読み込みに失敗しました", e);
    }
    return { companies: [], tasks: [], reviews: [] };
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      toast("保存に失敗しました（容量制限の可能性）");
    }
  }

  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  /* ---------- ユーティリティ ---------- */
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  function el(tag, attrs = {}, children = []) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "class") node.className = v;
      else if (k === "html") node.innerHTML = v;
      else if (k === "text") node.textContent = v;
      else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2), v);
      else if (v !== null && v !== undefined && v !== false) node.setAttribute(k, v);
    }
    (Array.isArray(children) ? children : [children]).forEach((c) => {
      if (c == null) return;
      node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    });
    return node;
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
    );
  }

  function statusMeta(key) {
    return STATUSES.find((s) => s.key === key) || STATUSES[0];
  }

  function stars(n) {
    n = Math.max(0, Math.min(5, Number(n) || 0));
    return "★".repeat(n) + "☆".repeat(5 - n);
  }

  function daysUntil(dateStr) {
    if (!dateStr) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const d = new Date(dateStr + "T00:00:00");
    return Math.round((d - today) / 86400000);
  }

  function formatDue(dateStr) {
    const d = daysUntil(dateStr);
    if (d === null) return { text: "", cls: "" };
    if (d < 0) return { text: `${dateStr}（${-d}日超過）`, cls: "overdue" };
    if (d === 0) return { text: `${dateStr}（本日）`, cls: "soon" };
    if (d <= 3) return { text: `${dateStr}（あと${d}日）`, cls: "soon" };
    return { text: `${dateStr}（あと${d}日）`, cls: "" };
  }

  let toastTimer = null;
  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (t.hidden = true), 2600);
  }

  function companyName(id) {
    const c = state.companies.find((c) => c.id === id);
    return c ? c.name : "（不明な企業）";
  }

  /* ============================================================
   * テーマ（ダーク / ライト）
   * ============================================================ */
  const THEME_KEY = "shukatsu-navi.theme";
  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    const btn = $("#themeToggle");
    if (btn) btn.textContent = theme === "dark" ? "☀️" : "🌙";
  }
  function initTheme() {
    let theme = localStorage.getItem(THEME_KEY);
    if (!theme) {
      theme = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }
    applyTheme(theme);
  }
  $("#themeToggle").addEventListener("click", () => {
    const next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
    localStorage.setItem(THEME_KEY, next);
    applyTheme(next);
  });
  initTheme();

  /* ============================================================
   * タブ切り替え
   * ============================================================ */
  $("#tabs").addEventListener("click", (e) => {
    const btn = e.target.closest(".tabs__btn");
    if (!btn) return;
    $$(".tabs__btn").forEach((b) => b.classList.toggle("is-active", b === btn));
    const tab = btn.dataset.tab;
    $$(".panel").forEach((p) => p.classList.toggle("is-active", p.id === "panel-" + tab));
    renderAll();
  });

  /* ============================================================
   * ダッシュボード
   * ============================================================ */
  function renderDashboard() {
    const c = state.companies;
    const active = c.filter((x) => !["お見送り", "辞退"].includes(x.status));
    const offers = c.filter((x) => x.status === "内定");
    const pendingTasks = state.tasks.filter((t) => !t.done);

    const stats = [
      { num: c.length, label: "登録企業数" },
      { num: active.length, label: "選考中" },
      { num: offers.length, label: "内定" },
      { num: pendingTasks.length, label: "未完了タスク" },
      { num: state.reviews.length, label: "口コミ件数" },
    ];
    $("#dashStats").innerHTML = stats
      .map((s) => `<div class="stat"><div class="stat__num">${s.num}</div><div class="stat__label">${esc(s.label)}</div></div>`)
      .join("");

    // 直近の予定（タスク締切 + 企業の次アクション日）
    const events = [];
    state.tasks.filter((t) => !t.done && t.dueDate).forEach((t) =>
      events.push({ date: t.dueDate, label: t.title, sub: t.companyId ? companyName(t.companyId) : "タスク" })
    );
    c.filter((x) => x.nextDate).forEach((x) =>
      events.push({ date: x.nextDate, label: x.nextAction || "次のアクション", sub: x.name })
    );
    events.sort((a, b) => a.date.localeCompare(b.date));
    const upcoming = events.filter((e) => { const d = daysUntil(e.date); return d !== null && d <= 7; });

    const ul = $("#dashUpcoming");
    if (upcoming.length === 0) {
      ul.innerHTML = `<li><span>7日以内の予定はありません</span></li>`;
    } else {
      ul.innerHTML = upcoming
        .map((e) => {
          const f = formatDue(e.date);
          return `<li><span>${esc(e.label)}<br><small style="color:var(--text-muted)">${esc(e.sub)}</small></span><span class="when ${f.cls}">${esc(f.text)}</span></li>`;
        })
        .join("");
    }

    // ファネル
    const counts = {};
    STATUSES.forEach((s) => (counts[s.key] = 0));
    c.forEach((x) => { if (counts[x.status] != null) counts[x.status]++; });
    const max = Math.max(1, ...Object.values(counts));
    $("#dashFunnel").innerHTML = STATUSES.filter((s) => counts[s.key] > 0)
      .map((s) => {
        const w = Math.round((counts[s.key] / max) * 100);
        return `<div class="funnel__row"><span class="funnel__label">${esc(s.key)}</span><span class="funnel__bar" style="width:${w}%;background:${s.color}"></span><span class="funnel__count">${counts[s.key]}</span></div>`;
      })
      .join("") || `<p class="card__text">まだ選考データがありません。</p>`;
  }

  /* ============================================================
   * 企業・求人
   * ============================================================ */
  function renderCompanyFilters() {
    const sel = $("#companyFilterStatus");
    const cur = sel.value;
    sel.innerHTML = `<option value="">すべての選考状況</option>` +
      STATUSES.map((s) => `<option value="${esc(s.key)}">${esc(s.key)}</option>`).join("");
    sel.value = cur;
  }

  function getFilteredCompanies() {
    const q = $("#companySearch").value.trim().toLowerCase();
    const status = $("#companyFilterStatus").value;
    const sort = $("#companySort").value;
    let list = state.companies.slice();
    if (q) {
      list = list.filter((c) =>
        [c.name, c.industry, c.jobType, c.location, c.memo].some((f) => (f || "").toLowerCase().includes(q))
      );
    }
    if (status) list = list.filter((c) => c.status === status);
    if (sort === "name") list.sort((a, b) => a.name.localeCompare(b.name, "ja"));
    else if (sort === "updated") list.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    else list.sort((a, b) => (b.interest || 0) - (a.interest || 0));
    return list;
  }

  function companyCard(c, withStatusSelect) {
    const m = statusMeta(c.status);
    const badge = el("span", { class: "badge", style: `background:${m.bg};color:${m.color}` }, c.status || "未設定");

    const rows = [];
    if (c.jobType) rows.push(el("div", { class: "company__row", html: `<b>職種:</b> ${esc(c.jobType)}` }));
    if (c.location) rows.push(el("div", { class: "company__row", html: `<b>勤務地:</b> ${esc(c.location)}` }));
    if (c.interest) rows.push(el("div", { class: "company__row", html: `<b>関心度:</b> <span class="stars">${stars(c.interest)}</span>` }));
    if (c.nextDate) {
      const f = formatDue(c.nextDate);
      rows.push(el("div", { class: "company__row", html: `<b>次の予定:</b> ${esc(c.nextAction || "")} <span class="when ${f.cls}">${esc(f.text)}</span>` }));
    }
    if (c.url) rows.push(el("div", { class: "company__row", html: `<b>URL:</b> <a class="link" href="${esc(c.url)}" target="_blank" rel="noopener">${esc(c.url)}</a>` }));
    if (c.memo) rows.push(el("div", { class: "company__memo", text: c.memo }));

    let actions;
    if (withStatusSelect) {
      const select = el("select", { class: "input", onchange: (e) => updateStatus(c.id, e.target.value) },
        STATUSES.map((s) => el("option", { value: s.key, selected: s.key === c.status }, s.key)));
      actions = el("div", { class: "company__actions" }, [select]);
    } else {
      actions = el("div", { class: "company__actions" }, [
        el("button", { class: "btn btn--primary", onclick: () => openResearchModal(c) }, "🔍 リサーチ"),
        el("button", { class: "btn", onclick: () => openCompanyModal(c) }, "編集"),
        el("button", { class: "btn btn--danger", onclick: () => deleteCompany(c.id) }, "削除"),
      ]);
    }

    return el("div", { class: "company" }, [
      el("div", { class: "company__head" }, [
        el("div", {}, [
          el("h3", { class: "company__name", text: c.name }),
          c.industry ? el("div", { class: "company__industry", text: c.industry }) : null,
        ]),
        badge,
      ]),
      ...rows,
      actions,
    ]);
  }

  function renderCompanies() {
    renderCompanyFilters();
    const grid = $("#companyGrid");
    const list = getFilteredCompanies();
    grid.innerHTML = "";
    list.forEach((c) => grid.appendChild(companyCard(c, false)));
    $("#companyEmpty").hidden = state.companies.length !== 0;
  }

  function renderSelectionBoard() {
    const board = $("#selectionBoard");
    board.innerHTML = "";
    const list = state.companies.slice().sort((a, b) => (b.interest || 0) - (a.interest || 0));
    if (list.length === 0) {
      board.innerHTML = `<p class="empty">企業を登録すると、ここで選考ステータスを管理できます。</p>`;
      return;
    }
    list.forEach((c) => board.appendChild(companyCard(c, true)));
  }

  function updateStatus(id, status) {
    const c = state.companies.find((x) => x.id === id);
    if (!c) return;
    c.status = status;
    c.updatedAt = Date.now();
    save();
    renderAll();
    toast(`${c.name} を「${status}」に更新しました`);
  }

  function deleteCompany(id) {
    const c = state.companies.find((x) => x.id === id);
    if (!c) return;
    if (!confirm(`「${c.name}」を削除しますか？\n関連する口コミ・タスクのひも付けも解除されます。`)) return;
    state.companies = state.companies.filter((x) => x.id !== id);
    state.reviews = state.reviews.filter((r) => r.companyId !== id);
    state.tasks.forEach((t) => { if (t.companyId === id) t.companyId = ""; });
    save();
    renderAll();
    toast("削除しました");
  }

  /* ============================================================
   * スケジュール・タスク
   * ============================================================ */
  function renderTasks() {
    const list = $("#taskList");
    const hideDone = $("#hideDoneTasks").checked;
    let tasks = state.tasks.slice().sort((a, b) => {
      if (a.done !== b.done) return a.done ? 1 : -1;
      return (a.dueDate || "9999").localeCompare(b.dueDate || "9999");
    });
    if (hideDone) tasks = tasks.filter((t) => !t.done);

    list.innerHTML = "";
    tasks.forEach((t) => {
      const f = formatDue(t.dueDate);
      const cls = "task" + (t.done ? " is-done" : f.cls === "overdue" ? " is-overdue" : f.cls === "soon" ? " is-soon" : "");
      const metaParts = [];
      if (t.type) metaParts.push(t.type);
      if (t.companyId) metaParts.push(companyName(t.companyId));
      list.appendChild(
        el("li", { class: cls }, [
          el("input", { type: "checkbox", checked: t.done, onchange: () => toggleTask(t.id) }),
          el("div", { class: "task__main" }, [
            el("div", { class: "task__title", text: t.title }),
            metaParts.length ? el("div", { class: "task__meta", text: metaParts.join(" ・ ") }) : null,
          ]),
          t.dueDate ? el("span", { class: "task__due " + f.cls, text: f.text }) : null,
          el("button", { class: "icon-btn", title: "編集", onclick: () => openTaskModal(t) }, "✎"),
          el("button", { class: "icon-btn", title: "削除", onclick: () => deleteTask(t.id) }, "🗑"),
        ])
      );
    });
    $("#taskEmpty").hidden = state.tasks.length !== 0;
  }

  function toggleTask(id) {
    const t = state.tasks.find((x) => x.id === id);
    if (!t) return;
    t.done = !t.done;
    save();
    renderTasks();
    renderDashboard();
  }

  function deleteTask(id) {
    state.tasks = state.tasks.filter((x) => x.id !== id);
    save();
    renderTasks();
    renderDashboard();
  }

  /* ============================================================
   * 口コミ
   * ============================================================ */
  function renderReviewFilters() {
    const sel = $("#reviewFilterCompany");
    const cur = sel.value;
    sel.innerHTML = `<option value="">すべての企業</option>` +
      state.companies.map((c) => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join("");
    sel.value = cur;
  }

  function renderReviews() {
    renderReviewFilters();
    const companyId = $("#reviewFilterCompany").value;
    const cat = $("#reviewFilterCategory").value;
    let list = state.reviews.slice().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    if (companyId) list = list.filter((r) => r.companyId === companyId);
    if (cat) list = list.filter((r) => r.category === cat);

    const wrap = $("#reviewList");
    wrap.innerHTML = "";
    list.forEach((r) => {
      wrap.appendChild(
        el("div", { class: "review" }, [
          el("div", { class: "review__head" }, [
            el("span", { class: "review__company", text: companyName(r.companyId) }),
            el("span", {}, [
              r.category ? el("span", { class: "review__cat", text: r.category }) : null,
              el("span", { class: "stars", text: " " + stars(r.rating) }),
            ]),
          ]),
          el("div", { class: "review__text", text: r.text }),
          el("div", { class: "review__meta" }, [
            el("span", { text: r.author ? `投稿者: ${r.author}` : "投稿者: 匿名" }),
            el("span", {}, [
              el("span", { text: r.createdAt ? new Date(r.createdAt).toLocaleDateString("ja-JP") : "" }),
              el("button", { class: "icon-btn", title: "削除", onclick: () => deleteReview(r.id) }, " 🗑"),
            ]),
          ]),
        ])
      );
    });
    $("#reviewEmpty").hidden = list.length !== 0;
  }

  function deleteReview(id) {
    state.reviews = state.reviews.filter((r) => r.id !== id);
    save();
    renderReviews();
    renderDashboard();
  }

  /* ============================================================
   * モーダル / フォーム
   * ============================================================ */
  const modal = $("#modal");
  function openModal(title, fields, onSubmit) {
    $("#modalTitle").textContent = title;
    const form = $("#modalForm");
    form.innerHTML = "";

    fields.forEach((f) => {
      const label = el("label", {}, [document.createTextNode(f.label)]);
      let input;
      if (f.type === "textarea") {
        input = el("textarea", { name: f.name, rows: f.rows || 3, placeholder: f.placeholder || "" });
        input.value = f.value || "";
      } else if (f.type === "select") {
        input = el("select", { name: f.name },
          f.options.map((o) => el("option", { value: o.value, selected: String(o.value) === String(f.value) }, o.label)));
      } else {
        input = el("input", { type: f.type || "text", name: f.name, placeholder: f.placeholder || "", value: f.value != null ? f.value : "" });
        if (f.required) input.required = true;
        if (f.min != null) input.min = f.min;
        if (f.max != null) input.max = f.max;
      }
      label.appendChild(input);
      form.appendChild(label);
    });

    const actions = el("div", { class: "form__actions" }, [
      el("button", { type: "button", class: "btn", onclick: closeModal }, "キャンセル"),
      el("button", { type: "submit", class: "btn btn--primary" }, "保存"),
    ]);
    form.appendChild(actions);

    form.onsubmit = (e) => {
      e.preventDefault();
      const data = {};
      new FormData(form).forEach((v, k) => (data[k] = typeof v === "string" ? v.trim() : v));
      onSubmit(data);
      closeModal();
    };

    modal.hidden = false;
    const first = form.querySelector("input, textarea, select");
    if (first) first.focus();
  }

  function closeModal() { modal.hidden = true; }
  modal.addEventListener("click", (e) => { if (e.target.hasAttribute("data-close")) closeModal(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !modal.hidden) closeModal(); });

  const statusOptions = STATUSES.map((s) => ({ value: s.key, label: s.key }));

  function openCompanyModal(existing) {
    const c = existing || {};
    openModal(existing ? "企業を編集" : "企業を追加", [
      { name: "name", label: "企業名 *", required: true, value: c.name, placeholder: "〇〇株式会社" },
      { name: "industry", label: "業界", value: c.industry, placeholder: "IT・通信 / 金融 / メーカー など" },
      { name: "jobType", label: "職種", value: c.jobType, placeholder: "総合職 / エンジニア など" },
      { name: "location", label: "勤務地", value: c.location, placeholder: "東京 など" },
      { name: "status", label: "選考ステータス", type: "select", options: statusOptions, value: c.status || "気になる" },
      { name: "interest", label: "関心度（1〜5）", type: "number", min: 0, max: 5, value: c.interest != null ? c.interest : 3 },
      { name: "url", label: "求人・企業ページURL", value: c.url, placeholder: "https://…" },
      { name: "nextAction", label: "次のアクション", value: c.nextAction, placeholder: "ES締切 / 一次面接 など" },
      { name: "nextDate", label: "次のアクション日", type: "date", value: c.nextDate },
      { name: "memo", label: "メモ", type: "textarea", rows: 3, value: c.memo, placeholder: "志望理由、選考フロー、気づきなど" },
    ], (data) => {
      data.interest = Number(data.interest) || 0;
      if (existing) {
        Object.assign(existing, data, { updatedAt: Date.now() });
      } else {
        state.companies.push({ id: uid(), ...data, createdAt: Date.now(), updatedAt: Date.now() });
      }
      save();
      renderAll();
      toast(existing ? "更新しました" : "企業を追加しました");
    });
  }

  function openTaskModal(existing) {
    const t = existing || {};
    const companyOpts = [{ value: "", label: "（企業に紐付けない）" }]
      .concat(state.companies.map((c) => ({ value: c.id, label: c.name })));
    openModal(existing ? "タスクを編集" : "タスクを追加", [
      { name: "title", label: "タスク名 *", required: true, value: t.title, placeholder: "ES提出 / 説明会参加 など" },
      { name: "type", label: "種別", type: "select", value: t.type || "その他",
        options: ["説明会", "ES締切", "Webテスト", "面接", "OB/OG訪問", "その他"].map((x) => ({ value: x, label: x })) },
      { name: "companyId", label: "関連企業", type: "select", options: companyOpts, value: t.companyId || "" },
      { name: "dueDate", label: "期日", type: "date", value: t.dueDate },
      { name: "memo", label: "メモ", type: "textarea", rows: 2, value: t.memo },
    ], (data) => {
      if (existing) {
        Object.assign(existing, data);
      } else {
        state.tasks.push({ id: uid(), done: false, ...data, createdAt: Date.now() });
      }
      save();
      renderTasks();
      renderDashboard();
      toast(existing ? "更新しました" : "タスクを追加しました");
    });
  }

  function openReviewModal() {
    if (state.companies.length === 0) {
      toast("先に企業を登録してください");
      return;
    }
    const companyOpts = state.companies.map((c) => ({ value: c.id, label: c.name }));
    openModal("口コミを追加", [
      { name: "companyId", label: "企業 *", type: "select", options: companyOpts, value: companyOpts[0].value },
      { name: "category", label: "カテゴリ", type: "select", value: "選考体験",
        options: REVIEW_CATEGORIES.map((x) => ({ value: x, label: x })) },
      { name: "rating", label: "評価（1〜5）", type: "number", min: 1, max: 5, value: 3 },
      { name: "text", label: "内容 *", type: "textarea", rows: 4, required: true, placeholder: "選考の雰囲気、聞かれた質問、社風など" },
      { name: "author", label: "情報源・投稿者", value: "", placeholder: "先輩 / 説明会 / 匿名 など" },
    ], (data) => {
      data.rating = Number(data.rating) || 0;
      state.reviews.push({ id: uid(), ...data, createdAt: Date.now() });
      save();
      renderReviews();
      renderDashboard();
      toast("口コミを追加しました");
    });
  }

  /* ============================================================
   * 企業リサーチ（情報収集の入口を自動生成）
   * 各サイトへ自動アクセス（スクレイピング）はせず、企業名から
   * 主要な検索／口コミ／選考体験サイトへのリンクを組み立てて開く。
   * ============================================================ */
  function researchLinks(c) {
    const name = c.name;
    const enc = (s) => encodeURIComponent(s);
    const g = (q) => "https://www.google.com/search?q=" + enc(q);
    const gnews = (q) => "https://news.google.com/search?q=" + enc(q) + "&hl=ja&gl=JP&ceid=JP:ja";

    return [
      {
        group: "🏢 公式・採用情報",
        links: [
          { label: c.url ? "登録済みの企業ページ" : "公式サイト・採用ページを探す", url: c.url || g(`${name} 採用 公式サイト`) },
          { label: "新卒採用・募集要項", url: g(`${name} 新卒採用 募集要項 ${(new Date().getFullYear() + 1)}`) },
          { label: "マイナビ／リクナビで探す", url: g(`${name} site:job.mynavi.jp OR site:job.rikunabi.com`) },
        ],
      },
      {
        group: "💬 口コミ・評判",
        links: [
          { label: "OpenWork（社員口コミ）", url: "https://www.openwork.jp/company_list?src_str=" + enc(name) },
          { label: "ライトハウス（en）で評判", url: g(`${name} site:en-hyouban.com`) },
          { label: "評判・口コミ全般", url: g(`${name} 評判 口コミ 就職 ホワイト ブラック`) },
        ],
      },
      {
        group: "📝 選考体験（ES・面接）",
        links: [
          { label: "ONE CAREER 選考体験記", url: g(`${name} site:onecareer.jp`) },
          { label: "みんなの就職活動日記", url: g(`${name} みんなの就職活動日記 体験記`) },
          { label: "ES例・面接の質問", url: g(`${name} ES 例文 面接 質問 選考フロー`) },
        ],
      },
      {
        group: "🔎 企業研究",
        links: [
          { label: "最新ニュース（Googleニュース）", url: gnews(name) },
          { label: "平均年収・待遇", url: g(`${name} 平均年収 初任給 残業`) },
          { label: "業界・競合・シェア", url: g(`${name} 競合 業界 シェア 強み 弱み`) },
          { label: "IR・有価証券報告書", url: g(`${name} IR 有価証券報告書 業績`) },
        ],
      },
    ];
  }

  function openResearchModal(c) {
    const groups = researchLinks(c);
    const wrap = el("div", { class: "research" }, [
      el("p", { class: "research__lead", text: `「${c.name}」について調べる入口です。各リンクは新しいタブで開きます。` }),
      ...groups.map((grp) =>
        el("div", { class: "research__group" }, [
          el("h4", { class: "research__group-title", text: grp.group }),
          el("div", { class: "research__links" },
            grp.links.map((lk) =>
              el("a", { class: "research__link", href: lk.url, target: "_blank", rel: "noopener noreferrer" }, lk.label)
            )
          ),
        ])
      ),
    ]);
    openInfoModal(`🔍 企業リサーチ — ${c.name}`, wrap);
  }

  // フォームを伴わない汎用モーダル（リサーチ結果などの表示用）
  function openInfoModal(title, contentNode) {
    $("#modalTitle").textContent = title;
    const form = $("#modalForm");
    form.innerHTML = "";
    form.onsubmit = (e) => e.preventDefault();
    form.appendChild(contentNode);
    form.appendChild(
      el("div", { class: "form__actions" }, [
        el("button", { type: "button", class: "btn btn--primary", onclick: closeModal }, "閉じる"),
      ])
    );
    modal.hidden = false;
  }

  /* ============================================================
   * データ取込 / 管理
   * ============================================================ */
  const IMPORT_FORMAT = `[
  {
    "name": "サンプル株式会社",        // 企業名（必須）
    "industry": "IT・通信",            // 業界
    "jobType": "ソフトウェアエンジニア",
    "location": "東京",
    "status": "気になる",              // 選考ステータス
    "interest": 4,                     // 関心度 1〜5
    "url": "https://example.com/jobs",
    "nextAction": "本エントリー",
    "nextDate": "2026-07-01",          // YYYY-MM-DD
    "memo": "自由記述メモ"
  }
]`;

  function sampleData() {
    const today = new Date();
    const d = (offset) => {
      const x = new Date(today);
      x.setDate(x.getDate() + offset);
      return x.toISOString().slice(0, 10);
    };
    const companies = [
      { name: "テックフロンティア株式会社", industry: "IT・通信", jobType: "ソフトウェアエンジニア", location: "東京", status: "一次面接", interest: 5, url: "https://example.com/techfrontier", nextAction: "一次面接", nextDate: d(3), memo: "自社プロダクト開発。技術面接あり。逆質問を準備する。" },
      { name: "みらい総合商社", industry: "商社", jobType: "総合職", location: "東京", status: "ES提出", interest: 4, url: "https://example.com/mirai", nextAction: "ES締切", nextDate: d(1), memo: "ガクチカ400字。OB訪問済み。" },
      { name: "さくら銀行", industry: "金融", jobType: "総合職", location: "大阪", status: "書類通過", interest: 3, url: "", nextAction: "Webテスト", nextDate: d(5), memo: "玉手箱形式。" },
      { name: "グリーンエナジー製作所", industry: "メーカー", jobType: "技術職", location: "名古屋", status: "気になる", interest: 4, url: "https://example.com/greenenergy", nextAction: "説明会", nextDate: d(8), memo: "脱炭素領域に注力。研究内容と親和性高い。" },
      { name: "ヘルスケアラボ", industry: "医療・ヘルスケア", jobType: "企画職", location: "福岡", status: "内定", interest: 4, url: "", nextAction: "内定承諾期限", nextDate: d(14), memo: "第一志望群。給与・配属を確認。" },
    ];
    const reviews = [
      { _companyName: "テックフロンティア株式会社", category: "選考体験", rating: 4, text: "一次面接は和やか。技術より人物重視で、チーム開発の経験を深掘りされた。", author: "サークルの先輩" },
      { _companyName: "みらい総合商社", category: "社風・雰囲気", rating: 5, text: "若手にも裁量があり、海外駐在のチャンスが多いと聞いた。体育会系の雰囲気。", author: "OB訪問" },
      { _companyName: "さくら銀行", category: "待遇・福利厚生", rating: 3, text: "福利厚生は手厚いが、転勤が多め。住宅補助はしっかりしている。", author: "説明会" },
    ];
    return { companies, reviews };
  }

  function normalizeCompany(obj) {
    if (!obj || !obj.name) return null;
    const validStatus = STATUSES.some((s) => s.key === obj.status) ? obj.status : "気になる";
    return {
      id: uid(),
      name: String(obj.name),
      industry: obj.industry || "",
      jobType: obj.jobType || obj.job_type || "",
      location: obj.location || "",
      status: validStatus,
      interest: Math.max(0, Math.min(5, Number(obj.interest) || 3)),
      url: obj.url || "",
      nextAction: obj.nextAction || "",
      nextDate: obj.nextDate || "",
      memo: obj.memo || "",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  }

  function importCompanies(arr) {
    if (!Array.isArray(arr)) throw new Error("配列(JSON array)を指定してください");
    let added = 0;
    arr.forEach((o) => {
      const c = normalizeCompany(o);
      if (!c) return;
      // 同名企業は重複登録しない
      if (state.companies.some((x) => x.name === c.name)) return;
      state.companies.push(c);
      added++;
    });
    return added;
  }

  function loadSample() {
    const { companies, reviews } = sampleData();
    const added = importCompanies(companies);
    // 口コミは企業名から企業IDを解決
    let revAdded = 0;
    reviews.forEach((r) => {
      const company = state.companies.find((c) => c.name === r._companyName);
      if (!company) return;
      state.reviews.push({ id: uid(), companyId: company.id, category: r.category, rating: r.rating, text: r.text, author: r.author, createdAt: Date.now() });
      revAdded++;
    });
    // サンプルタスク
    if (state.tasks.length === 0) {
      const mirai = state.companies.find((c) => c.name === "みらい総合商社");
      const tech = state.companies.find((c) => c.name === "テックフロンティア株式会社");
      const d = (o) => { const x = new Date(); x.setDate(x.getDate() + o); return x.toISOString().slice(0, 10); };
      if (mirai) state.tasks.push({ id: uid(), title: "みらい総合商社 ESを提出", type: "ES締切", companyId: mirai.id, dueDate: d(1), done: false, memo: "ガクチカ・志望動機", createdAt: Date.now() });
      if (tech) state.tasks.push({ id: uid(), title: "テックフロンティア 一次面接", type: "面接", companyId: tech.id, dueDate: d(3), done: false, memo: "オンライン", createdAt: Date.now() });
    }
    save();
    renderAll();
    toast(`サンプルを読み込みました（企業${added}件・口コミ${revAdded}件）`);
  }

  function doExport() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = el("a", { href: url, download: `shukatsu-navi-${new Date().toISOString().slice(0, 10)}.json` });
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast("エクスポートしました");
  }

  /* ---------- CSV（Excel / スプレッドシート連携） ---------- */
  const CSV_COLUMNS = ["name", "industry", "jobType", "location", "status", "interest", "url", "nextAction", "nextDate", "memo"];

  function csvCell(v) {
    const s = String(v == null ? "" : v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function doExportCsv() {
    if (state.companies.length === 0) { toast("書き出す企業がありません"); return; }
    const rows = [CSV_COLUMNS.join(",")];
    state.companies.forEach((c) => rows.push(CSV_COLUMNS.map((k) => csvCell(c[k])).join(",")));
    // 先頭に BOM を付けて Excel での文字化けを防ぐ
    const blob = new Blob(["﻿" + rows.join("\r\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = el("a", { href: url, download: `shukatsu-navi-companies-${new Date().toISOString().slice(0, 10)}.csv` });
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast(`${state.companies.length}件をCSVで書き出しました`);
  }

  // 簡易CSVパーサ（カンマ区切り・ダブルクォート対応・改行込みセル対応）
  function parseCSV(text) {
    const rows = [];
    let row = [], cell = "", inQuotes = false;
    text = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (inQuotes) {
        if (ch === '"') {
          if (text[i + 1] === '"') { cell += '"'; i++; }
          else inQuotes = false;
        } else cell += ch;
      } else if (ch === '"') inQuotes = true;
      else if (ch === ",") { row.push(cell); cell = ""; }
      else if (ch === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
      else cell += ch;
    }
    if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
    return rows.filter((r) => r.some((c) => c.trim() !== ""));
  }

  function importCSV(text) {
    const rows = parseCSV(text);
    if (rows.length < 2) throw new Error("ヘッダー行とデータ行が必要です");
    const header = rows[0].map((h) => h.trim());
    const objs = rows.slice(1).map((r) => {
      const o = {};
      header.forEach((h, i) => { if (h) o[h] = (r[i] || "").trim(); });
      return o;
    });
    return importCompanies(objs);
  }

  function doImportFile(file) {
    const reader = new FileReader();
    const isCsv = /\.csv$/i.test(file.name);
    reader.onload = () => {
      try {
        if (isCsv) {
          const n = importCSV(String(reader.result));
          save();
          renderAll();
          toast(`CSVから${n}件の企業を取り込みました`);
          return;
        }
        const data = JSON.parse(reader.result);
        if (!data.companies && !Array.isArray(data)) throw new Error("形式が不正です");
        if (Array.isArray(data)) {
          const n = importCompanies(data);
          save();
          renderAll();
          toast(`${n}件の企業を取り込みました`);
        } else {
          if (!confirm("バックアップを復元すると、現在のデータは上書きされます。続行しますか？")) return;
          state = {
            companies: Array.isArray(data.companies) ? data.companies : [],
            tasks: Array.isArray(data.tasks) ? data.tasks : [],
            reviews: Array.isArray(data.reviews) ? data.reviews : [],
          };
          save();
          renderAll();
          toast("復元しました");
        }
      } catch (e) {
        toast("読み込みに失敗しました: " + e.message);
      }
    };
    reader.readAsText(file);
  }

  /* ============================================================
   * イベント配線
   * ============================================================ */
  $("#addCompanyBtn").addEventListener("click", () => openCompanyModal(null));
  $("#addTaskBtn").addEventListener("click", () => openTaskModal(null));
  $("#addReviewBtn").addEventListener("click", () => openReviewModal());

  ["companySearch", "companyFilterStatus", "companySort"].forEach((id) =>
    $("#" + id).addEventListener("input", renderCompanies));
  $("#hideDoneTasks").addEventListener("change", renderTasks);
  ["reviewFilterCompany", "reviewFilterCategory"].forEach((id) =>
    $("#" + id).addEventListener("change", renderReviews));

  $("#loadSampleBtn").addEventListener("click", loadSample);
  $("#showImportFormatBtn").addEventListener("click", () => {
    const pre = $("#importFormatHelp");
    if (pre.hidden) { pre.textContent = IMPORT_FORMAT; pre.hidden = false; }
    else pre.hidden = true;
  });
  $("#importJsonBtn").addEventListener("click", () => {
    const raw = $("#importJson").value.trim();
    if (!raw) { toast("JSONまたはCSVを入力してください"); return; }
    // JSON（[ や { で始まる）か CSV かを自動判定
    const isJson = raw[0] === "[" || raw[0] === "{";
    try {
      const n = isJson ? importCompanies(JSON.parse(raw)) : importCSV(raw);
      save();
      renderAll();
      $("#importJson").value = "";
      toast(`${n}件の企業を取り込みました（重複・名称なしは除外）`);
    } catch (e) {
      toast((isJson ? "JSON" : "CSV") + "の解析に失敗しました: " + e.message);
    }
  });
  $("#exportCsvBtn").addEventListener("click", doExportCsv);
  $("#exportBtn").addEventListener("click", doExport);
  $("#importFile").addEventListener("change", (e) => {
    if (e.target.files[0]) doImportFile(e.target.files[0]);
    e.target.value = "";
  });
  $("#resetBtn").addEventListener("click", () => {
    if (!confirm("すべてのデータを削除します。元に戻せません。よろしいですか？")) return;
    state = { companies: [], tasks: [], reviews: [] };
    save();
    renderAll();
    toast("全データを削除しました");
  });

  /* ============================================================
   * 描画
   * ============================================================ */
  function renderAll() {
    renderDashboard();
    renderCompanies();
    renderSelectionBoard();
    renderTasks();
    renderReviews();
  }

  renderAll();
})();
