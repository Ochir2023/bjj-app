/* Browser/CommonJS module. Legacy storage is never overwritten. */
(function (root) {
  "use strict";
  const KEY = "coachcontrol.data",
    PREFIX = "coachcontrol.backup.",
    VERSION = 1;
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const object = (value) =>
    value !== null && typeof value === "object" && !Array.isArray(value);
  const amount = (value) =>
    typeof value === "number" &&
    Number.isFinite(value) &&
    (value === -1 || value >= 0);
  function validate(students, expenses, requireIds = false) {
    if (!Array.isArray(students) || !Array.isArray(expenses))
      throw Error("Ожидались списки учеников и расходов.");
    const ids = new Set();
    students.forEach((s) => {
      if (!object(s) || (requireIds && (typeof s.id !== "string" || !s.id)))
        throw Error("Повреждена запись ученика.");
      for (const key of ["id", "name", "student", "group", "parent", "phone"]) {
        if (s[key] !== undefined && typeof s[key] !== "string")
          throw Error("Некорректное поле ученика: " + key);
      }
      if (s.birthDate !== undefined && s.birthDate !== "" && (
        typeof s.birthDate !== "string" ||
        !/^\\d{4}-\\d{2}-\\d{2}$/.test(s.birthDate) ||
        !Number.isFinite(Date.parse(s.birthDate)) ||
        new Date(s.birthDate + "T00:00:00Z").toISOString().slice(0,10) !== s.birthDate
      )) throw Error("Некорректная дата рождения.");
      if (s.weightKg !== undefined && s.weightKg !== null &&
        (typeof s.weightKg !== "number" || !Number.isFinite(s.weightKg) ||
         s.weightKg < 0.1 || s.weightKg > 500))
        throw Error("Некорректный вес ученика.");
      if (s.id && ids.has(s.id))
        throw Error("Повторяющийся идентификатор ученика.");
      if (s.id) ids.add(s.id);
      if (
        s.rateCents !== undefined &&
        (!Number.isSafeInteger(s.rateCents) || s.rateCents < 0)
      )
        throw Error("Некорректный тариф в копейках.");
      if (s.rate !== undefined && (!amount(s.rate) || s.rate < 0))
        throw Error("Некорректный тариф.");
      if (s.paid !== undefined && typeof s.paid !== "boolean")
        throw Error("Некорректный старый статус оплаты.");
      if (s.payments !== undefined) {
        if (!object(s.payments) && !Array.isArray(s.payments))
          throw Error("Повреждены платежи.");
        Object.values(s.payments).forEach((p) => {
          if (typeof p === "boolean" || amount(p)) return;
          if (
            !object(p) ||
            !amount(p.amount) ||
            (p.date !== undefined && typeof p.date !== "string")
          )
            throw Error("Повреждена запись платежа.");
        });
      }
    });
    const expenseIds = new Set();
    expenses.forEach((e) => {
      if (
        !object(e) ||
        typeof e.id !== "string" ||
        !e.id ||
        expenseIds.has(e.id) ||
        !Number.isFinite(e.amount) ||
        e.amount <= 0 ||
        !Number.isInteger(e.month) ||
        e.month < 0 ||
        e.month > 11 ||
        typeof e.category !== "string" ||
        (e.note !== undefined && typeof e.note !== "string") ||
        (e.ts !== undefined && !Number.isFinite(e.ts))
      )
        throw Error("Повреждена запись расхода.");
      expenseIds.add(e.id);
    });
  }
  function normalize(students) {
    return students.map((s) => ({
      ...s,
      id: s.id || crypto.randomUUID(),
      name: s.name || s.student || "",
      group: s.group || "Детская",
      parent: s.parent || "",
      phone: s.phone || "",
      rate: s.rate === undefined ? 3000 : s.rate,
      payments: s.payments === undefined ? {} : clone(s.payments),
    }));
  }
  function create(storage, options = {}) {
    const accounting = options.accounting;
    let expected,
      state,
      legacySources,
      blocked = false,
      error = "";
    const readLegacy = () =>
      ["bjj_students", "bjj_expenses", "students"].map((key) =>
        storage.getItem(key),
      );
    function load() {
      try {
        expected = storage.getItem(KEY);
        legacySources = readLegacy();
        if (expected !== null) {
          state = JSON.parse(expected);
          if (
            !object(state) ||
            ![VERSION, ...(accounting ? [2] : [])].includes(
              state.schemaVersion,
            ) ||
            !Number.isInteger(state.revision) ||
            state.revision < 1 ||
            !Array.isArray(state.archivedStudents) ||
            !Array.isArray(state.archivedExpenses)
          )
            throw Error("Неизвестная версия или повреждённая схема.");
          validate(state.students, state.expenses, true);
          validate(state.archivedStudents, state.archivedExpenses, true);
        } else {
          const modern = storage.getItem("bjj_students"),
            legacy = storage.getItem("students");
          if (
            modern !== null &&
            legacy !== null &&
            legacy !== "[]" &&
            modern !== legacy
          )
            throw Error(
              "Обнаружены два разных списка учеников. Нужна ручная сверка; оба сохранены.",
            );
          const students = JSON.parse(
            modern !== null ? modern : legacy !== null ? legacy : "[]",
          );
          const expenseRaw = storage.getItem("bjj_expenses");
          const expenses = JSON.parse(expenseRaw === null ? "[]" : expenseRaw);
          validate(students, expenses);
          state = {
            schemaVersion: VERSION,
            revision: 0,
            students: normalize(students),
            expenses,
            archivedStudents: [],
            archivedExpenses: [],
          };
        }
        if (accounting) {
          if (state.schemaVersion === 2 && !state.finance)
            throw Error("Отсутствует финансовая модель.");
          state.finance = accounting.migrate(state);
          const ids = new Set(
            [...state.students, ...state.archivedStudents].map((s) => s.id),
          );
          if (
            state.finance.profiles.length !== ids.size ||
            state.finance.profiles.some((p) => !ids.has(p.studentId))
          )
            throw Error("Финансы ссылаются на отсутствующего ученика.");
        }
        return clone(state);
      } catch (e) {
        blocked = true;
        error = e.message;
        state = {
          schemaVersion: VERSION,
          revision: 0,
          students: [],
          expenses: [],
          archivedStudents: [],
          archivedExpenses: [],
        };
        if (accounting) state.finance = accounting.migrate(state);
        return clone(state);
      }
    }
    // Include raw bytes, even when JSON is malformed; do not collect unrelated origin data.
    function rawBackup() {
      const raw = {};
      for (let i = 0; i < storage.length; i++) {
        const key = storage.key(i);
        if (
          key === "students" ||
          key.startsWith("bjj_") ||
          key.startsWith("coachcontrol.")
        )
          raw[key] = storage.getItem(key);
      }
      return raw;
    }
    function commit(students, expenses, finance) {
      if (blocked)
        throw Error(
          error || "Запись заблокирована для защиты исходных данных.",
        );
      validate(students, expenses, true);
      if (JSON.stringify(readLegacy()) !== JSON.stringify(legacySources))
        throw Error(
          "Старые данные изменены другой версией приложения. Экспортируйте копию и выполните ручную сверку.",
        );
      if (storage.getItem(KEY) !== expected)
        throw Error(
          "Данные изменены в другой вкладке. Экспортируйте текущую копию и перезагрузите страницу.",
        );
      const next = clone(state);
      next.students = clone(students);
      next.expenses = clone(expenses);
      next.revision++;
      next.archivedStudents.push(
        ...state.students.filter((s) => !students.some((n) => n.id === s.id)),
      );
      next.archivedExpenses.push(
        ...state.expenses.filter((e) => !expenses.some((n) => n.id === e.id)),
      );
      if (accounting) {
        next.schemaVersion = 2;
        next.finance = clone(finance || state.finance);
        accounting.syncStudents(
          next.finance,
          next.students,
          next.archivedStudents,
        );
        accounting.validate(next.finance);
        accounting.validateSource(next.finance, next);
        if (
          JSON.stringify(next.finance.migration) !==
          JSON.stringify(state.finance.migration)
        )
          throw Error("Метаданные миграции неизменяемы.");
        if (
          JSON.stringify(
            next.finance.history.slice(0, state.finance.history.length),
          ) !== JSON.stringify(state.finance.history)
        )
          throw Error("Порядок финансового журнала неизменяем.");
        // Accounting operations and audit events may be corrected, never physically removed.
        for (const table of [
          "charges",
          "payments",
          "expenses",
          "attendance",
          "history",
          "legacy",
        ]) {
          for (const old of state.finance[table]) {
            const current = next.finance[table].find(
              (row) => row.id === old.id,
            );
            if (!current)
              throw Error("Удаление финансовой истории запрещено: " + table);
            if (
              table === "charges" &&
              JSON.stringify(current) !== JSON.stringify(old)
            ) {
              // A tariff correction must preserve its before/after states
              // in the append-only financial history.
              let recorded = old;
              for (const entry of next.finance.history.slice(state.finance.history.length)) {
                if (
                  entry.entity === "charge" &&
                  entry.action === "correct" &&
                  entry.before?.id === old.id &&
                  typeof entry.reason === "string" &&
                  entry.reason.trim() &&
                  JSON.stringify(entry.before) === JSON.stringify(recorded)
                ) recorded = entry.after;
              }
              if (JSON.stringify(recorded) !== JSON.stringify(current))
                throw Error("Изменение начисления без полной истории запрещено.");
            }
            if (
              ["payments", "expenses", "attendance"].includes(table) &&
              JSON.stringify(current) !== JSON.stringify(old)
            ) {
              const entity = {
                payments: "payment",
                expenses: "expense",
                attendance: "attendance",
              }[table];
              let recorded = old;
              for (const event of next.finance.history.slice(
                state.finance.history.length,
              )) {
                if (
                  event.entity === entity &&
                  event.before?.id === old.id &&
                  JSON.stringify(event.before) === JSON.stringify(recorded)
                )
                  recorded = event.after;
              }
              if (JSON.stringify(recorded) !== JSON.stringify(current))
                throw Error("Изменение операции без полной истории запрещено.");
            }
            if (
              table === "legacy" &&
              old.resolution !== null &&
              JSON.stringify(current.resolution) !==
                JSON.stringify(old.resolution)
            )
              throw Error("Повторное изменение перенесённой записи запрещено.");
            if (
              (table === "history" &&
                JSON.stringify(current) !== JSON.stringify(old)) ||
              (table === "legacy" &&
                JSON.stringify({ ...current, resolution: null }) !==
                  JSON.stringify({ ...old, resolution: null }))
            )
              throw Error("Исходная финансовая история неизменяема.");
          }
        }
        // New code cannot alter old source records, even while saving profile changes.
        for (const old of [...state.students, ...state.archivedStudents]) {
          const current = [...next.students, ...next.archivedStudents].find(
            (s) => s.id === old.id,
          );
          if (
            !current ||
            JSON.stringify(current.payments) !== JSON.stringify(old.payments) ||
            current.paid !== old.paid
          )
            throw Error(
              "Старые платежи нельзя изменять. Используйте ручную сверку.",
            );
        }
        if (JSON.stringify(next.expenses) !== JSON.stringify(state.expenses))
          throw Error(
            "Старые расходы нельзя изменять. Используйте финансовый журнал.",
          );
      }
      // Backup first: a failed backup prevents all changes to the active document.
      const backupKey = PREFIX + crypto.randomUUID();
      const raw = rawBackup();
      // Prior backups are independently retained; avoid exponential nesting.
      Object.keys(raw)
        .filter((k) => k.startsWith(PREFIX))
        .forEach((k) => delete raw[k]);
      const backup = JSON.stringify({
        format: "CoachControlBackup",
        formatVersion: 1,
        createdAt: new Date().toISOString(),
        raw,
        current: clone(state),
      });
      storage.setItem(backupKey, backup);
      if (storage.getItem(backupKey) !== backup)
        throw Error("Не удалось проверить резервную копию.");
      if (
        storage.getItem(KEY) !== expected ||
        JSON.stringify(readLegacy()) !== JSON.stringify(legacySources)
      )
        throw Error(
          "Данные изменены в другой вкладке. Перезагрузите страницу.",
        );
      const serialized = JSON.stringify(next);
      storage.setItem(KEY, serialized); // Single-document atomic write.
      try {
        if (storage.getItem(KEY) !== serialized)
          throw Error("Не удалось проверить записанный документ.");
        if (accounting) {
          const verified = JSON.parse(storage.getItem(KEY));
          accounting.validate(verified.finance);
          accounting.validateSource(verified.finance, verified);
        }
      } catch (verificationError) {
        try {
          if (expected === null) storage.removeItem(KEY);
          else storage.setItem(KEY, expected);
          if (storage.getItem(KEY) !== expected)
            throw Error("Восстановление не подтверждено.");
        } catch (restoreError) {
          blocked = true;
          error =
            "Не удалось проверить откат. Резервная копия " +
            backupKey +
            ". Не очищайте хранилище. " +
            restoreError.message;
          throw Error(error);
        }
        throw Error(
          "Запись не прошла проверку и отменена. " + verificationError.message,
        );
      }
      expected = serialized;
      state = next;
      return clone(state);
    }
    return {
      load,
      commit,
      snapshot: () => clone(state),
      get blocked() {
        return blocked;
      },
      get error() {
        return error;
      },
      exportBackup: () => ({
        format: "CoachControlBackup",
        formatVersion: 1,
        exportedAt: new Date().toISOString(),
        raw: rawBackup(),
        current: blocked ? null : clone(state),
        loadError: error || null,
      }),
    };
  }
  const api = { create, validate, VERSION, KEY };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.CoachData = api;
})(globalThis);
