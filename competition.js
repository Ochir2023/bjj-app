/* Competition roster and club reports. No network access or private-data upload. */
let competitionDate = "";
let competitionSearch = "";
let competitionGroupId = "";
function contestAge(born, onDate) {
  if (!born || !/^\d{4}-\d{2}-\d{2}$/.test(born)) return null;
  const [y,m,d] = born.split("-").map(Number);
  const dob = new Date(Date.UTC(y,m-1,d));
  if (dob.toISOString().slice(0,10) !== born) return null;
  const target = onDate ? new Date(onDate + "T12:00:00") : new Date();
  if (isNaN(target.getTime()) || target.getFullYear() < y) return null;
  let age = target.getFullYear() - y;
  if (target.getMonth()+1 < m || (target.getMonth()+1 === m && target.getDate() < d)) age--;
  return age;
}
function contestSelected() {
  return students.filter((s) => s.competitionSelected === true);
}
function competitionCSV(rows, dateValue = "") {
  const safe = (value) => {
    const str = String(value ?? "");
    return /^[\s]*[=+@-]/.test(str) || /^[\t\r\n]/.test(str) ? "'" + str : str;
  };
  const quote = (value) => '"' + safe(value).replace(/"/g,'""') + '"';
  const header = ["№","ФИО участника","Дата рождения","Возраст (полных лет)","Вес, кг","Группа","ФИО родителя","Телефон родителя"];
  const records = rows.map((s,i) => [
    i+1,s.name,s.birthDate || "",contestAge(s.birthDate,dateValue) ?? "",
    s.weightKg == null ? "" : String(s.weightKg).replace(".",","),
    s.group || "",s.parent || "",s.phone || ""
  ]);
  return "\ufeff" + [header,...records].map(row=>row.map(quote).join(";")).join("\r\n");
}
function contestExport() {
  const selected=contestSelected();
  if(!selected.length) return alert("Отметьте хотя бы одного участника.");
  const incomplete=selected.filter(s=> !s.birthDate || s.weightKg == null ||
    (groupNeedsParent(s.group) && (!s.parent || !s.phone)));
  if(incomplete.length && !confirm("У "+incomplete.length+
    " участников не заполнены дата рождения, вес или данные родителя. Экспортировать с пустыми полями?")) return;
  if(!confirm("Скачать заявку с личными данными детей и телефонами родителей? Передавайте файл только организаторам соревнований.")) return;
  const csv=competitionCSV(selected,competitionDate);
  downloadText("coachcontrol-competition-"+(competitionDate||"roster")+".csv",csv,"text/csv;charset=utf-8");
}
function renderCompetition(tools,list) {
  list.className="students-grid";
  const note=document.createElement("p");
  note.className="small";
  note.textContent="Выберите спортсменов для заявки. Отметки сохраняются в карточках на этом устройстве. Возраст рассчитывается на дату соревнования, если она указана.";
  tools.appendChild(note);
  const dateLabel=document.createElement("label");
  dateLabel.className="field-label";
  dateLabel.textContent="Дата соревнования";
  const date=document.createElement("input");
  date.type="date";date.id="competitionDate";date.value=competitionDate;
  date.onchange=()=>{competitionDate=date.value;render();};
  dateLabel.appendChild(date);tools.appendChild(dateLabel);
  const group=document.createElement("select");group.id="competitionGroup";
  group.setAttribute("aria-label","Фильтр по группе");
  const all=document.createElement("option");all.value="";all.textContent="Все группы";group.appendChild(all);
  activeGroups().forEach(g=>{const option=document.createElement("option");option.value=g.id;option.textContent=g.name;group.appendChild(option);});
  group.value=competitionGroupId;
  group.onchange=()=>{competitionGroupId=group.value;render();};
  tools.appendChild(group);
  const search=document.createElement("input");search.type="search";
  search.id="competitionSearch";search.placeholder="Поиск ученика";
  search.setAttribute("aria-label","Найти участника");
  search.value=competitionSearch;
  search.oninput=()=>{competitionSearch=search.value;draw();};
  tools.appendChild(search);
  const summary=document.createElement("p");summary.id="competitionCount";
  tools.appendChild(summary);
  const actions=document.createElement("div");actions.className="utility-actions";
  button(actions,"Скачать заявку CSV",contestExport,"export","btn primary");
  button(actions,"Снять все отметки",async()=>{
    if(!contestSelected().length || !confirm("Снять отметки у всех участников?"))return;
    const prior=students.map(s=>({id:s.id,competitionSelected:s.competitionSelected}));
    students.forEach(s=>s.competitionSelected=false);
    if(!await save()) return;
    render();
  });
  tools.appendChild(actions);
  const draw=()=>{
    list.innerHTML="";
    const selected=contestSelected();
    summary.textContent="Отмечено участников: "+selected.length+" из "+students.length;
    const query=competitionSearch.trim().toLocaleLowerCase("ru");
    const people=students.filter(s=> (!competitionGroupId ||
      finance.profiles.some(p=>p.studentId===s.id && p.groupId===competitionGroupId)) &&
      s.name.toLocaleLowerCase("ru").includes(query));
    if(!people.length){empty(list,"Учеников не найдено.");return;}
    people.forEach(s=>{
      const row=document.createElement("label");row.className="card";
      row.style.display="flex";row.style.gap="12px";row.style.alignItems="center";
      const cb=document.createElement("input");cb.type="checkbox";
      cb.checked=!!s.competitionSelected;
      cb.setAttribute("aria-label","Участник: "+s.name);
      cb.onchange=async()=>{
        const prior=s.competitionSelected;
        s.competitionSelected=cb.checked;
        const ok=await save();
        if(!ok){s.competitionSelected=prior;cb.checked=!!prior;}
        summary.textContent="Отмечено участников: "+contestSelected().length+" из "+students.length;
      };
      const label=document.createElement("span");
      const age=contestAge(s.birthDate,competitionDate);
      const missing=[];
      if(!s.birthDate)missing.push("дата рождения");
      if(s.weightKg == null)missing.push("вес");
      if(groupNeedsParent(s.group)&&!s.parent)missing.push("ФИО родителя");
      if(groupNeedsParent(s.group)&&!s.phone)missing.push("телефон");
      const text=document.createElement("strong");text.textContent=s.name;
      const info=document.createElement("span");info.className="small";info.style.display="block";
      info.textContent=[s.group,age==null?"Возраст не указан":age+" лет",
        s.weightKg==null?"Вес не указан":String(s.weightKg).replace(".",",")+" кг"].join(" · ");
      label.appendChild(text);label.appendChild(info);
      if(missing.length){const warning=document.createElement("span");warning.className="small";
        warning.style.display="block";warning.textContent="Заполнить: "+missing.join(", ");label.appendChild(warning);}
      row.appendChild(cb);row.appendChild(label);list.appendChild(row);
    });
  };
  draw();
}
function renderClubAnalytics(tools,list) {
  const period=periodFor(monthIndex);
  const summary=Ledger.report(finance,period,reportBasis);
  const heading=document.createElement("p");heading.className="small";
  heading.textContent="Сводка руководителя за "+period+
    ". Финансы — по выбранному режиму; долги и начисления — за период. Только данные этого устройства.";
  tools.appendChild(heading);
  const card=document.createElement("div");card.className="card";
  card.textContent="Активных учеников: "+students.length+" · групп: "+activeGroups().length+
    " · начислено: "+rubles(summary.charged)+" · получено: "+rubles(summary.received)+
    " · долги: "+rubles(summary.debt);
  tools.appendChild(card);
  list.className="students-grid";
  for(const g of activeGroups()){
    const r=Ledger.report(finance,period,reportBasis,g.id);
    const tile=document.createElement("div");tile.className="card";
    const title=document.createElement("strong");title.textContent=g.name;
    const info=document.createElement("p");info.className="small";
    info.textContent="Учеников: "+membersOf(g.id).length+" · начислено: "+rubles(r.charged)+
      " · платежи: "+rubles(r.received)+" · задолженность: "+rubles(r.debt);
    tile.appendChild(title);tile.appendChild(info);list.appendChild(tile);
  }
  const note=document.createElement("p");note.className="small";
  note.textContent="Облачная синхронизация, отдельные аккаунты тренеров и права доступа пока не реализованы. Не передавайте общий PIN для доступа к данным детей.";
  tools.appendChild(note);
}
if (typeof module!=="undefined" && module.exports)
  module.exports={contestAge,competitionCSV};
