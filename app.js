if(!localStorage.pin) localStorage.pin='1234';

let currentGroup='Детская';
let data=JSON.parse(localStorage.getItem('bjj_data')||'[]');

const pinScreen=document.getElementById('pinScreen');
const app=document.getElementById('app');
const formBlock=document.getElementById('formBlock');
const parentInput=document.getElementById('parentInput');
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

// Вкладки групп
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
    student:studentInput.value.trim(),
    group:currentGroup,
    paid:false
  });
  parentInput.value='';studentInput.value='';
  save();render();
});

function save(){localStorage.setItem('bjj_data',JSON.stringify(data));}

// Рендер
function render(){
  list.innerHTML='';parentsList.innerHTML='';
  const parentsSet=new Set();

  data.filter(s=>s.group===currentGroup).forEach((s,i)=>{
    parentsSet.add(s.parent);
    const d=document.createElement('div');
    d.className='card';
    d.innerHTML=`<b>${s.student}</b><br>Родитель: ${s.parent}<br>
    <span class="${s.paid?'paid':'unpaid'}">${s.paid?'Оплачено':'Не оплачено'}</span><br><br>
    <button onclick="confirmPay(${i})">Оплата</button>
    <button onclick="confirmRemove(${i})" style="background:#b00020">Удалить</button>`;
    list.appendChild(d);
  });

  parentsSet.forEach(p=>{
    const o=document.createElement('option');o.value=p;parentsList.appendChild(o);
  });
}

// Модальные окна
function confirmPay(i){
  currentAction='pay';
  currentIndex=i;
  modalText.textContent=`Подтвердите оплату ученика: ${data[i].student}`;
  modal.classList.remove('hidden');
}

function confirmRemove(i){
  currentAction='remove';
  currentIndex=i;
  modalText.textContent=`Удалить ученика: ${data[i].student}?`;
  modal.classList.remove('hidden');
}

// Кнопки модалки
modalOk.addEventListener('click', ()=>{
  if(currentAction==='pay'){data[currentIndex].paid=true;}
  else if(currentAction==='remove'){data.splice(currentIndex,1);}
  save(); render();
  modal.classList.add('hidden');
  currentAction=null; currentIndex=null;
});

modalCancel.addEventListener('click', ()=>{
  if(currentAction==='pay'){data[currentIndex].paid=false; save(); render();}
  modal.classList.add('hidden');
  currentAction=null; currentIndex=null;
});
