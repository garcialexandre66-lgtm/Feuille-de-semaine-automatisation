import threading,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from http.server import ThreadingHTTPServer
from server import Handler
from playwright.sync_api import sync_playwright
import os, tempfile, storage
_test_data = tempfile.TemporaryDirectory()
os.environ['ASC_DATA_DIR'] = _test_data.name
storage.set_code('test-only-password')
server=ThreadingHTTPServer(('127.0.0.1',0),Handler)
threading.Thread(target=server.serve_forever,daemon=True).start()
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 page=browser.new_page(viewport={'width':390,'height':844},locale='fr-FR')
 errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto(f'http://127.0.0.1:{server.server_port}')
 page.locator('#access-code').fill('test-only-password')
 page.get_by_role('button',name='Ouvrir mes semaines').click()
 page.locator('#application').wait_for(state='visible')
 page.locator('#days button').first.click()
 assert page.locator('#previous-day').is_disabled()
 page.locator('#add').click()
 page.locator('#form [name=client]').fill('Client exemple')
 page.locator('#form [name=city]').fill('Saint-Estève')
 page.locator('#next').click()
 page.locator('#form [name=travel]').fill('60')
 page.locator('[name=tpe]').fill('1h')
 page.locator('#previous').click()
 assert page.locator('#form [name=client]').input_value()=='Client exemple'
 page.locator('#next').click()
 assert page.locator('#form [name=travel]').input_value()=='60'
 page.locator('#next').click()
 page.locator('[name=chantier]').fill('6h90')
 page.locator('#next').click()
 assert page.locator('#step-count').inner_text()=='Étape 3 sur 4'
 assert 'minutes' in page.locator('#error').inner_text()
 page.locator('[name=chantier]').fill('6h30')
 page.locator('#next').click()
 assert '8 h 30' in page.locator('#recap').inner_text()
 assert '0 h 30' in page.locator('#recap').inner_text()
 page.screenshot(path='apercus/saisie-etapes-telephone.png',full_page=True)
 page.locator('#next').click()
 assert page.locator('#daytotal').inner_text()=='8 h 30'
 page.locator('#next-day').click()
 assert page.locator('#daytitle').inner_text()=='Mardi'
 assert page.locator('#daytotal').inner_text()=='0 h 00'
 page.locator('#previous-day').click()
 assert page.locator('#daytotal').inner_text()=='8 h 30'
 page.wait_for_function("() => document.querySelector('#sync-status').textContent==='✓ Semaines synchronisées'")
 page.reload();page.locator('#application').wait_for(state='visible');page.locator('#days button').first.click()
 assert page.locator('#daytotal').inner_text()=='8 h 30'
 page.get_by_role('button',name='Modifier',exact=True).click()
 for _ in range(3):page.locator('#next').click()
 page.locator('#next').click()
 assert page.locator('#daytotal').inner_text()=='8 h 30'
 page.locator('#add').click();page.locator('#next').click()
 page.screenshot(path='apercus/etape-trajet-telephone.png',full_page=True)
 assert not errors,errors
 print('OK : 4 étapes, retour sans perte, rejet durée invalide, récapitulatif et heures supplémentaires, sauvegarde, navigation entre jours, rechargement, modification sans doublon.')
 browser.close()
server.shutdown()
