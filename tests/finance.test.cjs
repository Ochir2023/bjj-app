const { test } = require("node:test");
const assert = require("node:assert/strict");
const F = require("../finance.js"),
  { create, KEY } = require("../data-store.js");
const student = {
  id: "s",
  name: "Иван",
  group: "Детская",
  rate: 3000,
  phone: "1",
  parent: "Родитель",
  payments: {},
};
const source = () => ({
  schemaVersion: 1,
  revision: 1,
  students: [structuredClone(student)],
  expenses: [],
  archivedStudents: [],
  archivedExpenses: [],
});
const fresh = () => F.migrate(source());
const pay = (f, amountCents, period = "2026-01", date = "2026-01-10") =>
  F.addPayment(f, { studentId: "s", amountCents, period, date });
class Storage {
  constructor(values = {}) {
    this.values = new Map(Object.entries(values));
    this.fail = null;
  }
  get length() {
    return this.values.size;
  }
  key(i) {
    return [...this.values.keys()][i];
  }
  getItem(k) {
    return this.values.get(k) ?? null;
  }
  setItem(k, v) {
    if (this.fail === k || this.fail === "all")
      throw Error("QuotaExceededError");
    this.values.set(k, v);
  }
}
function store(state = source()) {
  const storage = new Storage({ [KEY]: JSON.stringify(state) }),
    data = create(storage, { accounting: F }),
    loaded = data.load();
  return { storage, data, loaded };
}
test("strict integer kopecks and date validation", () => {
  assert.equal(F.cents("1500,25"), 150025);
  assert.equal(F.cents("0.01"), 1);
  for (const s of ["0.001", "-1", "1e3", "Infinity", "", "9007199254740991"])
    assert.throws(() => F.cents(s));
  assert.equal(F.date("2025-02-29"), false);
  assert.equal(F.date("2024-02-29"), true);
  assert.equal(F.period("2026-13"), false);
});
test("2025 and 2026 payments and charges are independent", () => {
  const f = fresh();
  F.ensureCharge(f, "s", "2025-01");
  F.ensureCharge(f, "s", "2026-01");
  pay(f, 300000, "2025-01", "2025-01-10");
  pay(f, 150000);
  assert.equal(F.report(f, "2025-01").received, 300000);
  assert.equal(F.report(f, "2026-01").received, 150000);
  assert.equal(F.balance(f, "s", "2026-01").debt, 150000);
});
test("partial payment remains unpaid with exact debt", () => {
  const f = fresh();
  F.ensureCharge(f, "s", "2026-01");
  pay(f, 123456);
  assert.deepEqual(F.balance(f, "s", "2026-01"), {
    charged: 300000,
    paid: 123456,
    debt: 176544,
    credit: 0,
    noShow: false,
    fullyPaid: false,
  });
});
test("several payments accumulate without overwriting", () => {
  const f = fresh();
  F.ensureCharge(f, "s", "2026-01");
  const a = pay(f, 150000),
    b = pay(f, 150000);
  assert.notEqual(a.id, b.id);
  assert.equal(f.payments.length, 2);
  assert.equal(F.balance(f, "s", "2026-01").fullyPaid, true);
});
test("overpayment, partial refund and refund limit", () => {
  const f = fresh();
  F.ensureCharge(f, "s", "2026-01");
  const a = pay(f, 400000);
  assert.equal(F.balance(f, "s", "2026-01").credit, 100000);
  F.addPayment(f, {
    studentId: "s",
    amountCents: 100000,
    date: "2026-02-01",
    period: "2026-01",
    type: "refund",
    refundOf: a.id,
  });
  assert.equal(F.balance(f, "s", "2026-01").debt, 0);
  assert.equal(F.balance(f, "s", "2026-01").credit, 0);
  assert.equal(F.report(f, "2026-02", "cash").received, -100000);
  const before = F.copy(f);
  assert.throws(() =>
    F.addPayment(f, {
      studentId: "s",
      amountCents: 300001,
      date: "2026-02-01",
      period: "2026-01",
      type: "refund",
      refundOf: a.id,
    }),
  );
  assert.deepEqual(f, before);
});
test("refund cannot reference another pupil or wrong period", () => {
  const f = fresh(),
    a = pay(f, 300000);
  assert.throws(() =>
    F.addPayment(f, {
      studentId: "s",
      amountCents: 1,
      date: "2026-01-10",
      period: "2025-01",
      type: "refund",
      refundOf: a.id,
    }),
  );
});
test("no-show is independent of charge, debt and payment status", () => {
  const f = fresh();
  F.ensureCharge(f, "s", "2026-01");
  F.setAttendance(f, "s", "2026-01", "no-show");
  assert.equal(F.balance(f, "s", "2026-01").debt, 300000);
  pay(f, 300000);
  const r = F.report(f, "2026-01");
  assert.equal(r.paidCount, 1);
  assert.equal(r.noShowCount, 1);
  assert.equal(r.charged, 300000);
});
test("archive preserves obligations, cash and profile", () => {
  const f = fresh();
  F.ensureCharge(f, "s", "2026-01");
  pay(f, 150000);
  const before = F.report(f, "2026-01");
  F.syncStudents(f, [], [student]);
  assert.equal(f.profiles[0].archived, true);
  assert.deepEqual(F.report(f, "2026-01"), before);
});
test("transfer keeps historic group and rate on existing charges and payments", () => {
  const f = fresh();
  const old = f.profiles[0].groupId;
  F.ensureCharge(f, "s", "2026-01");
  pay(f, 300000);
  F.syncStudents(f, [{ ...student, group: "Взрослая", rate: 1500 }]);
  const next = f.profiles[0].groupId;
  F.ensureCharge(f, "s", "2026-02");
  pay(f, 150000, "2026-02", "2026-02-10");
  assert.equal(F.report(f, "2026-01", "accrual", old).received, 300000);
  assert.equal(F.report(f, "2026-01", "accrual", next).received, 0);
  assert.equal(f.charges[1].amountCents, 150000);
  assert.equal(f.charges[0].amountCents, 300000);
});
test("late payment for old period keeps old group after transfer", () => {
  const f = fresh();
  F.ensureCharge(f, "s", "2026-01");
  const old = f.profiles[0].groupId;
  F.syncStudents(f, [{ ...student, group: "Взрослая" }]);
  const p = pay(f, 300000, "2026-01", "2026-02-01");
  assert.equal(p.groupId, old);
});
test("expense edit and void retain originals in journal", () => {
  const f = fresh(),
    e = F.addExpense(f, {
      amountCents: 10000,
      date: "2026-02-02",
      period: "2026-01",
      category: "Аренда",
      note: "A",
    });
  F.correctExpense(
    f,
    e.id,
    { amountCents: 25000, category: "Зал", note: "B" },
    "Исправлена сумма",
  );
  assert.equal(F.report(f, "2026-01").expenses, 25000);
  const h = f.history.at(-1);
  assert.equal(h.before.amountCents, 10000);
  assert.equal(h.after.amountCents, 25000);
  F.correctExpense(f, e.id, { voided: true }, "Ошибка");
  assert.equal(F.report(f, "2026-01").expenses, 0);
  assert.equal(f.expenses.length, 1);
});
test("cash and allocation reports do not mix periods", () => {
  const f = fresh();
  F.ensureCharge(f, "s", "2026-01");
  F.ensureCharge(f, "s", "2026-02");
  pay(f, 200000, "2026-01", "2026-02-01");
  F.addExpense(f, {
    amountCents: 50000,
    date: "2026-02-02",
    period: "2026-01",
    category: "Зал",
  });
  const jan = F.report(f, "2026-01"),
    cashJan = F.report(f, "2026-01", "cash"),
    cashFeb = F.report(f, "2026-02", "cash");
  assert.equal(jan.charged, 300000);
  assert.equal(jan.debt, 100000);
  assert.equal(jan.result, 150000);
  assert.equal(cashJan.received, 0);
  assert.equal(cashJan.expenses, 0);
  assert.equal(cashFeb.received, 200000);
  assert.equal(cashFeb.result, 150000);
  assert.equal(jan.paidCount, 0);
  assert.equal(jan.debtCount, 1);
});
test("correction logs old payment and requires reason; financial records cannot disappear", () => {
  const f = fresh(),
    p = pay(f, 300000);
  assert.throws(() => F.correctPayment(f, p.id, { amountCents: 150000 }, ""));
  F.correctPayment(f, p.id, { amountCents: 150000 }, "Опечатка");
  assert.equal(f.history.at(-1).before.amountCents, 300000);
  assert.equal(f.history.at(-1).after.amountCents, 150000);
  F.correctPayment(f, p.id, { voided: true }, "Дубликат");
  assert.equal(f.payments.length, 1);
  assert.equal(F.report(f, "2026-01").received, 0);
});
test("correction cannot invalidate existing refunds", () => {
  const f = fresh(),
    p = pay(f, 300000);
  F.addPayment(f, {
    studentId: "s",
    amountCents: 200000,
    date: "2026-01-12",
    period: "2026-01",
    type: "refund",
    refundOf: p.id,
  });
  assert.throws(() =>
    F.correctPayment(f, p.id, { amountCents: 150000 }, "Ошибка"),
  );
  assert.throws(() => F.correctPayment(f, p.id, { voided: true }, "Ошибка"));
});
test("migration preserves every legacy record, flags, archives and raw values without guessing years", () => {
  const s = source();
  s.students[0].payments = {
    0: 3000,
    1: true,
    2: false,
    3: -1,
    4: { amount: 1500, date: "2025-05-01", extra: "keep" },
  };
  s.students[0].paid = true;
  s.archivedStudents = [{ ...student, id: "old", payments: { 5: 3000 } }];
  s.expenses = [{ id: "e", amount: 100, month: 0, category: "Зал" }];
  s.archivedExpenses = [{ id: "oldE", amount: 200, month: 1, category: "Зал" }];
  const before = F.copy(s),
    f = F.migrate(s);
  assert.deepEqual(s, before);
  assert.equal(f.legacy.length, 9);
  assert.equal(f.payments.length, 0);
  assert.equal(f.charges.length, 0);
  assert.equal(f.expenses.length, 0);
  assert.ok(f.legacy.every((e) => e.resolution === null));
  assert.deepEqual(F.migrate({ ...s, finance: f }), f);
});
test("manual period resolution is idempotent and retains original bytes/values", () => {
  const s = source();
  s.students[0].payments = { 0: { amount: 1500, date: "", extra: "keep" } };
  const f = F.migrate(s),
    entry = F.copy(f.legacy[0]);
  F.resolveLegacy(f, entry.id, {
    period: "2025-01",
    date: "2025-02-01",
    chargeCents: 300000,
  });
  assert.equal(F.balance(f, "s", "2025-01").debt, 150000);
  assert.deepEqual(f.legacy[0].original, entry.original);
  assert.throws(() =>
    F.resolveLegacy(f, entry.id, {
      period: "2026-01",
      date: "2026-01-01",
      chargeCents: 300000,
    }),
  );
  assert.equal(f.payments.length, 1);
});
test("failed reconciliation leaves even in-memory charges unchanged", () => {
  const s = source();
  s.students[0].payments = { 0: 1500 };
  const f = F.migrate(s),
    before = F.copy(f);
  assert.throws(() =>
    F.resolveLegacy(f, f.legacy[0].id, {
      period: "2025-01",
      date: "",
      chargeCents: 300000,
    }),
  );
  assert.deepEqual(f, before);
});
test("legacy attendance never removes financial charge", () => {
  const s = source();
  s.students[0].payments = { 0: -1 };
  const f = F.migrate(s);
  F.resolveLegacy(f, f.legacy[0].id, {
    period: "2025-01",
    chargeCents: 300000,
  });
  assert.equal(F.balance(f, "s", "2025-01").debt, 300000);
  assert.equal(F.balance(f, "s", "2025-01").noShow, true);
});
test("archived legacy expense remains void after explicit resolution", () => {
  const s = source();
  s.archivedExpenses = [{ id: "e", month: 0, amount: 100, category: "Зал" }];
  const f = F.migrate(s);
  F.resolveLegacy(f, f.legacy[0].id, { period: "2025-01", date: "2025-01-01" });
  assert.equal(f.expenses[0].voided, true);
  assert.equal(F.report(f, "2025-01").expenses, 0);
});
test("storage migration is deferred, backed up, versioned and repeatable", () => {
  const s = source();
  s.students[0].payments = { 0: 3000 };
  const { data, storage, loaded } = store(s),
    raw = storage.getItem(KEY);
  assert.equal(JSON.parse(raw).schemaVersion, 1);
  data.commit(loaded.students, loaded.expenses, loaded.finance);
  const v2 = JSON.parse(storage.getItem(KEY));
  assert.equal(v2.schemaVersion, 2);
  assert.equal(v2.finance.legacy.length, 1);
  assert.ok(
    [...storage.values].some(
      ([k, v]) =>
        k.startsWith("coachcontrol.backup.") && JSON.parse(v).raw[KEY] === raw,
    ),
  );
  const again = create(storage, { accounting: F }).load();
  assert.equal(again.finance.legacy.length, 1);
  assert.deepEqual(again.finance, v2.finance);
});
test("failed migration write restores accepted state and leaves exact v1 source", () => {
  const { data, storage, loaded } = store(),
    before = storage.getItem(KEY),
    snapshot = data.snapshot();
  F.ensureCharge(loaded.finance, "s", "2026-01");
  storage.fail = KEY;
  assert.throws(() =>
    data.commit(loaded.students, loaded.expenses, loaded.finance),
  );
  assert.equal(storage.getItem(KEY), before);
  assert.deepEqual(data.snapshot(), snapshot);
});
test("failed backup prevents migration", () => {
  const { data, storage, loaded } = store(),
    raw = storage.getItem(KEY);
  storage.fail = "all";
  assert.throws(() =>
    data.commit(loaded.students, loaded.expenses, loaded.finance),
  );
  assert.equal(storage.getItem(KEY), raw);
});
test("validation failure prevents changes to persisted data", () => {
  const { data, storage, loaded } = store(),
    raw = storage.getItem(KEY);
  loaded.finance.payments.push({ id: "bad", amountCents: 1.2 });
  assert.throws(() =>
    data.commit(loaded.students, loaded.expenses, loaded.finance),
  );
  assert.equal(storage.getItem(KEY), raw);
});
test("immutable source payments and journal entries cannot be rewritten", () => {
  const { data, loaded } = store();
  const changed = F.copy(loaded);
  changed.students[0].payments[0] = 3000;
  assert.throws(() =>
    data.commit(changed.students, changed.expenses, changed.finance),
  );
  F.ensureCharge(loaded.finance, "s", "2026-01");
  data.commit(loaded.students, loaded.expenses, loaded.finance);
  const next = data.snapshot();
  next.finance.history[0].reason = "rewrite";
  assert.throws(() => data.commit(next.students, next.expenses, next.finance));
});
test("migration supports raw legacy storage without changing original keys", () => {
  const raw = JSON.stringify([
      { student: "Старый", paid: true, payments: { 0: true } },
    ]),
    storage = new Storage({ students: raw }),
    data = create(storage, { accounting: F }),
    loaded = data.load();
  assert.equal(loaded.finance.legacy.length, 2);
  data.commit(loaded.students, [], loaded.finance);
  assert.equal(storage.getItem("students"), raw);
  assert.equal(JSON.parse(storage.getItem(KEY)).schemaVersion, 2);
});

