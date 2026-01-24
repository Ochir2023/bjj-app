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
const parentsList=document.getElementById('parentsList');
const list=document.getElementById('list');
const tabs=document.querySelectorAll('.tab');
const loginBtn=document.getElementById('loginBtn');
const addBtn=document.getElementById('addStudentBtn');
const toggleFormBtn=document.getElementById('toggleForm');

// Модальное окно
const modal=document.getElementById('modal');
const modalText=document.getElementById('modal-text');
const modalOk=document.getElementById('modal-ok');
const modalCancel=document.getElementById('modal-cancel');
let currentAction=null;
let currentIndex=null;

// Логин
loginBtn.addEventListener('click',()=>{
  if(document.getElementById('pinInput').value===localStorage.pin){
    pinScreen.classList.add('hidden');
    app.classList.remove('hidden');
    render();
  }else alert('Неверный PIN');
});

// Вкладки
tabs.forEach(tab=>{
  tab.addEventListener('click',()=>{
    currentGroup=tab.dataset.group;
    tabs.forEach(t=>t.classList.remove('active'));
    tab.classList.add('active');
    render();
  });
});

// Показ/скрытие формы
toggleFormBtn.addEventListener('click',()=>formBlock.classList.toggle('hidden'));

// Добавление ученика
addBtn.addEventListener('click',()=>{
  if(!parentInput.value||!studentInput.value){alert('Заполните поля');return;}
  data.push({
    parent:parentInput.value.trim(),
    phone:phoneInput.value.trim(),
    student:studentInput.value.trim(),
    group:currentGroup,
    payments:{} // по месяцам
  });
  parentInput.value=''; phoneInput.value=''; studentInput.value='';
  save();render();
});

function save(){localStorage.setItem('bjj_data',JSON.stringify(data));}

// Рендер
function render(){
  list.innerHTML=''; parentsList.innerHTML='';
  const parentsSet=new Set();

  if(currentGroup==="Оплата"){
    renderPayments();
    return;
  }

  data.filter(s=>s.group===currentGroup).forEach((s,i)=>{
    parentsSet.add(s.parent);
    const paidThisMonth=s.payments[months[new Date().getMonth()]]||false;
    const d=document.createElement('div');
    d.className='card';
    d.innerHTML=`<b>${s.student}</b><br>Родитель: ${s.parent} (${s.phone})<br>
    <span class="${paidThisMonth?'paid':'unpaid'}">${paidThisMonth?'Оплачено':'Не оплачено'}</span><br><br>
    <button onclick="confirmPay(${i})">Оплата</button>
    <button onclick="confirmRemove(${i})" style="background:#b00020">Удалить</button>`;
    list.appendChild(d);
  });

  parentsSet.forEach(p=>{
    const o=document.createElement('option');o.value=p;parentsList.appendChild(o);
  });
}

// Отдельная вкладка Оплата
function renderPayments(){
  const currentMonth=months[new Date().getMonth()];
  const totals={Детская:0,Взрослая:0,Женская:0};
  list.innerHTML='<h4>Оплата за '+currentMonth+'</h4>';

  data.forEach(s=>{
    const paid=s.payments[currentMonth]||false;
    if(paid) totals[s.group] += FIXED_PAYMENT;
    const d=document.createElement('div');
    d.className='card';
    d.innerHTML=`<b>${s.student}</b> (${s.group})<br>Родитель: ${s.parent} (${s.phone})<br>
      <span class="${paid?'paid':'unpaid'}">${paid?'Оплачено':'Не оплачено'}</span>
      <button onclick="confirmPay(${data.indexOf(s)})">Оплатить</button>`;
    list.appendChild(d);
  });

  const summary=document.createElement('div');
  summary.className='card';
  summary.innerHTML=`<strong>Доход за месяц:</strong> ${totals.Детская+totals.Взрослая+totals.Женская} ₽<br>
    Детская: ${totals.Детская} ₽<br>
    Взрослая: ${totals.Взрослая} ₽<br>
    Женская: ${totals.Женская} ₽`;
  list.prepend(summary);
}

// Модальные окна
function confirmPay(i){
  currentAction='pay';
  currentIndex=i;
  const s=data[i];
  modalText.textContent=`Подтвердите оплату ученика: ${s.student} (${s.group})`;
  modal.classList.remove('hidden'); // появляется только при нажатии кнопки
}

function confirmRemove(i){
  currentAction='remove';
  currentIndex=i;
  modalText.textContent=`Удалить ученика: ${data[i].student}?`;
  modal.classList.remove('hidden'); // появляется только при нажатии кнопки
}

// Кнопки модалки
modalOk.addEventListener('click', ()=>{
  if(currentAction==='pay'){
    const month=months[new Date().getMonth()];
    data[currentIndex].payments[month]=true;
  } else if(currentAction==='remove'){data.splice(currentIndex,1);}
  save(); render();
  modal.classList.add('hidden'); currentAction=null; currentIndex=null;
});

modalCancel.addEventListener('click', ()=>{
  if(currentAction==='pay'){
    const month=months[new Date().getMonth()];
    data[currentIndex].payments[month]=false;
    save(); render();
  }
  modal.classList.add('hidden'); currentAction=null; currentIndex=null;
});
