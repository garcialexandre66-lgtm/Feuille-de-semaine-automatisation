"""Congés et arrêts maladie : périodes futures, confirmation, sauvegarde et PDF."""
import os
import sys
import tempfile
import threading
import subprocess
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from http.server import ThreadingHTTPServer
from playwright.sync_api import sync_playwright
import storage
from server import Handler

with tempfile.TemporaryDirectory() as folder:
    os.environ['ASC_DATA_DIR']=folder
    storage.set_code('test-only-password')
    server=ThreadingHTTPServer(('127.0.0.1',0),Handler)
    threading.Thread(target=server.serve_forever,daemon=True).start()
    try:
        with sync_playwright() as p:
            browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
            page=browser.new_page(viewport={'width':390,'height':844},locale='fr-FR')
            page.goto(f'http://127.0.0.1:{server.server_port}')
            page.locator('#access-code').fill('test-only-password')
            page.get_by_role('button',name='Ouvrir mes semaines').click()
            page.locator('#application').wait_for(state='visible')
            page.locator('#name').fill('Test absences')
            page.locator('#week').fill('2027-01-04')
            page.locator('#days button').first.click()
            page.locator('#workshop-day').click()
            # Pas de suppression si on refuse de remplacer une journée travaillée.
            page.locator('#leave').click()
            page.locator('#leave-week').click()
            page.once('dialog',lambda d:d.dismiss())
            page.locator('#leave-form button.primary').click()
            assert page.locator('#leave-dialog').is_visible()
            assert page.locator('#daytotal').inner_text()=='8 h 00'
            page.once('dialog',lambda d:d.accept())
            page.locator('#leave-form button.primary').click()
            assert page.locator('#dayremaining').inner_text()=='Congé'
            assert page.locator('#days button span').all_inner_texts()==['Congé']*5+['0 h 00']*2
            assert page.locator('#add').is_disabled()
            assert page.locator('#total').inner_text()=='0 h 00'
            # Une période future traverse deux semaines, week-ends ignorés.
            page.locator('#leave').click()
            page.locator('#leave-start').fill('2027-02-01')
            page.locator('#leave-end').fill('2027-02-12')
            page.locator('#leave-form button.primary').click()
            assert page.locator('#week').input_value()=='2027-02-01'
            page.locator('#week').fill('2027-02-08')
            assert page.locator('#days button span').all_inner_texts()==['Congé']*5+['0 h 00']*2
            # Arrêt maladie sur la semaine entière, incluant les week-ends.
            page.locator('#week').fill('2027-03-01')
            page.locator('#sick').click()
            page.locator('#leave-week').click()
            page.locator('#leave-weekend').check()
            page.locator('#leave-form button.primary').click()
            assert page.locator('#days button span').all_inner_texts()==['Arrêt maladie']*7
            assert page.locator('#overtime').inner_text()=='0 h 00'
            # Deux motifs dans la même semaine sur des dates distinctes.
            page.locator('#week').fill('2027-01-04')
            page.locator('#days button').last.click()
            page.locator('#sick').click()
            page.locator('#leave-form button.primary').click()
            page.wait_for_function("() => document.querySelector('#sync-status').textContent==='✓ Semaines synchronisées'")
            page.reload();page.locator('#application').wait_for(state='visible')
            page.locator('#week').fill('2027-01-04')
            page.locator('#days button').last.click()
            assert page.locator('#dayremaining').inner_text()=='Arrêt maladie'
            with page.expect_download(timeout=90000) as event:
                page.locator('#export').click()
            pdf=Path(folder)/'absences.pdf';event.value.save_as(pdf)
            text=subprocess.run(['pdftotext','-layout',str(pdf),'-'],capture_output=True,text=True,check=True).stdout
            assert text.count('Congé')==5
            assert 'Arrêt maladie' in text
            # Aucun des motifs ne devient un client mémorisé.
            assert not page.locator('#remembered-clients option').count()
            page.screenshot(path='apercus/conges-maladie.png',full_page=True)
            # Une période inversée ne modifie pas la feuille.
            page.locator('#leave').click()
            page.locator('#leave-start').fill('2027-04-10')
            page.locator('#leave-end').fill('2027-04-01')
            page.locator('#leave-form button.primary').click()
            assert 'fin' in page.locator('#leave-error').inner_text()
            browser.close()
        print('OK : congé journée/semaine/période future, week-ends optionnels, arrêt maladie, refus de remplacement, total nul, sauvegarde serveur et PDF avec les deux motifs.')
    finally:
        server.shutdown()
