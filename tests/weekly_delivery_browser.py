import os,json
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    engine=os.environ.get('ASC_BROWSER_ENGINE','chromium')
    browser=getattr(p,engine).launch(headless=True,**({'executable_path':'/usr/bin/chromium','args':['--no-sandbox']} if engine=='chromium' else {}))
    page=browser.new_page(viewport={'width':390,'height':844},locale='fr-FR');errors=[];sent=[];prepared=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto(os.environ['ASC_TEST_URL']);page.locator('#cloud-setup').wait_for(state='visible')
    page.locator('#setup-token').fill(os.environ['ASC_TEST_SETUP']);page.locator('#new-code').fill('manual-send-test');page.locator('#confirm-code').fill('manual-send-test');page.get_by_role('button',name='Créer mon espace').click()
    page.locator('#access-code').fill('manual-send-test');page.get_by_role('button',name='Ouvrir mes semaines').click();page.locator('#application').wait_for(state='visible')
    page.evaluate("""()=>{store.name='Test Alexandre';week='2030-01-07';expandedDay=null;store.weeks[week]=Array.from({length:7},(_,i)=>i<5?[{client:'Chantier '+i,city:'',workplace:'client',travel:0,tpe:480,regie:0,chantier:0,sav:0}]:[]);save();render();}""")
    page.wait_for_function('()=>!dirty&&!busy')
    # The real server prepares a PDF even before Google is connected; no misleading send button.
    page.locator('#gmail-pdf').click();page.wait_for_function("()=>document.querySelector('#weekly-delivery-status').textContent.includes('activation')")
    assert page.locator('#weekly-delivery-send').is_disabled()
    preview_url=page.locator('#weekly-delivery-preview').get_attribute('href')
    response=page.evaluate("""async url=>{const r=await fetch(url);return {status:r.status,body:await r.text(),cache:r.headers.get('cache-control')}}""",preview_url)
    assert response['status']==200 and response['body'].startswith('%PDF-')
    assert response['cache']=='no-store'
    assert page.evaluate("""async()=>{const r=await fetch('/api/delivery/confirm',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:'a'.repeat(64),confirm:false})});return r.status}""")==400
    page.get_by_role('button',name='Annuler',exact=True).click()
    # Mock only the external connection flag and confirmation, never send real mail.
    def connected(route):
        response=route.fetch();data=response.json();data.update(configured=True,connected=True,from_='test@example.com');data['from']='test@example.com';prepared.append(data)
        route.fulfill(response=response,json=data)
    page.route('**/api/delivery/prepare',connected)
    def confirm(route):
        sent.append(route.request.post_data_json);route.fulfill(json={'sent':True,'week':'2030-01-07','message':'Feuille envoyée à Suzie avec le PDF joint.'})
    page.route('**/api/delivery/confirm',confirm)
    page.locator('#gmail-pdf').click();page.locator('#weekly-delivery-send').wait_for(state='visible');page.wait_for_function("()=>!document.querySelector('#weekly-delivery-send').disabled")
    assert 's.sanchez@asc66.fr' in page.locator('#weekly-delivery-content').inner_text()
    assert '40 h' in page.locator('.delivery-week-total').inner_text()
    assert 'Chantier 0' in page.locator('#weekly-delivery-content').inner_text()
    assert not sent
    page.screenshot(path='apercus/envoi-suzie-verification.png',full_page=True)
    page.get_by_role('button',name='Annuler',exact=True).click();assert not sent
    # Confirm sends only the reviewed snapshot and records its version.
    page.locator('#gmail-pdf').click();page.wait_for_function("()=>!document.querySelector('#weekly-delivery-send').disabled")
    draft_id=prepared[-1]['id']
    page.evaluate("()=>{store.weeks['2030-01-07'][0][0].client='Modifié après aperçu';save();}")
    page.locator('#weekly-delivery-send').click()
    page.wait_for_function("()=>document.querySelector('#weekly-delivery-title').textContent.includes('envoyée')")
    assert len(sent)==1 and sent[0]=={'id':draft_id,'confirm':True}
    assert page.evaluate("Timesheet.sentStatus(store,'2030-01-07')")=='À renvoyer'
    page.get_by_role('button',name='Fermer',exact=True).last.click()
    # Weekend entries need an explicit exclusion acknowledgement in the same window.
    page.evaluate("()=>{store.weeks['2030-01-07'][5]=JSON.parse(JSON.stringify(store.weeks['2030-01-07'][0]));save();render();}")
    page.locator('#gmail-pdf').click();page.locator('#weekly-delivery-weekend').wait_for(state='visible')
    assert page.locator('#weekly-delivery-send').is_disabled()
    page.locator('#weekly-delivery-weekend').check();assert page.locator('#weekly-delivery-send').is_enabled()
    page.get_by_role('button',name='Annuler',exact=True).click();assert len(sent)==1
    # Google connection is visible immediately in settings; errors are shown beside it.
    page.locator('#settings-open').click()
    page.locator('#connect-google').wait_for(state='visible')
    assert not page.locator('#settings-more').get_attribute('open')
    assert page.locator('#connect-google').inner_text()=='Connecter mon compte Google'
    page.locator('#connect-google').click();page.locator('#google-connection-message').wait_for(state='visible')
    page.wait_for_function("()=>document.querySelector('#google-connection-message').textContent.includes('Cloudflare')")
    page.screenshot(path='apercus/parametres-google.png',full_page=True)
    # When configured, the same button starts the actual OAuth flow (navigation mocked).
    page.route('**/api/google/start',lambda route:route.fulfill(json={'url':'https://accounts.google.com/mock-oauth'}))
    page.route('https://accounts.google.com/mock-oauth',lambda route:route.fulfill(content_type='text/html',body='Google OAuth test'))
    page.locator('#connect-google').click();page.wait_for_url('https://accounts.google.com/mock-oauth')
    assert not errors,errors
    browser.close()
print('OK: authenticated real PDF preview, Google setup state, cancellation without send, explicit confirmation, immutable reviewed version, weekend acknowledgement.')
