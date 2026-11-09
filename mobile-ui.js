/* CoachControl mobile shell. Accounting and persistence remain in the v2 modules. */
const icons = {
  home: '<path d="m3 10 9-7 9 7v10H3z"/><path d="M9 20v-7h6v7"/>',
  groups:
    '<circle cx="9" cy="8" r="3"/><path d="M3 20v-3a6 6 0 0 1 12 0v3M17 5a3 3 0 0 1 0 6m1 3a5 5 0 0 1 3 5"/>',
  payments:
    '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M3 10h18m-14 5h4"/>',
  expenses: '<path d="M7 3h10v18l-2-1-3 1-3-1-2 1zM10 8h4m-4 4h4m-4 4h2"/>',
  export: '<path d="M12 3v12m-4-8 4-4 4 4M5 14v6h14v-6"/>',
  backup: '<path d="M4 10a8 8 0 1 1 0 5m0-10v5h5m3-3v5l3 2"/>',
  settings:
    '<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3" fill="white"/><circle cx="16" cy="17" r="3" fill="white"/>',
  pro: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  left: '<path d="m14 5-7 7 7 7"/>',
  right: '<path d="m10 5 7 7-7 7"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  arrow: '<path d="M5 19 19 5M5 5h14v14"/>',
};
const svg = (name) =>
  `<svg viewBox="0 0 24 24" aria-hidden="true">${icons[name] || icons.groups}</svg>`;
let historyPosition = Number(history.state?.position) || 0;
let currentScreen = "home",
  selectedGroupId = null,
  paymentGroupId = null,
  paymentSort = "status",
  drawerOpen = false,
  drawerTimer = null,
  popHandling = false,
  overlayFocus = null;
const screenNames = {
  home: "Обзор финансов",
  groups: "Мои группы",
  payments: "Оплата",
  expenses: "Расходы",
  export: "Экспорт",
  backup: "Резервная копия",
  settings: "Настройки",
  pro: "CoachControl PRO",
  competition: "Соревнования",
  club: "Руководителю",
};
const plural = (n, one, few, many) =>
  n % 10 === 1 && n % 100 !== 11
    ? one
    : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14)
      ? few
      : many;
const activeGroups = () => finance.groups.filter((g) => !g.archived);
const membersOf = (id) =>
  students.filter((s) =>
    finance.profiles.some((p) => p.studentId === s.id && p.groupId === id),
  );
