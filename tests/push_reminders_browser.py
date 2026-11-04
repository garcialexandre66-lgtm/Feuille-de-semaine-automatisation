import os
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
    page=browser.new_page(viewport={'width':390,'height':844},locale='fr-FR');errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto(os.environ['ASC_TEST_URL']);page.locator('#cloud-setup').wait_for(state='visible')
    page.locator('#setup-token').fill(os.environ['ASC_TEST_SETUP']);page.locator('#new-code').fill('push-reminder-test');page.locator('#confirm-code').fill('push-reminder-test');page.get_by_role('button',name='Créer mon espace').click()
    page.locator('#access-code').fill('push-reminder-test');page.get_by_role('button',name='Ouvrir mes semaines').click();page.locator('#application').wait_for(state='visible')
    page.wait_for_function('()=>!!navigator.serviceWorker.controller')
    # Browser permission and transport are mocked; registration and D1 are real.
    page.evaluate("""async()=>{
     const pair=await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},true,['deriveBits']);
     const encode=bytes=>btoa(String.fromCharCode(...new Uint8Array(bytes))).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
     const data={endpoint:'https://web.push.apple.com/browser-test',keys:{p256dh:encode(await crypto.subtle.exportKey('raw',pair.publicKey)),auth:encode(crypto.getRandomValues(new Uint8Array(16)))}};
     window.testPushSub=null;window.testPermission='default';window.testPermissionRequests=0;
     Object.defineProperty(Notification,'permission',{get:()=>window.testPermission,configurable:true});
     Notification.requestPermission=async()=>{window.testPermissionRequests++;window.testPermission='granted';return 'granted';};
     PushManager.prototype.getSubscription=async()=>window.testPushSub;
     PushManager.prototype.subscribe=async options=>{if(!options.userVisibleOnly||options.applicationServerKey.length!==65)throw Error('Invalid push options');window.testPushSub={endpoint:data.endpoint,toJSON:()=>data,unsubscribe:async()=>{window.testPushSub=null;return true;}};return window.testPushSub;};
    }""")
    page.locator('#settings-open').click();page.wait_for_function("()=>document.querySelector('#push-status').textContent.includes('une seule fois')")
    assert page.locator('#push-reminder-time').input_value()=='18:00'
    page.locator('#push-enable').click();page.wait_for_function("()=>document.querySelector('#push-status').textContent.includes('C’est activé')")
    assert page.evaluate('window.testPermissionRequests')==1
    status=page.evaluate("async()=>await api('/api/push/status',{endpoint:window.testPushSub.endpoint})")
    assert status=={'enabled':True,'time':'18:00'}
    page.locator('#push-reminder-time').fill('18:15');page.locator('#push-enable').click()
    page.wait_for_function("()=>document.querySelector('#push-status').textContent.includes('18 h 15')")
    page.locator('#settings-close').click();page.locator('#settings-open').click()
    page.wait_for_function("()=>document.querySelector('#push-status').textContent.includes('Notifications activées')")
    assert page.locator('#push-reminder-time').input_value()=='18:15'
    page.locator('#push-disable').click();page.wait_for_function("()=>document.querySelector('#push-status').textContent.includes('désactivées')")
    assert page.locator('#push-disable').is_hidden()
    assert page.evaluate("async()=>await api('/api/push/status',{endpoint:'https://web.push.apple.com/browser-test'})")=={'enabled':False,'time':'18:00'}
    # iPhone installation guidance is explicit before permission is requested.
    page.evaluate("()=>{Object.defineProperty(navigator,'userAgent',{value:'iPhone',configurable:true});Object.defineProperty(navigator,'standalone',{value:false,configurable:true});}")
    page.locator('#settings-close').click();page.locator('#settings-open').click()
    assert 'écran d’accueil' in page.locator('#push-status').inner_text()
    assert page.locator('#push-enable').is_disabled()
    assert not errors,errors
    browser.close()
print('OK: permission gesture, real subscription persistence, Friday 18:00 default, time changes, opt-out and iPhone installation guidance. No real pushes sent.')
