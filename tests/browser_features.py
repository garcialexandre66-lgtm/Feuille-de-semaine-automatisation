"""Test réel de deux appareils, authentification et fonctions de saisie."""
import os
import sys
import tempfile
import threading
import urllib.request
import urllib.error
import json
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from http.server import ThreadingHTTPServer
from playwright.sync_api import sync_playwright
import storage
from server import Handler


def run():
    with tempfile.TemporaryDirectory() as folder:
        os.environ['ASC_DATA_DIR'] = folder
        storage.set_code('test-only-password')
        server = ThreadingHTTPServer(('127.0.0.1',0), Handler)
        threading.Thread(target=server.serve_forever,daemon=True).start()
        base = f'http://127.0.0.1:{server.server_port}'
        try:
            for path in ['/api/state','/export']:
                request=urllib.request.Request(base+path, data=b'{}' if path=='/export' else None,headers={'Content-Type':'application/json'})
                try:
                    urllib.request.urlopen(request)
                    raise AssertionError('Accès non protégé')
                except urllib.error.HTTPError as error:
                    assert error.code == 401
            with sync_playwright() as p:
                browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
                a=browser.new_context(viewport={'width':390,'height':844},locale='fr-FR')
                b=browser.new_context(viewport={'width':1280,'height':900},locale='fr-FR')
                one,two=a.new_page(),b.new_page()
                def login(page):
                    page.goto(base)
                    page.locator('#access-code').fill('test-only-password')
                    page.get_by_role('button',name='Ouvrir mes semaines').click()
                    page.locator('#application').wait_for(state='visible')
                def synced(page):
                    page.wait_for_function("() => document.querySelector('#sync-status').textContent==='✓ Semaines synchronisées'")
                login(one)
                one.locator('#settings-open').click()
                one.locator('#name').fill('Test technicien')
                one.locator('#settings-close').click()
                one.locator('#days button').first.click()
                one.locator('#workshop-day').click()
                synced(one)
                assert one.locator('#daytotal').inner_text()=='8 h 00'
                assert one.locator('#entries').inner_text().count('Atelier ASC')==1
                login(two)
                initial=two.evaluate("async () => (await fetch('/api/state')).json()")
                remote_allowed=False
                def stale_until_write(route):
                    nonlocal remote_allowed
                    if route.request.method=='POST':
                        remote_allowed=True
                        route.continue_()
                    elif remote_allowed:route.continue_()
                    else:route.fulfill(json=initial)
                two.route('**/api/state',stale_until_write)
                two.locator('#days button').first.click()
                assert two.locator('#daytotal').inner_text()=='8 h 00'
                # Copie par valeur : supprimer sur la copie ne change pas la source.
                one.locator('#next-day').click()
                one.locator('.day-more').evaluate('(d)=>d.open=true')
                one.locator('#copy-day').click()
                one.locator('#copy-form button.primary').click()
                assert one.locator('#daytotal').inner_text()=='8 h 00'
                one.on('dialog',lambda dialog:dialog.accept())
                one.get_by_role('button',name='Supprimer',exact=True).click()
                assert one.locator('#daytotal').inner_text()=='0 h 00'
                one.locator('#previous-day').click()
                assert one.locator('#daytotal').inner_text()=='8 h 00'
                # Client mémorisé et historique.
                one.locator('#next-day').click()
                one.locator('#add').click()
                one.locator('#form [name=client]').fill('Client mémorisé')
                one.locator('#form [name=city]').fill('Perpignan')
                one.locator('#next').click();one.locator('#next').click()
                one.locator('[name=chantier]').fill('2h30')
                one.locator('#next').click();one.locator('#next').click()
                synced(one)
                one.locator('#add').click()
                one.locator('#form [name=client]').fill('Client mémorisé')
                one.locator('#form [name=city]').focus()
                assert one.locator('#form [name=city]').input_value()=='Perpignan'
                one.locator('#cancel').click()
                one.locator('#day-picker').fill('2026-10-19')
                one.locator('#workshop-day').click()
                synced(one)
                assert one.locator('#history-list button').count()==2
                one.locator('#app-tabs [data-view=weeks]').click()
                one.locator('#history-list button').first.click()
                assert one.locator('#week').input_value()!='2026-10-19'
                # B conserve une révision ancienne : le serveur refuse l’écrasement.
                two.locator('#next-day').click()
                two.locator('#workshop-day').click()
                two.locator('#conflict').wait_for(state='visible')
                two.on('dialog',lambda dialog:dialog.accept())
                two.unroute('**/api/state')
                two.locator('#load-remote').click()
                two.locator('#conflict').wait_for(state='hidden')
                assert two.locator('#daytotal').inner_text()=='2 h 30'
                synced(two)
                # Récupération après rechargement et fermeture de session.
                two.reload();two.locator('#application').wait_for(state='visible')
                two.locator('#settings-open').click()
                two.locator('#logout').click()
                two.locator('#login-panel').wait_for(state='visible')
                assert two.locator('#application').is_hidden()
                response=b.request.get(base+'/api/state')
                assert response.status==401
                one.locator('#name').blur()
                one.screenshot(path='apercus/nouvelles-fonctions.png',full_page=True)
                browser.close()
            print('OK : API protégée, connexion sur 2 appareils, synchronisation, conflit sans écrasement, clients/localité, copie indépendante, historique, atelier 8h, persistance et verrouillage.')
        finally:
            server.shutdown()

if __name__=='__main__':
    run()
