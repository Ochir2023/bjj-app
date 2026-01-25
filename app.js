document.getElementById("confirmDelete").classList.add("hidden");
let deleteIndex = null;

const PIN = "1234";
let currentGroup = "Детская";
let students = JSON.parse(localStorage.getItem("students") || "[]");
let deleteIndex = null;

function checkPin() {
  const pin = document.getElementById("pinInput").value;
  if (pin === PIN) {
    document.getElementById("pinScreen").classList.add("hidden");
    document.getElementById("appScreen").classList.remove("hidden");

    closeDelete(); // ← ВАЖНО
    render();
  } else {
    alert("Неверный PIN");
  }
}

function setGroup(group) {
  currentGroup = group;
  render();
}

function render(){
  updateHeader();
  const list = document.getElementById("list");
  list.innerHTML = "";

  // вкладка "Оплата" остаётся отдельной
  if(mainTab === "Оплата"){
    renderPaymentsTab();
    return;
  }

  // делаем список плитками
  list.classList.add("students-grid");

  const groupList = students.filter(s=>s.group === mainTab);
  if(groupList.length === 0){
    list.appendChild(emptyCard(`В группе "${mainTab}" пока нет учеников. Нажмите “＋” чтобы добавить.`));
    return;
  }

  groupList.forEach(s=>{
    const v = monthStatusValue(s, selectedMonthIndex);
    const cls = statusClass(v); // ok / warn / bad

    const tile = document.createElement("div");
    tile.className = "tile";
    tile.onclick = () => openInfo(s.id);

    // набор маленьких иконок: телефон, тариф, родитель(если есть)
    const phoneIcon = `<span class="ico muted" title="Телефон">📞</span>`;
    const rateIcon  = `<span class="ico gold" title="Тариф">${s.rate === 1500 ? "₽1500" : "₽3000"}</span>`;
    const parentIcon = s.parent ? `<span class="ico muted" title="Родитель">👪</span>` : "";

    tile.innerHTML = `
      <div class="tile-top">
        <div class="tile-name">${escapeHtml(s.name)}</div>
        <div class="status-dot ${cls}" title="${escapeHtml(statusLabel(v))}"></div>
      </div>

      <div class="tile-icons">
        ${phoneIcon}
        ${rateIcon}
        ${parentIcon}
        <span class="badge-mini">${MONTHS[selectedMonthIndex]}</span>
      </div>
    `;

    list.appendChild(tile);
  });
}

  localStorage.setItem("students", JSON.stringify(students));
}

function openAddModal() {
  document.getElementById("addModal").classList.remove("hidden");

  if (currentGroup === "Детская") {
    document.getElementById("parentName").style.display = "block";
  } else {
    document.getElementById("parentName").style.display = "none";
  }
}

function closeAddModal() {
  document.getElementById("addModal").classList.add("hidden");
}

function saveStudent() {
  const parent = document.getElementById("parentName").value;
  const phone = document.getElementById("parentPhone").value;
  const student = document.getElementById("studentName").value;

  students.push({
    group: currentGroup,
    parent: currentGroup === "Детская" ? parent : "",
    phone,
    student
  });

  closeAddModal();
  render();
}

function askDelete(i) {
  deleteIndex = i;
  document.getElementById("confirmDelete").classList.remove("hidden");
}

function closeDelete() {
  document.getElementById("confirmDelete").classList.add("hidden");
}

function confirmDeleteYes() {
  students.splice(deleteIndex, 1);
  closeDelete();
  render();
}