test("verified-write failure rolls back exact version-one document", () => {
  const { data, storage, loaded } = store(),
    raw = storage.getItem(KEY),
    set = storage.setItem.bind(storage);
  let corrupt = true;
  storage.setItem = (k, v) => {
    if (k === KEY && corrupt) {
      corrupt = false;
      set(k, "{invalid");
    } else set(k, v);
  };
  assert.throws(
    () => data.commit(loaded.students, loaded.expenses, loaded.finance),
    /отменена/,
  );
  assert.equal(storage.getItem(KEY), raw);
  assert.equal(data.snapshot().schemaVersion, 1);
});
test("corrupt first write rolls back to absent key", () => {
  const storage = new Storage({ bjj_students: JSON.stringify([student]) }),
    data = create(storage, { accounting: F }),
    loaded = data.load(),
    set = storage.setItem.bind(storage);
  storage.removeItem = (k) => storage.values.delete(k);
  storage.setItem = (k, v) => set(k, k === KEY ? "{invalid" : v);
  assert.throws(
    () => data.commit(loaded.students, loaded.expenses, loaded.finance),
    /отменена/,
  );
  assert.equal(storage.getItem(KEY), null);
  assert.equal(storage.getItem("bjj_students"), JSON.stringify([student]));
});
test("unverifiable rollback blocks further writes and retains backup evidence", () => {
  const { data, storage, loaded } = store(),
    set = storage.setItem.bind(storage);
  storage.setItem = (k, v) => set(k, k === KEY ? "{invalid" : v);
  assert.throws(
    () => data.commit(loaded.students, loaded.expenses, loaded.finance),
    /откат/,
  );
  assert.equal(data.blocked, true);
  assert.ok(
    Object.keys(data.exportBackup().raw).some((k) =>
      k.startsWith("coachcontrol.backup."),
    ),
  );
  assert.throws(() =>
    data.commit(loaded.students, loaded.expenses, loaded.finance),
  );
});
test("persisted payment edits without an audit event are rejected", () => {
  const { data, loaded } = store();
  F.addPayment(loaded.finance, {
    studentId: "s",
    amountCents: 300000,
    date: "2026-01-01",
    period: "2026-01",
  });
  data.commit(loaded.students, loaded.expenses, loaded.finance);
  const next = data.snapshot();
  next.finance.payments[0].amountCents = 1;
  assert.throws(
    () => data.commit(next.students, next.expenses, next.finance),
    /истории/,
  );
});
test("legacy assignment after transfer retains source group and consistent audit", () => {
  const s = source();
  s.students[0].payments = { 0: 3000 };
  const f = F.migrate(s),
    old = f.profiles[0].groupId;
  F.syncStudents(f, [{ ...student, group: "Взрослая" }]);
  F.resolveLegacy(f, f.legacy[0].id, {
    period: "2025-01",
    date: "2025-01-01",
    chargeCents: 300000,
  });
  assert.equal(f.payments[0].groupId, old);
  assert.equal(f.charges[0].groupId, old);
  assert.equal(
    f.history.find((h) => h.entity === "payment").after.groupId,
    old,
  );
  assert.equal(f.history.find((h) => h.entity === "charge").after.groupId, old);
});

