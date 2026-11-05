const { test } = require("node:test");
const assert = require("node:assert/strict");
const F = require("../finance.js");
const { create, KEY } = require("../data-store.js");
const student = {
  id: "s",
  name: "Иван",
  group: "Детская",
  parent: "Родитель",
  phone: "1",
  rate: 3000,
  payments: { 0: 3000 },
};
const state = () => ({
  schemaVersion: 1,
  revision: 1,
  students: [structuredClone(student)],
  expenses: [],
  archivedStudents: [],
  archivedExpenses: [],
});
test("dynamic group creation, duplicate rejection and archival", () => {
  const f = F.migrate(state()),
    g = F.addGroup(f, "Плавание");
  assert.equal(g.name, "Плавание");
  assert.throws(() => F.addGroup(f, "плавание"));
  F.archiveGroup(f, g.id);
  assert.equal(f.groups.find((x) => x.id === g.id).archived, true);
  assert.throws(() => F.addGroup(f, "Плавание"));
});
test("rename keeps original IDs, child rule and historical totals", () => {
  const f = F.migrate(state()),
    g = f.groups.find((g) => g.name === "Детская");
  F.ensureCharge(f, "s", "2026-01");
  F.addPayment(f, {
    studentId: "s",
    period: "2026-01",
    date: "2026-01-10",
    amountCents: 150000,
  });
  const before = F.report(f, "2026-01", "accrual", g.id);
  F.renameGroup(f, g.id, "Юниоры");
  F.syncStudents(f, [{ ...student, group: "Юниоры" }]);
  F.syncStudents(f, [], [student]);
  assert.deepEqual(F.report(f, "2026-01", "accrual", g.id), before);
  assert.equal(f.groups.length, 3);
  assert.equal(f.groups.find((x) => x.id === g.id).requiresParent, true);
  assert.equal(f.profiles[0].groupId, g.id);
});
test("group with active students cannot be archived; history survives later archive", () => {
  const f = F.migrate(state()),
    g = f.groups[0];
  assert.throws(() => F.archiveGroup(f, g.id));
  F.syncStudents(f, [], [student]);
  F.archiveGroup(f, g.id);
  assert.equal(f.profiles[0].groupId, g.id);
  assert.equal(f.legacy.length, 1);
});
test("case-only rename remains unambiguous within the same group", () => {
  const f = F.migrate(state()),
    g = f.groups[0];
  F.renameGroup(f, g.id, "ДЕТСКАЯ");
  F.syncStudents(f, [student]);
  assert.equal(f.groups.length, 3);
  assert.equal(f.groups[0].id, g.id);
});
test("persisted renamed group preserves archived original profile and source records", () => {
  const s = state();
  s.archivedStudents = [{ ...student, id: "old" }];
  const values = new Map([[KEY, JSON.stringify(s)]]);
  const storage = {
    get length() {
      return values.size;
    },
    key: (i) => [...values.keys()][i],
    getItem: (k) => values.get(k) ?? null,
    setItem: (k, v) => values.set(k, v),
  };
  const data = create(storage, { accounting: F }),
    loaded = data.load(),
    g = loaded.finance.groups[0];
  F.renameGroup(loaded.finance, g.id, "Юниоры");
  loaded.students[0].group = "Юниоры";
  data.commit(loaded.students, loaded.expenses, loaded.finance);
  const reloaded = create(storage, { accounting: F }).load();
  assert.equal(reloaded.finance.groups.length, 3);
  assert.equal(reloaded.archivedStudents[0].group, "Детская");
  assert.deepEqual(reloaded.students[0].payments, student.payments);
  assert.equal(
    reloaded.finance.profiles.find((p) => p.studentId === "old").groupId,
    g.id,
  );
});
