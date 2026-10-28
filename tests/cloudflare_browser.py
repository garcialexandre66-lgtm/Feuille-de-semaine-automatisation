"""Parcours utilisateur, bilan, partage, favoris et vraie réouverture hors ligne."""
import os
from pathlib import Path
import zipfile
import fitz
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
    context=browser.new_context(viewport={'width':390,'height':844},locale='fr-FR',reduced_motion='reduce')
    page=context.new_page();errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto(os.environ['ASC_TEST_URL'])
    page.locator('#cloud-setup').wait_for(state='visible')
    page.locator('#setup-token').fill(os.environ['ASC_TEST_SETUP'])
    page.locator('#new-code').fill('test-only-cloud-code');page.locator('#confirm-code').fill('test-only-cloud-code')
    page.get_by_role('button',name='Créer mon espace').click()
    page.locator('#login-form').wait_for(state='visible')
    page.locator('#access-code').fill('test-only-cloud-code');page.get_by_role('button',name='Ouvrir mes semaines').click()
    page.locator('#application').wait_for(state='visible')
    def tab(page,name):page.locator(f'#app-tabs [data-view={name}]').click()
    def synced(page):
        page.locator('#settings-dialog').evaluate('(d)=>d.open&&d.close()')
        page.wait_for_function("() => document.querySelector('#sync-status').textContent==='✓ Semaines synchronisées'")
    def set_name(page):
        page.locator('#settings-open').click();page.locator('#name').fill('Technicien démonstration');page.locator('#settings-close').click()
    def atelier(page,date):page.locator('#day-picker').fill(date);page.locator('#workshop-day').click()
    set_name(page);atelier(page,'2027-01-25')
    page.locator('#day-picker').fill('2027-01-26');page.locator('#add').click()
    page.locator('#form [name=client]').fill('Client & fils');page.locator('#form [name=city]').fill('Saint-Estève')
    page.locator('#next').click();page.locator('#form [name=travel]').fill('60');page.locator('[name=tpe]').fill('1h')
    page.locator('#next').click();page.locator('[name=chantier]').fill('6h30');page.locator('#next').click();page.locator('#remember-favorite').check();page.locator('#next').click()
    assert page.locator('#daytotal').inner_text()=='8 h 30'
    # Favori : client, localité et trajet, sans recopier les heures du chantier.
    page.locator('#day-picker').fill('2027-01-29');page.locator('#add').click()
    page.locator('#favorite-choice').select_option(index=1)
    assert page.locator('#form [name=client]').input_value()=='Client & fils'
    assert page.locator('#form [name=city]').input_value()=='Saint-Estève'
    page.locator('#next').click();assert page.locator('#form [name=travel]').input_value()=='60'
    page.locator('#next').click();page.locator('[name=chantier]').fill('8h');page.locator('#next').click();page.locator('#next').click()
    for date,kind in [('2027-01-27','leave'),('2027-01-28','sick')]:
        page.locator('#day-picker').fill(date)
        if not page.locator('#'+kind).is_visible():page.locator('.day-more summary').click()
        page.locator('#'+kind).click();page.locator('#leave-form button.primary').click()
    tab(page,'month');page.locator('#month').fill('2027-01')
    assert page.locator('#month-worked').inner_text()=='25 h 30'
    assert page.locator('#month-overtime').inner_text()=='1 h 30'
    assert page.locator('#month-leave').inner_text()=='1 j';assert page.locator('#month-sick').inner_text()=='1 j'
    assert '26/01/2027' in page.locator('#overtime-notebook').input_value()
    page.locator('#month-notes').fill('Heures à vérifier avec la secrétaire.')
    with page.expect_download() as event:page.locator('#download-notes').click()
    notes=Path('apercus/bloc-notes-test.txt');event.value.save_as(notes)
    assert '1 h 30' in notes.read_text();assert 'Heures à vérifier' in notes.read_text()
    synced(page)
    print('Bilan mensuel et favoris validés.',flush=True)
    # Statut manuel, automatiquement invalidé si la feuille est corrigée.
    tab(page,'weeks');page.once('dialog',lambda d:d.accept());page.locator('#mark-sent').click()
    assert page.locator('#week-state').inner_text()=='Envoyée'
    tab(page,'day');page.locator('#day-picker').fill('2027-01-25');page.locator('#add').click()
    page.locator('#workplace').select_option('atelier');page.locator('#next').click();page.locator('[name=tpe]').fill('0h30');page.locator('#next').click();page.locator('#next').click()
    tab(page,'weeks');assert page.locator('#week-state').inner_text()=='À renvoyer'
    # Rappel calendrier et rappel vendredi dans l’application.
    page.evaluate("() => renderReminder(new Date('2027-01-29T12:00:00'))")
    assert page.locator('#friday-reminder').is_visible()
    page.locator('#settings-open').click()
    with page.expect_download() as event:page.locator('#calendar-reminder').click()
    calendar=Path('apercus/rappel-test.ics');event.value.save_as(calendar)
    assert 'RRULE:FREQ=WEEKLY;BYDAY=FR' in calendar.read_text()
    assert 'TZID:Europe/Paris' in calendar.read_text()
    page.locator('#settings-close').click()
    # Roulette et persistance après rechargement.
    page.locator('#settings-open').click();page.locator('#theme-open').click()
    page.get_by_role('button',name='Violet',exact=True).click();page.locator('#theme-wheel').focus();page.keyboard.press('ArrowRight')
    assert page.locator('#theme-wheel').get_attribute('aria-valuenow')=='280'
    page.locator('#theme-done').click();page.locator('#settings-close').click();synced(page)
    page.reload();page.locator('#application').wait_for(state='visible')
    assert page.evaluate("() => localStorage.getItem('asc-theme-hue-v1')")=='280'
    tab(page,'weeks');page.locator('#week').fill('2027-01-25')
    # Partage natif simulé : ne doit pas marquer automatiquement la feuille envoyée.
    page.evaluate("""() => {Object.defineProperty(navigator,'canShare',{configurable:true,value:()=>true});Object.defineProperty(navigator,'share',{configurable:true,value:async data=>{window.sharedNames=data.files.map(f=>f.name);}});} """)
    page.locator('#share-pdf').click();page.wait_for_function('() => window.sharedNames?.length===1')
    assert page.evaluate('() => window.sharedNames[0]')=='feuille-semaine-2027-01-25.pdf'
    assert page.locator('#week-state').inner_text()=='À renvoyer'
    page.evaluate("() => Object.defineProperty(navigator,'canShare',{configurable:true,value:()=>false})")
    with page.expect_download() as event:page.locator('#share-pdf').click()
    assert event.value.suggested_filename=='feuille-semaine-2027-01-25.pdf'
    assert page.locator('#week-state').inner_text()=='À renvoyer'
    # Service worker prêt ; les données personnelles ne sont pas dans son cache.
    page.evaluate('async () => {await navigator.serviceWorker.ready;}')
    page.wait_for_function('() => !!navigator.serviceWorker.controller')
    cached=page.evaluate('async () => {const names=await caches.keys();return (await Promise.all(names.map(async n=>(await (await caches.open(n)).keys()).map(r=>new URL(r.url).pathname)))).flat();}')
    assert '/index.html' in cached and '/cloud-export.js' in cached
    assert not any(path.startswith('/api/') for path in cached)
    assert page.evaluate("async () => {const s=await OfflineStore.record();return !new TextDecoder().decode(s.payload).includes('secrétaire');}")
    print('Statut, calendrier et couleurs validés.',flush=True)
    # Deuxième appareil connecté sur la même base.
    second=browser.new_context(locale='fr-FR',reduced_motion='reduce');other=second.new_page();other.goto(os.environ['ASC_TEST_URL'])
    other.locator('#access-code').fill('test-only-cloud-code');other.get_by_role('button',name='Ouvrir mes semaines').click();other.locator('#application').wait_for(state='visible')
    tab(other,'month');other.locator('#month').fill('2027-01')
    assert other.locator('#month-overtime').inner_text()=='2 h 00'
    print('Deuxième appareil connecté. Test de fermeture hors ligne.',flush=True)
    # Fermeture puis réouverture hors connexion, avec code requis dans un nouvel onglet.
    context.set_offline(True);page.close();page=context.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto(os.environ['ASC_TEST_URL']);page.locator('#login-panel').wait_for(state='visible')
    page.locator('#access-code').fill('incorrect-code');page.get_by_role('button',name='Ouvrir mes semaines').click()
    assert page.locator('#application').is_hidden()
    page.locator('#access-code').fill('test-only-cloud-code');page.get_by_role('button',name='Ouvrir mes semaines').click();page.locator('#application').wait_for(state='visible')
    tab(page,'day');atelier(page,'2027-01-30')
    page.wait_for_function('() => cacheSaved && dirty')
    page.reload();page.locator('#application').wait_for(state='visible');page.locator('#day-picker').fill('2027-01-30')
    assert page.locator('#daytotal').inner_text()=='8 h 00'
    # Le PDF est généré sans réseau ; le bloc-notes demeure conservé.
    tab(page,'weeks');page.locator('#week').fill('2027-01-25')
    with page.expect_download(timeout=90000) as event:page.locator('#export').click()
    event.value.save_as('apercus/cloudflare-exemple.pdf');doc=fitz.open('apercus/cloudflare-exemple.pdf');assert len(doc)==1
    text=doc[0].get_text()
    for value in ['Atelier ASC','Client & fils','Saint-Estève','Congé','Arrêt maladie','8 h 30','0 h 30']:
        assert value in text,(value,text)
    page.locator('.export-panel details summary').click()
    with page.expect_download() as event:page.locator('#export-ods').click()
    event.value.save_as('apercus/cloudflare-exemple.ods')
    with zipfile.ZipFile('apercus/cloudflare-exemple.ods') as archive:
        assert archive.infolist()[0].filename=='mimetype';assert archive.infolist()[0].compress_type==0
    print('Réouverture et exports hors ligne validés.',flush=True)
    # Une note saisie sur B ne doit pas être écrasée par la journée hors ligne sur A.
    other.locator('#month-notes').fill('Note ajoutée sur ordinateur pendant la coupure.');other.locator('#screen-title').click();synced(other)
    context.set_offline(False);synced(page)
    tab(page,'month');page.locator('#month').fill('2027-01')
    assert page.locator('#month-notes').input_value()=='Note ajoutée sur ordinateur pendant la coupure.'
    tab(other,'day');other.locator('#sync-now').click();other.locator('#day-picker').fill('2027-01-30')
    other.wait_for_function("() => document.querySelector('#daytotal').textContent==='8 h 00'")
    assert page.locator('#conflict').is_hidden()
    assert page.evaluate('() => document.documentElement.scrollWidth <= innerWidth')
    page.evaluate('() => window.scrollTo(0,0)')
    page.screenshot(path='apercus/nouveau-bilan-mobile.png',full_page=True)
    page.set_viewport_size({'width':1280,'height':950});tab(page,'day');page.evaluate('() => window.scrollTo(0,0)');page.screenshot(path='apercus/nouvelle-journee-ordinateur.png',full_page=True)
    assert page.evaluate('() => document.documentElement.scrollWidth <= innerWidth')
    assert not errors,errors
    browser.close()
print('OK : trois écrans, bilan/bloc-notes, favoris et trajets, statut envoyé, calendrier vendredi, partage, PDF/ODS hors ligne, fermeture/réouverture chiffrée, synchronisation sans écrasement et couleurs.')