test("missing legacy source representation blocks canonical reload", () => {
  const s = source();
  s.students[0].payments = { 0: 3000 };
  const f = F.migrate(s);
  f.legacy = [];
  f.migration.legacyIds = [];
  const storage = new Storage({
      [KEY]: JSON.stringify({ ...s, schemaVersion: 2, finance: f }),
    }),
    data = create(storage, { accounting: F });
  data.load();
  assert.equal(data.blocked, true);
  assert.match(data.error, /исходный платёж/);
});
test("legacy originals and migration identity remain immutable after resolution", () => {
  const s = source();
  s.students[0].payments = { 0: 3000 };
  const { data, loaded } = store(s);
  F.resolveLegacy(loaded.finance, loaded.finance.legacy[0].id, {
    period: "2025-01",
    date: "2025-01-10",
    chargeCents: 300000,
  });
  data.commit(loaded.students, loaded.expenses, loaded.finance);
  const next = data.snapshot();
  next.finance.legacy[0].resolution = null;
  assert.throws(
    () => data.commit(next.students, next.expenses, next.finance),
    /Повторное/,
  );
});

test("legacy archived student name aliases survive repeated saves", () => {
  const s = source();
  s.archivedStudents = [
    {
      id: "old",
      student: "Старое имя",
      group: "Детская",
      payments: { 0: 3000 },
    },
  ];
  const { data, loaded } = store(s);
  data.commit(loaded.students, loaded.expenses, loaded.finance);
  const next = data.snapshot();
  data.commit(next.students, next.expenses, next.finance);
  assert.equal(
    data.snapshot().finance.profiles.find((p) => p.studentId === "old").name,
    "Старое имя",
  );
});

