/* Pure accounting rules. All new monetary values are integer kopecks. */
(function (root) {
  "use strict";
  const copy = (x) => JSON.parse(JSON.stringify(x));
  const id = () => crypto.randomUUID();
  const now = () => new Date().toISOString();
  function assert(ok, message) {
    if (!ok) throw Error(message);
  }
  function cents(value) {
    const text = String(value).replace(",", ".");
    assert(
      /^\d+(\.\d{1,2})?$/.test(text),
      "Введите сумму с точностью до копейки.",
    );
    const [whole, fraction = ""] = text.split(".");
    const result = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
    assert(Number.isSafeInteger(result), "Сумма слишком велика.");
    return result;
  }
  const money = (x) => Number.isSafeInteger(x) && x >= 0;
  const period = (x) =>
    typeof x === "string" &&
    /^\d{4}-(0[1-9]|1[0-2])$/.test(x) &&
    Number(x.slice(0, 4)) > 0;
  function date(x) {
    return (
      typeof x === "string" &&
      /^\d{4}-\d{2}-\d{2}$/.test(x) &&
      period(x.slice(0, 7)) &&
      !isNaN(Date.parse(x)) &&
      new Date(x + "T00:00:00Z").toISOString().slice(0, 10) === x
    );
  }
  function sum(items, fn) {
    return items.reduce((s, x) => {
      const n = s + fn(x);
      assert(Number.isSafeInteger(n), "Переполнение суммы.");
      return n;
    }, 0);
  }
  function event(f, entity, action, before, after, reason) {
    f.history.push({
      id: id(),
      at: now(),
      entity,
      action,
      reason: reason || action,
      before: before ? copy(before) : null,
      after: after ? copy(after) : null,
    });
  }
  function group(f, name) {
    let g = f.groups.find((g) => g.name === name || g.aliases?.includes(name));
    if (!g) {
      g = { id: id(), name };
      f.groups.push(g);
    }
    return g;
  }
  function addGroup(f, name, requiresParent = false) {
    name = String(name).trim();
    assert(name && name.length <= 80, "Название группы: от 1 до 80 символов.");
    assert(
      !f.groups.some((g) =>
        [g.name, ...(g.aliases || [])].some(
          (n) => n.toLocaleLowerCase("ru") === name.toLocaleLowerCase("ru"),
        ),
      ),
      "Такое название уже используется, в том числе в архиве.",
    );
    const g = {
      id: id(),
      name,
      aliases: [],
      archived: false,
      requiresParent: !!requiresParent,
    };
    f.groups.push(g);
    event(f, "group", "create", null, g);
    return g;
  }
  function renameGroup(f, groupId, name) {
    const g = f.groups.find((g) => g.id === groupId && !g.archived);
    assert(g, "Активная группа не найдена.");
    name = String(name).trim();
    assert(name && name.length <= 80, "Название группы: от 1 до 80 символов.");
    assert(
      !f.groups.some(
        (other) =>
          other.id !== groupId &&
          [other.name, ...(other.aliases || [])].some(
            (n) => n.toLocaleLowerCase("ru") === name.toLocaleLowerCase("ru"),
          ),
      ),
      "Название уже используется.",
    );
    const before = copy(g);
    g.requiresParent =
      g.requiresParent ??
      (g.name === "Детская" || g.aliases?.includes("Детская") || false);
    g.aliases = [...new Set([...(g.aliases || []), g.name])].filter(
      (n) => n !== name,
    );
    g.name = name;
    event(f, "group", "rename", before, g);
    return g;
  }
  function archiveGroup(f, groupId) {
    const g = f.groups.find((g) => g.id === groupId && !g.archived);
    assert(g, "Активная группа не найдена.");
    assert(
      !f.profiles.some((p) => p.groupId === groupId && !p.archived),
      "Сначала переведите или архивируйте активных учеников.",
    );
    const before = copy(g);
    g.archived = true;
    event(f, "group", "archive", before, g);
    return g;
  }
  function tariffAmount(f, amountCents) {
    assert(money(amountCents), "Некорректный тариф.");
    let t = f.tariffs.find((t) => t.amountCents === amountCents);
    if (!t) {
      t = {
        id: id(),
        amountCents,
        name: (amountCents / 100).toFixed(2) + " ₽",
      };
      f.tariffs.push(t);
    }
    return t;
  }
  function tariff(f, rubles) {
    return tariffAmount(f, cents(rubles));
  }
  function syncStudents(f, students, archived = []) {
    const all = [...students, ...archived];
    all.forEach((s) => {
      const g = group(f, s.group || "Детская"),
        t =
          s.rateCents === undefined
            ? tariff(f, s.rate === undefined ? 3000 : s.rate)
            : tariffAmount(f, s.rateCents);
      let p = f.profiles.find((p) => p.studentId === s.id);
      const isArchived = !students.some((a) => a.id === s.id);
      const name = s.name || s.student || "";
      if (!p) {
        p = {
          studentId: s.id,
          groupId: g.id,
          tariffId: t.id,
          name,
          archived: isArchived,
          archivedAt: null,
        };
        f.profiles.push(p);
      } else if (
        p.groupId !== g.id ||
        p.tariffId !== t.id ||
        p.name !== name ||
        p.archived !== isArchived
      ) {
        const before = copy(p);
        Object.assign(p, {
          groupId: g.id,
          tariffId: t.id,
          name,
          archived: isArchived,
          archivedAt: isArchived ? p.archivedAt || now() : null,
        });
        event(
          f,
          "student",
          "update",
          before,
          p,
          "Изменение/архивирование ученика",
        );
      }
    });
    // Removed active students remain addressable in profiles and the store archive.
    f.profiles
      .filter((p) => !students.some((s) => s.id === p.studentId) && !p.archived)
      .forEach((p) => {
        const before = copy(p);
        p.archived = true;
        p.archivedAt = now();
        event(f, "student", "archive", before, p);
      });
  }
  function migrate(state) {
    if (state.finance) {
      validate(state.finance);
      validateSource(state.finance, state);
      return copy(state.finance);
    }
    const f = {
      schemaVersion: 2,
      groups: [],
      tariffs: [],
      profiles: [],
      charges: [],
      payments: [],
      expenses: [],
      attendance: [],
      history: [],
      legacy: [],
      migration: { from: 1, to: 2 },
    };
    ["Детская", "Взрослая", "Женская"].forEach((n) => group(f, n));
    [1500, 2000, 2500, 3000].forEach((n) => tariff(f, n));
    syncStudents(f, state.students, state.archivedStudents || []);
    const sources = [
      ["active", state.students],
      ["archived", state.archivedStudents || []],
    ];
    for (const [source, students] of sources)
      students.forEach((s) => {
        const profile = f.profiles.find((p) => p.studentId === s.id);
        Object.entries(s.payments || {}).forEach(([month, original]) =>
          f.legacy.push({
            id: `legacy:${source}:${s.id}:payment:${month}`,
            kind: "payment",
            studentId: s.id,
            month: /^(0|[1-9]|10|11)$/.test(month) ? Number(month) : null,
            sourcePath: `${source}/${s.id}/payments/${month}`,
            sourceKey: month,
            original: copy(original),
            groupId: profile.groupId,
            archived: source === "archived",
            resolution: null,
          }),
        );
        if (typeof s.paid === "boolean")
          f.legacy.push({
            id: `legacy:${source}:${s.id}:paid`,
            kind: "paid",
            studentId: s.id,
            month: null,
            sourcePath: `${source}/${s.id}/paid`,
            original: s.paid,
            groupId: profile.groupId,
            archived: source === "archived",
            resolution: null,
          });
      });
    for (const [source, expenses] of [
      ["active", state.expenses],
      ["archived", state.archivedExpenses || []],
    ])
      expenses.forEach((e) =>
        f.legacy.push({
          id: `legacy:${source}:expense:${e.id}`,
          kind: "expense",
          studentId: null,
          month: e.month,
          sourcePath: `${source}/expenses/${e.id}`,
          original: copy(e),
          archived: source === "archived",
          resolution: null,
        }),
      );
    f.migration.legacyIds = f.legacy.map((entry) => entry.id);
    validate(f);
    validateSource(f, state);
    return f;
  }
  function profile(f, studentId) {
    const p = f.profiles.find((p) => p.studentId === studentId);
    assert(p, "Ученик не найден.");
    return p;
  }
  function ensureCharge(f, studentId, p, amountCents, groupId) {
    assert(period(p), "Нужен период YYYY-MM.");
    const s = profile(f, studentId);
    let c = f.charges.find((c) => c.studentId === studentId && c.period === p);
    if (!c) {
      const t = f.tariffs.find((t) => t.id === s.tariffId);
      const amount = amountCents === undefined ? t.amountCents : amountCents;
      assert(money(amount), "Некорректное начисление.");
      c = {
        id: id(),
        studentId,
        period: p,
        amountCents: amount,
        groupId: groupId || s.groupId,
        tariffId: s.tariffId,
        createdAt: now(),
      };
      f.charges.push(c);
      event(f, "charge", "create", null, c);
    }
    return c;
  }
  function correctCharge(f, studentId, p, amountCents, reason) {
    assert(period(p), "Нужен период YYYY-MM.");
    assert(money(amountCents) && amountCents > 0, "Некорректное начисление.");
    assert(typeof reason === "string" && reason.trim(), "Укажите причину исправления начисления.");
    const c = f.charges.find((c) => c.studentId === studentId && c.period === p);
    assert(c, "Начисление за выбранный период не найдено.");
    if (c.amountCents === amountCents) return c;
    const before = copy(c);
    c.amountCents = amountCents;
    event(f, "charge", "correct", before, c, reason.trim());
    return c;
  }
  const signed = (p) => (p.type === "refund" ? -1 : 1) * p.amountCents;
  function balance(f, studentId, p) {
    const charged = sum(
      f.charges.filter((c) => c.studentId === studentId && c.period === p),
      (c) => c.amountCents,
    );
    const paid = sum(
      f.payments.filter(
        (o) => !o.voided && o.studentId === studentId && o.period === p,
      ),
      signed,
      addGroup,
      renameGroup,
      archiveGroup,
    );
    const noShow = f.attendance.some(
      (a) =>
        a.studentId === studentId && a.period === p && a.status === "no-show",
    );
    return {
      charged,
      paid,
      debt: Math.max(0, charged - paid),
      credit: Math.max(0, paid - charged),
      noShow,
      fullyPaid: charged > 0 && paid >= charged,
    };
  }
  function addPayment(f, input) {
    assert(
      period(input.period) && date(input.date),
      "Укажите корректные период и дату операции.",
    );
    assert(
      money(input.amountCents) && input.amountCents > 0,
      "Сумма должна быть положительной.",
    );
    const s = profile(f, input.studentId);
    const charge = f.charges.find(
      (c) => c.studentId === s.studentId && c.period === input.period,
    );
    const type = input.type || "payment";
    assert(["payment", "refund"].includes(type), "Неизвестный тип операции.");
    const original =
      type === "refund"
        ? f.payments.find(
            (p) => p.id === input.refundOf && !p.voided && p.type === "payment",
          )
        : null;
    if (type === "refund") {
      assert(
        original &&
          original.studentId === input.studentId &&
          original.period === input.period,
        "Возврат должен ссылаться на исходный платёж того же ученика и периода.",
      );
      const refunded = sum(
        f.payments.filter((p) => !p.voided && p.refundOf === original.id),
        (p) => p.amountCents,
      );
      assert(
        refunded + input.amountCents <= original.amountCents,
        "Возврат превышает остаток исходного платежа.",
      );
    }
    const p = {
      id: id(),
      studentId: s.studentId,
      groupId: original
        ? original.groupId
        : charge
          ? charge.groupId
          : input.groupId || s.groupId,
      period: input.period,
      date: input.date,
      amountCents: input.amountCents,
      type,
      refundOf: original ? original.id : null,
      voided: false,
      createdAt: now(),
    };
    f.payments.push(p);
    event(f, "payment", "create", null, p, input.reason);
    return p;
  }
  function correctPayment(f, paymentId, patch, reason) {
    assert(
      typeof reason === "string" && reason.trim(),
      "Нужна причина исправления.",
    );
    const p = f.payments.find((p) => p.id === paymentId && !p.voided);
    assert(p, "Операция не найдена.");
    const next = {
      ...p,
      ...Object.fromEntries(
        ["amountCents", "date", "period", "voided"]
          .filter((k) => k in patch)
          .map((k) => [k, patch[k]]),
      ),
    };
    assert(
      money(next.amountCents) &&
        next.amountCents > 0 &&
        period(next.period) &&
        date(next.date) &&
        typeof next.voided === "boolean",
      "Некорректное исправление.",
    );
    const refunds = f.payments.filter((r) => !r.voided && r.refundOf === p.id);
    if (refunds.length)
      assert(
        !next.voided &&
          next.period === p.period &&
          next.amountCents >= sum(refunds, (r) => r.amountCents),
        "Сначала исправьте связанные возвраты.",
      );
    if (p.type === "refund") {
      const original = f.payments.find((o) => o.id === p.refundOf && !o.voided);
      assert(
        original && next.period === original.period,
        "Период возврата должен совпадать с исходным платежом.",
      );
      assert(
        sum(
          f.payments.filter(
            (r) => !r.voided && r.refundOf === original.id && r.id !== p.id,
          ),
          (r) => r.amountCents,
        ) +
          (next.voided ? 0 : next.amountCents) <=
          original.amountCents,
        "Возврат превышает платёж.",
      );
    }
    // Reassignment uses the charge's historical group, never the pupil's current group.
    if (next.period !== p.period) {
      const c = f.charges.find(
        (c) => c.studentId === p.studentId && c.period === next.period,
      );
      assert(c, "Сначала создайте начисление для нового периода.");
      next.groupId = c.groupId;
    }
    const before = copy(p);
    Object.assign(p, next);
    event(f, "payment", "correct", before, p, reason.trim());
    return p;
  }
  function setAttendance(f, studentId, p, status) {
    assert(
      period(p) && ["attended", "no-show"].includes(status),
      "Некорректная посещаемость.",
    );
    const s = profile(f, studentId);
    let a = f.attendance.find(
      (a) => a.studentId === studentId && a.period === p,
    );
    const before = a ? copy(a) : null;
    if (!a) {
      a = {
        id: id(),
        studentId,
        period: p,
        groupId: (
          f.charges.find((c) => c.studentId === studentId && c.period === p) ||
          s
        ).groupId,
      };
      f.attendance.push(a);
    }
    a.status = status;
    event(f, "attendance", "set", before, a);
    return a;
  }
  function addExpense(f, input) {
    assert(
      money(input.amountCents) &&
        input.amountCents > 0 &&
        period(input.period) &&
        date(input.date) &&
        typeof input.category === "string" &&
        input.category.trim(),
      "Проверьте сумму, дату, период и категорию расхода.",
    );
    const e = {
      id: id(),
      amountCents: input.amountCents,
      period: input.period,
      date: input.date,
      category: input.category.trim(),
      note: String(input.note || ""),
      voided: false,
      createdAt: now(),
    };
    f.expenses.push(e);
    event(f, "expense", "create", null, e);
    return e;
  }
  function correctExpense(f, expenseId, patch, reason) {
    const e = f.expenses.find((e) => e.id === expenseId && !e.voided);
    assert(
      e && typeof reason === "string" && reason.trim(),
      "Нужна запись и причина изменения.",
    );
    const before = copy(e);
    const next = {
      ...e,
      ...Object.fromEntries(
        ["amountCents", "date", "period", "category", "note", "voided"]
          .filter((k) => k in patch)
          .map((k) => [k, patch[k]]),
      ),
    };
    assert(
      money(next.amountCents) &&
        next.amountCents > 0 &&
        date(next.date) &&
        period(next.period) &&
        typeof next.category === "string" &&
        next.category.trim() &&
        typeof next.note === "string" &&
        typeof next.voided === "boolean",
      "Некорректный расход.",
    );
    Object.assign(e, next);
    event(
      f,
      "expense",
      next.voided ? "void" : "correct",
      before,
      e,
      reason.trim(),
    );
    return e;
  }
  function report(f, p, mode = "accrual", groupId = null) {
    assert(
      period(p) && ["accrual", "cash"].includes(mode),
      "Некорректный отчёт.",
    );
    const charges = f.charges.filter(
      (c) => c.period === p && (!groupId || c.groupId === groupId),
    );
    const students = [...new Set(charges.map((c) => c.studentId))];
    const balances = students.map((s) => balance(f, s, p));
    const received = sum(
      f.payments.filter(
        (o) =>
          !o.voided &&
          (mode === "cash" ? o.date.slice(0, 7) : o.period) === p &&
          (!groupId || o.groupId === groupId),
      ),
      signed,
      addGroup,
      renameGroup,
      archiveGroup,
    );
    const expenses = sum(
      f.expenses.filter(
        (e) =>
          !e.voided && (mode === "cash" ? e.date.slice(0, 7) : e.period) === p,
      ),
      (e) => e.amountCents,
    );
    return {
      charged: sum(charges, (c) => c.amountCents),
      received,
      debt: sum(balances, (b) => b.debt),
      expenses,
      result: received - expenses,
      paidCount: balances.filter((b) => b.fullyPaid).length,
      debtCount: balances.filter((b) => b.debt > 0).length,
      noShowCount: f.attendance.filter(
        (a) =>
          a.period === p &&
          a.status === "no-show" &&
          (!groupId || a.groupId === groupId),
      ).length,
    };
  }
  function resolveLegacy(f, legacyId, input) {
    const e = f.legacy.find((e) => e.id === legacyId);
    assert(e && !e.resolution, "Запись уже перенесена или не найдена.");
    assert(period(input.period), "Выберите период вручную.");
    const before = copy(e),
      targets = [];
    if (e.kind === "expense") {
      const o = addExpense(f, {
        period: input.period,
        date: input.date,
        amountCents: cents(e.original.amount),
        category: e.original.category || "Другое",
        note: e.original.note || "",
      });
      if (e.archived)
        correctExpense(
          f,
          o.id,
          { voided: true },
          "Архивный расход при миграции",
        );
      targets.push(o.id);
    } else {
      const raw = e.original;
      const value = typeof raw === "object" ? raw.amount : raw;
      assert(
        money(input.chargeCents),
        "Вручную укажите начисление в копейках (0 — нет начисления).",
      );
      const existing = f.charges.find(
        (c) => c.studentId === e.studentId && c.period === input.period,
      );
      assert(
        !existing ||
          (existing.amountCents === input.chargeCents &&
            existing.groupId === e.groupId),
        "Начисление за период уже существует и отличается; выполните сверку.",
      );
      if (input.chargeCents > 0) {
        const c = ensureCharge(
          f,
          e.studentId,
          input.period,
          input.chargeCents,
          e.groupId,
        );
        targets.push(c.id);
      }
      if (value === -1) {
        targets.push(setAttendance(f, e.studentId, input.period, "no-show").id);
      } else if (value === true || (typeof value === "number" && value > 0)) {
        const amountCents = value === true ? input.amountCents : cents(value);
        const o = addPayment(f, {
          studentId: e.studentId,
          period: input.period,
          date: input.date,
          amountCents,
          groupId: e.groupId,
          reason: "Ручная сверка старой записи",
        });
        targets.push(o.id);
      }
    }
    e.resolution = { period: input.period, at: now(), targets };
    event(f, "legacy", "resolve", before, e, "Период назначен пользователем");
    return e;
  }
  function validateSource(f, state) {
    const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    const students = [...state.students, ...(state.archivedStudents || [])];
    for (const student of students) {
      for (const [key, original] of Object.entries(student.payments || {})) {
        assert(
          f.legacy.some(
            (e) =>
              e.kind === "payment" &&
              e.studentId === student.id &&
              e.sourceKey === key &&
              equal(e.original, original),
          ),
          "Отсутствует исходный платёж в перечне сверки.",
        );
      }
      if (typeof student.paid === "boolean")
        assert(
          f.legacy.some(
            (e) =>
              e.kind === "paid" &&
              e.studentId === student.id &&
              e.original === student.paid,
          ),
          "Отсутствует исходный статус оплаты.",
        );
    }
    for (const expense of [
      ...state.expenses,
      ...(state.archivedExpenses || []),
    ])
      assert(
        f.legacy.some(
          (e) => e.kind === "expense" && equal(e.original, expense),
        ),
        "Отсутствует исходный расход.",
      );
    for (const entry of f.legacy) {
      if (entry.kind === "expense")
        assert(
          [...state.expenses, ...(state.archivedExpenses || [])].some((e) =>
            equal(e, entry.original),
          ),
          "Изменён исходный расход.",
        );
      else
        assert(
          students.some(
            (s) =>
              s.id === entry.studentId &&
              (entry.kind === "paid"
                ? s.paid === entry.original
                : Object.prototype.hasOwnProperty.call(
                    s.payments || {},
                    entry.sourceKey,
                  ) && equal(s.payments[entry.sourceKey], entry.original)),
          ),
          "Изменена исходная запись оплаты.",
        );
    }
    return true;
  }
  function validate(f) {
    assert(f && f.schemaVersion === 2, "Неизвестная финансовая схема.");
    for (const key of [
      "groups",
      "tariffs",
      "profiles",
      "charges",
      "payments",
      "expenses",
      "attendance",
      "history",
      "legacy",
    ])
      assert(Array.isArray(f[key]), "Повреждён раздел " + key);
    for (const key of [
      "groups",
      "tariffs",
      "charges",
      "payments",
      "expenses",
      "attendance",
      "history",
      "legacy",
    ]) {
      const ids = new Set();
      for (const x of f[key]) {
        assert(
          x && typeof x.id === "string" && x.id && !ids.has(x.id),
          "Повтор/отсутствие ID: " + key,
        );
        ids.add(x.id);
      }
    }
    const groups = new Set(f.groups.map((g) => g.id)),
      tariffs = new Set(f.tariffs.map((t) => t.id));
    f.groups.forEach((g) =>
      assert(typeof g.name === "string" && g.name, "Некорректная группа."),
    );
    const names = new Map();
    f.groups.forEach((g) => {
      assert(
        g.archived === undefined || typeof g.archived === "boolean",
        "Некорректный архив группы.",
      );
      assert(
        g.requiresParent === undefined || typeof g.requiresParent === "boolean",
        "Некорректный тип группы.",
      );
      assert(
        g.aliases === undefined ||
          (Array.isArray(g.aliases) &&
            g.aliases.every((n) => typeof n === "string" && n.trim())),
        "Некорректные прежние названия.",
      );
      for (const name of [g.name, ...(g.aliases || [])]) {
        const key = name;
        assert(
          !names.has(key) || names.get(key) === g.id,
          "Неоднозначное название группы.",
        );
        names.set(key, g.id);
      }
    });
    f.tariffs.forEach((t) =>
      assert(money(t.amountCents), "Некорректный тариф."),
    );
    const students = new Set();
    f.profiles.forEach((s) => {
      assert(
        typeof s.studentId === "string" &&
          s.studentId &&
          !students.has(s.studentId) &&
          groups.has(s.groupId) &&
          tariffs.has(s.tariffId) &&
          typeof s.archived === "boolean" &&
          typeof s.name === "string",
        "Повреждён профиль.",
      );
      students.add(s.studentId);
    });
    const uniqueCharges = new Set();
    f.charges.forEach((c) => {
      const k = c.studentId + "/" + c.period;
      assert(
        students.has(c.studentId) &&
          groups.has(c.groupId) &&
          tariffs.has(c.tariffId) &&
          period(c.period) &&
          money(c.amountCents) &&
          !uniqueCharges.has(k),
        "Повреждено начисление.",
      );
      uniqueCharges.add(k);
    });
    f.payments.forEach((p) =>
      assert(
        students.has(p.studentId) &&
          groups.has(p.groupId) &&
          period(p.period) &&
          date(p.date) &&
          money(p.amountCents) &&
          p.amountCents > 0 &&
          ["payment", "refund"].includes(p.type) &&
          typeof p.voided === "boolean",
        "Повреждён платёж.",
      ),
    );
    f.payments
      .filter((p) => p.type === "refund")
      .forEach((r) => {
        const p = f.payments.find(
          (p) => p.id === r.refundOf && p.type === "payment",
        );
        assert(
          p &&
            r.studentId === p.studentId &&
            r.period === p.period &&
            r.groupId === p.groupId,
          "Повреждена связь возврата.",
        );
        if (!r.voided) assert(!p.voided, "Возврат без действующего платежа.");
      });
    f.payments
      .filter((p) => p.type === "payment")
      .forEach((p) =>
        assert(
          sum(
            f.payments.filter((r) => !r.voided && r.refundOf === p.id),
            (r) => r.amountCents,
          ) <= p.amountCents,
          "Возвраты превышают платёж.",
        ),
      );
    f.expenses.forEach((e) =>
      assert(
        money(e.amountCents) &&
          e.amountCents > 0 &&
          date(e.date) &&
          period(e.period) &&
          typeof e.category === "string" &&
          e.category.trim() &&
          typeof e.note === "string" &&
          typeof e.voided === "boolean",
        "Повреждён расход.",
      ),
    );
    const attendance = new Set();
    f.attendance.forEach((a) => {
      const k = a.studentId + "/" + a.period;
      assert(
        students.has(a.studentId) &&
          groups.has(a.groupId) &&
          period(a.period) &&
          ["attended", "no-show"].includes(a.status) &&
          !attendance.has(k),
        "Повреждена посещаемость.",
      );
      attendance.add(k);
    });
    f.history.forEach((h) =>
      assert(
        typeof h.at === "string" &&
          typeof h.action === "string" &&
          typeof h.reason === "string" &&
          "before" in h &&
          "after" in h,
        "Повреждён журнал.",
      ),
    );
    f.legacy.forEach((e) =>
      assert(
        ["payment", "paid", "expense"].includes(e.kind) &&
          "original" in e &&
          (e.resolution === null ||
            (e.resolution &&
              period(e.resolution.period) &&
              Array.isArray(e.resolution.targets))) &&
          (e.studentId === null || students.has(e.studentId)),
        "Повреждена старая запись.",
      ),
    );
    assert(
      f.migration?.from === 1 &&
        f.migration?.to === 2 &&
        Array.isArray(f.migration.legacyIds) &&
        f.migration.legacyIds.length === f.legacy.length &&
        new Set(f.migration.legacyIds).size === f.legacy.length &&
        f.legacy.every((e) => f.migration.legacyIds.includes(e.id)),
      "Нарушена полнота миграции.",
    );
    sum(f.charges, (c) => c.amountCents);
    sum(f.payments, (p) => p.amountCents);
    sum(f.expenses, (e) => e.amountCents);
    const targets = new Set(
      [...f.charges, ...f.payments, ...f.expenses, ...f.attendance].map(
        (o) => o.id,
      ),
    );
    f.legacy
      .filter((e) => e.resolution)
      .forEach((e) =>
        assert(
          e.resolution.targets.every((id) => targets.has(id)),
          "Отсутствует операция переноса.",
        ),
      );
    return true;
  }
  const api = {
    copy,
    cents,
    money,
    period,
    date,
    migrate,
    validate,
    validateSource,
    syncStudents,
    ensureCharge,
    correctCharge,
    addPayment,
    correctPayment,
    setAttendance,
    addExpense,
    correctExpense,
    balance,
    report,
    resolveLegacy,
    signed,
    addGroup,
    renameGroup,
    archiveGroup,
  };
  // Public mutations are transactional in memory, including failed legacy reconciliation.
  for (const name of [
    "addGroup",
    "renameGroup",
    "archiveGroup",
    "syncStudents",
    "ensureCharge",
    "correctCharge",
    "addPayment",
    "correctPayment",
    "setAttendance",
    "addExpense",
    "correctExpense",
    "resolveLegacy",
  ]) {
    const operation = api[name];
    api[name] = (f, ...args) => {
      const next = copy(f);
      const result = operation(next, ...args);
      validate(next);
      Object.assign(f, next);
      return result;
    };
  }
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.CoachFinance = api;
})(globalThis);
