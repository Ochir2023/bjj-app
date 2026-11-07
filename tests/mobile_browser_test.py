"""Mobile navigation and accessibility, using synthetic data only."""
import json
import unittest
import browser_test as baseline

DEMO = '''async()=>{
 yearIndex=2026;monthIndex=10;
 const names=['Александр Константинович Михайлов','Мария Соколова','Артём Волков','Екатерина Смирнова','Михаил Орлов','Анна Лебедева'];
 students=names.map((name,i)=>({id:'demo-'+i,name,group:['Детская','Взрослая','Женская'][i%3],parent:'Тестовый родитель',phone:'+70000000000',rateCents:300000,payments:{}}));
 await save();
 await financialAction(f=>{
  Ledger.addPayment(f,{studentId:'demo-0',period:'2026-11',date:'2026-11-03',amountCents:150000});
  Ledger.addPayment(f,{studentId:'demo-1',period:'2026-11',date:'2026-11-02',amountCents:300000});
  Ledger.addPayment(f,{studentId:'demo-2',period:'2026-11',date:'2026-11-04',amountCents:300000});
  Ledger.setAttendance(f,'demo-3','2026-11','no-show');
  Ledger.setAttendance(f,'demo-5','2026-11','no-show');
  Ledger.addExpense(f,{period:'2026-11',date:'2026-11-02',amountCents:200000,category:'Аренда зала',note:'Тестовая аренда'});
  Ledger.addExpense(f,{period:'2026-11',date:'2026-11-04',amountCents:65000,category:'Инвентарь',note:'Тестовый инвентарь'});
  Ledger.addExpense(f,{period:'2026-11',date:'2026-11-05',amountCents:35000,category:'Транспорт',note:'Тестовый проезд'});
 });render();
}'''

