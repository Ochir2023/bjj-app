if(!localStorage.pin) localStorage.pin='1234';
const FIXED_PAYMENT=3000;
let currentGroup='Детская';
let data=JSON.parse(localStorage.getItem('bjj_data')||'[]');
const months=["Январь","Февраль","Март","Апрель","Май","Июнь","Июль","Август","Сентябрь","Октябрь","Ноябрь","Декабрь"];

const pinScreen=document.getElementById('pinScreen');
const app=document.getElementById('app');
const formBlock=document.getElementById('formBlock');
const parentInput=document.getElementById('parentInput');
const phoneInput=document.getElementById('phoneInput');
const studentInput=document.getElementById('studentInput');
const list=document.getElementById('list');
const tabs=document.querySelectorAll('.tab');
const loginBtn=document.getElementById('loginBtn');
const addBtn=document.getElementById('addStudentBtn');
const toggleFormBtn=document.getElementById('toggleForm');

// Модалка
const modal=document.getElementById('modal');
modal.classList.add('hidden');
const modalText=document.getElementById('modal-text');
const modalOk=document.getElementById('modal-ok');
const modalCancel=document.getElementById('modal-cancel');
let currentAction=null;
let currentIndex=null;

// Вход по PIN
loginBtn.addEventListener('click',()=>{
  if(document.getElementById('pinInput').value===localStorage.pin){
    pinScreen.classList.add('hidden');
    app.classList.remove('hidden');
    render();
  } else alert("Неверный PIN");
});

// Вкладки
tabs.forEach(tab=>{
  tab.addEventListener('click',()=>{
    currentGroup=tab.dataset.group;
    tabs.forEach(t=>t.classList.remove('active'));
    tab.classList.add('active');
    formBlock.classList.add('hidden');
    render();
  });
});

// Плюс — показать форму
toggleFormBtn.addEventListener('click',()=>{
  formBlock.classList.toggle('hidden');
  adjustFormFields();
});

// Адаптация полей
function adjustFormFields(){
  if(currentGroup==="Детская"){
    document.getElementById('parentField').style.display='block';
    studentInput.placeholder="ФИО ученика";
  } else {
    document.getElementById('parentField').style.display='none';
    studentInput.placeholder="ФИО спортсмена";
  }
}

// Добавление ученика
addBtn.addEventListener('click',()=>{
  const parent=parentInput.value.trim();
  const phone=phoneInput.value.trim();
  const student=studentInput.value.trim();

  if(currentGroup==="Детская" && (!parent||!student)){ alert("Заполните ФИО родителя и ученика!"); return; }
  if(currentGroup!=="Детская" && !student){ alert("Заполните ФИО спортсмена!"); return; }

  data.push({
    group: currentGroup,
    parent: currentGroup==="Детская"?parent:"",
    phone: phone,
    student: student,
    payments: {}
  });
  parentInput.value=''; phoneInput.value=''; studentInput.value='';
  save(); render();
});

// Сохранение
function save(){ localStorage.setItem('bjj_data',JSON.stringify(data)); }

// Рендер списка
function render(){
  list.innerHTML='';
  if(currentGroup==='Оплата'){
    renderPayments();
    return;
     }
  data.filter(s=>s.group===currentGroup).forEach((s,i)=>{
    const paid=data[i].payments[months[new Date().getMonth()]]||false;
    const d=document.createElement('div');
    d.className='card';
    d.innerHTML=`<b>${s.student}</b><br>
      ${s.parent?`Родитель: ${s.parent} (`:''}${s.phone}${s.parent?')':''}<br>
      <span class="${paid?'paid':'unpaid'}">${paid?'Оплачено':'Не оплачено'}</span><br><br>
      <button class="pay-btn" data-index="${i}">Оплата</button>
      <button class="remove-btn" data-index="${i}" style="background:#b00020">Удалить</button>`;
    list.appendChild(d);
  });

  document.querySelectorAll('.pay-btn').forEach(btn=>{
    btn.addEventListener('click',()=>confirmPay(Number(btn.dataset.index)));
  });
  document.querySelectorAll('.remove-btn').forEach(btn=>{
    btn.addEventListener('click',()=>confirmRemove(Number(btn.dataset.index)));
  });
}

// Модалка
function confirmPay(i){
  currentAction='pay';
  currentIndex=i;
  modalText.textContent=`Подтвердите оплату: ${data[i].student} (${data[i].group})`;
  modal.classList.remove('hidden');
}
function confirmRemove(i){
  currentAction='remove';
  currentIndex=i;
  modalText.textContent=`Удалить ученика: ${data[i].student}?`;
  modal.classList.remove('hidden');
}
modalOk.addEventListener('click',()=>{
  if(currentAction==='pay'){ const month=months[new Date().getMonth()]; data[currentIndex].payments[month]=true; }
  if(currentAction==='remove') data.splice(currentIndex,1);
  save(); render(); modal.classList.add('hidden'); currentAction=null; currentIndex=null;
});
modalCancel.addEventListener('click',()=>{
  if(currentAction==='pay'){ const month=months[new Date().getMonth()]; data[currentIndex].payments[month]=false; save(); render(); }
  modal.classList.add('hidden'); currentAction=null; currentIndex=null;
});

window.confirmPay=confirmPay;
window.confirmRemove=confirmRemove;

// PWA Service Worker
if('serviceWorker' in navigator){ navigator.serviceWorker.register('sw.js'); }
