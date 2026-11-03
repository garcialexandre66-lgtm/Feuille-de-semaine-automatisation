"""Release audit: navigation, draft protection, sync failures, history, offline and small screens."""
import os
from pathlib import Path
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
    context=browser.new_context(viewport={'width':390,'height':844},locale='fr-FR',reduced_motion='reduce')
    page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto(os.environ['ASC_TEST_URL']);page.locator('#cloud-setup').wait_for(state='visible')
    page.locator('#setup-token').fill(os.environ['ASC_TEST_SETUP']);page.locator('#new-code').fill('professional-audit');page.locator('#confirm-code').fill('professional-audit');page.get_by_role('button',name='Créer mon espace').click()
    page.locator('#access-code').fill('professional-audit');page.locator('#toggle-code').click();assert page.locator('#access-code').get_attribute('type')=='text'
    page.locator('#toggle-code').click();assert page.locator('#access-code').get_attribute('type')=='password'
    page.screenshot(path='apercus/pro-login.png')
    page.get_by_role('button',name='Ouvrir mes semaines').click();page.locator('#application').wait_for(state='visible')
    page.evaluate("""()=>{
      week=monday(iso(new Date()));selected=0;expandedDay=null;store.name='Alexandre Garcia';
      const item={client:'Résidence Les Oliviers',city:'Perpignan',travel:60,tpe:0,regie:0,chantier:420,sav:0};
      store.weeks[week]=Array.from({length:7},()=>[]);store.weeks[week][0]=[{...item}];store.weeks[week][1]=[{...item,client:'Électricité Martin',city:'Canet',chantier:360}];
      store.weeks[week][2]=[{kind:'leave',client:'Congé',city:'',travel:0,tpe:0,regie:0,chantier:0,sav:0}];
      store.completedDays[week]=Timesheet.signature('',store.weeks[week][0]);
      const old='2026-10-19';store.weeks[old]=Array.from({length:7},(_,i)=>i===0?[{...item,client:'École',workplace:'school',travel:0,tpe:420,chantier:0}]:[]);
      save();render();
    }""")
    page.wait_for_function('() => !dirty&&!busy')
    assert page.locator('#connection-indicator').inner_text()=='À jour'
    assert page.locator('#weekly-progress').get_attribute('aria-valuenow')=='900'
    assert '1 / 5' in page.locator('.week-completed').inner_text()
    assert page.locator('.bottom-dock button').count()==3
    assert page.locator('#nav-week').get_attribute('aria-current')=='page'
    page.screenshot(path='apercus/pro-home.png')
    page.locator('#open-calendar').click();assert page.locator('#calendar-dialog').is_visible()
    page.locator('#calendar-month').fill('2026-12');page.locator('[data-date="2026-12-31"]').focus();page.keyboard.press('ArrowRight')
    assert page.locator('#calendar-month').input_value()=='2027-01'
    assert page.locator('[data-date="2027-01-01"]').evaluate('(e)=>e===document.activeElement')
    page.keyboard.press('Escape')
    page.locator('#nav-bilan').click();assert page.locator('#month-dialog').is_visible();page.locator('#month-dialog').screenshot(path='apercus/pro-bilan.png');page.locator('#month-close').click()
    # A changed editor requires a deliberate discard, both with Escape and Cancel.
    page.locator('.week-card[data-day="0"]>summary').click();page.locator('#add').click()
    assert not page.locator('#form [name=prep]').is_visible()
    page.locator('#form [name=client]').fill('Brouillon chantier')
    page.once('dialog',lambda d:d.dismiss());page.keyboard.press('Escape')
    assert page.locator('#editor').is_visible();assert page.locator('#form [name=client]').input_value()=='Brouillon chantier'
    page.once('dialog',lambda d:d.accept());page.locator('#cancel').click();assert not page.locator('#editor').is_visible()
    page.locator('#add').click();page.locator('#workplace').select_option('school')
    assert not page.locator('#form [name=chantier]').is_visible();assert page.locator('#form [name=tpe]').is_visible()
    page.once('dialog',lambda d:d.accept());page.locator('#cancel').click()
    # Inline hours cannot silently disappear during navigation or refresh.
    page.locator('#entries .edit-hours').click();page.locator('.quick-hours [name=chantier]').fill('4h')
    page.wait_for_function('() => !dirty&&!busy')
    page.evaluate("""async()=>{const remote=await api('/api/state');remote.store.learningNotes['2026-10-20']='Note d’un autre appareil';await api('/api/state',{revision:remote.revision,store:remote.store});await reconcile();}""")
    assert page.locator('.quick-hours [name=chantier]').input_value()=='4h'
    context.set_offline(True);context.set_offline(False);page.evaluate('() => reconnect()')
    assert page.locator('.quick-hours [name=chantier]').input_value()=='4h'
    page.once('dialog',lambda d:d.dismiss());page.locator('.week-card[data-day="1"]>summary').click()
    assert page.evaluate('selected')==0;assert page.locator('.quick-hours [name=chantier]').input_value()=='4h'
    page.once('dialog',lambda d:d.dismiss());page.evaluate('() => refreshApplication()')
    assert page.locator('.quick-hours [name=chantier]').input_value()=='4h'
    page.once('dialog',lambda d:d.accept());page.locator('.week-card[data-day="1"]>summary').click()
    assert page.evaluate('selected')==1;assert page.evaluate('days()[0][0].chantier')==420
    assert page.locator('.quick-hours').count()==0
    # Task removal is reversible independently of other tasks.
    page.locator('#day-todo>summary').click();page.get_by_role('button',name='Retirer la tâche : Outils récupérés',exact=True).click()
    assert page.locator('#todo-list input').count()==2
    page.locator('#undo-deletion-button').click();assert page.locator('#todo-list input').count()==3
    page.locator('#day-todo>summary').click()
    page.screenshot(path='apercus/pro-day.png',full_page=True)
    # Searching history is accent insensitive and does not modify data.
    page.locator('#settings-open').click();page.screenshot(path='apercus/pro-settings.png')
    page.locator('#open-history').click();page.locator('#history-search').fill('ecole')
    assert page.locator('#history-list button').count()==1
    page.locator('#history-search').fill('inconnu');assert 'Aucune semaine' in page.locator('#history-list').inner_text()
    page.locator('#history-search').fill('');page.screenshot(path='apercus/pro-history.png')
    page.locator('#history-close').click()
    # Friday reminder was previously hidden by CSS; it must be actionable.
    page.evaluate("renderReminder(new Date('2026-11-06T12:00:00'))")
    assert page.locator('#friday-reminder').is_visible()
    page.evaluate('renderReminder()')
    # A server rejection is explained rather than mislabeled as no internet.
    def reject_write(route):
        if route.request.method=='POST':route.fulfill(status=400,json={'error':'Archive de test refusée'})
        else:route.continue_()
    page.route('**/api/state',reject_write)
    page.evaluate("store.learningNotes[selectedDate()]='Note audit';save()")
    page.wait_for_function("() => document.querySelector('#connection-indicator').dataset.state==='error'")
    assert 'Archive de test refusée' in page.locator('#sync-status').inner_text()
    assert page.evaluate('dirty&&cacheSaved')
    page.unroute('**/api/state',reject_write);page.evaluate('() => push()');page.wait_for_function('() => !dirty&&!busy')
    # Offline remains visible, protected edits and refresh still work.
    context.set_offline(True);page.wait_for_function("() => document.querySelector('#connection-indicator').dataset.state==='offline'")
    page.locator('#day-learning>summary').click();page.locator('#learning-note').fill('Note conservée hors connexion')
    page.wait_for_function('() => cacheSaved');page.reload();page.locator('#application').wait_for(state='visible')
    assert 'hors connexion' in page.evaluate('Object.values(store.learningNotes).join(" ")')
    context.set_offline(False);page.evaluate('() => reconnect()');page.wait_for_function('() => connected&&!dirty')
    # Small phones, desktop, all dialogs and reduced motion.
    for width in [320,375,390,768,1280]:
        page.set_viewport_size({'width':width,'height':844});assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
        page.locator('#open-calendar').click();assert page.evaluate("document.querySelector('#calendar-dialog').scrollWidth<=document.querySelector('#calendar-dialog').clientWidth")
        page.keyboard.press('Escape')
    page.set_viewport_size({'width':1280,'height':900});page.screenshot(path='apercus/pro-desktop.png',full_page=True)
    assert not errors,errors
    browser.close()
print('OK : navigation, nouveau design, brouillons protégés, annulation des tâches, recherche, rappel vendredi, erreurs serveur, hors connexion et cinq tailles d’écran.')
