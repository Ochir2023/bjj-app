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

loginBtn.addEventListener('click',()=>{
  if(document.getElementById('pinInput').value===localStorage.pin){
    pinScreen.classList.add('hidden');
    app.classList.remove('hidden');
    render();
  }else alert('Неверный PIN');
});

tabs.forEach(tab=>{
  tab.addEventListener('click',()=>{
    currentGroup=tab.dataset.group;
    tabs.forEach(t=>t.classList.remove('active'));
    tab.classList.add('active');
    render();
  });
});

toggleFormBtn.addEventListener('click',()=>formBlock.classList.toggle('hidden'));

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

function render(){
  list.innerHTML='';parentsList.innerHTML='';
  const parentsSet=new Set();
  data.filter(s=>s.group===currentGroup).forEach((s,i)=>{
    parentsSet.add(s.parent);
    const d=document.createElement('div');
    d.className='card';
    d.innerHTML=`<b>${s.student}</b><br>Родитель: ${s.parent}<br>
    <span class="${s.paid?'paid':'unpaid'}">${s.paid?'Оплачено':'Не оплачено'}</span><br><br>
    <button onclick="togglePay(${i})">Оплата</button>
    <button onclick="remove(${i})" style="background:#b00020">Удалить</button>`;
    list.appendChild(d);
  });
  parentsSet.forEach(p=>{
    const o=document.createElement('option');o.value=p;parentsList.appendChild(o);
  });
}

function togglePay(i){data[i].paid=!data[i].paid;save();render();}
function remove(i){data.splice(i,1);save();render();}
