/* Existing visual components, now backed by the versioned accounting ledger. */
const Ledger = CoachFinance;
let reportBasis = "accrual",
  financialEditPaymentId = null,
  financialExpenseId = null;
const periodFor = (mi) =>
  `${String(yearIndex).padStart(4, "0")}-${String(mi + 1).padStart(2, "0")}`;
const rubles = (cents) =>
  (cents / 100).toLocaleString("ru-RU", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }) + " ₽";
const localDate = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
function changeYear(value) {
  const y = Number(value);
  if (!Number.isInteger(y) || y < 1 || y > 9999) {
    alert("Год должен быть от 1 до 9999.");
    document.getElementById("yearSelect").value = yearIndex;
    return;
  }
  yearIndex = y;
  render();
}
function formPeriod(year, month) {
  const p = `${String(Number(year)).padStart(4, "0")}-${String(Number(month) + 1).padStart(2, "0")}`;
  if (!Ledger.period(p)) throw Error("Укажите корректный год и месяц.");
  return p;
}
function financialStatus(s, mi = monthIndex) {
  return Ledger.balance(finance, s.id, periodFor(mi));
}
function monthStatusValue(s, mi) {
  const b = financialStatus(s, mi);
  return b.fullyPaid ? b.paid / 100 : b.noShow ? -1 : 0;
}
function getPaymentEntry(s, mi) {
  const b = financialStatus(s, mi);
  return { amount: b.paid / 100, date: "", debt: b.debt, noShow: b.noShow };
}
function incomeForMonth(mi, group = null) {
  const g = finance.groups.find((g) => g.name === group);
  return (
    Ledger.report(finance, periodFor(mi), reportBasis, g ? g.id : null)
      .received / 100
  );
}
function expensesForMonth(mi) {
  return Ledger.report(finance, periodFor(mi), reportBasis).expenses / 100;
}
function renderDashboard() {
  const period = periodFor(monthIndex),
    a = Ledger.report(finance, period, "accrual"),
    c = Ledger.report(finance, period, "cash");
  document.getElementById("yearSelect").value = yearIndex;
  const box = document.getElementById("financialDashboard");
  box.innerHTML = `<b>${esc(period)}</b><div class="small">По периоду начисления: начислено ${rubles(a.charged)} • назначено оплат (за вычетом возвратов) ${rubles(a.received)} • долг ${rubles(a.debt)} • расходы ${rubles(a.expenses)} • результат ${rubles(a.result)}</div><div class="small">По дате движения денег: получено (за вычетом возвратов) ${rubles(c.received)} • расходы ${rubles(c.expenses)} • результат ${rubles(c.result)}</div><div class="small">По начислениям: оплатили ${a.paidCount} • с долгом ${a.debtCount} • не ходили ${a.noShowCount} (независимый статус)</div><select id="reportBasis" aria-label="Основание списка операций"><option value="accrual">Списки по периоду назначения</option><option value="cash">Списки по дате движения денег</option></select>`;
  box.querySelector("select").value = reportBasis;
  box.querySelector("select").onchange = (e) => {
    reportBasis = e.target.value;
    render();
  };
}
function render() {
  updateHeader();
  renderDashboard();
  const list = document.getElementById("list");
  list.innerHTML = "";
  if (tab === "Оплата") {
    renderPaymentTiles();
    return;
  }
  if (tab === "Затраты") {
    renderExpenses();
    return;
  }
  let arr = students.filter((s) => s.group === tab).filter(matchesSearch);
  if (groupFilter === "paid")
    arr = arr.filter((s) => financialStatus(s).fullyPaid);
  if (groupFilter === "unpaid")
    arr = arr.filter((s) => financialStatus(s).debt > 0);
  if (groupFilter === "noshow")
    arr = arr.filter((s) => financialStatus(s).noShow);
  renderStudentTiles(arr);
}
function renderStudentTiles(arr) {
  const list = document.getElementById("list");
  if (!arr.length) {
    const empty = document.createElement("div");
    empty.className = "card";
    empty.style.gridColumn = "1 / -1";
    empty.textContent = "Ничего не найдено. Добавьте ученика «＋».";
    list.appendChild(empty);
    return;
  }
  arr.forEach((s) => {
    const b = financialStatus(s);
    const tile = document.createElement("div");
    tile.className = "tile";
    tile.innerHTML = `<div class="tile-left"><div class="avatar">${esc(initials(s.name))}</div><div style="min-width:0"><div class="tile-name">${esc(s.name)}</div><div class="small">${b.charged === 0 ? "Нет начисления" : b.debt ? "Долг " + rubles(b.debt) : "Оплатил"}${b.credit ? " • Переплата " + rubles(b.credit) : ""}${b.noShow ? " • Не ходил" : ""}</div></div></div><div class="tile-right"><span class="dot ${b.fullyPaid ? "green" : b.debt ? "red" : "yellow"}" title="${esc(b.debt ? "Долг " + rubles(b.debt) : "Нет долга")}"></span><span class="chev">›</span></div>`;
    attachLongPress(tile, s.id);
    list.appendChild(tile);
  });
}
function renderPaymentTiles() {
  const list = document.getElementById("list"),
    bar = document.createElement("div");
  bar.className = "grid-header";
  bar.innerHTML =
    '<div class="small">Группа:</div><div class="pay-subtabs"></div>';
  list.appendChild(bar);
  finance.groups
    .filter((g) => ["Детская", "Взрослая", "Женская"].includes(g.name))
    .forEach((g) => {
      const b = document.createElement("button");
      b.className = "pay-subtab" + (g.name === payGroup ? " active" : "");
      b.textContent = g.name;
      b.onclick = () => {
        payGroup = g.name;
        render();
      };
      bar.lastChild.appendChild(b);
    });
  const g = finance.groups.find((g) => g.name === payGroup),
    report = Ledger.report(finance, periodFor(monthIndex), reportBasis, g?.id);
  const summary = document.createElement("div");
  summary.className = "grid-header";
  summary.textContent = `${payGroup}: ${reportBasis === "cash" ? "по дате денег" : "по периоду назначения"} ${rubles(report.received)}. Поиск фильтрует карточки, а не итоги.`;
  list.appendChild(summary);
  const rows = students
    .filter((s) => s.group === payGroup)
    .filter(matchesSearch);
  for (const [title, filter] of [
    ["Оплатили", (s) => financialStatus(s).fullyPaid],
    ["Не оплатили", (s) => financialStatus(s).debt > 0],
    ["Не ходили", (s) => financialStatus(s).noShow],
    ["Нет начисления", (s) => financialStatus(s).charged === 0],
  ]) {
    const arr = rows.filter(filter);
    const h = document.createElement("div");
    h.className = "grid-header";
    h.textContent = `${title} • ${arr.length} чел.`;
    list.appendChild(h);
    renderStudentTiles(arr);
  }
}
async function financialAction(action) {
  try {
    const next = Ledger.copy(finance);
    action(next);
    Ledger.validate(next);
    finance = next;
    return await save();
  } catch (error) {
    const prior = dataStore.snapshot();
    finance = prior.finance;
    students = prior.students;
    expenses = prior.expenses;
    alert(error.message);
    return false;
  }
}
async function createPeriodCharges() {
  const p = periodFor(monthIndex);
  if (
    !confirm(
      `Начислить тарифы активным ученикам за ${p}? Существующие начисления не меняются.`,
    )
  )
    return;
  await financialAction((f) =>
    students.forEach((s) => Ledger.ensureCharge(f, s.id, p)),
  );
  render();
}
const originalOpenInfo = openInfo;
openInfo = function (id) {
  originalOpenInfo(id);
  const s = students.find((s) => s.id === id);
  if (!s) return;
  const b = financialStatus(s);
  document.getElementById("infoStatusBadge").className =
    "status " + (b.debt ? "bad" : b.fullyPaid ? "ok" : "warn");
  document.getElementById("infoStatusBadge").textContent =
    `Начислено ${rubles(b.charged)} • Оплаты ${rubles(b.paid)} • Долг ${rubles(b.debt)}${b.credit ? " • Переплата " + rubles(b.credit) : ""}${b.noShow ? " • Не ходил" : ""}`;
  let btn = document.getElementById("studentHistoryBtn");
  if (!btn) {
    btn = document.createElement("button");
    btn.id = "studentHistoryBtn";
    btn.className = "btn";
    btn.textContent = "История всех платежей";
    document.querySelector("#modalInfo .modal-card").appendChild(btn);
  }
  btn.onclick = () => openStudentHistory(id);
};
function onPayTypeChange() {
  const custom = document.getElementById("payAmountSelect").value === "custom";
  document.getElementById("customPayBox").classList.toggle("hidden", !custom);
  document
    .getElementById("refundSourceBox")
    .classList.toggle(
      "hidden",
      document.getElementById("payOperation").value !== "refund",
    );
}
function selectRefundSource() {
  const p = finance.payments.find(
    (p) => p.id === document.getElementById("refundSource").value,
  );
  if (p) {
    document.getElementById("payYear").value = Number(p.period.slice(0, 4));
    document.getElementById("payMonthSelect").value =
      Number(p.period.slice(5)) - 1;
  }
}
function openPay(id) {
  if (!finance.profiles.some((s) => s.studentId === id)) return;
  payId = id;
  financialEditPaymentId = null;
  const profile = finance.profiles.find((s) => s.studentId === id);
  document.getElementById("payPrompt").textContent =
    profile.name + " • Добавление новой операции (не замена прошлых оплат)";
  fillMonthSelect(document.getElementById("payMonthSelect"), monthIndex);
  document.getElementById("payYear").value = yearIndex;
  document.getElementById("payDateInput").value = localDate();
  const currentStudent = students.find((s) => s.id === id);
  const currentRate = currentStudent?.rateCents ?? 300000;
  const rateSelect = document.getElementById("payAmountSelect");
  const rateValue = String(currentRate / 100);
  rateSelect.value = [...rateSelect.options].some((option) => option.value === rateValue)
    ? rateValue : "custom";
  document.getElementById("payCustomInput").value =
    rateSelect.value === "custom" ? (currentRate / 100).toFixed(2) : "";

  document.getElementById("payReason").value = "";
  document.getElementById("rememberRate").checked = false;
  document.getElementById("payOperation").disabled = false;
  document.getElementById("payOperation").value = "payment";
  document.getElementById("refundSource").disabled = false;
  const source = document.getElementById("refundSource");
  source.innerHTML = "";
  finance.payments
    .filter((p) => p.studentId === id && !p.voided && p.type === "payment")
    .forEach((p) => {
      const o = document.createElement("option");
      o.value = p.id;
      o.textContent = `${p.period} • ${p.date} • ${rubles(p.amountCents)}`;
      source.appendChild(o);
    });
  onPayTypeChange();
  document.getElementById("modalPay").classList.remove("hidden");
}
function editPayment(id) {
  const p = finance.payments.find((p) => p.id === id);
  openPay(p.studentId);
  financialEditPaymentId = id;
  document.getElementById("payPrompt").textContent =
    "Исправление операции. Укажите причину; прежние значения останутся в журнале.";
  document.getElementById("payOperation").value = p.type;
  document.getElementById("payOperation").disabled = true;
  document.getElementById("refundSource").value = p.refundOf || "";
  document.getElementById("refundSource").disabled = true;
  document.getElementById("payYear").value = Number(p.period.slice(0, 4));
  document.getElementById("payMonthSelect").value =
    Number(p.period.slice(5)) - 1;
  document.getElementById("payDateInput").value = p.date;
  document.getElementById("payAmountSelect").value = "custom";
  document.getElementById("payCustomInput").value = (
    p.amountCents / 100
  ).toFixed(2);
  onPayTypeChange();
}
function openRefund(id) {
  const p = finance.payments.find((p) => p.id === id);
  openPay(p.studentId);
  document.getElementById("payOperation").value = "refund";
  document.getElementById("refundSource").value = id;
  document.getElementById("payAmountSelect").value = "custom";
  selectRefundSource();
  onPayTypeChange();
}
async function applyPay() {
  try {
    const studentId = payId,
      p = formPeriod(
        document.getElementById("payYear").value,
        document.getElementById("payMonthSelect").value,
      ),
      kind = document.getElementById("payAmountSelect").value;
    const operation = document.getElementById("payOperation").value,
      when = document.getElementById("payDateInput").value;
    const amountCents = ["-1", "0", "attended"].includes(kind)
      ? 0
      : Ledger.cents(
          kind === "custom"
            ? document.getElementById("payCustomInput").value
            : kind,
        );
    if (
      financialEditPaymentId &&
      !confirm(
        "Сохранить исправление с сохранением прежних значений в журнале?",
      )
    )
      return;
    const rememberedStudent = students.find((s) => s.id === studentId);
    if (
      !financialEditPaymentId &&
      rememberedStudent &&
      document.getElementById("rememberRate").checked &&
      [150000, 200000, 250000, 300000].includes(amountCents)
    )
      rememberedStudent.rateCents = amountCents;
    const currentStudent = students.find((s) => s.id === studentId);
    const oldCharge = finance.charges.find(
      (c) => c.studentId === studentId && c.period === p,
    );
    const alignCharge =
      !financialEditPaymentId &&
      operation === "payment" &&
      amountCents > 0 &&
      oldCharge &&
      currentStudent &&
      oldCharge.amountCents !== currentStudent.rateCents &&
      amountCents === currentStudent.rateCents &&
      confirm(
        `У ученика тариф ${rubles(currentStudent.rateCents)}, но за ${p} ранее начислено ${rubles(oldCharge.amountCents)}. Исправить начисление на ${rubles(currentStudent.rateCents)}? Изменение сохранится в журнале.`,
      );
    if (!financialEditPaymentId && operation === "payment" && amountCents > 0) {
      const matching = finance.payments.filter((entry) =>
        !entry.voided && entry.type === "payment" && entry.studentId === studentId &&
        entry.period === p && entry.date === when && entry.amountCents === amountCents,
      );
      const previousBalance = Ledger.balance(finance, studentId, p);
      if (
        matching.length &&
        !confirm("Такой платёж уже записан: " + rubles(amountCents) +
          ", " + when + ". Добавить ещё один отдельный платёж? Отмена сохранит прежние данные.")
      ) return;
      if (
        !matching.length && previousBalance.charged > 0 && previousBalance.fullyPaid &&
        !confirm("За этот месяц ученик уже оплатил начисление. Вы уверены, что получили ещё " +
          rubles(amountCents) + "? Это увеличит поступления и переплату.")
      ) return;
    }
    const ok = await financialAction((f) => {
      if (alignCharge) {
        Ledger.correctCharge(
          f, studentId, p, currentStudent.rateCents,
          "Подтверждённое исправление начисления по выбранному тарифу",
        );
      }
      if (financialEditPaymentId) {
        if (!amountCents)
          throw Error("Для исправления нужна положительная сумма.");
        Ledger.correctPayment(
          f,
          financialEditPaymentId,
          { amountCents, date: when, period: p },
          document.getElementById("payReason").value,
        );
      } else if (kind === "-1" || kind === "attended")
        Ledger.setAttendance(
          f,
          studentId,
          p,
          kind === "-1" ? "no-show" : "attended",
        );
      else if (kind === "0") {
        Ledger.ensureCharge(f, studentId, p);
        if (Ledger.balance(f, studentId, p).fullyPaid)
          throw Error(
            "Статус рассчитан по операциям. Исправьте ошибочную оплату в истории.",
          );
      } else {
        if (operation === "payment") Ledger.ensureCharge(f, studentId, p);
        Ledger.addPayment(f, {
          studentId,
          period: p,
          date: when,
          amountCents,
          type: operation,
          refundOf: document.getElementById("refundSource").value,
        });
      }
    });
    if (ok) {
      yearIndex = Number(p.slice(0, 4));
      monthIndex = Number(p.slice(5)) - 1;
      closePay();
      closeFinancialModal();
      render();
    }
  } catch (error) {
    alert(error.message);
  }
}
function modal(title) {
  closeFinancialModal();
  const overlay = document.createElement("div");
  overlay.id = "financialModal";
  overlay.className = "modal";
  const card = document.createElement("div");
  card.className = "modal-card";
  const h = document.createElement("h3");
  h.textContent = title;
  card.appendChild(h);
  const content = document.createElement("div");
  content.id = "financialContent";
  card.appendChild(content);
  const close = document.createElement("button");
  close.className = "btn";
  close.textContent = "Закрыть";
  close.onclick = closeFinancialModal;
  card.appendChild(close);
  overlay.appendChild(card);
  document.body.appendChild(overlay);
  return content;
}
function closePay() {
  document.getElementById("modalPay").classList.add("hidden");
  document.getElementById("payCustomInput").value = "";
  payId = null;
  financialEditPaymentId = null;
}
function closeExpense() {
  document.getElementById("modalExp").classList.add("hidden");
  financialExpenseId = null;
}
function closeExpenseDetails() {
  document.getElementById("modalExpDetails").classList.add("hidden");
}
function closeFinancialModal() {
  document.getElementById("financialModal")?.remove();
}
function actionButton(parent, text, action) {
  const b = document.createElement("button");
  b.className = "btn mini";
  b.textContent = text;
  b.onclick = action;
  parent.appendChild(b);
  return b;
}
function openStudentHistory(studentId) {
  const p = finance.profiles.find((p) => p.studentId === studentId),
    content = modal("Финансовая история: " + p.name);
  actionButton(content, "Добавить платёж", () => {
    closeFinancialModal();
    openPay(studentId);
  });
  finance.charges
    .filter((c) => c.studentId === studentId)
    .forEach((c) => {
      const row = document.createElement("p");
      row.textContent = `Начисление ${c.period}: ${rubles(c.amountCents)} • ${finance.groups.find((g) => g.id === c.groupId)?.name}`;
      content.appendChild(row);
    });
  finance.payments
    .filter((o) => o.studentId === studentId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .forEach((o) => {
      const row = document.createElement("div");
      row.className = "card";
      row.textContent = `${o.type === "refund" ? "Возврат" : "Платёж"} ${rubles(o.amountCents)} • дата ${o.date} • период ${o.period} • ${finance.groups.find((g) => g.id === o.groupId)?.name}${o.voided ? " • Аннулирован" : ""} • ID ${o.id}`;
      if (!o.voided) {
        actionButton(row, "Исправить", () => {
          closeFinancialModal();
          editPayment(o.id);
        });
        if (o.type === "payment")
          actionButton(row, "Возврат", () => {
            closeFinancialModal();
            openRefund(o.id);
          });
        actionButton(row, "Аннулировать", async () => {
          const reason = prompt("Причина аннулирования (история сохраняется)");
          if (!reason || !confirm("Аннулировать операцию?")) return;
          if (
            await financialAction((f) =>
              Ledger.correctPayment(f, o.id, { voided: true }, reason),
            )
          ) {
            render();
            openStudentHistory(studentId);
          }
        });
      }
      content.appendChild(row);
    });
  const legacyCount = finance.legacy.filter(
    (e) => e.studentId === studentId && !e.resolution,
  ).length;
  if (legacyCount)
    actionButton(content, `Старые записи без года: ${legacyCount}`, openLegacy);
  actionButton(content, "История изменений", () => openAudit(studentId));
}
function openReconciliation() {
  const period = periodFor(monthIndex);
  const cashMode = reportBasis === "cash";
  const rows = finance.payments
    .filter((p) => !p.voided && (cashMode ? p.date.slice(0, 7) : p.period) === period)
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));
  const total = rows.reduce((sum, p) => sum + Ledger.signed(p), 0);
  const expected = Ledger.report(finance, period, reportBasis).received;
  const content = modal("Сверка поступлений: " + period);
  const intro = document.createElement("p");
  intro.textContent = (cashMode ? "По дате получения. " : "По периоду назначения. ") +
    "В учёт попадают все неаннулированные платежи минус возвраты. " +
    "Проверьте записи, если итог отличается от наличных денег. Тариф сам по себе не подтверждает оплату.";
  content.appendChild(intro);
  const summary = document.createElement("p");
  summary.textContent = "Операций: " + rows.length + " • Сумма: " +
    rubles(total) + " • Отчёт: " + rubles(expected);
  content.appendChild(summary);
  const keys = new Set();
  let duplicates = 0;
  rows.forEach((p) => {
    const key = [p.studentId, p.period, p.date, p.type, p.amountCents].join("|");
    const possibleDuplicate = keys.has(key);
    keys.add(key);
    if (possibleDuplicate) duplicates++;
    const person = finance.profiles.find((x) => x.studentId === p.studentId);
    const row = document.createElement("div");
    row.className = "card";
    row.textContent = (person?.name || "Ученик из архива") + " • " +
      (p.type === "refund" ? "Возврат −" : "Поступление +") +
      rubles(p.amountCents) + " • " + p.date +
      " • назначено " + p.period +
      (possibleDuplicate ? " • Возможный повтор!" : "");
    actionButton(row, "Открыть историю ученика", () => openStudentHistory(p.studentId));
    content.appendChild(row);
  });
  if (!rows.length) {
    const empty = document.createElement("p");
    empty.textContent = "За выбранный период операций нет.";
    content.appendChild(empty);
  }
  if (duplicates) {
    const note = document.createElement("p");
    note.textContent = "Внимание: " + duplicates +
      " возможных повторов (одинаковый ученик, дата, период, сумма). " +
      "Это могут быть настоящие отдельные взносы — проверяйте перед аннулированием.";
    content.insertBefore(note, summary.nextSibling);
  }
}
function openArchive() {
  const content = modal("Архив учеников");
  finance.profiles
    .filter((p) => p.archived)
    .forEach((p) => {
      const row = document.createElement("div");
      row.className = "card";
      row.textContent =
        p.name +
        " • " +
        finance.groups.find((g) => g.id === p.groupId)?.name +
        " • " +
        rubles(finance.tariffs.find((t) => t.id === p.tariffId).amountCents);
      actionButton(row, "Обязательства и платежи", () =>
        openStudentHistory(p.studentId),
      );
      content.appendChild(row);
    });
}
function openAudit(studentId = null) {
  const content = modal("Журнал изменений");
  finance.history
    .filter(
      (h) =>
        !studentId ||
        h.before?.studentId === studentId ||
        h.after?.studentId === studentId,
    )
    .slice()
    .reverse()
    .forEach((h) => {
      const row = document.createElement("details");
      const summary = document.createElement("summary");
      summary.textContent = `${h.at} • ${h.entity} • ${h.action} • ${h.reason}`;
      row.appendChild(summary);
      const pre = document.createElement("pre");
      pre.style.whiteSpace = "pre-wrap";
      pre.textContent = JSON.stringify(
        { before: h.before, after: h.after },
        null,
        2,
      );
      row.appendChild(pre);
      content.appendChild(row);
    });
}
function expenseRows() {
  return finance.expenses.filter(
    (e) =>
      !e.voided &&
      (reportBasis === "cash" ? e.date.slice(0, 7) : e.period) ===
        periodFor(monthIndex),
  );
}
function renderExpenses() {
  const list = document.getElementById("list"),
    summary = document.createElement("div");
  summary.className = "grid-header";
  summary.textContent = `${reportBasis === "cash" ? "По дате движения денег" : "По периоду назначения"}: расходы ${rubles(Ledger.report(finance, periodFor(monthIndex), reportBasis).expenses)}`;
  actionButton(summary, "＋ Расход", () => openExpense());
  list.appendChild(summary);
  const groups = new Map();
  expenseRows().forEach((e) => {
    const k = e.category.trim().toLowerCase();
    const g = groups.get(k) || { title: e.category, total: 0 };
    g.total += e.amountCents;
    groups.set(k, g);
  });
  if (!groups.size) {
    const empty = document.createElement("div");
    empty.className = "card";
    empty.textContent = "Расходов за выбранный период нет.";
    list.appendChild(empty);
  }
  [...groups.entries()]
    .sort((a, b) => b[1].total - a[1].total)
    .forEach(([key, g]) => {
      const tile = document.createElement("div");
      tile.className = "tile";
      tile.textContent = `${g.title} — ${rubles(g.total)}`;
      tile.onclick = () => openExpenseDetails(key, g.title);
      list.appendChild(tile);
    });
}
function openExpenseDetails(key, title) {
  const list = document.getElementById("expDetailsList");
  list.innerHTML = "";
  document.getElementById("expDetailsTitle").textContent =
    title + " • " + periodFor(monthIndex);
  expenseRows()
    .filter((e) => e.category.trim().toLowerCase() === key)
    .forEach((e) => {
      const row = document.createElement("div");
      row.className = "card";
      row.textContent = `${rubles(e.amountCents)} • ${e.date} • период ${e.period} • ${e.note}`;
      actionButton(row, "Редактировать", () => {
        closeExpenseDetails();
        openExpense(e.id);
      });
      actionButton(row, "Удалить", () => deleteExpense(e.id));
      list.appendChild(row);
    });
  document.getElementById("modalExpDetails").classList.remove("hidden");
}
async function deleteExpense(id) {
  if (
    !confirm(
      "Удалить расход из итогов? Операция и прежние значения останутся в журнале.",
    )
  )
    return;
  if (
    await financialAction((f) =>
      Ledger.correctExpense(
        f,
        id,
        { voided: true },
        "Удаление расхода пользователем",
      ),
    )
  ) {
    closeExpenseDetails();
    render();
  }
}
function openExpense(id = null) {
  financialExpenseId = id;
  const e = finance.expenses.find((e) => e.id === id);
  fillMonthSelect(
    document.getElementById("expMonth"),
    e ? Number(e.period.slice(5)) - 1 : monthIndex,
  );
  document.getElementById("expYear").value = e
    ? Number(e.period.slice(0, 4))
    : yearIndex;
  document.getElementById("expDate").value = e ? e.date : localDate();
  document.getElementById("expAmount").value = e
    ? (e.amountCents / 100).toFixed(2)
    : "";
  document.getElementById("expCategory").value = e ? e.category : "";
  document.getElementById("expNote").value = e ? e.note : "";
  document.getElementById("expReason").value = "";
  document.getElementById("modalExp").classList.remove("hidden");
}
async function saveExpense() {
  try {
    const input = {
      amountCents: Ledger.cents(document.getElementById("expAmount").value),
      date: document.getElementById("expDate").value,
      period: formPeriod(
        document.getElementById("expYear").value,
        document.getElementById("expMonth").value,
      ),
      category: document.getElementById("expCategory").value,
      note: document.getElementById("expNote").value,
    };
    if (
      financialExpenseId &&
      !confirm("Сохранить исправление расхода с историей изменений?")
    )
      return;
    if (
      await financialAction((f) =>
        financialExpenseId
          ? Ledger.correctExpense(
              f,
              financialExpenseId,
              input,
              document.getElementById("expReason").value,
            )
          : Ledger.addExpense(f, input),
      )
    ) {
      yearIndex = Number(input.period.slice(0, 4));
      monthIndex = Number(input.period.slice(5)) - 1;
      closeExpense();
      render();
    }
  } catch (error) {
    alert(error.message);
  }
}
function openLegacy() {
  const content = modal("Старые записи: год не определён");
  const hint = document.createElement("p");
  hint.className = "small";
  hint.textContent =
    "Они не входят в новые итоги. Назначайте период только после сверки. Начисление и неизвестная сумма указываются вручную. Архивные расходы после переноса остаются аннулированными.";
  content.appendChild(hint);
  finance.legacy.forEach((e) => {
    const row = document.createElement("div");
    row.className = "card";
    const p = finance.profiles.find((p) => p.studentId === e.studentId);
    row.textContent = `${p?.name || "Расход"} • ${e.month === null ? "месяц неизвестен" : MONTHS[e.month]} • ${e.archived ? "архив • " : ""}${JSON.stringify(e.original)}${e.resolution ? " • Назначено: " + e.resolution.period : ""}`;
    if (!e.resolution)
      actionButton(row, "Назначить период", () => openLegacyResolution(e.id));
    content.appendChild(row);
  });
}
function openLegacyResolution(id) {
  const e = finance.legacy.find((e) => e.id === id),
    content = modal("Ручная сверка старой записи");
  const original = document.createElement("p");
  original.textContent = JSON.stringify(e.original);
  content.appendChild(original);
  content.insertAdjacentHTML(
    "beforeend",
    '<label>Период (выберите вручную)<input id="legacyPeriod" type="month" /></label><label>Дата фактической операции (если есть движение денег)<input id="legacyDate" type="date" /></label><label>Начислено за этот период, ₽ (0 — нет начисления)<input id="legacyCharge" type="number" min="0" step="0.01" /></label><label>Сумма платежа, ₽ (если в старой записи только true)<input id="legacyAmount" type="number" min="0.01" step="0.01" /></label>',
  );
  actionButton(content, "Подтвердить перенос", async () => {
    if (!confirm("Период проверен? Исходная запись останется неизменной."))
      return;
    try {
      const input = {
        period: document.getElementById("legacyPeriod").value,
        date: document.getElementById("legacyDate").value,
        chargeCents:
          e.kind === "expense"
            ? 0
            : Ledger.cents(document.getElementById("legacyCharge").value),
        amountCents: document.getElementById("legacyAmount").value
          ? Ledger.cents(document.getElementById("legacyAmount").value)
          : undefined,
      };
      if (await financialAction((f) => Ledger.resolveLegacy(f, id, input))) {
        render();
        openLegacy();
      }
    } catch (error) {
      alert(error.message);
    }
  });
}
