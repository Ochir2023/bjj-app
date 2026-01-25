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

function render() {
  const list = document.getElementById("list");
  list.innerHTML = "";

  students
    .filter(s => s.group === currentGroup)
    .forEach((s, i) => {
      const div = document.createElement("div");
      div.innerHTML = `
        <strong>${s.student}</strong><br>
        ${s.parent ? "Родитель: " + s.parent + "<br>" : ""}
        Телефон: ${s.phone}<br>
        <button onclick="askDelete(${i})">Удалить</button>
      `;
      list.appendChild(div);
    });

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