test("confirmed correction 3000 -> 2000 settles a 2000 payment without losing history", () => {
  const f = fresh();
  F.ensureCharge(f, "s", "2026-11");
  F.syncStudents(f, [{ ...student, rate: 2000, rateCents: 200000 }]);
  assert.equal(F.balance(f, "s", "2026-11").charged, 300000);
  F.correctCharge(f, "s", "2026-11", 200000, "Тариф исправлен на 2000");
  F.addPayment(f, {
    studentId: "s", period: "2026-11", date: "2026-11-05",
    amountCents: 200000,
  });
  const balance = F.balance(f, "s", "2026-11");
  assert.equal(balance.debt, 0);
  assert.equal(balance.fullyPaid, true);
  const history = f.history.find((h) =>
    h.entity === "charge" && h.action === "correct");
  assert.equal(history.before.amountCents, 300000);
  assert.equal(history.after.amountCents, 200000);
});
test("charge change without audit is rejected on saving", () => {
  const { data, loaded } = store();
  F.ensureCharge(loaded.finance, "s", "2026-11");
  data.commit(loaded.students, loaded.expenses, loaded.finance);
  const snapshot = data.snapshot();
  snapshot.finance.charges[0].amountCents = 200000;
  assert.throws(() =>
    data.commit(snapshot.students, snapshot.expenses, snapshot.finance),
    /начисления/,
  );
});
test("charge correction with audit passes storage validation", () => {
  const { data, loaded } = store();
  F.ensureCharge(loaded.finance, "s", "2026-11");
  data.commit(loaded.students, loaded.expenses, loaded.finance);
  const snapshot = data.snapshot();
  F.correctCharge(snapshot.finance, "s", "2026-11", 200000, "Изменился тариф");
  data.commit(snapshot.students, snapshot.expenses, snapshot.finance);
  assert.equal(data.snapshot().finance.charges[0].amountCents, 200000);
});
