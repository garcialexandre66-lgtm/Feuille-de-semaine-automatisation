"""Compteur 35h/39h, récupération de 8h et école avec validation explicite."""
import os
from pathlib import Path
import fitz
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
    context=browser.new_context(viewport={'width':390,'height':844},locale='fr-FR',reduced_motion='reduce')
    page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.on('dialog',lambda d:d.accept())
    page.goto(os.environ['ASC_TEST_URL']);page.locator('#cloud-setup').wait_for(state='visible')
    page.locator('#setup-token').fill(os.environ['ASC_TEST_SETUP']);page.locator('#new-code').fill('test-only-cloud-code');page.locator('#confirm-code').fill('test-only-cloud-code');page.get_by_role('button',name='Créer mon espace').click()
    page.locator('#access-code').fill('test-only-cloud-code');page.get_by_role('button',name='Ouvrir mes semaines').click();page.locator('#application').wait_for(state='visible')
    def tab(name):page.locator(f'#app-tabs [data-view={name}]').click()
    def details(selector):
        if not page.locator(selector).is_visible():page.locator(selector).evaluate('(el)=>el.closest("details").open=true')
    page.locator('#settings-open').click();page.locator('#name').fill('Test récupération');page.locator('#settings-close').click()
    for date in ['2026-10-05','2026-10-06','2026-10-07','2026-10-08','2026-10-09']:
        page.locator('#day-picker').fill(date);page.locator('#workshop-day').click()
    page.get_by_role('button',name='Modifier',exact=True).click();page.locator('#next').click();page.locator('[name=tpe]').fill('7h');page.locator('#next').click();page.locator('#next').click()
    tab('weeks');assert page.locator('#total').inner_text()=='39 h 00';assert page.locator('#overtime').inner_text()=='4 h 00'
    tab('month');assert 'inconnu' in page.locator('#recovery-balance').inner_text()
    details('#recovery-start');page.locator('#recovery-start').fill('2026-10-01');page.locator('#recovery-opening').fill('');page.locator('#opening-form button').click()
    details('#credit-week');page.locator('#credit-week').fill('2026-10-05');assert page.locator('#credit-duration').input_value()=='4 h 00'
    page.locator('#validate-credit').click();assert page.locator('#recovery-earned').inner_text()=='4 h 00';assert 'inconnu' in page.locator('#recovery-balance').inner_text()
    page.locator('#validate-credit').click();assert page.locator('#recovery-earned').inner_text()=='4 h 00'
    # Les dates prévues ne donnent pas de crédit automatiquement.
    page.locator('#settings-open').click();page.locator('#school-open').click();page.locator('#school-start').fill('2026-10-12');page.locator('#school-end').fill('2026-10-16');page.locator('#school-form button').click();page.locator('#school-file').set_input_files({'name':'planning.json','mimeType':'application/json','buffer':b'["2026-10-20"]'});page.wait_for_function("() => document.querySelector('#school-message').textContent.includes('importé')");page.locator('#school-close').click();page.locator('#settings-close').click()
    assert page.locator('#recovery-earned').inner_text()=='4 h 00'
    page.locator('#credit-week').fill('2026-10-12');page.locator('#credit-source').select_option('school');page.locator('#validate-credit').click();assert page.locator('#recovery-earned').inner_text()=='8 h 00'
    tab('day');page.locator('#day-picker').fill('2026-10-12');assert page.locator('#school-badge').is_visible()
    page.locator('#day-picker').fill('2026-10-19');page.locator('.day-more summary').click();page.locator('#recovery-day').click();page.locator('#leave-form button.primary').click()
    assert page.locator('#days button').count()==5
    assert page.locator('#dayremaining').inner_text()=='Récupération';assert page.locator('#daytotal').inner_text()=='0 h 00'
    tab('month');assert page.locator('#recovery-taken').inner_text()=='8 h 00';assert 'inconnu' in page.locator('#recovery-balance').inner_text()
    page.locator('#recovery-opening').fill('10h');page.locator('#opening-form button').click();assert '10 h 00' in page.locator('#recovery-balance').inner_text()
    # Une correction ne conserve pas un crédit devenu faux.
    tab('day');page.locator('#day-picker').fill('2026-10-05');page.get_by_role('button',name='Modifier',exact=True).click();page.locator('#next').click();page.locator('[name=tpe]').fill('9h');page.locator('#next').click();page.locator('#next').click()
    tab('month');assert page.locator('#recovery-earned').inner_text()=='4 h 00';assert 'revalid' in page.locator('#recovery-warning').inner_text()
    page.locator('#credit-week').fill('2026-10-05');page.locator('#credit-source').select_option('work');assert page.locator('#credit-duration').input_value()=='5 h 00';page.locator('#validate-credit').click()
    assert page.locator('#recovery-earned').inner_text()=='9 h 00';assert '11 h 00' in page.locator('#recovery-balance').inner_text()
    page.locator('#month').fill('2026-10');assert page.locator('#month-overtime').inner_text()=='9 h 00'
    # Aucun crédit futur confirmé avant que la semaine soit effectuée.
    page.locator('#credit-week').fill('2027-12-06');page.locator('#credit-source').select_option('school');page.locator('#validate-credit').click();assert 'vendredi' in page.locator('#credit-error').inner_text();assert page.locator('#recovery-earned').inner_text()=='9 h 00'
    # Congés ouvrables : lundi-vendredi sélectionnés incluent aussi le samedi.
    tab('day');page.locator('#day-picker').fill('2026-11-09');page.locator('.day-more').evaluate('(d)=>d.open=true');page.locator('#leave').click();page.locator('#leave-start').fill('2026-11-09');page.locator('#leave-end').fill('2026-11-13');page.locator('#leave-form button.primary').click()
    assert page.locator('#days button span').all_inner_texts()==['Congé']*5
    tab('month');page.locator('#month').fill('2026-11');assert page.locator('#month-leave').inner_text()=='6 j'
    # Les heures d’école peuvent être saisies comme effectuées, sans inventer les dates prévues.
    tab('day');page.locator('#day-picker').fill('2026-11-16');page.locator('#add').click();page.locator('#workplace').select_option('school');page.locator('#next').click();page.locator('[name=tpe]').fill('8h');page.locator('#next').click();page.locator('#next').click()
    assert 'École' in page.locator('#entries').inner_text();assert page.locator('#daytotal').inner_text()=='8 h 00'
    # Export : dépassement de 35h, pas addition des dépassements quotidiens.
    tab('weeks');page.locator('#week').fill('2026-10-05')
    with page.expect_download(timeout=90000) as event:page.locator('#export').click()
    path=Path('apercus/recuperation-35h.pdf');event.value.save_as(path);doc=fitz.open(path);assert '5 h 00' in doc[0].get_text()
    page.wait_for_function("() => document.querySelector('#sync-status').textContent==='✓ Semaines synchronisées'")
    page.reload();page.locator('#application').wait_for(state='visible');tab('month');assert '11 h 00' in page.locator('#recovery-balance').inner_text()
    page.evaluate('()=>window.scrollTo(0,0)');page.screenshot(path='apercus/compteur-recuperation.png',full_page=True)
    assert not errors,errors
    browser.close()
print('OK : 39h=4h, crédits non doublés, solde inconnu conservé, récupération -8h, école prévue sans crédit, école confirmée +4h, correction/revalidation, refus futur, congés 6 jours et PDF 35h.')