function parseRoute() {
  const [name, groupId] = location.hash.replace(/^#\/?/, "").split("/");
  return {
    screen: name === "group" ? "group" : screenNames[name] ? name : "home",
    groupId: groupId || null,
  };
}
function applyRoute(route) {
  currentScreen = route.screen;
  selectedGroupId = route.groupId;
  if (
    currentScreen === "group" &&
    !finance.groups.some((g) => g.id === selectedGroupId && !g.archived)
  )
    currentScreen = "groups";
  tab =
    currentScreen === "payments"
      ? "Оплата"
      : currentScreen === "expenses"
        ? "Затраты"
        : finance.groups.find((g) => g.id === selectedGroupId)?.name ||
          activeGroups()[0]?.name ||
          "Детская";
  render();
}
function routeURL(screen, groupId) {
  return "#/" + (screen === "group" ? "group/" + groupId : screen);
}
function navigate(screen, groupId = null) {
  closeDrawer(false);
  closeAll();
  closeFinancialModal();
  const next = { screen, groupId };
  if (currentScreen !== screen || selectedGroupId !== groupId) {
    const method = history.state?.overlay ? "replaceState" : "pushState";
    if (method === "pushState") historyPosition++;
    history[method](
      { cc: true, position: historyPosition, ...next },
      "",
      routeURL(screen, groupId),
    );
  } else if (history.state?.overlay)
    history.replaceState(
      { cc: true, position: historyPosition, ...next },
      "",
      routeURL(screen, groupId),
    );
  applyRoute(next);
  window.scrollTo({ top: 0, behavior: "instant" });
  document.getElementById("mainContent").focus({ preventScroll: true });
}
function openGroupByName(name) {
  const g = finance.groups.find(
    (g) => g.name === name || g.aliases?.includes(name),
  );
  if (g) navigate("group", g.id);
}
function setTab(name) {
  if (name === "Оплата") navigate("payments");
  else if (name === "Затраты") navigate("expenses");
  else openGroupByName(name);
}
function updateHeader() {
  document.getElementById("heroTitle").textContent =
    currentScreen === "group"
      ? finance.groups.find((g) => g.id === selectedGroupId)?.name || "Группа"
      : screenNames[currentScreen];
}
function button(parent, text, action, icon = null, cls = "btn") {
  const b = document.createElement("button");
  b.className = cls;
  if (icon) b.innerHTML = svg(icon);
  const span = document.createElement("span");
  span.textContent = text;
  if (cls === "icon-button") span.className = "sr-only";
  b.appendChild(span);
  b.onclick = action;
  parent.appendChild(b);
  return b;
}
function empty(parent, text) {
  const p = document.createElement("div");
  p.className = "empty";
  p.textContent = text;
  parent.appendChild(p);
}
function render() {
  if (!document.getElementById("screenTools")) return;
  updateHeader();
  const isPeople = ["group", "payments"].includes(currentScreen),
    isFinance = ["home", "group", "payments", "expenses", "club"].includes(
      currentScreen,
    );
  document.getElementById("periodBar").classList.toggle("hidden", !isFinance);
  fillMonthSelect(document.getElementById("monthSelect"), monthIndex);
  document.getElementById("yearSelect").value = yearIndex;
  document.getElementById("screenEyebrow").textContent =
    currentScreen === "home"
      ? "ВАШ ТРЕНЕРСКИЙ ПУЛЬТ"
      : currentScreen === "group"
        ? "КОМАНДА И УЧЕНИКИ"
        : "COACHCONTROL";
  document.getElementById("topHint").textContent =
    currentScreen === "home"
      ? "Всё важное. В одном месте."
      : currentScreen === "payments"
        ? "Поступления, долги и история учеников."
        : currentScreen === "groups"
          ? `${activeGroups().length} ${plural(activeGroups().length, "активная группа", "активные группы", "активных групп")}`
          : currentScreen === "expenses"
            ? "Каждая операция под контролем."
            : "";
  document
    .getElementById("studentControls")
    .classList.toggle("hidden", !isPeople);
  document.getElementById("statusChips").classList.remove("hidden");
  document.getElementById("searchWrap").classList.remove("hidden");
  if (document.activeElement !== document.getElementById("searchInput"))
    document.getElementById("searchInput").value = searchText;
  for (const [id, value] of [
    ["chipAll", "all"],
    ["chipPaid", "paid"],
    ["chipUnpaid", "unpaid"],
    ["chipNoShow", "noshow"],
  ]) {
    const el = document.getElementById(id);
    el.classList.toggle("active", groupFilter === value);
    el.setAttribute("aria-pressed", groupFilter === value);
  }
  document
    .getElementById("screenEyebrow")
    .classList.toggle("hidden", currentScreen !== "home");
  const dashboard = document.getElementById("financialDashboard"),
    tools = document.getElementById("screenTools"),
    list = document.getElementById("list");
  dashboard.innerHTML = "";
  tools.innerHTML = "";
  list.innerHTML = "";
  list.className = "students-grid";
  if (currentScreen === "home") renderDashboard();
  else if (currentScreen === "groups") renderGroups(tools, list);
  else if (currentScreen === "group") renderGroup(tools, list);
  else if (currentScreen === "payments") renderPaymentTiles();
  else if (currentScreen === "expenses") renderExpenses();
  else if (currentScreen === "competition") renderCompetition(tools, list);
  else if (currentScreen === "club") renderClubAnalytics(tools, list);
  else renderUtility(tools);
  renderNav();
}
function modeSelect(parent) {
  const select = document.createElement("select");
  select.id = "reportBasis";
  select.className = "report-select";
  select.setAttribute("aria-label", "Режим отчёта");
  select.innerHTML =
    '<option value="cash">По дате получения денег</option><option value="accrual">По периоду начисления</option>';
  select.value = reportBasis;
  select.onchange = () => {
    reportBasis = select.value;
    render();
  };
  parent.appendChild(select);
}
function metric(parent, label, value, cls = "") {
  const el = document.createElement("div");
  el.className = "metric";
  el.innerHTML = `<div class="metric-label">${esc(label)}</div><div class="metric-value ${cls}">${esc(value)}</div>`;
  parent.appendChild(el);
}
function renderDashboard() {
  const box = document.getElementById("financialDashboard"),
    p = periodFor(monthIndex),
    a = Ledger.report(finance, p, "accrual"),
    r = Ledger.report(finance, p, reportBasis);
  modeSelect(box);
  const hero = document.createElement("section");
  hero.className = "metric-hero";
  hero.innerHTML = `<div class="metric-label">Финансовый результат</div><div class="metric-value">${rubles(r.result)}</div><div class="small">${reportBasis === "cash" ? "Получено минус расходы по фактическим датам" : "Назначенные платежи минус расходы за период"}</div>`;
  box.appendChild(hero);
  const grid = document.createElement("div");
  grid.className = "metric-grid";
  metric(grid, "Получено", rubles(r.received));
  metric(grid, "Расходы", rubles(r.expenses));
  metric(grid, "Задолженность", rubles(a.debt), a.debt ? "red" : "");
  metric(grid, "Начислено", rubles(a.charged));
  const verify = document.createElement("div");
  verify.className = "utility-actions";
  button(verify, "Проверить поступления", openReconciliation, "payments", "btn");
  box.appendChild(verify);
  box.appendChild(grid);
  const note = document.createElement("p");
  note.className = "mode-note";
  note.textContent = `${reportBasis === "cash" ? "Получено и расходы — по дате движения денег." : "Получено и расходы — по периоду назначения."} Долг, начисления и статусы — за ${p}.`;
  box.appendChild(note);
  const counts = document.createElement("div");
  counts.className = "count-grid";
  metric(counts, "Оплатили", a.paidCount);
  metric(counts, "С долгом", a.debtCount, a.debtCount ? "red" : "");
  metric(counts, "Не посещают", a.noShowCount);
  box.appendChild(counts);
  const title = document.createElement("div");
  title.className = "section-title";
  title.innerHTML = "<h2>Быстрые действия</h2>";
  box.appendChild(title);
  const quick = document.createElement("div");
  quick.className = "quick-actions";
  button(
    quick,
    "Ученик",
    () => openAdd(),
    "groups",
    "quick-action",
  ).setAttribute("aria-label", "Добавить ученика");
  button(
    quick,
    "Оплата",
    openPaymentPicker,
    "payments",
    "quick-action",
  ).setAttribute("aria-label", "Добавить оплату");
  button(
    quick,
    "Расход",
    () => openExpense(),
    "plus",
    "quick-action",
  ).setAttribute("aria-label", "Добавить расход");
  box.appendChild(quick);
  box.insertBefore(title, grid);
  box.insertBefore(quick, grid);
  const util = document.createElement("div");
  util.className = "utility-actions";
  button(util, "Начислить за период", createPeriodCharges);
  button(util, "Без определённого года", openLegacy);
  button(util, "Заявка на соревнования", () => navigate("competition"));
  button(util, "Статистика клуба", () => navigate("club"));
  box.appendChild(util);
}
function renderGroups(tools, list) {
  button(
    tools,
    "Добавить группу",
    () => openGroupForm(),
    "plus",
    "btn primary",
  );
  list.className = "group-grid";
  if (!activeGroups().length)
    empty(list, "Пока нет групп. Создайте первую команду.");
  for (const g of activeGroups()) {
    const b = document.createElement("button");
    b.className = "group-tile";
    b.dataset.groupId = g.id;
    b.innerHTML = `<span class="group-icon">${svg("groups")}</span><strong>${esc(g.name)}</strong><span class="small">${membersOf(g.id).length} ${plural(membersOf(g.id).length, "ученик", "ученика", "учеников")}</span>`;
    b.onclick = () => navigate("group", g.id);
    list.appendChild(b);
  }
}
function filteredPeople(rows) {
  let arr = rows.filter(matchesSearch);
  if (groupFilter === "paid")
    arr = arr.filter((s) => financialStatus(s).fullyPaid);
  if (groupFilter === "unpaid")
    arr = arr.filter((s) => financialStatus(s).debt > 0);
  if (groupFilter === "noshow")
    arr = arr.filter((s) => financialStatus(s).noShow);
  return arr.sort((a, b) => {
    const rank = (s) =>
      financialStatus(s).debt > 0
        ? 0
        : financialStatus(s).noShow
          ? 1
          : financialStatus(s).fullyPaid
            ? 2
            : 3;
    return (
      (paymentSort === "status" ? rank(a) - rank(b) : 0) ||
      a.name.localeCompare(b.name, "ru")
    );
  });
}
function renderGroup(tools, list) {
  const g = finance.groups.find((g) => g.id === selectedGroupId);
  const toolbar = document.createElement("div");
  toolbar.className = "toolbar";
  button(toolbar, "К группам", () => navigate("groups"), "left");
  button(
    toolbar,
    "Настройки группы",
    () => openGroupForm(g.id),
    "settings",
    "icon-button",
  ).setAttribute("aria-label", "Настройки группы");
  tools.appendChild(toolbar);
  button(
    tools,
    "Добавить ученика",
    () => openAdd(),
    "plus",
    "btn primary",
  ).title = "Добавить";
  document.getElementById("topHint").textContent =
    `${membersOf(g.id).length} ${plural(membersOf(g.id).length, "ученик", "ученика", "учеников")} · ${groupNeedsParent(g.name) ? "Детская группа" : "Спортивная группа"}`;
  renderStudentTiles(filteredPeople(membersOf(g.id)));
}
function renderStudentTiles(arr) {
  const list = document.getElementById("list");
  if (!arr.length) {
    empty(
      list,
      searchText
        ? "Никого не нашли. Попробуйте другое ФИО."
        : "Здесь пока нет учеников с выбранным статусом.",
    );
    return;
  }
  arr.forEach((s) => {
    const b = financialStatus(s),
      profile = finance.profiles.find((p) => p.studentId === s.id),
      g = finance.groups.find((g) => g.id === profile?.groupId);
    const card = document.createElement("button");
    card.className = "tile";
    const age = studentAge(s.birthDate);
    const personalDetails = [
      age === null ? "" : age + " лет",
      s.weightKg == null ? "" : String(s.weightKg).replace(".", ",") + " кг"
    ].filter(Boolean).join(" · ");
    card.innerHTML = `<span class="tile-left"><span class="avatar">${esc(initials(s.name))}</span><span style="min-width:0"><span class="tile-name">${esc(s.name)}</span>${personalDetails ? `<span class="small" style="display:block">${esc(personalDetails)}</span>` : ""}<span class="tile-meta" style="display:block"><span class="badge ${b.fullyPaid ? "paid" : b.debt ? "debt" : "neutral"}">${b.fullyPaid ? "Оплатил" : b.debt ? "Не оплатил" : "Нет начисления"}</span>${b.noShow ? ' <span class="badge absent">Не ходил</span>' : ""}${b.debt ? `<span style="display:block;color:var(--danger)">Долг ${rubles(b.debt)}</span>` : ""}${b.credit ? `<span style="display:block">Переплата ${rubles(b.credit)}</span>` : ""}${currentScreen === "payments" && searchText ? `<span class="small" style="display:block">${esc(g?.name || "")}</span>` : ""}</span></span></span><span class="tile-right">${svg("right")}</span>`;
    bindStudentCard(card, s.id);
    list.appendChild(card);
  });
}
function bindStudentCard(card, id) {
  let timer = null,
    fired = false,
    start = null;
  const clear = () => {
    clearTimeout(timer);
    timer = null;
  };
  card.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    fired = false;
    start = { x: e.clientX, y: e.clientY };
    timer = setTimeout(() => {
      fired = true;
      openSheet(id);
    }, 450);
  });
  card.addEventListener("pointermove", (e) => {
    if (
      start &&
      (Math.abs(e.clientX - start.x) > 10 || Math.abs(e.clientY - start.y) > 10)
    )
      clear();
  });
  for (const event of ["pointerup", "pointercancel", "pointerleave"])
    card.addEventListener(event, clear);
  card.onclick = (e) => {
    clear();
    if (fired) {
      fired = false;
      e.preventDefault();
      return;
    }
    currentScreen === "payments" ? openPaymentActions(id) : openInfo(id);
  };
}
function renderPaymentTiles() {
  const tools = document.getElementById("screenTools");
  modeSelect(tools);
  const rail = document.createElement("div");
  rail.className = "group-rail";
  const gs = activeGroups();
  if (!gs.some((g) => g.id === paymentGroupId))
    paymentGroupId = gs[0]?.id || null;
  const move = (delta) => {
    const i = gs.findIndex((g) => g.id === paymentGroupId);
    paymentGroupId = gs[(i + delta + gs.length) % gs.length]?.id || null;
    render();
    document
      .querySelector(".group-tabs .active")
      ?.scrollIntoView({ block: "nearest", inline: "center" });
  };
  button(rail, "", () => move(-1), "left", "icon-button").setAttribute(
    "aria-label",
    "Предыдущая группа",
  );
  const tabs = document.createElement("div");
  tabs.className = "group-tabs";
  tabs.setAttribute("aria-label", "Группы оплаты");
  for (const g of gs) {
    const b = button(
      tabs,
      g.name,
      () => {
        paymentGroupId = g.id;
        payGroup = g.name;
        render();
      },
      null,
      "pay-subtab" + (paymentGroupId === g.id ? " active" : ""),
    );
    b.setAttribute("aria-pressed", g.id === paymentGroupId);
  }
  rail.appendChild(tabs);
  button(rail, "", () => move(1), "right", "icon-button").setAttribute(
    "aria-label",
    "Следующая группа",
  );
  tools.appendChild(rail);
  const sort = document.createElement("select");
  sort.className = "sort-select";
  sort.id = "paymentSort";
  sort.setAttribute("aria-label", "Сортировка учеников");
  sort.innerHTML =
    '<option value="status">Сначала должники, затем по ФИО</option><option value="name">По ФИО, А–Я</option>';
  sort.value = paymentSort;
  sort.onchange = () => {
    paymentSort = sort.value;
    render();
  };
  tools.appendChild(sort);
  const rows = searchText ? students : membersOf(paymentGroupId);
  if (paymentGroupId)
    payGroup =
      finance.groups.find((g) => g.id === paymentGroupId)?.name || payGroup;
  renderStudentTiles(filteredPeople(rows));
}
function openPaymentActions(id) {
  const s = students.find((s) => s.id === id),
    content = modal(s.name);
  button(
    content,
    "Добавить оплату",
    () => {
      closeFinancialModal();
      openPay(id);
    },
    "plus",
    "btn primary",
  );
  button(content, "История платежей", () => openStudentHistory(id), "backup");
  button(
    content,
    "Карточка ученика",
    () => {
      closeFinancialModal();
      openInfo(id);
    },
    "groups",
  );
}
function renderExpenses() {
  const tools = document.getElementById("screenTools"),
    list = document.getElementById("list");
  modeSelect(tools);
  const report = Ledger.report(finance, periodFor(monthIndex), reportBasis);
  const total = document.createElement("div");
  total.className = "expense-total";
  total.innerHTML = `<div class="metric-label">Всего расходов</div><div class="metric-value">${rubles(report.expenses)}</div>`;
  tools.appendChild(total);
  button(
    tools,
    "Расход",
    () => openExpense(),
    "plus",
    "btn primary",
  ).setAttribute("aria-label", "Добавить расход");
  const groups = new Map();
  expenseRows().forEach((e) => {
    const key = e.category.trim().toLocaleLowerCase("ru");
    const g = groups.get(key) || { name: e.category, total: 0, count: 0 };
    g.total += e.amountCents;
    g.count++;
    groups.set(key, g);
  });
  if (!groups.size) empty(list, "Расходов пока нет. Добавьте первую операцию.");
  for (const [key, g] of [...groups].sort((a, b) => b[1].total - a[1].total)) {
    const b = document.createElement("button");
    b.className = "expense-category tile";
    b.innerHTML = `<span><strong>${esc(g.name)}</strong><span class="small">${g.count} ${plural(g.count, "операция", "операции", "операций")}</span></span><span class="amount">${rubles(g.total)}</span>`;
    b.onclick = () => openExpenseDetails(key, g.name);
    list.appendChild(b);
  }
}
function renderNav() {
  const nav = document.getElementById("bottomNav");
  nav.innerHTML = "";
  for (const [name, label, icon] of [
    ["home", "Главная", "home"],
    ["groups", "Группы", "groups"],
    ["payments", "Оплата", "payments"],
    ["menu", "Меню", "menu"],
  ]) {
    const b = button(
      nav,
      label,
      () => (name === "menu" ? toggleDrawer() : navigate(name)),
      icon,
      "nav-button",
    );
    if (
      currentScreen === name ||
      (name === "groups" && currentScreen === "group")
    )
      b.setAttribute("aria-current", "page");
  }
  document
    .querySelectorAll("[data-drawer-route]")
    .forEach((b) =>
      b.setAttribute(
        "aria-current",
        b.dataset.drawerRoute === currentScreen ? "page" : "false",
      ),
    );
}
function renderUtility(parent) {
  if (currentScreen === "export") {
    const card = document.createElement("div");
    card.className = "card export-option";
    card.innerHTML =
      '<h2>Финансовые операции</h2><p class="small">CSV со всеми новыми платежами, возвратами и расходами. Включает аннулированные операции и их признаки. Старые записи без года доступны в полной резервной копии.</p>';
    button(card, "Скачать CSV", exportCSV, "export", "btn primary");
    parent.appendChild(card);
  } else if (currentScreen === "backup") {
    const card = document.createElement("div");
    card.className = "card export-option";
    card.innerHTML =
      '<h2>Ваши данные — с вами</h2><p class="small">Полный JSON: ученики, архив, операции, история, исходные записи и локальные снимки. Файл не зашифрован — храните его в защищённом месте вне браузера.</p>';
    button(card, "Резервная копия JSON", exportBackup, "backup", "btn primary");
    const warning=document.createElement("p");
    warning.className="small";
    warning.textContent="Если появляется ошибка «The quota has been exceeded», сначала сохраните аварийный JSON во внешние «Файлы», затем освободите место от старых снимков.";
    card.appendChild(warning);
    button(card, "1. Скачать аварийный JSON", exportCompactBackup, "export", "btn primary");
    let usage=null;
    try {usage=dataStore.storageUsage();} catch(error) { /* blocked/private storage must not break the backup screen */ }
    const info=document.createElement("p");info.className="small";
    info.textContent=usage
      ? "Внутренних снимков: "+usage.snapshots+
        " · занимают примерно "+(usage.snapshotsBytes/1024/1024).toFixed(2)+" МиБ"
      : "Доступ к хранилищу ограничен. Попробуйте скачать резервную копию; не очищайте браузер.";
    card.appendChild(info);
    button(card, "2. Освободить место от старых снимков", cleanupOldBackups, "backup", "btn");
    parent.appendChild(card);
  } else if (currentScreen === "pro") {
    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML =
      '<h2>Больше возможностей. Позже.</h2><p class="small">PRO и облачная синхронизация пока не запущены. Сейчас приложение работает локально, без подписки и списаний.</p>';
    parent.appendChild(card);
  } else {
    const section = document.createElement("div");
    section.innerHTML =
      '<div class="settings-row"><strong>Хранение данных</strong><p class="small">Только в этом браузере. Аккаунтов и облачной копии пока нет.</p></div>';
    const privacy = document.createElement("div");
    privacy.className = "settings-row";
    button(privacy, "Резервная копия JSON", () => navigate("backup"), "backup");
    button(privacy, "Архив учеников", openArchive, "groups");
    button(privacy, "Без определённого года", openLegacy, "backup");
    button(privacy, "Журнал изменений", () => openAudit(), "expenses");
    section.appendChild(privacy);
    button(section, "Заблокировать приложение", lockApp, "close");
    parent.appendChild(section);
  }
}
function downloadText(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function exportCSV() {
  const escape = (value) => '"' + String(value ?? "").replace(/"/g, '""') + '"';
  const safe = (value) =>
    /^(?:\s*[=+\-@]|[\t\r\n])/.test(String(value)) ? "'" + value : value;
  const rows = [
    [
      "Тип",
      "ID",
      "Ученик",
      "Группа",
      "Период",
      "Дата",
      "Копейки",
      "Категория",
      "Комментарий",
      "Аннулирован",
    ],
  ];
  finance.payments.forEach((p) =>
    rows.push([
      p.type,
      p.id,
      finance.profiles.find((s) => s.studentId === p.studentId)?.name,
      finance.groups.find((g) => g.id === p.groupId)?.name,
      p.period,
      p.date,
      Ledger.signed(p),
      "",
      "",
      p.voided,
    ]),
  );
  finance.expenses.forEach((e) =>
    rows.push([
      "expense",
      e.id,
      "",
      "",
      e.period,
      e.date,
      e.amountCents,
      e.category,
      e.note,
      e.voided,
    ]),
  );
  downloadText(
    "coachcontrol-operations.csv",
    "\ufeff" +
      rows
        .map((r, i) =>
          r
            .map((v, col) =>
              escape(i > 0 && [2, 3, 7, 8].includes(col) ? safe(v) : v),
            )
            .join(";"),
        )
        .join("\r\n"),
    "text/csv;charset=utf-8",
  );
}
function lockApp() {
  closeDrawer(false);
  closeAll();
  closeFinancialModal();
  document.getElementById("pinInput").value = "";
  document.getElementById("appScreen").classList.add("hidden");
  document.getElementById("pinScreen").classList.remove("hidden");
  document.getElementById("pinInput").focus();
}
function openPaymentPicker() {
  if (!students.length) {
    const c = modal("Сначала добавьте ученика");
    button(
      c,
      "Добавить ученика",
      () => {
        closeFinancialModal();
        openAdd();
      },
      "plus",
      "btn primary",
    );
    return;
  }
  const c = modal("Кому добавить оплату?");
  const input = document.createElement("input");
  input.type = "search";
  input.placeholder = "Поиск по полному ФИО";
  input.setAttribute("aria-label", "Найти ученика для оплаты");
  c.appendChild(input);
  const results = document.createElement("div");
  c.appendChild(results);
  const draw = () => {
    results.innerHTML = "";
    students
      .filter((s) =>
        s.name
          .toLocaleLowerCase("ru")
          .includes(input.value.toLocaleLowerCase("ru")),
      )
      .forEach((s) =>
        button(
          results,
          s.name,
          () => {
            closeFinancialModal();
            openPay(s.id);
          },
          null,
          "btn",
        ),
      );
    if (!results.children.length) empty(results, "Нет совпадений.");
  };
  input.oninput = draw;
  draw();
}
function selectAddGroup(name) {
  const g = activeGroups().find((g) => g.name === name);
  if (!g) return;
  document.getElementById("modalAdd").dataset.addGroup = name;
  document.getElementById("addGroupSelect").value = name;
  document.getElementById("addGroupLabel").textContent = name;
  document
    .getElementById("addParentBox")
    .classList.toggle("hidden", !groupNeedsParent(name));
  document.getElementById("addNameLabel").textContent = groupNeedsParent(name)
    ? "ФИО ученика"
    : "ФИО спортсмена";
}
function openAdd() {
  const gs = activeGroups();
  if (!gs.length) {
    openGroupForm();
    return;
  }
  const preferred =
    gs.find((g) => g.id === selectedGroupId) ||
    gs.find((g) => g.id === paymentGroupId) ||
    gs[0];
  const select = document.getElementById("addGroupSelect");
  select.innerHTML = "";
  gs.forEach((g) => {
    const o = document.createElement("option");
    o.value = g.name;
    o.textContent = g.name;
    select.appendChild(o);
  });
  selectAddGroup(preferred.name);
  document.getElementById("modalAdd").classList.remove("hidden");
}
const mobileOriginalOpenEdit = openEdit;
openEdit = function (id) {
  const select = document.getElementById("editGroup");
  select.innerHTML = "";
  activeGroups().forEach((g) => {
    const o = document.createElement("option");
    o.value = g.name;
    o.textContent = g.name;
    select.appendChild(o);
  });
  mobileOriginalOpenEdit(id);
};
function openGroupForm(id = null) {
  const g = finance.groups.find((g) => g.id === id),
    content = modal(g ? "Настройки группы" : "Новая группа");
  content.innerHTML =
    '<label for="groupName">Название группы</label><input id="groupName" maxlength="80" autocomplete="off" /><label for="groupCoachName">ФИО тренера группы</label><input id="groupCoachName" maxlength="120" autocomplete="off" /><label id="groupParentLabel"><input id="groupRequiresParent" type="checkbox" /> Контакт родителя обязателен</label>';
  document.getElementById("groupName").value = g?.name || "";
  document.getElementById("groupCoachName").value = g?.coachName || "";
  document.getElementById("groupRequiresParent").checked = g
    ? groupNeedsParent(g.name)
    : false;
  if (g) document.getElementById("groupParentLabel").classList.add("hidden");
  button(
    content,
    "Сохранить группу",
    async () => {
      const name = document.getElementById("groupName").value.trim();
      let savedId = id;
      const ok = await financialAction((f) => {
        if (g) {
          Ledger.renameGroup(f, id, name);
          Ledger.setGroupCoach(f, id, document.getElementById("groupCoachName").value);
          const ids = f.profiles
            .filter((p) => p.groupId === id)
            .map((p) => p.studentId);
          students.forEach((s) => {
            if (ids.includes(s.id)) s.group = name;
          });
        } else
          {
            savedId = Ledger.addGroup(
              f,
              name,
              document.getElementById("groupRequiresParent").checked,
            ).id;
            Ledger.setGroupCoach(f, savedId, document.getElementById("groupCoachName").value);
          }
      });
      if (ok) {
        closeFinancialModal();
        navigate("group", savedId);
      }
    },
    null,
    "btn primary",
  );
  if (g)
    button(
      content,
      "Архивировать группу",
      async () => {
        if (
          !confirm(
            "Архивировать группу? Исторические операции сохранятся. Активных учеников нужно предварительно перевести или архивировать.",
          )
        )
          return;
        if (await financialAction((f) => Ledger.archiveGroup(f, id))) {
          closeFinancialModal();
          navigate("groups");
        }
      },
      null,
      "btn danger",
    );
}
function initDrawer() {
  const backdrop = document.createElement("button");
  backdrop.id = "drawerBackdrop";
  backdrop.className = "drawer-backdrop hidden";
  backdrop.setAttribute("aria-label", "Закрыть меню");
  backdrop.onclick = () => closeDrawer();
  document.body.appendChild(backdrop);
  const drawer = document.createElement("aside");
  drawer.id = "drawer";
  drawer.className = "drawer";
  drawer.setAttribute("aria-label", "Меню CoachControl");
  drawer.setAttribute("role", "dialog");
  drawer.setAttribute("aria-modal", "true");
  drawer.setAttribute("aria-hidden", "true");
  drawer.inert = true;
  drawer.innerHTML = `<div class="drawer-head"><div><strong>CoachControl</strong><div class="drawer-kicker">ВАША КОМАНДА. ВАШ КОНТРОЛЬ.</div></div><button class="icon-button" id="drawerClose" aria-label="Закрыть меню">${svg("close")}</button></div><nav class="drawer-links" aria-label="Разделы"></nav><div class="drawer-footer">Меньше рутины. Больше тренерства.<br>Данные хранятся на этом устройстве.</div>`;
  document.body.appendChild(drawer);
  drawer.querySelector("#drawerClose").onclick = () => closeDrawer();
  for (const [route, label] of [
    ["home", "Главная"],
    ["groups", "Группы"],
    ["payments", "Оплата"],
    ["expenses", "Расходы"],
    ["competition", "Соревнования"],
    ["club", "Руководителю"],
    ["export", "Экспорт"],
    ["backup", "Резервная копия"],
    ["settings", "Настройки"],
    ["pro", "PRO"],
  ]) {
    const b = button(
      drawer.querySelector("nav"),
      label,
      () => navigate(route),
      route,
      "drawer-link",
    );
    b.dataset.drawerRoute = route;
    if (route === "pro")
      b.insertAdjacentHTML(
        "beforeend",
        '<span class="pro-label" aria-hidden="true">СКОРО</span>',
      );
  }
  let start = null;
  drawer.addEventListener(
    "touchstart",
    (e) => {
      start = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    },
    { passive: true },
  );
  drawer.addEventListener(
    "touchend",
    (e) => {
      if (
        start &&
        e.changedTouches[0].clientX - start.x < -60 &&
        Math.abs(e.changedTouches[0].clientY - start.y) < 90
      )
        closeDrawer();
      start = null;
    },
    { passive: true },
  );
}
function toggleDrawer() {
  drawerOpen ? closeDrawer() : openDrawer();
}
function openDrawer() {
  clearTimeout(drawerTimer);
  const drawer = document.getElementById("drawer"),
    backdrop = document.getElementById("drawerBackdrop");
  drawerOpen = true;
  drawer.inert = false;
  drawer.classList.remove("closing");
  drawer.classList.add("open");
  drawer.setAttribute("aria-hidden", "false");
  backdrop.classList.remove("hidden");
  requestAnimationFrame(() => {
    if (drawerOpen) backdrop.classList.add("open");
  });
  document.body.classList.add("drawer-open");
  document.getElementById("menuButton").setAttribute("aria-expanded", "true");
}
function closeDrawer(animate = true) {
  if (!document.getElementById("drawer")) return;
  drawerOpen = false;
  document.body.classList.remove("drawer-open");
  document.getElementById("menuButton").setAttribute("aria-expanded", "false");
  const drawer = document.getElementById("drawer"),
    backdrop = document.getElementById("drawerBackdrop");
  drawer.classList.remove("open");
  drawer.classList.add("closing");
  drawer.setAttribute("aria-hidden", "true");
  drawer.inert = true;
  backdrop.classList.remove("open");
  clearTimeout(drawerTimer);
  const finish = () => {
    drawer.classList.remove("closing");
    backdrop.classList.add("hidden");
  };
  if (animate && !matchMedia("(prefers-reduced-motion: reduce)").matches)
    drawerTimer = setTimeout(finish, 240);
  else finish();
}
function visiblePanels() {
  return [
    ...document.querySelectorAll(".modal:not(.hidden),.sheet:not(.hidden)"),
  ];
}
function topPanel() {
  return drawerOpen
    ? document.getElementById("drawer")
    : visiblePanels().at(-1);
}
function enhancePanel(panel) {
  if (!panel) return;
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-modal", "true");
  const title = panel.querySelector("h3,.sheet-title");
  if (title) {
    if (!title.id) title.id = "title-" + crypto.randomUUID();
    panel.setAttribute("aria-labelledby", title.id);
    title.tabIndex = -1;
  }
  if (panel.id !== "drawer" && !panel.querySelector(".panel-close")) {
    const close = document.createElement("button");
    close.className = "panel-close";
    close.setAttribute("aria-label", "Закрыть панель");
    close.innerHTML = svg("close");
    close.onclick = () => dismissPanels();
    panel.querySelector(".modal-card,.sheet-card")?.prepend(close);
  }
  panel
    .querySelectorAll("input:not([type=checkbox]),select")
    .forEach((field) => {
      if (!field.id) field.id = "field-" + crypto.randomUUID();
      if (
        !field.getAttribute("aria-label") &&
        !document.querySelector(`label[for="${field.id}"]`) &&
        !field.closest("label")
      ) {
        let text =
          { payMonthSelect: "Месяц назначения", expMonth: "Месяц расхода" }[
            field.id
          ] ||
          field.previousElementSibling?.textContent ||
          field.placeholder ||
          field.id;
        field.setAttribute("aria-label", text.trim());
      }
      if (
        !field.dataset.labelled &&
        field.type !== "hidden" &&
        !field.disabled &&
        field.type !== "checkbox" &&
        !field.previousElementSibling?.classList.contains("small") &&
        !document.querySelector(`label[for="${field.id}"]`) &&
        !field.closest("label")
      ) {
        const label = document.createElement("label");
        label.className = "field-label";
        label.htmlFor = field.id;
        label.textContent = field.getAttribute("aria-label");
        field.before(label);
        field.dataset.labelled = "true";
      }
    });
}
function dismissPanels() {
  closeAll();
  closeFinancialModal();
  closeDrawer();
}
let observedPanel = null,
  overlaySyncQueued = false;
function syncOverlays() {
  overlaySyncQueued = false;
  const previousFocus = document.activeElement;
  const panel = topPanel();
  document.getElementById("appScreen").inert = drawerOpen;
  document
    .querySelectorAll("#mainContent,.app-header,#bottomNav")
    .forEach((el) => (el.inert = !!panel));
  document
    .querySelectorAll(".modal,.sheet")
    .forEach((p) => (p.inert = p.classList.contains("hidden") || p !== panel));
  if (panel && panel !== observedPanel) {
    overlayFocus = overlayFocus || previousFocus;
    enhancePanel(panel);
    if (!panel.contains(document.activeElement))
      panel
        .querySelector("h3,.sheet-title,button,input")
        ?.focus({ preventScroll: true });
    if (!history.state?.overlay && !popHandling)
      history.pushState(
        {
          cc: true,
          position: ++historyPosition,
          screen: currentScreen,
          groupId: selectedGroupId,
          overlay: true,
        },
        "",
        location.href,
      );
  }
  if (!panel && observedPanel) {
    if (history.state?.overlay && !popHandling)
      history.replaceState(
        {
          cc: true,
          position: historyPosition,
          screen: currentScreen,
          groupId: selectedGroupId,
        },
        "",
        location.href,
      );
    if (
      overlayFocus?.isConnected &&
      !overlayFocus.closest(".hidden") &&
      !overlayFocus.closest("[inert]")
    )
      overlayFocus.focus({ preventScroll: true });
    overlayFocus = null;
  }
  observedPanel = panel;
}
function queueOverlaySync() {
  if (!overlaySyncQueued) {
    overlaySyncQueued = true;
    queueMicrotask(syncOverlays);
  }
}
window.addEventListener("popstate", () => {
  const hadPanel = !!topPanel();
  const next = history.state?.cc ? history.state : parseRoute();
  const nextPosition = Number.isInteger(next.position)
    ? next.position
    : historyPosition - 1;
  const direction = nextPosition < historyPosition ? -1 : 1;
  historyPosition = nextPosition;
  if (
    !hadPanel &&
    next.screen === currentScreen &&
    next.groupId === selectedGroupId
  ) {
    history.go(direction);
    return;
  }
  popHandling = true;
  dismissPanels();
  applyRoute(next);
  history.replaceState(
    {
      cc: true,
      position: historyPosition,
      screen: currentScreen,
      groupId: selectedGroupId,
    },
    "",
    location.href,
  );
  syncOverlays();
  popHandling = false;
});
document.addEventListener("keydown", (e) => {
  const panel = topPanel();
  if (!panel) return;
  if (e.key === "Escape") {
    e.preventDefault();
    dismissPanels();
  }
  if (e.key === "Tab") {
    const nodes = [
      ...panel.querySelectorAll(
        'button,input,select,a[href],summary,[tabindex="0"]',
      ),
    ].filter(
      (el) =>
        !el.disabled && !el.closest(".hidden") && el.getClientRects().length,
    );
    if (!nodes.length) {
      e.preventDefault();
      return;
    }
    const first = nodes[0],
      last = nodes.at(-1);
    if (
      e.shiftKey &&
      (document.activeElement === first ||
        !nodes.includes(document.activeElement))
    ) {
      e.preventDefault();
      last.focus();
    } else if (
      !e.shiftKey &&
      (document.activeElement === last ||
        !nodes.includes(document.activeElement))
    ) {
      e.preventDefault();
      first.focus();
    }
  }
});
// PIN has no account semantics. Unlock always opens the dashboard.
const mobileCheckPin = checkPin;
checkPin = function () {
  mobileCheckPin();
  if (!document.getElementById("appScreen").classList.contains("hidden")) {
    navigate("home");
  }
};
initDrawer();
const initialRoute = parseRoute();
history.replaceState(
  { cc: true, position: historyPosition, ...initialRoute },
  "",
  routeURL(initialRoute.screen, initialRoute.groupId),
);
const uiObserver = new MutationObserver(queueOverlaySync);
uiObserver.observe(document.body, {
  subtree: true,
  childList: true,
  attributes: true,
  attributeFilter: ["class"],
});
// Render the requested location without writing application data.
applyRoute(initialRoute);

// Do not activate an update in the middle of an unsaved form.
if ("serviceWorker" in navigator) {
  navigator.serviceWorker
    .getRegistration()
    .then((reg) => {
      if (!reg) return;
      const notice = () => {
        if (reg.waiting) {
          let message = document.getElementById("updateNotice");
          if (!message) {
            message = document.createElement("div");
            message.id = "updateNotice";
            message.className = "toast";
            message.setAttribute("role", "status");
            message.textContent =
              "Новая версия готова. После сохранения закройте вкладки CoachControl и откройте приложение снова.";
            document.body.appendChild(message);
          }
        }
      };
      notice();
      reg.addEventListener("updatefound", () => {
        reg.installing?.addEventListener("statechange", notice);
      });
    })
    .catch(() => {});
}
document.addEventListener("click", (e) => {
  if (e.target.matches(".modal,.sheet")) dismissPanels();
});
