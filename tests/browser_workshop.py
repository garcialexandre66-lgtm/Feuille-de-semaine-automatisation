"""Test du parcours atelier et du contenu du PDF (Playwright et LibreOffice)."""
import sys
import threading
import subprocess
import tempfile
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from http.server import ThreadingHTTPServer
from server import Handler
from playwright.sync_api import sync_playwright

import os, tempfile, storage
_test_data = tempfile.TemporaryDirectory()
os.environ['ASC_DATA_DIR'] = _test_data.name
storage.set_code('test-only-password')
server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
threading.Thread(target=server.serve_forever, daemon=True).start()
try:
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox'])
        page = browser.new_page(viewport={'width':390, 'height':844})
        page.goto(f'http://127.0.0.1:{server.server_port}')
        page.locator('#access-code').fill('test-only-password')
        page.get_by_role('button',name='Ouvrir mes semaines').click()
        page.locator('#application').wait_for(state='visible')
        page.locator('#name').fill('Test atelier')
        page.locator('#add').click()
        page.locator('#workplace').select_option('atelier')
        assert not page.locator('[name=client]').is_visible()
        page.locator('#next').click()
        assert not page.locator('[name=travel]').is_visible()
        page.locator('[name=tpe]').fill('8h')
        page.locator('#next').click()
        assert page.locator('#step-count').inner_text() == 'Étape 3 sur 3'
        assert 'Atelier ASC' in page.locator('#recap').inner_text()
        page.locator('#next').click()
        assert page.locator('#daytotal').inner_text() == '8 h 00'
        assert page.locator('#overtime').inner_text() == '0 h 00'
        page.get_by_role('button',name='Modifier',exact=True).click()
        assert page.locator('#workplace').input_value() == 'atelier'
        page.locator('#cancel').click()
        with page.expect_download() as event:
            page.locator('#export').click()
        with tempfile.TemporaryDirectory() as folder:
            pdf=Path(folder)/'atelier.pdf'
            event.value.save_as(pdf)
            result=subprocess.run(['pdftotext','-layout',str(pdf),'-'],capture_output=True,text=True,check=True)
            assert 'Atelier ASC' in result.stdout
            assert '8 h 00' in result.stdout
        browser.close()
    print('OK : choix entreprise, TPE seul, 8h sans trajet ni heures supplémentaires, modification et PDF Atelier ASC.')
finally:
    server.shutdown()
