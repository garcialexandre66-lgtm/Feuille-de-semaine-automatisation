"""A private fragment imports into the authenticated account without touching worked hours."""
import os,json
from pathlib import Path
from playwright.sync_api import sync_playwright
dates=json.loads(Path(os.environ['ASC_TEST_SCHOOL_DATES_FILE']).read_text())['dates'] if os.environ.get('ASC_TEST_SCHOOL_DATES_FILE') else ['2028-02-28','2028-02-29']
fragment='#ecole='+','.join(date.replace('-','') for date in dates)
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
    page=browser.new_page(viewport={'width':390,'height':844},locale='fr-FR');errors=[];requests=[]
    page.on('pageerror',lambda e:errors.append(str(e)));page.on('request',lambda request:requests.append(request.url))
    page.goto(os.environ['ASC_TEST_URL']);page.locator('#cloud-setup').wait_for(state='visible')
    page.locator('#setup-token').fill(os.environ['ASC_TEST_SETUP']);page.locator('#new-code').fill('school-link-test');page.locator('#confirm-code').fill('school-link-test');page.get_by_role('button',name='Créer mon espace').click()
    def login():
        page.locator('#access-code').fill('school-link-test');page.get_by_role('button',name='Ouvrir mes semaines').click();page.locator('#application').wait_for(state='visible')
    login()
    page.evaluate("""()=>{store.name='Test planning';store.schoolDates['2029-01-09']=true;store.weeks['2026-11-02']=Array.from({length:7},(_,i)=>i===0?[{client:'Travail existant',city:'',travel:0,tpe:480,regie:0,chantier:0,sav:0}]:[]);save();render();}""")
    page.wait_for_function('() => !dirty&&!busy')
    page.evaluate("$('logout').click()");page.locator('#login-panel').wait_for(state='visible')
    page.goto(os.environ['ASC_TEST_URL']+fragment)
    assert str(len(dates)) in page.locator('#school-link-login-note').inner_text()
    assert page.evaluate('pendingSchoolDates.length')==len(dates)
    login();page.wait_for_function('() => pendingSchoolDates===null')
    assert page.locator('#school-link-result').is_visible()
    assert str(len(dates)) in page.locator('#school-link-result').inner_text()
    assert 'ecole=' not in page.url
    assert page.evaluate('Object.keys(store.schoolDates).length')==len(dates)+1
    assert page.evaluate("store.schoolDates['2029-01-09']")
    assert page.evaluate("store.weeks['2026-11-02'][0][0].tpe")==480
    assert page.evaluate('Object.keys(store.recovery.weeks).length')==0
    page.wait_for_function('() => !dirty&&!busy')
    remote=page.evaluate("async()=> (await api('/api/state')).store")
    assert all(remote['schoolDates'].get(date) for date in dates)
    assert all('ecole=' not in request for request in requests)
    page.locator('#school-link-result button').filter(has_text='Voir le calendrier').click()
    page.locator('#calendar-month').fill(dates[0][:7])
    assert page.locator('[data-date="'+dates[0]+'"]').get_attribute('data-kind')=='school'
    page.locator('[data-date="'+dates[0]+'"]').click()
    assert 'Cours au CFA' in page.locator('.week-card[open]>summary').inner_text()
    assert 'École prévue' in page.locator('.week-card[open]>summary').inner_text()
    page.locator('#add').click();assert page.locator('#workplace').input_value()=='school'
    assert not page.locator('#form [name=chantier]').is_visible()
    page.locator('#cancel').click()
    # Reopening the same link is idempotent.
    page.goto(os.environ['ASC_TEST_URL']+fragment);page.wait_for_function('() => pendingSchoolDates===null')
    assert page.evaluate('Object.keys(store.schoolDates).length')==len(dates)+1
    # A failed encrypted save retains the link and offers a retry.
    page.evaluate('()=>{window.originalTestPersist=OfflineStore.persist;OfflineStore.persist=async()=>{throw Error("test")};}')
    page.goto(os.environ['ASC_TEST_URL']+'#ecole=20300102')
    page.get_by_role('button',name='Réessayer',exact=True).wait_for(state='visible')
    assert 'ecole=' in page.url
    page.evaluate('()=>{OfflineStore.persist=window.originalTestPersist;}')
    page.get_by_role('button',name='Réessayer',exact=True).click();page.wait_for_function('() => pendingSchoolDates===null')
    assert 'ecole=' not in page.url
    # Exact replacement drops old automatic school rows, but keeps jobs.
    page.evaluate("""()=>{store.schoolDates['2030-01-08']=true;store.weeks['2030-01-07']=[[],[{client:'École',city:'',workplace:'school',travel:0,tpe:420,regie:0,chantier:0,sav:0,prep:'',intervention:''}],[],[],[],[],[]];save();}""")
    page.wait_for_function('() => !dirty&&!busy')
    page.goto(os.environ['ASC_TEST_URL']+'#ecole=20300109&remplacer=1&du=20300101&au=20301231')
    page.wait_for_function('() => pendingSchoolDates===null')
    assert page.evaluate("store.weeks['2030-01-07'][1].length")==0
    assert page.evaluate("store.weeks['2030-01-07'][2][0].tpe")==420
    assert not page.evaluate("!!store.schoolDates['2030-01-08']")
    assert page.evaluate("store.weeks['2026-11-02'][0][0].tpe")==480
    page.wait_for_function('() => !dirty&&!busy')
    remote=page.evaluate("async()=> (await api('/api/state')).store")
    assert remote['weeks']['2030-01-07'][1]==[]
    # Invalid input does not partially change the account.
    before=page.evaluate('Object.keys(store.schoolDates).length')
    page.goto(os.environ['ASC_TEST_URL']+'#ecole=20260231')
    assert 'invalide' in page.locator('#school-link-result').inner_text()
    assert page.evaluate('Object.keys(store.schoolDates).length')==before
    assert not errors,errors
    browser.close()
print('OK : import privé de '+str(len(dates))+' dates après connexion, calendrier, D1, conservation des heures, répétition sans doublon et reprise après échec de sauvegarde.')
