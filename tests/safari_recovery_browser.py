"""Reproduce Cloudflare's HTML redirect, then recover without deleting encrypted edits."""
import os
from playwright.sync_api import sync_playwright,Error
engine=os.environ.get('ASC_BROWSER_ENGINE','chromium')
with sync_playwright() as p:
    kind=p.webkit if engine=='webkit' else p.chromium
    browser=kind.launch(headless=True,**({} if engine=='webkit' else {'executable_path':'/usr/bin/chromium','args':['--no-sandbox']}))
    page=browser.new_page(viewport={'width':390,'height':844},locale='fr-FR');errors=[];page.on('pageerror',lambda error:errors.append(str(error)))
    base=os.environ['ASC_TEST_URL'];page.goto(base);page.locator('#cloud-setup').wait_for(state='visible')
    page.locator('#setup-token').fill(os.environ['ASC_TEST_SETUP']);page.locator('#new-code').fill('safari-test-code');page.locator('#confirm-code').fill('safari-test-code');page.get_by_role('button',name='Créer mon espace').click()
    page.locator('#access-code').fill('safari-test-code');page.get_by_role('button',name='Ouvrir mes semaines').click();page.locator('#application').wait_for(state='visible')
    page.evaluate("()=>{store.name='Test Safari';store.weeks['2026-11-02']=Array.from({length:7},(_,i)=>i===0?[{client:'Travail conservé',city:'',travel:0,tpe:480,regie:0,chantier:0,sav:0}]:[]);save();render();}")
    page.wait_for_function('() => !dirty&&!busy')
    page.wait_for_function('() => !!navigator.serviceWorker.controller')
    assert page.evaluate("async()=> (await caches.match('/index.html',{cacheName:'asc-shell-broken'})).redirected")
    page.evaluate("()=>{connected=false;store.learningNotes['2026-11-02']='Saisie locale non synchronisée à conserver';save();}")
    page.wait_for_function('() => dirty&&cacheSaved')
    # Safari rejects this navigation; Chromium behavior is browser-version dependent.
    try:page.reload(wait_until='domcontentloaded',timeout=10000)
    except Error:pass
    if engine=='webkit':assert any('redirections' in error for error in errors),errors
    errors.clear() # The intentionally broken worker above is expected to report an error.
    response=page.request.get(base+'__test-upgrade');assert response.ok
    page.goto(base+'api/recover#ecole=20280228,20280229')
    page.wait_for_url(lambda url:str(url).split('#')[0]==base,timeout=60000)
    page.locator('#application').wait_for(state='visible',timeout=30000)
    page.wait_for_function('() => pendingSchoolDates===null')
    assert page.evaluate('store.name')=='Test Safari'
    assert page.evaluate("store.weeks['2026-11-02'][0][0].tpe")==480
    assert 'non synchronisée' in page.evaluate("store.learningNotes['2026-11-02']")
    assert page.evaluate("store.schoolDates['2028-02-28']&&store.schoolDates['2028-02-29']")
    page.wait_for_function('() => !dirty&&!busy')
    # Both online refresh and an actual offline navigation must now be usable.
    page.reload();page.locator('#application').wait_for(state='visible')
    if engine=='webkit':
        # WebKit's protocol offline switch can abort navigation before a worker runs.
        # Instead make every asset unavailable at the server and block account requests.
        assert page.request.get(base+'__test-offline').ok
        page.route('**/api/session',lambda route:route.abort())
        page.route('**/api/state',lambda route:route.abort())
    else:page.context.set_offline(True)
    page.reload();page.locator('#application').wait_for(state='visible')
    assert 'non synchronisée' in page.evaluate("store.learningNotes['2026-11-02']")
    assert not errors,errors
    browser.close()
print('OK '+engine+' : redirection HTML reproduite, récupération via /api/recover, saisies chiffrées et session conservées, planning importé, navigation hors connexion.')