class MobileBrowserTests(unittest.TestCase):
    setUpClass=baseline.BrowserTests.__dict__['setUpClass']
    tearDownClass=baseline.BrowserTests.__dict__['tearDownClass']
    setUp=baseline.BrowserTests.setUp
    tearDown=baseline.BrowserTests.tearDown
    login=baseline.BrowserTests.login
    add=baseline.BrowserTests.add

    def seed(self): self.page.evaluate(DEMO)
    def nav(self,name): self.page.locator('#bottomNav').get_by_role('button',name=name,exact=True).click()
    def drawer_route(self,name):
        self.page.get_by_role('button',name='Открыть меню',exact=True).click()
        self.page.locator('#drawer').get_by_role('button',name=name,exact=True).click()

    def test_competition_roster_selection_persists_and_export(self):
        self.login()
        self.add()
        self.page.evaluate('openEdit(students[0].id)')
        self.page.fill('#editBirthDate','2016-11-09')
        self.page.fill('#editWeightKg','33.5')
        self.page.locator('#modalEdit button:has-text("Сохранить")').click()
        self.page.wait_for_function('document.getElementById("modalEdit").classList.contains("hidden")')
        self.page.evaluate('navigate("competition")')
        self.page.fill('#competitionDate','2026-11-10')
        self.page.locator('#competitionDate').dispatch_event('change')
        self.page.get_by_role('checkbox',name='Участник: Тестовый ученик').check()
        self.page.wait_for_function('students[0].competitionSelected===true')
        self.page.reload()
        self.page.fill('#pinInput','1234')
        self.page.click('button:has-text("Войти")')
        self.page.evaluate('navigate("competition")')
        self.assertTrue(self.page.get_by_role('checkbox',name='Участник: Тестовый ученик').is_checked())
        self.assertIn('33,5 кг',self.page.locator('#list').inner_text())
        with self.page.expect_download() as dl:
            self.page.get_by_role('button',name='Скачать заявку CSV').click()
        content=dl.value.path().read_text(encoding='utf-8-sig')
        self.assertIn('Тестовый ученик',content)
        self.assertIn('Тестовый родитель',content)
        self.assertIn('33,5',content)
        self.assertIn('ФИО родителя',content)

    def test_group_coach_assignment_is_in_club_report(self):
        self.login()
        self.page.evaluate('openGroupForm(finance.groups[0].id)')
        self.page.fill('#groupCoachName','Тестовый тренер')
        self.page.locator('#financialModal button:has-text("Сохранить группу")').click()
        self.page.wait_for_function('!document.getElementById("financialModal")')
        self.page.evaluate('navigate("club")')
        self.assertIn('Тестовый тренер',self.page.locator('#list').inner_text())
        self.page.reload()
        self.page.fill('#pinInput','1234')
        self.page.click('button:has-text("Войти")')
        self.page.evaluate('navigate("club")')
        self.assertIn('Тестовый тренер',self.page.locator('#list').inner_text())

    def test_dashboard_is_first_screen_and_quick_actions_work(self):
        self.login();self.assertEqual(self.page.evaluate('currentScreen'),'home')
        self.assertEqual(self.page.locator('h1').inner_text(),'Обзор финансов')
        self.assertIn('CoachControl',self.page.title())
        self.page.get_by_role('button',name='Добавить ученика',exact=True).click()
        self.assertTrue(self.page.locator('#modalAdd').is_visible())
        self.page.keyboard.press('Escape');self.assertFalse(self.page.locator('#modalAdd').is_visible())
        self.page.get_by_role('button',name='Добавить оплату',exact=True).click()
        self.assertIn('Сначала добавьте ученика',self.page.locator('#financialModal').inner_text())
        self.page.keyboard.press('Escape');self.page.get_by_role('button',name='Добавить расход',exact=True).click()
        self.assertTrue(self.page.locator('#modalExp').is_visible())

    def test_reconciliation_shows_each_payment_and_possible_duplicate(self):
        self.login(); self.add()
        self.page.evaluate("""async () => {
          const id = students[0].id;
          await financialAction(f => {
            Ledger.addPayment(f, {studentId:id, period:'2026-11',date:'2026-11-05',amountCents:200000});
            Ledger.addPayment(f, {studentId:id, period:'2026-11',date:'2026-11-05',amountCents:200000});
          });
        }""")
        self.page.evaluate('navigate("home")')
        self.page.get_by_role('button',name='Проверить поступления').click()
        content=self.page.locator('#financialModal').inner_text()
        self.assertIn('4000',content.replace(' ', '').replace('\u00a0', '').replace('\u202f', ''))
        self.assertIn('Возможный повтор',content)
        self.assertIn('Открыть историю ученика',content)

    def test_drawer_background_escape_swipe_and_focus(self):
        self.login();self.page.click('#menuButton')
        self.assertTrue(self.page.evaluate('drawerOpen'))
        self.assertEqual(self.page.locator('#menuButton').get_attribute('aria-expanded'),'true')
        bounds=self.page.locator('#drawer').bounding_box();self.assertEqual(bounds['x'],0);self.assertEqual(bounds['y'],0);self.assertEqual(bounds['height'],844)
        self.page.keyboard.press('Tab');self.assertTrue(self.page.evaluate('document.getElementById("drawer").contains(document.activeElement)'))
        self.page.keyboard.press('Escape');self.assertFalse(self.page.evaluate('drawerOpen'));self.assertEqual(self.page.evaluate('document.activeElement.id'),'menuButton')
        self.page.click('#menuButton');self.page.locator('#drawerBackdrop').click(position={'x':380,'y':400});self.assertFalse(self.page.evaluate('drawerOpen'))
        self.page.click('#menuButton')
        self.page.evaluate("""()=>{const drawer=document.getElementById('drawer');for(const [type,key,point] of [['touchstart','touches',{clientX:250,clientY:200}],['touchend','changedTouches',{clientX:100,clientY:210}]]){const e=new Event(type);Object.defineProperty(e,key,{value:[point]});drawer.dispatchEvent(e);}}""")
        self.assertFalse(self.page.evaluate('drawerOpen'))
        self.assertEqual(self.page.locator('#menuButton').get_attribute('aria-expanded'),'false')

    def test_routes_and_system_back_close_panels_before_leaving_screen(self):
        self.login();self.nav('Группы');self.assertEqual(self.page.evaluate('currentScreen'),'groups')
        self.page.locator('.group-tile').first.click();self.assertEqual(self.page.evaluate('currentScreen'),'group')
        self.page.get_by_role('button',name='Настройки группы',exact=True).click();self.assertTrue(self.page.locator('#financialModal').is_visible())
        self.page.evaluate('history.back()');self.page.wait_for_function('!document.getElementById("financialModal")');self.assertEqual(self.page.evaluate('currentScreen'),'group')
        self.page.evaluate('history.back()');self.page.wait_for_function('currentScreen==="groups"')
        self.nav('Оплата');self.page.click('#menuButton');self.page.evaluate('history.back()');self.page.wait_for_function('!drawerOpen');self.assertEqual(self.page.evaluate('currentScreen'),'payments')
        self.drawer_route('Расходы');self.assertEqual(self.page.evaluate('currentScreen'),'expenses')
        self.page.evaluate('history.back()');self.page.wait_for_function('currentScreen==="payments"');self.page.evaluate('history.forward()');self.page.wait_for_function('currentScreen==="expenses"')

    def test_dynamic_group_create_rename_child_rule_and_archive(self):
        self.login();self.nav('Группы');self.page.get_by_role('button',name='Добавить группу',exact=True).click();self.page.fill('#groupName','Плавание');self.page.check('#groupRequiresParent');self.page.get_by_role('button',name='Сохранить группу').click()
        self.page.wait_for_function('currentScreen==="group"&&document.getElementById("heroTitle").textContent==="Плавание"')
        group_id=self.page.evaluate('selectedGroupId')
        self.assertEqual(self.page.locator('.group-tile .settings').count(),0)
        self.page.get_by_role('button',name='Добавить ученика',exact=True).click();self.assertTrue(self.page.locator('#addParentBox').is_visible())
        self.page.fill('#addParentName','Тестовый родитель');self.page.fill('#addPhone','123');self.page.fill('#addStudentName','Тестовый спортсмен');self.page.locator('#modalAdd button:has-text("Сохранить")').click();self.page.wait_for_function('students.length===1&&document.getElementById("modalAdd").classList.contains("hidden")')
        self.page.get_by_role('button',name='Настройки группы',exact=True).click();self.page.fill('#groupName','Пловцы');self.page.get_by_role('button',name='Сохранить группу').click();self.page.wait_for_function('document.getElementById("heroTitle").textContent==="Пловцы"')
        self.assertEqual(self.page.evaluate('selectedGroupId'),group_id)
        self.page.get_by_role('button',name='Настройки группы',exact=True).click();self.page.get_by_role('button',name='Архивировать группу').click();self.assertTrue(any('активных учеников' in d for d in self.dialogs))
        self.page.keyboard.press('Escape');self.page.locator('#list .tile').click();self.page.click('#infoDelBtn');self.page.locator('#modalDelete button:has-text("Архивировать")').click();self.page.wait_for_function('students.length===0')
        self.page.get_by_role('button',name='Настройки группы',exact=True).click();self.page.get_by_role('button',name='Архивировать группу').click();self.page.wait_for_function('currentScreen==="groups"')
        self.assertTrue(self.page.evaluate('(id)=>finance.groups.find(g=>g.id===id).archived',group_id))
        self.page.reload();self.assertTrue(self.page.evaluate('(id)=>finance.groups.find(g=>g.id===id).archived',group_id))

    def test_payments_all_groups_search_filters_sort_and_arrows(self):
        self.login();self.seed();self.nav('Оплата');self.assertEqual(self.page.locator('.group-tabs button').count(),3)
        old=self.page.evaluate('paymentGroupId');self.page.get_by_role('button',name='Следующая группа').click();self.assertNotEqual(self.page.evaluate('paymentGroupId'),old)
        self.page.fill('#searchInput','Мария Соколова');self.assertEqual(self.page.locator('#list .tile').count(),1)
        self.assertIn('Взрослая',self.page.locator('#list').inner_text())
        self.page.click('#chipUnpaid');self.assertEqual(self.page.locator('#list .tile').count(),0)
        self.page.click('#chipPaid');self.assertEqual(self.page.locator('#list .tile').count(),1)
        self.page.select_option('#paymentSort','name');self.page.locator('#list .tile').click();self.page.locator('#financialModal').get_by_role('button',name='Добавить оплату',exact=True).click();self.assertTrue(self.page.locator('#modalPay').is_visible())

    def test_responsive_widths_long_names_and_keyboard_height(self):
        self.login();self.seed();self.nav('Группы')
        for width in [320,375,390,430]:
            self.page.set_viewport_size({'width':width,'height':844})
            for screen in ['home','groups','payments','expenses']:
                self.page.evaluate('(s)=>navigate(s)',screen)
                self.assertFalse(self.page.evaluate('document.documentElement.scrollWidth>innerWidth'),f'{screen} {width}')
            self.page.evaluate('openGroupByName("Детская")')
            name=self.page.locator('.tile-name').filter(has_text='Александр Константинович Михайлов')
            self.assertEqual(name.inner_text(),'Александр Константинович Михайлов')
            self.assertFalse(name.evaluate('(e)=>e.scrollWidth>e.clientWidth'))
            self.page.locator('#list .tile').first.click();self.assertTrue(self.page.locator('#modalInfo').is_visible());self.page.keyboard.press('Escape')
        self.page.evaluate('openAdd()');self.page.set_viewport_size({'width':390,'height':360});self.page.fill('#addStudentName','Проверка клавиатуры')
        self.page.locator('#modalAdd button:has-text("Сохранить")').scroll_into_view_if_needed()
        box=self.page.locator('#modalAdd .modal-card').bounding_box();self.assertGreaterEqual(box['y'],0);self.assertLessEqual(box['y']+box['height'],361)
        self.assertEqual(self.page.locator('#modalAdd .modal-card').evaluate('(e)=>getComputedStyle(e).overflowY'),'auto')

    def test_update_and_navigation_do_not_write_or_lose_v2_data(self):
        self.login();self.seed();before=self.page.evaluate('localStorage.getItem("coachcontrol.data")')
        for route in ['home','groups','payments','expenses','backup','settings','pro']:
            self.page.evaluate('(route)=>navigate(route)',route)
        self.assertEqual(self.page.evaluate('localStorage.getItem("coachcontrol.data")'),before)
        self.page.reload();self.assertEqual(self.page.evaluate('localStorage.getItem("coachcontrol.data")'),before)
        self.assertEqual(len(json.loads(before)['finance']['payments']),3)
        self.login();self.assertEqual(self.page.evaluate('currentScreen'),'home')

    def test_export_backup_pro_and_keyboard_accessibility(self):
        self.login();self.seed();self.drawer_route('Экспорт')
        with self.page.expect_download() as info:self.page.get_by_role('button',name='Скачать CSV').click()
        self.assertEqual(info.value.suggested_filename,'coachcontrol-operations.csv')
        self.drawer_route('Резервная копия')
        with self.page.expect_download() as info:self.page.get_by_role('button',name='Резервная копия JSON',exact=True).click()
        self.assertTrue(info.value.suggested_filename.endswith('.json'))
        self.drawer_route('PRO');self.assertIn('пока не запущены',self.page.locator('#screenTools').inner_text())
        self.nav('Группы');self.page.get_by_role('button',name='Добавить группу').click();self.page.keyboard.press('Tab');self.assertTrue(self.page.evaluate('document.getElementById("financialModal").contains(document.activeElement)'))
        self.assertEqual(self.page.locator('#groupName').get_attribute('id'),'groupName')
        self.assertEqual(self.page.locator('#financialModal').get_attribute('role'),'dialog')
        self.page.keyboard.press('Escape');self.assertFalse(self.page.locator('#financialModal').count())

    def test_complete_shell_runs_offline_without_changing_financial_data(self):
        self.login();self.seed();before=self.page.evaluate('localStorage.getItem("coachcontrol.data")')
        self.page.evaluate('navigator.serviceWorker.ready.then(()=>true)')
        self.page.reload();self.page.evaluate('navigator.serviceWorker.ready.then(()=>true)')
        self.ctx.set_offline(True)
        self.page.reload();self.assertIn('CoachControl',self.page.title())
        self.page.fill('#pinInput','1234');self.page.get_by_role('button',name='Войти',exact=True).click()
        self.nav('Группы');self.assertEqual(self.page.locator('.group-tile').count(),3)
        self.assertEqual(self.page.evaluate('localStorage.getItem("coachcontrol.data")'),before)
        self.ctx.set_offline(False)

    def test_reduced_motion_and_long_press_are_supported(self):
        self.login();self.seed();self.page.evaluate('openGroupByName("Детская")')
        tile=self.page.locator('#list .tile').first;bounds=tile.bounding_box();self.page.mouse.move(bounds['x']+20,bounds['y']+20);self.page.mouse.down();self.page.wait_for_timeout(470);self.page.mouse.up();self.assertTrue(self.page.locator('#actionSheet').is_visible());self.page.keyboard.press('Escape')
        self.page.click('#menuButton');self.assertEqual(self.page.locator('#drawer').evaluate('(e)=>getComputedStyle(e).transitionDuration'),'0s');self.page.keyboard.press('Escape')
        self.page.emulate_media(reduced_motion='no-preference');self.page.click('#menuButton');self.assertIn('0.24',self.page.locator('#drawer').evaluate('(e)=>getComputedStyle(e).transitionDuration'))

if __name__=='__main__':unittest.main(verbosity=2)
