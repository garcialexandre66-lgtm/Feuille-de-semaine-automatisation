"""Exports et synchronisation sur le runtime officiel Cloudflare local."""
import os
from pathlib import Path
import zipfile
import fitz
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
    context=browser.new_context(viewport={'width':390,'height':844},locale='fr-FR')
    page=context.new_page()
    errors=[]
    page.on('pageerror',lambda error:errors.append(str(error)))
    page.goto(os.environ['ASC_TEST_URL'])
    page.locator('#cloud-setup').wait_for(state='visible')
    page.locator('#setup-token').fill(os.environ['ASC_TEST_SETUP'])
    page.locator('#new-code').fill('test-only-cloud-code')
    page.locator('#confirm-code').fill('test-only-cloud-code')
    page.get_by_role('button',name='Créer mon espace').click()
    page.locator('#login-form').wait_for(state='visible')
    page.locator('#access-code').fill('test-only-cloud-code')
    page.get_by_role('button',name='Ouvrir mes semaines').click()
    page.locator('#application').wait_for(state='visible')
    page.locator('#name').fill('Technicien démonstration')
    page.locator('#week').fill('2027-01-04')
    page.locator('#days button').first.click()
    page.locator('#workshop-day').click()
    page.locator('#next-day').click()
    page.locator('#add').click()
    page.locator('[name=client]').fill('Client & fils')
    page.locator('[name=city]').fill('Saint-Estève')
    page.locator('#next').click()
    page.locator('[name=travel]').fill('60')
    page.locator('[name=tpe]').fill('1h')
    page.locator('#next').click()
    page.locator('[name=chantier]').fill('6h30')
    page.locator('#next').click();page.locator('#next').click()
    page.locator('#next-day').click()
    page.locator('#leave').click()
    page.locator('#leave-form button.primary').click()
    page.locator('#next-day').click()
    page.locator('#sick').click()
    page.locator('#leave-form button.primary').click()
    page.wait_for_function("() => document.querySelector('#sync-status').textContent==='✓ Semaines synchronisées'")
    # Second appareil et première installation désactivée.
    second=browser.new_context(locale='fr-FR')
    other=second.new_page();other.goto(os.environ['ASC_TEST_URL'])
    other.locator('#login-form').wait_for(state='visible')
    assert other.locator('#cloud-setup').is_hidden()
    other.locator('#access-code').fill('test-only-cloud-code')
    other.get_by_role('button',name='Ouvrir mes semaines').click()
    other.locator('#application').wait_for(state='visible')
    other.locator('#week').fill('2027-01-04')
    assert other.locator('#total').inner_text()=='16 h 30'
    assert other.locator('#overtime').inner_text()=='0 h 30'
    # Personnalisation : roulette, clavier, persistance et mises en page.
    page.locator('#theme-open').click()
    page.get_by_role('button',name='Violet',exact=True).click()
    assert page.locator('#theme-wheel').get_attribute('aria-valuenow')=='275'
    page.locator('#theme-wheel').focus()
    page.keyboard.press('ArrowRight')
    assert page.locator('#theme-wheel').get_attribute('aria-valuenow')=='280'
    page.locator('#theme-done').click()
    assert page.evaluate("() => document.documentElement.scrollWidth <= innerWidth")
    page.reload();page.locator('#application').wait_for(state='visible')
    assert page.evaluate("() => localStorage.getItem('asc-theme-hue-v1')")=='280'
    assert page.evaluate("() => getComputedStyle(document.documentElement).getPropertyValue('--theme-hue').trim()")=='280'
    page.locator('#week').fill('2027-01-04')
    page.screenshot(path='apercus/theme-violet-mobile.png',full_page=True)
    page.locator('#theme-open').click()
    page.locator('#theme-wheel').click(position={'x':148,'y':80})
    assert page.locator('#theme-wheel').get_attribute('aria-valuenow')=='90'
    page.locator('#theme-reset').click()
    assert page.locator('#theme-wheel').get_attribute('aria-valuenow')=='213'
    page.screenshot(path='apercus/roulette-couleurs.png',full_page=True)
    page.locator('#theme-done').click()
    page.set_viewport_size({'width':1280,'height':950})
    assert page.evaluate("() => document.documentElement.scrollWidth <= innerWidth")
    page.screenshot(path='apercus/design-colore-ordinateur.png',full_page=True)
    page.set_viewport_size({'width':390,'height':844})
    # Exports locaux : aucun appel à /export/pdf ni à LibreOffice.
    page.route('**/export*',lambda route:route.abort())
    with page.expect_download(timeout=90000) as event:
        page.locator('#export').click()
    event.value.save_as('apercus/cloudflare-exemple.pdf')
    doc=fitz.open('apercus/cloudflare-exemple.pdf')
    assert len(doc)==1
    text=doc[0].get_text()
    for value in ['Atelier ASC','Client & fils','Saint-Estève','Congé','Arrêt maladie','8 h 30','0 h 30','Technicien démonstration','04/01/2027','10/01/2027']:
        assert value in text,(value,text)
    assert '2000' not in text
    doc[0].get_pixmap(matrix=fitz.Matrix(1.6,1.6)).save('apercus/cloudflare-pdf.png')
    with page.expect_download() as event:
        page.locator('#export-ods').click()
    event.value.save_as('apercus/cloudflare-exemple.ods')
    with zipfile.ZipFile('apercus/cloudflare-exemple.ods') as archive:
        assert archive.infolist()[0].filename=='mimetype'
        assert archive.infolist()[0].compress_type==0
        xml=archive.read('content.xml').decode()
        for label in ['Atelier ASC','Congé','Arrêt maladie','Client &amp; fils']:
            assert label in xml
    assert not errors,errors
    page.screenshot(path='apercus/cloudflare-application.png',full_page=True)
    browser.close()
print('OK : installation sécurisée, code personnel, 2 appareils, D1, PDF fidèle au modèle et ODS générés sur l’appareil, congés, maladie et heures supplémentaires.')
