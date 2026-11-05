"""Disposable profiles and in-process HTTP server; no real browser data is used."""
import json
import os
from pathlib import Path
import threading
import shutil
import unittest
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
KEY = 'coachcontrol.data'

class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *args): pass
    def handle(self):
        try: super().handle()
        except (BrokenPipeError, ConnectionResetError): pass

class BrowserTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = ThreadingHTTPServer(('127.0.0.1', 0), partial(QuietHandler, directory=str(ROOT)))
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.url = f'http://127.0.0.1:{cls.server.server_port}/'
        cls.pw = sync_playwright().start()
        cls.browser = cls.pw.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH') or shutil.which('chromium') or cls.pw.chromium.executable_path, headless=True, args=['--no-sandbox'])

    @classmethod
    def tearDownClass(cls):
        cls.browser.close(); cls.pw.stop(); cls.server.shutdown(); cls.server.server_close(); cls.thread.join()

    def setUp(self):
        self.ctx = self.browser.new_context(viewport={'width':390,'height':844}, accept_downloads=True)
        self.page = self.ctx.new_page()
        self.dialogs = []
        self.errors = []
        self.handle_dialog = lambda d: (self.dialogs.append(d.message), d.accept())
        self.page.on('dialog', self.handle_dialog)
        self.page.on('pageerror', lambda e: self.errors.append(str(e)))

    def tearDown(self):
        self.ctx.close()
        self.assertEqual(self.errors, [])

    def login(self):
        self.page.goto(self.url)
        self.page.fill('#pinInput', '1234')
        self.page.click('button:has-text("Войти")')

    def add(self, name='Тестовый ученик', group='Детская'):
        self.page.click({'Детская':'#tabKids','Взрослая':'#tabAdult','Женская':'#tabWomen'}[group])
        self.page.click('button[title="Добавить"]')
        if group == 'Детская': self.page.fill('#addParentName','Тестовый родитель')
        self.page.fill('#addPhone','+70000000000'); self.page.fill('#addStudentName',name)
        self.page.locator('#modalAdd button:has-text("Сохранить")').click()
        self.page.wait_for_function('document.getElementById("modalAdd").classList.contains("hidden")')

    def test_students_groups_edit_search_and_filters(self):
        self.login()
        for group in ['Детская','Взрослая','Женская']: self.add(group+' ученик',group)
        self.page.click('#tabKids'); self.assertEqual(self.page.locator('#list .tile').count(),1)
        self.page.locator('#list .tile').click(); self.page.click('#infoEditBtn')
        self.page.fill('#editName','Новое имя'); self.page.locator('#modalEdit button:has-text("Сохранить")').click()
        self.page.wait_for_function('document.getElementById("modalEdit").classList.contains("hidden")')
        self.page.fill('#searchInput','новое'); self.assertEqual(self.page.locator('#list .tile').count(),1)
        self.page.fill('#searchInput','нет совпадений'); self.assertEqual(self.page.locator('#list .tile').count(),0)
        self.page.fill('#searchInput',''); self.page.click('#chipPaid'); self.assertEqual(self.page.locator('#list .tile').count(),0)
        self.page.click('#chipUnpaid'); self.assertEqual(self.page.locator('#list .tile').count(),1)
        self.page.reload(); self.assertEqual(self.page.evaluate('students.length'),3)

    def test_payments_statuses_expenses_and_archive(self):
        self.login(); self.add()
        self.page.evaluate('openPay(students[0].id)'); self.page.select_option('#payAmountSelect','custom'); self.page.fill('#payCustomInput','2500')
        self.page.fill('#payDateInput','2026-11-05'); self.page.locator('#modalPay button:has-text("Применить")').click()
        self.page.wait_for_function('document.getElementById("modalPay").classList.contains("hidden")')
        self.assertEqual(self.page.evaluate('incomeForMonth(monthIndex)'),2500)
        self.page.click('#chipPaid'); self.assertEqual(self.page.locator('#list .tile').count(),1)
        self.page.evaluate('openPay(students[0].id)'); self.page.select_option('#payAmountSelect','-1'); self.page.locator('#modalPay button:has-text("Применить")').click()
        self.page.wait_for_function('document.getElementById("modalPay").classList.contains("hidden")')
        self.page.click('#chipNoShow'); self.assertEqual(self.page.locator('#list .tile').count(),1)
        self.page.click('#tabExp'); self.page.click('button:has-text("＋ Расход")'); self.page.fill('#expAmount','500'); self.page.fill('#expCategory','constructor')
        self.page.locator('#modalExp button:has-text("Сохранить")').click(); self.page.wait_for_function('expenses.length===1 && document.getElementById("modalExp").classList.contains("hidden")')
        self.assertEqual(self.page.evaluate('expensesForMonth(monthIndex)'),500)
        self.page.locator('#list .tile').click(); self.page.locator('#expDetailsList button').click(); self.page.wait_for_function('expenses.length===0 && document.getElementById("modalExpDetails").classList.contains("hidden")')
        self.page.evaluate('openDelete(students[0].id)'); self.page.locator('#modalDelete button:has-text("Удалить")').click(); self.page.wait_for_function('students.length===0 && document.getElementById("modalDelete").classList.contains("hidden")')
        state=self.page.evaluate('dataStore.snapshot()')
        self.assertEqual(len(state['archivedStudents']),1); self.assertEqual(len(state['archivedExpenses']),1)
        backups=self.page.evaluate('dataStore.exportBackup()')
        self.assertTrue(any('2500' in value for key,value in backups['raw'].items() if key.startswith('coachcontrol.backup.')))

    def test_corruption_is_read_only_and_download_preserves_raw(self):
        self.page.goto(self.url); self.page.evaluate('localStorage.setItem("bjj_students","{broken")'); self.login()
        self.assertTrue(self.page.evaluate('dataStore.blocked'))
        with self.page.expect_download() as info: self.page.click('button:has-text("Резервная копия JSON")')
        exported=json.loads(Path(info.value.path()).read_text())
        self.assertEqual(exported['raw']['bjj_students'],'{broken'); self.assertIsNone(exported['current'])
        self.page.evaluate('students.push({id:"x",name:"X",group:"Детская",payments:{}})')
        self.assertFalse(self.page.evaluate('save()'))
        self.assertEqual(self.page.evaluate('localStorage.getItem("bjj_students")'),'{broken')
        self.assertIsNone(self.page.evaluate(f'localStorage.getItem("{KEY}")'))

    def test_failed_write_rolls_back_ui_and_keeps_source(self):
        self.login(); self.add()
        before=self.page.evaluate(f'localStorage.getItem("{KEY}")')
        self.page.evaluate('()=>{Storage.prototype.setItem=function(){throw new DOMException("Full","QuotaExceededError")};}')
        self.page.evaluate('students[0].name="Unsaved"')
        self.assertFalse(self.page.evaluate('save()'))
        self.assertEqual(self.page.evaluate(f'localStorage.getItem("{KEY}")'),before)
        self.assertEqual(self.page.evaluate('students[0].name'),'Тестовый ученик')
        self.assertTrue(any('не сохранены' in d for d in self.dialogs))

    def test_legacy_load_does_not_migrate_on_open(self):
        self.page.goto(self.url)
        raw=json.dumps([{'student':'Старый ученик','paid':True,'custom':'KEEP','payments':{'0':{'amount':3000,'date':'','extra':'KEEP'}}}])
        self.page.evaluate('(raw)=>localStorage.setItem("students",raw)',raw); self.login()
        self.assertEqual(self.page.evaluate('students[0].name'),'Старый ученик')
        self.assertEqual(self.page.evaluate('localStorage.getItem("students")'),raw)
        self.assertIsNone(self.page.evaluate(f'localStorage.getItem("{KEY}")'))
        self.assertEqual(self.page.evaluate('Object.keys(students[0].payments)'),['0'])

    def test_existing_financial_record_not_overwritten_when_confirmation_cancelled(self):
        self.login(); self.add()
        self.page.evaluate('async()=>{students[0].payments[0]={amount:3000,date:"2025-01-10",original:"KEEP"};await save();}')
        before=self.page.evaluate(f'localStorage.getItem("{KEY}")')
        self.page.evaluate('monthIndex=0;openPay(students[0].id)')
        self.page.select_option('#payAmountSelect','1500')
        self.page.remove_listener('dialog',self.handle_dialog)
        self.page.on('dialog',lambda d:d.dismiss())
        with self.page.expect_event('dialog'):
            self.page.locator('#modalPay button:has-text("Применить")').click()
        self.assertEqual(self.page.evaluate(f'localStorage.getItem("{KEY}")'),before)
        self.assertEqual(self.page.evaluate('students[0].payments[0].amount'),3000)
        self.assertEqual(self.page.evaluate('students[0].payments[0].original'),'KEEP')
        self.assertTrue(self.page.locator('#modalPay').is_visible())

    def test_invalid_form_does_not_write(self):
        self.login(); self.page.click('button[title="Добавить"]')
        self.page.locator('#modalAdd button:has-text("Сохранить")').click()
        self.assertEqual(self.page.evaluate('students.length'),0)
        self.assertIsNone(self.page.evaluate(f'localStorage.getItem("{KEY}")'))
        self.assertTrue(self.page.locator('#modalAdd').is_visible())

    def test_storage_access_denied_keeps_application_and_export_errors_visible(self):
        self.page.add_init_script('Object.defineProperty(window,"localStorage",{get(){throw new DOMException("Denied","SecurityError")}})')
        self.login()
        self.assertTrue(self.page.evaluate('dataStore.blocked'))
        self.assertTrue(self.page.locator('[role="alert"]').is_visible())
        with self.page.expect_event('dialog') as error:
            self.page.click('button:has-text("Резервная копия JSON")')
        self.assertIn('Не удалось экспортировать',error.value.message)

    def test_successful_download_contains_active_archived_and_raw_data(self):
        self.login(); self.add()
        self.page.evaluate('openDelete(students[0].id)')
        self.page.locator('#modalDelete button:has-text("Удалить")').click()
        self.page.wait_for_function('document.getElementById("modalDelete").classList.contains("hidden")')
        with self.page.expect_download() as info: self.page.click('button:has-text("Резервная копия JSON")')
        data=json.loads(Path(info.value.path()).read_text())
        self.assertEqual(data['format'],'CoachControlBackup')
        self.assertEqual(len(data['current']['archivedStudents']),1)
        self.assertEqual(json.loads(data['raw'][KEY]),data['current'])
        self.assertTrue(any(k.startswith('coachcontrol.backup.') for k in data['raw']))

    def test_concurrent_tabs_reject_stale_write(self):
        self.login(); self.add()
        second=self.ctx.new_page(); second.goto(self.url)
        second.evaluate('students[0].name="Вторая вкладка"; save()')
        self.page.evaluate('students[0].name="Старая вкладка"')
        self.assertFalse(self.page.evaluate('save()'))
        self.assertEqual(self.page.evaluate(f'JSON.parse(localStorage.getItem("{KEY}")).students[0].name'),'Вторая вкладка')

if __name__ == '__main__': unittest.main(verbosity=2)
