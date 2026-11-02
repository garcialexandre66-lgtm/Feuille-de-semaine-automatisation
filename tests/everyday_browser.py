"""Ten everyday improvements through the real browser, D1 and encrypted local cache."""
import os
from pathlib import Path
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
    context=browser.new_context(viewport={'width':390,'height':844},locale='fr-FR',reduced_motion='reduce')
    page=context.new_page();errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto(os.environ['ASC_TEST_URL'])
    page.locator('#cloud-setup').wait_for(state='visible')
    page.locator('#setup-token').fill(os.environ['ASC_TEST_SETUP'])
    page.locator('#new-code').fill('everyday-test-code');page.locator('#confirm-code').fill('everyday-test-code')
    page.get_by_role('button',name='Créer mon espace').click()
    page.locator('#access-code').fill('everyday-test-code');page.get_by_role('button',name='Ouvrir mes semaines').click()
    page.locator('#application').wait_for(state='visible')
    page.evaluate("""()=>{
      week=monday(iso(new Date()));selected=1;expandedDay=1;store.name='Test apprenti';
      const item={client:'Résidence Oliviers',city:'Perpignan',travel:60,tpe:0,regie:0,chantier:420,sav:0,prep:'',intervention:''};
      store.weeks[week]=Array.from({length:7},(_,i)=>i<2?[{...item}]:[]);
      store.weeks[week][0][0].client='Électricité Martin';
      store.favorites=[{id:'quick-test',client:'Chantier habituel',city:'Canet',travel:30}];save();render();
    }""")
    def synced():
        page.wait_for_function("() => !dirty&&!busy")
    def close_recap():
        page.locator('#day-confirmation-close').click()
    # Remaining weekly hours and today marker.
    assert '19 h 00 restantes' in page.locator('#automatic-overtime-note').inner_text()
    assert page.locator('.is-today').count()==1
    # Completion checkbox, learning note and persistence.
    page.locator('#day-completed').check()
    assert 'Terminée' in page.locator('.week-card[data-day="1"]>summary').inner_text()
    page.locator('#day-learning>summary').click()
    page.locator('#learning-note').fill('Lire un schéma électrique et raccorder une prise.')
    # One click on a favorite prefills the editor without inventing hours.
    page.locator('#quick-favorites>summary').click()
    page.locator('.quick-favorite-list button').click()
    assert page.locator('#form [name=client]').input_value()=='Chantier habituel'
    assert page.locator('#form [name=city]').input_value()=='Canet'
    assert page.locator('#form [name=travel]').input_value()=='30'
    assert page.evaluate("parseDuration($('form').elements.chantier.value)")==0
    page.locator('#cancel').click()
    # Direct editing keeps identity; bad durations do not alter the day.
    page.locator('#entries .edit-hours').click()
    page.locator('.quick-hours [name=chantier]').fill('25h')
    page.locator('.quick-hours button.primary').click()
    assert page.locator('.quick-hours [role=alert]').inner_text()
    assert page.evaluate('days()[selected][0].chantier')==420
    page.locator('.quick-hours [name=chantier]').fill('9h30')
    page.locator('.quick-hours button.primary').click();close_recap()
    assert page.evaluate('days()[selected][0].chantier')==570
    assert not page.locator('#day-completed').is_checked()
    assert 'Plus de 10 h' in page.locator('.week-card[data-day="1"]>summary').inner_text()
    # Delete/undo restores the original but refuses to erase later edits.
    page.on('dialog',lambda dialog:dialog.accept())
    page.locator('#entries button').filter(has_text='Supprimer').click()
    assert page.locator('#undo-deletion').is_visible()
    page.locator('#undo-deletion-button').click()
    assert page.evaluate('days()[selected][0].chantier')==570
    page.locator('#entries button').filter(has_text='Supprimer').click()
    page.evaluate("days()[selected].push({client:'Nouvelle saisie',city:'',travel:0,tpe:60,regie:0,chantier:0,sav:0});save();render()")
    page.locator('#undo-deletion-button').click()
    assert 'a changé' in page.locator('#undo-deletion').inner_text()
    assert page.evaluate('days()[selected][0].client')=='Nouvelle saisie'
    page.locator('#undo-deletion button[aria-label]').click()
    # Search ignores accents; copy order still uses proximity to destination.
    page.locator('#day-action-toggle').click()
    page.locator('#day-action-menu [data-action=copy-day]').click()
    page.locator('#copy-search').fill('electricite')
    assert page.locator('#copy-source option').count()==2
    assert 'Électricité Martin' in page.locator('#copy-source').inner_text()
    page.locator('#copy-search').fill('inconnu')
    assert 'Aucun client' in page.locator('#copy-source').inner_text()
    page.locator('#copy-cancel').click()
    # Prepare five complete days; the summary appears even without warnings.
    page.evaluate("""()=>{const item={client:'Atelier ASC',workplace:'atelier',city:'',travel:0,tpe:420,regie:0,chantier:0,sav:0};store.weeks[week]=Array.from({length:7},(_,i)=>i<5?[{...item}]:[]);expandedDay=null;save();render();}""")
    page.locator('#check-pdf').click()
    assert page.locator('#review-dialog').is_visible()
    assert page.locator('#review-overview li').count()==5
    assert '35 h 00' in page.locator('#review-overview').inner_text()
    assert page.locator('#review-clear').is_visible()
    with page.expect_download() as event:page.locator('#review-download').click()
    path=Path('apercus/everyday-week.pdf');event.value.save_as(path)
    assert path.read_bytes().startswith(b'%PDF')
    # Note in monthly recap and text export; a backup includes all new metadata.
    page.locator('#settings-open').click();page.locator('#open-month').click()
    page.locator('#month').fill(page.evaluate('week.slice(0,7)'))
    page.locator('#month-learning>summary').click()
    assert 'Lire un schéma' in page.locator('#month-learning').inner_text()
    with page.expect_download() as event:page.locator('#download-notes').click()
    notes=Path('apercus/everyday-notes.txt');event.value.save_as(notes)
    assert 'MES APPRENTISSAGES' in notes.read_text()
    page.locator('#month-close').click()
    page.locator('.week-card[data-day="1"]>summary').click()
    page.locator('#day-completed').check()
    synced()
    remote=page.evaluate("async()=> (await api('/api/state')).store")
    assert len(remote['completedDays'])==1
    assert 'Lire un schéma' in next(iter(remote['learningNotes'].values()))
    page.reload();page.locator('#application').wait_for(state='visible')
    page.locator('.week-card[data-day="1"]>summary').click()
    assert page.locator('#day-completed').is_checked()
    page.locator('#day-learning>summary').click()
    assert 'Lire un schéma' in page.locator('#learning-note').input_value()
    context.set_offline(True)
    page.locator('#learning-note').fill('Lire un schéma électrique, puis tester le raccordement hors connexion.')
    page.wait_for_function('() => cacheSaved')
    page.reload();page.locator('#application').wait_for(state='visible')
    page.locator('.week-card[data-day="1"]>summary').click()
    page.locator('#day-learning>summary').click()
    assert 'hors connexion' in page.locator('#learning-note').input_value()
    context.set_offline(False)
    page.evaluate('() => push()');synced()
    assert 'hors connexion' in page.evaluate("async()=> (await api('/api/state')).store.learningNotes[selectedDate()]")
    with page.expect_download() as event:page.evaluate("$('backup').click()")
    backup=Path('apercus/everyday-backup.json');event.value.save_as(backup)
    import json
    saved=json.loads(backup.read_text())
    assert saved['learningNotes'] and saved['completedDays']
    # No horizontal overflow on small mobile; settings stay compact.
    page.set_viewport_size({'width':320,'height':740})
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
    page.screenshot(path='apercus/everyday-mobile.png',full_page=True)
    page.locator('#settings-open').click()
    assert page.locator('.settings-shortcuts button:visible').count()==4
    assert not page.locator('#delivery-form').is_visible()
    assert not errors,errors
    browser.close()
print('OK : dix améliorations, validations des durées, annulation protégée, PDF, notes exportées, stockage D1 et rechargement chiffré.')
