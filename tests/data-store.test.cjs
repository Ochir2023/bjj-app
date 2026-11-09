const {test} = require('node:test');
const assert = require('node:assert/strict');
const {create,KEY} = require('../data-store.js');
class Storage {
  constructor(values={}) { this.values=new Map(Object.entries(values)); this.fail=null; }
  get length(){return this.values.size;}
  key(i){return [...this.values.keys()][i];}
  getItem(k){if(this.fail==='read')throw Error('SecurityError');return this.values.get(k)??null;}
  setItem(k,v){if(this.fail==='all'||this.fail===k)throw Error('QuotaExceededError');this.values.set(k,String(v));}
  removeItem(k){this.values.delete(k);}
}
const student={id:'s',name:'Иван',group:'Детская',phone:'1',parent:'Родитель',rate:3000,payments:{0:true,1:1500,2:{amount:3000,date:'2025-03-01',extra:'preserve'}},paid:true,custom:'keep'};
const legacy=()=>new Storage({bjj_students:JSON.stringify([student]),bjj_expenses:'[]'});
test('loading legacy does not write or assign a period to paid',()=>{const s=legacy(),before=[...s.values];const d=create(s),v=d.load();assert.deepEqual([...s.values],before);assert.deepEqual(v.students[0],student);});
test('first edit backs up raw bytes and keeps all legacy keys and unknown fields',()=>{const s=legacy(),raw=s.getItem('bjj_students'),d=create(s),v=d.load();v.students[0].name='Пётр';d.commit(v.students,v.expenses);assert.equal(s.getItem('bjj_students'),raw);const b=JSON.parse([...s.values].find(([k])=>k.startsWith('coachcontrol.backup.'))[1]);assert.equal(b.raw.bjj_students,raw);const next=JSON.parse(s.getItem(KEY));assert.equal(next.schemaVersion,1);assert.equal(next.students[0].custom,'keep');assert.deepEqual(next.students[0].payments,student.payments);});
test('reload is idempotent without new backups or writes',()=>{const s=legacy(),d=create(s),v=d.load();d.commit(v.students,[]);const before=[...s.values];assert.deepEqual(create(s).load(),d.snapshot());assert.deepEqual([...s.values],before);});
for(const raw of ['{broken','{}','null','[null]','[{"payments":{"0":{"amount":"bad"}}}]']) test('invalid data blocks writes and exports exact raw: '+raw,()=>{const s=new Storage({bjj_students:raw}),d=create(s);d.load();assert.equal(d.blocked,true);assert.throws(()=>d.commit([],[]));assert.equal(d.exportBackup().raw.bjj_students,raw);assert.equal(s.getItem('bjj_students'),raw);assert.equal(s.getItem(KEY),null);});
test('future version stays untouched',()=>{const raw=JSON.stringify({schemaVersion:99}),s=new Storage({[KEY]:raw}),d=create(s);d.load();assert.equal(d.blocked,true);assert.equal(d.exportBackup().raw[KEY],raw);});
test('unavailable storage blocks loading without throwing',()=>{const s=new Storage();s.fail='read';const d=create(s);assert.doesNotThrow(()=>d.load());assert.equal(d.blocked,true);assert.throws(()=>d.commit([],[]));});
test('backup failure prevents active write',()=>{const s=legacy(),d=create(s),v=d.load();s.fail='all';assert.throws(()=>d.commit(v.students,[]));assert.equal(s.getItem(KEY),null);assert.equal(d.snapshot().revision,0);});
test('active write failure leaves prior data plus recoverable backup',()=>{const s=legacy(),d=create(s),v=d.load();s.fail=KEY;assert.throws(()=>d.commit(v.students,[]));assert.equal(s.getItem(KEY),null);assert.ok([...s.values.keys()].some(k=>k.startsWith('coachcontrol.backup.')));assert.equal(d.snapshot().revision,0);});
test('stale tab cannot overwrite another tab',()=>{const s=legacy(),a=create(s),b=create(s),av=a.load(),bv=b.load();av.students[0].name='new';a.commit(av.students,[]);assert.throws(()=>b.commit(bv.students,[]),/другой вкладке/);assert.equal(JSON.parse(s.getItem(KEY)).students[0].name,'new');});
test('student and expense removal archives complete records',()=>{const s=legacy();s.setItem('bjj_expenses',JSON.stringify([{id:'e',month:0,amount:500,category:'Аренда'}]));const d=create(s),v=d.load();d.commit([],[]);assert.deepEqual(d.snapshot().archivedStudents,v.students);assert.deepEqual(d.snapshot().archivedExpenses,v.expenses);});
test('explicit payment correction keeps prior financial record in snapshot',()=>{const s=legacy(),d=create(s),v=d.load();d.commit(v.students,[]);v.students[0].payments[2]={amount:1500,date:''};d.commit(v.students,[]);const backups=[...s.values].filter(([k])=>k.startsWith('coachcontrol.backup.')).map(([,v])=>JSON.parse(v));assert.ok(backups.some(b=>b.current.students[0].payments[2].amount===3000));});
test('both legacy sources are preserved and conflicting lists block writes',()=>{const s=legacy();s.setItem('students','[{"student":"Other"}]');const d=create(s);d.load();assert.equal(d.blocked,true);assert.equal(d.exportBackup().raw.students,'[{"student":"Other"}]');});
test('old students key supported without deleting source or inventing month',()=>{const raw='[{"student":"Old","paid":true}]',s=new Storage({students:raw}),d=create(s),v=d.load();assert.equal(v.students[0].name,'Old');assert.deepEqual(v.students[0].payments,{});assert.equal(v.students[0].paid,true);assert.equal(s.getItem('students'),raw);});
test('export includes archives, malformed raw and independent backups, excludes unrelated keys',()=>{const s=legacy();s.setItem('unrelated','private');const d=create(s),v=d.load();d.commit([],[]);const e=d.exportBackup();assert.equal(e.current.archivedStudents.length,1);assert.ok(Object.keys(e.raw).some(k=>k.startsWith('coachcontrol.backup.')));assert.equal(e.raw.unrelated,undefined);});
test('invalid expense and duplicate student IDs block load',()=>{for(const values of [{bjj_expenses:'[{"id":"e","amount":-1,"month":12,"category":"X"}]'},{bjj_students:JSON.stringify([student,student])}]){const d=create(new Storage(values));d.load();assert.equal(d.blocked,true);}});

