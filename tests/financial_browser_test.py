"""New accounting scenarios using synthetic data and disposable browser profiles."""
import json
import unittest
import browser_test as baseline

class FinancialBrowserTests(unittest.TestCase):
    setUpClass=baseline.BrowserTests.__dict__['setUpClass']
    tearDownClass=baseline.BrowserTests.__dict__['tearDownClass']
    setUp=baseline.BrowserTests.setUp
    tearDown=baseline.BrowserTests.tearDown
    login=baseline.BrowserTests.login
    add=baseline.BrowserTests.add

    def payment(self,amount,period='2026-01',date='2026-01-10'):
        self.page.evaluate('openPay(students[0].id)')
        self.page.fill('#payYear',period[:4]); self.page.select_option('#payMonthSelect',str(int(period[5:])-1))
        self.page.select_option('#payAmountSelect','custom'); self.page.fill('#payCustomInput',amount); self.page.fill('#payDateInput',date)
        self.page.locator('#modalPay button:has-text("Применить")').click()
        self.page.wait_for_function('document.getElementById("modalPay").classList.contains("hidden")')

    def expense(self,amount,period='2026-01',date='2026-01-10',category='Зал'):
        self.page.evaluate('openExpense()');self.page.fill('#expYear',period[:4]);self.page.select_option('#expMonth',str(int(period[5:])-1))
        self.page.fill('#expAmount',amount);self.page.fill('#expDate',date);self.page.fill('#expCategory',category)
        self.page.locator('#modalExp button:has-text("Сохранить")').click()
        self.page.wait_for_function('document.getElementById("modalExp").classList.contains("hidden")')

    def test_two_years_partial_multiple_and_dashboard(self):
        self.login();self.add();self.payment('1000','2025-01','2025-02-01')
        self.assertEqual(self.page.evaluate('financialStatus(students[0]).debt'),200000)
        self.assertIn('Долг',self.page.locator('#list').inner_text())
        self.page.locator('#list .tile').click();self.assertIn('bad',self.page.locator('#infoStatusBadge').get_attribute('class'));self.page.evaluate('closeInfo()')
        self.payment('2000','2025-01','2025-02-05');self.assertTrue(self.page.evaluate('financialStatus(students[0]).fullyPaid'))
        self.payment('1500.25','2026-01','2026-02-01')
        self.assertEqual(self.page.evaluate('Ledger.report(finance,"2025-01").received'),300000)
        self.assertEqual(self.page.evaluate('financialStatus(students[0]).debt'),149975)
        self.assertEqual(self.page.evaluate('finance.payments.length'),3)
        self.assertIn('По дате движения денег',self.page.locator('#financialDashboard').inner_text())
        self.page.fill('#yearSelect','2025');self.page.press('#yearSelect','Tab')
        self.assertEqual(self.page.evaluate('yearIndex'),2025)
        self.assertIn('Оплатил',self.page.locator('#list').inner_text())

    def test_refund_and_correction_history(self):
        self.login();self.add();self.payment('4000')
        self.page.evaluate('openStudentHistory(students[0].id)')
        self.page.locator('#financialModal button:has-text("Возврат")').click()
        self.page.fill('#payCustomInput','1000');self.page.fill('#payDateInput','2026-02-01')
        self.page.locator('#modalPay button:has-text("Применить")').click()
        self.page.wait_for_function('finance.payments.length===2 && document.getElementById("modalPay").classList.contains("hidden")')
        self.assertEqual(self.page.evaluate('Ledger.balance(finance,students[0].id,"2026-01").debt'),0)
        self.assertEqual(self.page.evaluate('Ledger.report(finance,"2026-02","cash").received'),-100000)
        self.page.evaluate('openStudentHistory(students[0].id)')
        self.page.locator('#financialModal .card').filter(has_text='Возврат').first.locator('button:has-text("Исправить")').click()
        self.page.fill('#payCustomInput','500');self.page.fill('#payReason','Исправлен возврат')
        self.page.locator('#modalPay button:has-text("Применить")').click()
        self.page.wait_for_function('document.getElementById("modalPay").classList.contains("hidden")')
        self.assertEqual(self.page.evaluate('Ledger.balance(finance,students[0].id,"2026-01").credit'),50000)
        history=self.page.evaluate('finance.history.filter(h=>h.entity==="payment"&&h.action==="correct")')
        self.assertEqual(history[0]['before']['amountCents'],100000);self.assertEqual(history[0]['after']['amountCents'],50000)

    def test_expense_edit_grouping_delete_and_cash_basis(self):
        self.login();self.expense('100','2026-01','2026-02-01');self.expense('200','2026-01','2026-01-20')
        self.page.click('#tabExp');self.assertEqual(self.page.locator('#list .tile').count(),1)
        self.assertIn('300',self.page.locator('#list .tile').inner_text())
        self.page.locator('#list .tile').click();self.page.locator('#expDetailsList button:has-text("Редактировать")').first.click()
        self.page.fill('#expAmount','150.50');self.page.fill('#expReason','Уточнена стоимость')
        self.page.locator('#modalExp button:has-text("Сохранить")').click()
        self.page.wait_for_function('document.getElementById("modalExp").classList.contains("hidden")')
        self.assertEqual(self.page.evaluate('Ledger.report(finance,"2026-01").expenses'),35050)
        self.page.select_option('#reportBasis','cash')
        self.assertEqual(self.page.evaluate('expensesForMonth(monthIndex)'),200)
        self.page.locator('#list .tile').click();self.page.locator('#expDetailsList button:has-text("Удалить")').click()
        self.page.wait_for_function('finance.expenses.some(e=>e.voided)')
        self.assertEqual(self.page.evaluate('Ledger.report(finance,"2026-01").expenses'),15050)
        self.page.evaluate('openAudit()');self.assertIn('Уточнена стоимость',self.page.locator('#financialModal').inner_text())

    def test_migration_manual_assignment_and_no_duplicates_after_reload(self):
        self.page.goto(self.url)
        source=json.dumps([{'id':'old','name':'Старый ученик','group':'Детская','rate':3000,'payments':{'0':{'amount':1500,'date':'','extra':'KEEP'}}}])
        self.page.evaluate('(s)=>localStorage.setItem("bjj_students",s)',source);self.login()
        self.assertEqual(self.page.evaluate('finance.payments.length'),0)
        self.assertIsNone(self.page.evaluate('localStorage.getItem("coachcontrol.data")'))
        self.page.locator('button:has-text("Без определённого года")').click();self.page.locator('#financialModal button:has-text("Назначить период")').click()
        self.assertEqual(self.page.input_value('#legacyPeriod'),'')
        self.page.fill('#legacyPeriod','2025-01');self.page.fill('#legacyDate','2025-02-10');self.page.fill('#legacyCharge','3000')
        self.page.locator('#financialModal button:has-text("Подтвердить перенос")').click()
        self.page.wait_for_function('finance.payments.length===1')
        self.assertEqual(self.page.evaluate('Ledger.balance(finance,"old","2025-01").debt'),150000)
        self.assertEqual(self.page.evaluate('localStorage.getItem("bjj_students")'),source)
        self.page.reload();self.assertEqual(self.page.evaluate('finance.payments.length'),1)
        self.assertEqual(self.page.evaluate('finance.legacy.length'),1)
        self.page.evaluate('openLegacy()');self.assertEqual(self.page.locator('#financialModal button:has-text("Назначить период")').count(),0)
        self.assertEqual(self.page.evaluate('finance.legacy[0].original.extra'),'KEEP')

    def test_migration_write_failure_has_no_partial_financial_operations(self):
        self.page.goto(self.url)
        self.page.evaluate('localStorage.setItem("bjj_students",JSON.stringify([{id:"old",name:"Старый",payments:{0:1500}}]))')
        self.login();self.page.evaluate('()=>{const original=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k==="coachcontrol.data")throw new DOMException("Full","QuotaExceededError");return original.call(this,k,v)}}')
        self.assertFalse(self.page.evaluate('financialAction(f=>Ledger.resolveLegacy(f,f.legacy[0].id,{period:"2025-01",date:"2025-01-10",chargeCents:300000}))'))
        self.assertEqual(self.page.evaluate('finance.payments.length'),0)
        self.assertIsNone(self.page.evaluate('finance.legacy[0].resolution'))
        self.assertIsNone(self.page.evaluate('localStorage.getItem("coachcontrol.data")'))
        self.assertTrue(self.page.evaluate('Object.keys(localStorage).some(k=>k.startsWith("coachcontrol.backup."))'))

    def test_transfer_archive_and_historic_totals_stay(self):
        self.login();self.add();self.payment('1500','2025-01','2025-01-15')
        old_group=self.page.evaluate('finance.charges.find(c=>c.period==="2025-01").groupId')
        self.page.evaluate('openEdit(students[0].id)');self.page.select_option('#editGroup','Взрослая');self.page.select_option('#editRate','1500')
        self.page.locator('#modalEdit button:has-text("Сохранить")').click();self.page.wait_for_function('document.getElementById("modalEdit").classList.contains("hidden")')
        self.assertEqual(self.page.evaluate('(g)=>Ledger.report(finance,"2025-01","accrual",g).received',old_group),150000)
        self.page.evaluate('openDelete(students[0].id)');self.page.locator('#modalDelete button:has-text("Удалить")').click();self.page.wait_for_function('document.getElementById("modalDelete").classList.contains("hidden")')
        self.assertEqual(self.page.evaluate('Ledger.report(finance,"2025-01").debt'),150000)
        self.assertEqual(self.page.evaluate('Ledger.report(finance,"2025-01").received'),150000)
        self.page.locator('button:has-text("Архив учеников")').click();self.page.locator('#financialModal button:has-text("Обязательства и платежи")').click()
        self.assertIn('2025-01',self.page.locator('#financialModal').inner_text())
        self.assertIn('Тестовый ученик',self.page.locator('#financialModal').inner_text())

    def test_attendance_is_independent_and_bulk_charges_are_explicit(self):
        self.login();self.add();self.payment('3000')
        self.page.evaluate('openPay(students[0].id)');self.page.select_option('#payAmountSelect','-1');self.page.locator('#modalPay button:has-text("Применить")').click()
        self.page.wait_for_function('document.getElementById("modalPay").classList.contains("hidden")')
        self.assertTrue(self.page.evaluate('financialStatus(students[0]).fullyPaid'));self.assertTrue(self.page.evaluate('financialStatus(students[0]).noShow'))
        self.page.select_option('#monthSelect','1');self.assertEqual(self.page.evaluate('Ledger.report(finance,periodFor(monthIndex)).charged'),0)
        self.page.locator('button:has-text("Начислить за период")').click();self.page.wait_for_function('Ledger.report(finance,periodFor(monthIndex)).charged===300000')
        before=self.page.evaluate('finance.charges.length');self.page.locator('button:has-text("Начислить за период")').click()
        self.page.wait_for_function('!document.querySelector("button").disabled')
        self.assertEqual(self.page.evaluate('finance.charges.length'),before)

    def test_new_money_is_in_kopecks_and_history_modal_fits_mobile(self):
        self.login();self.add();self.payment('0.01')
        self.assertEqual(self.page.evaluate('finance.payments[0].amountCents'),1)
        self.assertEqual(self.page.evaluate('students[0].rateCents'),300000)
        self.assertIsNone(self.page.evaluate('students[0].rate ?? null'))
        self.page.evaluate('openStudentHistory(students[0].id)')
        self.page.set_viewport_size({'width':320,'height':400})
        bounds=self.page.locator('#financialModal .modal-card').evaluate('(e)=>{const r=e.getBoundingClientRect();return {top:r.top,bottom:r.bottom,overflow:getComputedStyle(e).overflowY}}')
        self.assertGreaterEqual(bounds['top'],0);self.assertLessEqual(bounds['bottom'],400);self.assertEqual(bounds['overflow'],'auto')

if __name__=='__main__':unittest.main(verbosity=2)
