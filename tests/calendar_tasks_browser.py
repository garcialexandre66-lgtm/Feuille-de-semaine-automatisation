"""Visual month navigation and daily task persistence against real D1 and offline cache."""
import os,json
from pathlib import Path
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
    context=browser.new_context(viewport={'width':390,'height':844},locale='fr-FR',reduced_motion='reduce')
    page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto(os.environ['ASC_TEST_URL']);page.locator('#cloud-setup').wait_for(state='visible')
    page.locator('#setup-token').fill(os.environ['ASC_TEST_SETUP'])
    page.locator('#new-code').fill('calendar-test-code');page.locator('#confirm-code').fill('calendar-test-code');page.get_by_role('button',name='Créer mon espace').click()
    page.locator('#access-code').fill('calendar-test-code');page.get_by_role('button',name='Ouvrir mes semaines').click();page.locator('#application').wait_for(state='visible')
    page.evaluate("""()=>{
      week='2026-11-02';selected=0;expandedDay=0;store.name='Test';
      const empty=()=>Array.from({length:7},()=>[]),item={client:'Client test',city:'Canet',travel:60,tpe:0,regie:0,chantier:420,sav:0};
      store.weeks[week]=empty();store.weeks[week][0]=[{...item}];store.weeks[week][1]=[{kind:'leave',client:'Congé',city:'',travel:0,tpe:0,regie:0,chantier:0,sav:0}];
      store.schoolDates['2026-11-04']=true;save();render();
    }""")
    def day(date):
        page.locator('#open-calendar').click();page.locator('#calendar-month').fill(date[:7]);page.locator('#calendar-days [data-date="'+date+'"]').click()
    # Calendar status, exact date navigation, weekdays and leap-year boundaries.
    page.locator('#open-calendar').click()
    assert page.locator('#calendar-days button').count()==30
    assert page.locator('[data-date="2026-11-02"]').get_attribute('data-kind')=='work'
    assert '8 h 00' in page.locator('[data-date="2026-11-02"]').inner_text()
    assert page.locator('[data-date="2026-11-03"]').get_attribute('data-kind')=='absence'
    assert 'Congé' in page.locator('[data-date="2026-11-03"]').inner_text()
    assert page.locator('[data-date="2026-11-04"]').get_attribute('data-kind')=='school'
    assert 'prévue' in page.locator('[data-date="2026-11-04"]').get_attribute('aria-label')
    page.locator('#calendar-month').fill('2028-02');assert page.locator('#calendar-days button').count()==29
    page.locator('#calendar-month').fill('2027-01');page.get_by_role('button',name='Mois précédent',exact=True).click();assert page.locator('#calendar-month').input_value()=='2026-12'
    page.get_by_role('button',name='Mois suivant',exact=True).click();assert page.locator('#calendar-month').input_value()=='2027-01'
    page.locator('#calendar-month').fill('2026-11')
    page.screenshot(path='apercus/month-calendar.png')
    page.locator('[data-date="2026-11-08"]').click()
    assert page.evaluate('selectedDate()')=='2026-11-08'
    assert page.locator('.week-card[data-day="6"]').get_attribute('open') is not None
    assert page.locator('#add').is_visible()
    # Blank weekend lists can be used without creating any work hours.
    page.locator('#day-todo>summary').click()
    assert page.locator('#todo-list input').count()==3
    assert page.evaluate("store.dayTasks['2026-11-08']===undefined")
    page.locator('#todo-list input[data-task="default-tools"]').check()
    assert page.locator('#day-todo .todo-count').inner_text()=='1/3'
    page.locator('#todo-new-task').fill('Fermer le portail');page.locator('#day-todo button[type=submit]').click()
    assert page.locator('#todo-list input').count()==4
    assert page.evaluate('daySum(days()[selected])')==0
    # Each date has its own tasks; defaults do not inherit the previous day's checks.
    day('2026-11-09');page.locator('#day-todo>summary').click()
    assert page.locator('#todo-list input').count()==3
    assert page.locator('#todo-list input:checked').count()==0
    assert 'Fermer le portail' not in page.locator('#todo-list').inner_text()
    day('2026-11-08');page.locator('#day-todo>summary').click()
    assert page.locator('#todo-list input[data-task="default-tools"]').is_checked()
    page.get_by_role('button',name='Retirer la tâche : Chantier rangé',exact=True).click()
    assert page.locator('#todo-list input').count()==3
    page.wait_for_function('() => !dirty&&!busy')
    remote=page.evaluate("async()=> (await api('/api/state')).store")
    assert remote['dayTasks']['2026-11-08']['default-tools']['done'] is True
    assert 'default-clean' not in remote['dayTasks']['2026-11-08']
    # Offline editing, reloading, then merging back to D1.
    context.set_offline(True)
    page.locator('#todo-list input[data-task="default-checks"]').check()
    page.wait_for_function('() => cacheSaved');page.reload();page.locator('#application').wait_for(state='visible')
    day('2026-11-08');page.locator('#day-todo>summary').click()
    assert page.locator('#todo-list input[data-task="default-checks"]').is_checked()
    context.set_offline(False);page.evaluate('() => push()');page.wait_for_function('() => !dirty&&!busy')
    with page.expect_download() as event:page.evaluate("$('backup').click()")
    backup=Path('apercus/tasks-backup.json');event.value.save_as(backup)
    assert json.loads(backup.read_text())['dayTasks']['2026-11-08']['default-checks']['done']
    # An explicitly emptied list stays empty after opening the day again.
    for button in page.locator('#todo-list button').all():
        # The list rerenders after each removal; always remove the first remaining row.
        page.locator('#todo-list button').first.click()
    assert page.locator('#todo-list input').count()==0
    day('2026-11-09');day('2026-11-08');page.locator('#day-todo>summary').click()
    assert page.locator('#todo-list input').count()==0
    page.locator('#todo-new-task').fill('Vérifier les fenêtres');page.locator('#day-todo button[type=submit]').click()
    for width in [320,390,1280]:
        page.set_viewport_size({'width':width,'height':844});assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
        page.locator('#open-calendar').click();assert page.evaluate("document.querySelector('#calendar-dialog').scrollWidth<=document.querySelector('#calendar-dialog').clientWidth")
        page.keyboard.press('Escape')
    page.set_viewport_size({'width':390,'height':844});page.screenshot(path='apercus/daily-tasks.png',full_page=True)
    assert not errors,errors
    browser.close()
print('OK : calendrier mensuel, école/absences/heures, années bissextiles, week-end vide, tâches indépendantes, sauvegarde D1, hors connexion et mobile.')
