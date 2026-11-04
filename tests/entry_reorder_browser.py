import os
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
    page=browser.new_page(viewport={'width':390,'height':844},has_touch=True,is_mobile=True)
    errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto(os.environ['ASC_TEST_URL']);page.locator('#cloud-setup').wait_for(state='visible')
    page.locator('#setup-token').fill(os.environ['ASC_TEST_SETUP']);page.locator('#new-code').fill('drag-test');page.locator('#confirm-code').fill('drag-test');page.get_by_role('button',name='Créer mon espace').click()
    page.locator('#access-code').fill('drag-test');page.get_by_role('button',name='Ouvrir mes semaines').click();page.locator('#application').wait_for(state='visible')
    page.evaluate("""()=>{week='2030-01-07';selected=0;expandedDay=0;store.weeks[week]=Array.from({length:7},()=>[]);store.weeks[week][0]=[{client:'Chantier',city:'',workplace:'client',travel:0,tpe:450,regie:0,chantier:0,sav:0},{client:'Atelier ASC',city:'',workplace:'atelier',travel:0,tpe:10,regie:0,chantier:0,sav:0}];save();render();}""")
    page.wait_for_function('()=>!dirty&&!busy')
    # Mouse: hold and move the second line above the first.
    grip=page.locator('.entry-grip').nth(1);grip.scroll_into_view_if_needed();box=grip.bounding_box()
    page.mouse.move(box['x']+15,box['y']+15);page.mouse.down();page.wait_for_timeout(400)
    assert page.locator('.entry-drag-ghost').count()==1
    first=page.locator('#entries>.entry').first.bounding_box();page.mouse.move(first['x']+30,first['y']+4,steps=8);page.mouse.up()
    assert page.evaluate("days()[selected].map(x=>x.client)")==['Atelier ASC','Chantier']
    assert page.evaluate('daySum(days()[selected])')==460
    page.wait_for_function('()=>!dirty&&!busy')
    assert page.evaluate("async()=> (await api('/api/state')).store.weeks['2030-01-07'][0][0].client")=='Atelier ASC'
    # Keyboard offers the same operation.
    page.locator('.entry-grip').first.focus();page.keyboard.press('ArrowDown')
    assert page.evaluate("days()[selected][0].client")=='Chantier'
    # Touch: normal scrolling movement cancels a pending hold.
    page.evaluate("""()=>{const row=document.querySelectorAll('#entries>.entry')[1],b=row.getBoundingClientRect();window.dragRow=row;window.touchY=b.top+20;const t=new Touch({identifier:1,target:row,clientX:b.left+70,clientY:touchY});row.dispatchEvent(new TouchEvent('touchstart',{touches:[t],bubbles:true}));const moved=new Touch({identifier:1,target:row,clientX:b.left+70,clientY:touchY+30});row.dispatchEvent(new TouchEvent('touchmove',{touches:[moved],bubbles:true,cancelable:true}));}""")
    page.wait_for_timeout(400);assert page.locator('.entry-drag-ghost').count()==0
    # Touch hold and drop saves a new order.
    page.evaluate("""()=>{const b=dragRow.getBoundingClientRect(),t=new Touch({identifier:2,target:dragRow,clientX:b.left+70,clientY:b.top+20});dragRow.dispatchEvent(new TouchEvent('touchstart',{touches:[t],bubbles:true}));}""")
    page.wait_for_timeout(400);assert page.locator('.entry-drag-ghost').count()==1
    page.evaluate("""()=>{const b=document.querySelector('#entries>.entry').getBoundingClientRect(),t=new Touch({identifier:2,target:dragRow,clientX:b.left+70,clientY:b.top+2});dragRow.dispatchEvent(new TouchEvent('touchmove',{touches:[t],bubbles:true,cancelable:true}));dragRow.dispatchEvent(new TouchEvent('touchend',{touches:[],bubbles:true}));}""")
    assert page.evaluate("days()[selected][0].client")=='Atelier ASC'
    assert page.locator('.entry-drag-ghost').count()==0
    page.wait_for_function('()=>!dirty&&!busy');page.reload();page.locator('#application').wait_for(state='visible')
    assert page.evaluate("store.weeks['2030-01-07'][0][0].client")=='Atelier ASC'
    assert not errors,errors
    browser.close()
print('OK: mouse hold, touch hold, scrolling cancellation, keyboard, durations and authenticated persistence.')
