const {test}=require("node:test");
const assert=require("node:assert/strict");
const {contestAge,competitionCSV}=require("../competition.js");
test("competition age depends on tournament date, not current year alone",()=>{
  assert.equal(contestAge("2016-11-09","2026-11-08"),9);
  assert.equal(contestAge("2016-11-09","2026-11-09"),10);
  assert.equal(contestAge("2016-11-09","2026-11-10"),10);
  assert.equal(contestAge("","2026-11-10"),null);
});
test("roster includes requested parent contact, weight and full age",()=>{
  const csv=competitionCSV([{name:"Тест Участник",birthDate:"2016-11-09",weightKg:31.5,group:"Детская",parent:"Тест Родитель",phone:"000-000"}],"2026-11-10");
  assert.match(csv,/ФИО участника/);
  assert.match(csv,/ФИО родителя/);
  assert.match(csv,/Телефон родителя/);
  assert.match(csv,/Тест Участник/);
  assert.match(csv,/Тест Родитель/);
  assert.match(csv,/000-000/);
  assert.match(csv,/31,5/);
  assert.match(csv,/10/);
});
test("csv escapes user-supplied Excel formulas and quotes",()=>{
  const csv=competitionCSV([{name:"=NOW()",birthDate:"",weightKg:null,group:"Зал",parent:'+1"2',phone:"@external"}]);
  assert.ok(csv.includes("'=NOW()"));
  assert.ok(csv.includes("'+1"));
  assert.ok(csv.includes("'@external"));
  assert.ok(csv.includes('""'));
});