test('older application edits to legacy keys prevent migration/save',()=>{const s=legacy(),d=create(s),v=d.load();const changed=JSON.stringify([{...student,name:'Old tab changed'}]);s.setItem('bjj_students',changed);assert.throws(()=>d.commit(v.students,[]),/другой версией/);assert.equal(s.getItem(KEY),null);assert.equal(s.getItem('bjj_students'),changed);});
test('unverified backup prevents migration',()=>{const s=legacy(),write=s.setItem.bind(s);s.setItem=(k,v)=>write(k,k.startsWith('coachcontrol.backup.')?'corrupt':v);const d=create(s),v=d.load();assert.throws(()=>d.commit(v.students,[]),/проверить резервную/);assert.equal(s.getItem(KEY),null);});
test('canonical records without IDs are blocked rather than silently reidentified',()=>{const s=new Storage({[KEY]:JSON.stringify({schemaVersion:1,revision:1,students:[{name:'No ID'}],expenses:[],archivedStudents:[],archivedExpenses:[]})});const d=create(s);d.load();assert.equal(d.blocked,true);});

test('empty expense string is corruption, not an empty list',()=>{const s=new Storage({bjj_expenses:''}),d=create(s);d.load();assert.equal(d.blocked,true);assert.equal(d.exportBackup().raw.bjj_expenses,'');assert.throws(()=>d.commit([],[]));});

test('many edits reuse one internal snapshot rather than filling localStorage',()=>{
  const s=legacy(),d=create(s),v=d.load();
  for(let i=0;i<30;i++) {
    v.students[0].name='Ученик '+i;
    d.commit(v.students,v.expenses);
  }
  const keys=[...s.values.keys()].filter(k=>k.startsWith('coachcontrol.backup.'));
  assert.deepEqual(keys,['coachcontrol.backup.rolling-v2']);
  assert.equal(JSON.parse(s.getItem(KEY)).students[0].name,'Ученик 29');
});
test('quota recovery preserves current data while removing only verified snapshots',()=>{
  const s=legacy(),d=create(s),v=d.load();
  d.commit(v.students,v.expenses);
  const current=s.getItem(KEY);
  const historical=JSON.stringify({
    format:'CoachControlBackup',formatVersion:1,
    current:d.snapshot(),createdAt:'2026-01-01T00:00:00Z'
  });
  for(let i=0;i<5;i++)s.setItem('coachcontrol.backup.historical-'+i,historical);
  s.setItem('coachcontrol.backup.unknown','corrupted important data');
  const compact=d.exportCompactBackup();
  assert.equal(compact.raw[KEY],current);
  assert.equal(compact.current.students[0].name,'Иван');
  assert.equal(Object.keys(compact.raw).some(k=>k.startsWith('coachcontrol.backup.')),false);
  assert.ok(Object.keys(d.exportBackup().raw).some(k=>k.startsWith('coachcontrol.backup.')));
  const result=d.removeOldSnapshots();
  assert.equal(result.removed,6);
  assert.equal(s.getItem(KEY),current);
  assert.equal(s.getItem('bjj_students'),JSON.stringify([student]));
  assert.equal(s.getItem('coachcontrol.backup.unknown'),'corrupted important data');
  assert.equal(d.storageUsage().snapshots,1);
  const next=d.snapshot();
  next.students[0].name='После очистки';
  d.commit(next.students,next.expenses);
  assert.equal(JSON.parse(s.getItem(KEY)).students[0].name,'После очистки');
});
test('quota failure does not change current student records and recovery permits saving',()=>{
  const s=legacy(),d=create(s),v=d.load();
  d.commit(v.students,v.expenses);
  const historical=JSON.stringify({
    format:'CoachControlBackup',formatVersion:1,current:d.snapshot()
  });
  for(let i=0;i<5;i++)s.setItem('coachcontrol.backup.historical-'+i,historical);
  let maxBytes=[...s.values].reduce((n,[k,value])=>n+2*(k.length+value.length),0);
  const originalSet=s.setItem.bind(s);
  s.setItem=(k,v)=>{
    const currentBytes=[...s.values].reduce((n,[key,value])=>n+2*(key.length+value.length),0);
    const old=s.getItem(k);
    const prospective=currentBytes-2*(old===null?0:k.length+old.length)+2*(k.length+String(v).length);
    if(prospective>maxBytes)throw Error('QuotaExceededError');
    originalSet(k,v);
  };
  const changed=d.snapshot();changed.students[0].name='Новый ученик';
  assert.throws(()=>d.commit(changed.students,changed.expenses),/QuotaExceededError/);
  assert.equal(JSON.parse(s.getItem(KEY)).students[0].name,'Иван');
  assert.equal(d.exportCompactBackup().current.students[0].name,'Иван');
  d.removeOldSnapshots();
  d.commit(changed.students,changed.expenses);
  assert.equal(JSON.parse(s.getItem(KEY)).students[0].name,'Новый ученик');
});
