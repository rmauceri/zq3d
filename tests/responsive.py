"""Bounded small-screen layout checks in installed Edge; loopback only."""
import functools
import sys
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
ARTIFACTS = Path(sys.argv[1]) if len(sys.argv) > 1 else None

def press_chevron_without_shift(page):
    toggle = page.locator("#controls-toggle")
    before = toggle.bounding_box()
    center = before["x"] + before["width"] / 2
    page.mouse.move(center, before["y"] + before["height"] / 2)
    page.mouse.down()
    page.wait_for_timeout(180)
    pressed = toggle.bounding_box()
    assert abs(pressed["x"] - before["x"]) <= 0.5, "Chevron shifts horizontally while pressed"
    assert abs(pressed["y"] - before["y"]) <= 0.5, "Chevron shifts vertically while pressed"
    page.mouse.up()
    page.wait_for_timeout(180)
    after = toggle.bounding_box()
    assert abs(after["x"] + after["width"] / 2 - center) <= 0.5, "Chevron loses horizontal center after toggle"

def check_home_reader(page):
    page.evaluate("""() => {
        const tray=document.getElementById('tray'), box=tray.getBoundingClientRect();
        const body=document.getElementById('tray-content');
        const header=document.querySelector('.site-header').getBoundingClientRect();
        const footer=document.querySelector('.welcome-footer').getBoundingClientRect();
        if(tray.hidden || box.left<0 || box.right>innerWidth ||
           box.top<header.bottom || box.bottom>footer.top)
            throw Error('Home reader covers a persistent rail or leaves the viewport');
        if(body.clientHeight<44 || body.scrollWidth>body.clientWidth+1)
            throw Error('Home reader has no usable scrolling area or overflows horizontally');
        for(const node of tray.querySelectorAll('button,summary,select,input')) {
            if(!node.getClientRects().length || node.closest('details:not([open])') && node.tagName!=='SUMMARY') continue;
            const r=node.getBoundingClientRect();
            const desktopCheckbox=innerWidth>1100 && node.matches('input[type="checkbox"]');
            if(!desktopCheckbox && (r.width<44 || r.height<44))
                throw Error('Small home reader touch target: '+(node.id || node.textContent));
        }
        const scroll=body.scrollTop;
        body.scrollTop=body.scrollHeight;
        if(body.scrollHeight>body.clientHeight && body.scrollTop===0)
            throw Error('Cannot reach the end of the home reader');
        body.scrollTop=scroll;
        if(ZQApp.game!==null) throw Error('Reading started an aquarium');
    }""")

def check_discovery_tiles(page):
    page.evaluate("""() => {
        const rootSize=parseFloat(getComputedStyle(document.documentElement).fontSize);
        for(const card of document.querySelectorAll('.discovery-collection .achievement')) {
            if(!card.getClientRects().length || card.closest('details:not([open])')) continue;
            const box=card.getBoundingClientRect(), title=card.querySelector('h3'), description=card.querySelector('p');
            if(!card.querySelector('.achievement-top').contains(title) || card.querySelector('small'))
                throw Error('Discovery metadata is spread over redundant rows');
            if(card.scrollWidth>card.clientWidth+1 || card.scrollHeight>card.clientHeight+1)
                throw Error('A compact discovery tile clips its contents');
            if(parseFloat(getComputedStyle(title).fontSize)<rootSize*0.81 ||
               parseFloat(getComputedStyle(description).fontSize)<rootSize*0.81)
                throw Error('Discovery tiles were tightened by shrinking their text');
            if(rootSize<=16.01 && box.width>=260 && box.height>100)
                throw Error('A compact discovery row still takes excessive vertical space');
        }
    }""")


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass


server = ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(QuietHandler, directory=str(ROOT)))
threading.Thread(target=server.serve_forever, daemon=True).start()
try:
    if ARTIFACTS:
        ARTIFACTS.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(channel="msedge", headless=True)
        try:
            page = browser.new_page()
            errors = []
            page.on("pageerror", lambda error: errors.append(str(error)))
            page.goto(f"http://127.0.0.1:{server.server_port}/index.html")
            page.wait_for_function("typeof ZQApp !== 'undefined' && ZQApp.renderer")
            for width, height in [(320, 480), (360, 640), (412, 915), (600, 960),
                                  (800, 1280), (480, 320), (568, 320), (740, 360), (915, 412),
                                  (960, 600), (1024, 768), (1200, 1600), (1280, 800), (1440, 900), (1920, 1080)]:
                page.set_viewport_size({"width": width, "height": height})
                page.wait_for_timeout(200)
                report = page.evaluate("""async () => {
                    const rect = selector => document.querySelector(selector).getBoundingClientRect();
                    const check = (condition,message) => { if(!condition) throw Error(message); };
                    const overlap = (a,b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
                    document.body.dataset.screen='welcome';
                    document.getElementById('game-ui').hidden=true;
                    document.getElementById('resume-card').hidden=false;
                    document.getElementById('resume-button').hidden=false;
                    document.getElementById('resume-button').textContent='Resume last session';
                    const world=rect('.world'), header=rect('.site-header'), footer=rect('.welcome-footer'), picker=rect('.world-picker');
                    check(!document.querySelector('.theme-number'), 'World choices still have numbers');
                    check(!document.getElementById('preview-badge') && !document.getElementById('renderer-label'), 'Redundant preview badge remains');
                    check(header.height>0 && footer.height>0 && header.top>=0 && footer.bottom<=innerHeight,
                          'A home rail is hidden or outside the viewport');
                    check(world.width>=innerWidth-40 && world.height>=120 &&
                          world.left>=0 && world.right<=innerWidth &&
                          world.top>=header.bottom && world.bottom<=footer.top,
                          'Tank is not between the top and bottom rails: '+world.width+'x'+world.height);
                    check(Math.abs(world.top-header.bottom)<=1 && Math.abs(world.bottom-footer.top)<=1,
                          'Tank does not fill the space between the rails');
                    const tagline=rect('.brand-tagline'), nav=rect('.header-actions');
                    check(tagline.width>0 && tagline.height>0 && tagline.top>=header.top &&
                          tagline.bottom<=header.bottom && tagline.right<=nav.left &&
                          document.querySelector('.brand-tagline').textContent==='A little world. A deeper calm.',
                          'Header tagline is hidden, missing, or overlapping the controls');
                    const brand=document.getElementById('about-button');
                    check(brand.textContent.trim()==='Zenquarium 3D' && brand.scrollWidth<=brand.clientWidth+1,
                          'App name is incorrect or overflows the branding button');
                    check(!overlap(rect('#about-button'),nav), 'Branding overlaps the header controls');
                    for(const selector of ['#about-button','#journal-button','#sound-button','#settings-button']) {
                        const b=rect(selector);
                        check(b.width>=44 && b.height>=44 && b.left>=header.left && b.right<=header.right &&
                              b.top>=header.top && b.bottom<=header.bottom, 'Header command does not fit its rail');
                    }
                    for(const selector of ['.lifetime-stats','#progress-button','#resume-button']) {
                        const b=rect(selector);
                        check(b.width>0 && b.height>0 && b.left>=footer.left && b.right<=footer.right &&
                              b.top>=footer.top && b.bottom<=footer.bottom, 'Bottom rail content is hidden or overflowing: '+selector);
                    }
                    const progress=document.getElementById('progress-button');
                    check(progress.matches('button.lifetime-stats') &&
                          progress.contains(document.getElementById('best-score')) &&
                          progress.contains(document.getElementById('achievement-count')) &&
                          !progress.querySelector('button,a,.icon') && rect('#progress-button').height>=44,
                          'Footer statistics are not one accessible progress target');
                    const stats=[...progress.children].map(node=>node.getBoundingClientRect());
                    const progressStyle=getComputedStyle(progress);
                    const expectedWidth=stats.reduce((sum,stat)=>sum+stat.width,0)+parseFloat(progressStyle.columnGap)
                        +parseFloat(progressStyle.paddingLeft)+parseFloat(progressStyle.paddingRight)
                        +parseFloat(progressStyle.borderLeftWidth)+parseFloat(progressStyle.borderRightWidth);
                    check(Math.abs(rect('#progress-button').width-expectedWidth)<=2,
                          'Progress target stretches beyond the statistics text group');
                    check(!overlap(rect('.lifetime-stats'),rect('#resume-button')), 'Bottom rail commands overlap');
                    check(!document.querySelector('.welcome-footer .original-link'), 'Original-game link remains in the footer');
                    check(!document.getElementById('resume-note'), 'Removed away message remains');
                    check(picker.left>=world.left && picker.right<=world.right &&
                          picker.top>world.top && picker.bottom<=world.bottom && world.bottom-picker.bottom<=24,
                          'Theme tiles are not floating near the bottom of the tank');
                    const start=rect('#begin-button'), themes=rect('#theme-options'), resume=rect('#resume-card');
                    const beside=start.left>=themes.right && start.left-themes.right<=16 &&
                                 Math.abs(start.bottom-themes.bottom)<=1;
                    const below=start.top>=themes.bottom && start.top-themes.bottom<=16 &&
                                Math.abs(start.right-themes.right)<=1;
                    check(beside || below, 'Start is disconnected from theme selection');
                    check(start.width<=140 && document.getElementById('begin-label').textContent==='Start',
                          'Start is not a compact, generic action');
                    check(resume.top>=footer.top && resume.bottom<=footer.bottom && !overlap(resume,world),
                          'Resume is not in the bottom rail');
                    const gap=beside ? [(themes.right+start.left)/2, (themes.top+themes.bottom)/2]
                                     : [(themes.left+themes.right)/2, (themes.bottom+start.top)/2];
                    check(document.elementFromPoint(...gap)?.closest('#viewport'),
                          'Empty space between launch controls blocks the water');
                    for(const selector of ['#begin-button','#resume-button']) {
                        const b=rect(selector);
                        check(b.width>=44 && b.height>=44, 'Small start touch target');
                        check(b.left>=0 && b.right<=innerWidth && b.top>=0 && b.bottom<=innerHeight, 'Start button out of view');
                        check(b.top>=header.bottom, 'Start buttons cover the header');
                    }
                    const choices=[...document.querySelectorAll('.theme-option')];
                    const selected=document.querySelector('.theme-option[aria-pressed="true"]');
                    const options=document.getElementById('theme-options');
                    check(document.querySelector('.world-picker').contains(options) &&
                          document.querySelector('.world-picker').contains(document.getElementById('begin-button')) &&
                          !document.querySelector('.world-picker').contains(document.getElementById('resume-button')),
                          'Start and Resume have lost their distinct groups');
                    check(options.scrollWidth<=options.clientWidth+1 && options.scrollHeight<=options.clientHeight+1,
                          'World choices require scrolling');
                    for(const button of choices) {
                        const b=button.getBoundingClientRect();
                        check(b.width>=44 && b.height>=44, 'Small theme touch target');
                        check(b.left>=picker.left-1 && b.right<=picker.right+1 && b.top>=0 && b.bottom<=innerHeight,
                            'Theme is not visible without scrolling: '+button.textContent);
                        check(button.scrollWidth<=button.clientWidth+1, 'Theme text overflows its button');
                        button.click();
                        const theme=ZQ.THEMES[button.dataset.theme], description=button.querySelector('.theme-description');
                        check(document.getElementById('scene-name').textContent===theme.name &&
                              document.getElementById('scene-subtitle').textContent===theme.subtitle &&
                              document.getElementById('scene-description').textContent===theme.description,
                              'Accessible preview announcement does not match selected world');
                        check(document.getElementById('begin-label').textContent==='Start',
                              'Start repeats the selected theme');
                        check(description.textContent===theme.description, 'Theme tile has the wrong description');
                        check((getComputedStyle(description).display!=='none')===(innerWidth>=720 && innerHeight>=640),
                              'Theme descriptions do not adapt to the available space');
                        if(getComputedStyle(description).display!=='none') {
                            check(description.scrollWidth<=description.clientWidth+1 &&
                                  description.getBoundingClientRect().bottom<=b.bottom, 'Theme description overflows its tile');
                        }
                        check(document.querySelectorAll('.theme-option[aria-pressed="true"]').length===1 &&
                              getComputedStyle(button.querySelector('.icon')).visibility==='visible',
                              'Selection has no unique, visible checkmark');
                        check(document.getElementById('resume-button').textContent==='Resume last session',
                              'Changing the preview changed Resume');
                    }
                    selected.click();
                    document.getElementById('resume-card').hidden=true;
                    document.getElementById('resume-button').hidden=true;
                    const withoutSave=rect('#begin-button'), withoutSaveThemes=rect('#theme-options');
                    check((beside ? withoutSave.left-withoutSaveThemes.right : withoutSave.top-withoutSaveThemes.bottom)<=16 &&
                          withoutSave.bottom<=innerHeight, 'New-player Start is separated or out of view');
                    check(rect('.world').top>=rect('.site-header').bottom &&
                          rect('.world').bottom<=rect('.welcome-footer').top &&
                          rect('.welcome-footer').height>0, 'No-save home loses its rails');
                    document.body.dataset.screen='game';
                    document.getElementById('game-ui').hidden=false;
                    check(rect('.world').width===innerWidth && rect('.world').height===innerHeight,
                          'Home overlays changed the full-screen game viewport');
                    const dock=rect('.dock'), hud=rect('.game-hud');
                    check(dock.height<=56 && dock.width<=382 && dock.left>=0 && dock.right<=innerWidth, 'Dock footprint too large');
                    for(const button of document.querySelectorAll('.dock > button')) {
                        const b=button.getBoundingClientRect();
                        check(b.width>=44 && b.height>=44, 'Small aquarium touch target');
                        check(button.scrollWidth<=button.clientWidth, 'Dock label overflows');
                    }
                    const menu=rect('#menu-button'), toggle=rect('#controls-toggle');
                    check(menu.width>=44 && menu.height>=44 && menu.right<=innerWidth &&
                          menu.left>innerWidth/2 && menu.top<60, 'Menu is not touch friendly in upper right');
                    check(toggle.width>=44 && toggle.height>=44 && toggle.top>=0, 'Small command chevron touch target');
                    check(hud.height<=(innerWidth<=1100?48:90) && rect('#score-button').height>=44, 'HUD footprint or touch target');
                    const rest=parseFloat(getComputedStyle(document.getElementById('encounter-hint')).bottom);
                    check(innerHeight-rest<=dock.top-8, 'Tray and hints overlap dock');
                    document.body.dataset.screen='welcome';
                    document.getElementById('game-ui').hidden=true;
                    document.getElementById('resume-card').hidden=false;
                    document.getElementById('resume-button').hidden=false;
                    return {preview:[Math.round(world.width),Math.round(world.height)],dock:[Math.round(dock.width),Math.round(dock.height)]};
                }""")
                print(f"PASS {width}x{height}: {report}", flush=True)
                if ARTIFACTS and (width, height) in [(320, 480), (412, 915), (480, 320), (1440, 900)]:
                    page.screenshot(path=str(ARTIFACTS / f"welcome-{width}x{height}.png"))
                page.locator("#progress-button").click()
                page.evaluate("""() => {
                    const panel=document.getElementById('tray').getBoundingClientRect();
                    const header=document.querySelector('.site-header').getBoundingClientRect();
                    const footer=document.querySelector('.welcome-footer').getBoundingClientRect();
                    if(document.getElementById('tray').dataset.kind!=='progress' ||
                       panel.top<header.bottom || panel.bottom>footer.top)
                        throw Error('Progress details hide a persistent home rail');
                }""")
                page.keyboard.press("Escape")
                page.locator("#about-button").click()
                page.evaluate("""() => {
                    const panel=document.getElementById('panel'), bounds=panel.getBoundingClientRect();
                    if(!panel.open || document.getElementById('panel-title').textContent!=='Zenquarium 3D' ||
                       document.getElementById('app-version').textContent!==ZQApp.version)
                        throw Error('About is missing the app name or version');
                    if(bounds.left<0 || bounds.top<0 || bounds.right>innerWidth || bounds.bottom>innerHeight)
                        throw Error('About does not fit the viewport');
                    if(document.activeElement!==document.getElementById('about-tagline') ||
                       document.getElementById('panel-content').scrollTop!==0)
                        throw Error('About skipped past its introduction');
                    const heading=panel.querySelector('.panel-heading');
                    const logo=heading.querySelector('#panel-logo .icon');
                    if(!logo || logo.querySelector('use').getAttribute('href')!=='#i-enso' ||
                       logo.getBoundingClientRect().width<44 || document.getElementById('about-close'))
                        throw Error('About lost its Enso logo or still has a Done button');
                    const title=document.getElementById('panel-title').getBoundingClientRect();
                    const version=document.getElementById('panel-version').getBoundingClientRect();
                    if(logo.getBoundingClientRect().right>title.left || version.top<title.bottom ||
                       version.bottom>heading.getBoundingClientRect().bottom)
                        throw Error('About logo or version is not positioned beside/below the title');
                    const tagline=document.getElementById('about-tagline');
                    const homeTagline=document.querySelector('.site-header .brand-tagline');
                    if(tagline.textContent!==homeTagline.textContent ||
                       getComputedStyle(tagline).color!==getComputedStyle(homeTagline).color ||
                       getComputedStyle(tagline.querySelector('span')).color!==getComputedStyle(homeTagline.querySelector('span')).color ||
                       tagline.getBoundingClientRect().bottom>document.getElementById('about-description').getBoundingClientRect().top)
                        throw Error('About tagline is missing, misplaced, or does not match the theme colors');
                    if(/GitHub Pages|IP addresses/.test(document.getElementById('panel-content').textContent))
                        throw Error('About assumes an online hosting provider');
                    if(panel.querySelector('.original-link').href!=='https://rmauceri.github.io/zenquarium')
                        throw Error('About lost the original-game link');
                    if(ZQApp.game!==null) throw Error('Opening About started an aquarium');
                }""")
                page.keyboard.press("Escape")
                assert page.locator("#about-button").evaluate("button => button===document.activeElement"), "Closing About lost branding focus"
                page.locator("#sound-button").click()
                page.evaluate("""() => {
                    const tray=document.getElementById('tray'), box=tray.getBoundingClientRect();
                    const trigger=document.getElementById('sound-button').getBoundingClientRect();
                    if(tray.dataset.anchor!=='sound' || box.top<trigger.bottom ||
                       box.top-trigger.bottom>12 || box.left<0 || box.right>innerWidth || box.bottom>innerHeight)
                        throw Error('Home sound flyout does not fit below its rail trigger');
                    for(const node of tray.querySelectorAll('button,input')) {
                        const r=node.getBoundingClientRect();
                        if(r.width<44 || r.height<44) throw Error('Small shared sound touch target');
                    }
                    if(document.getElementById('sound-button').getAttribute('aria-expanded')!=='true')
                        throw Error('Open sound flyout is not announced');
                }""")
                page.locator("#dock-volume").fill("37")
                volume_before = page.evaluate("ZQApp.settings.volume")
                page.locator("#volume-mute").click()
                page.locator("#volume-mute").click()
                assert page.evaluate("ZQApp.settings.volume") == volume_before
                page.keyboard.press("Escape")
                assert page.locator("#sound-button").evaluate("button => button===document.activeElement")
            for width, height, text_size in [(320, 480, "100%"), (480, 320, "100%"),
                                              (412, 915, "200%"), (915, 412, "200%"),
                                              (1024, 768, "200%"), (1440, 900, "100%")]:
                page.set_viewport_size({"width": width, "height": height})
                page.evaluate("(size) => document.documentElement.style.fontSize=size", text_size)
                page.wait_for_timeout(200)
                reader_save = page.evaluate("localStorage.getItem(ZQ.STORAGE_KEY)")
                for trigger in ["#journal-button", "#settings-button", "#progress-button"]:
                    page.locator(trigger).click()
                    check_home_reader(page)
                    if trigger == "#journal-button":
                        assert page.locator("#tray [data-tab='guide']").inner_text() == "How to play"
                        assert page.locator("#tray details[open]").count() == 0
                        page.locator("#guide-care > summary").focus()
                        page.keyboard.press("Enter")
                        assert page.locator("#guide-care").evaluate("node => node.open")
                        assert page.locator(".guide-intro p").first.evaluate("node => parseFloat(getComputedStyle(node).fontSize)") >= (26 if text_size == "200%" else 13)
                    page.evaluate("document.querySelectorAll('#tray details').forEach(node => node.open=true)")
                    check_home_reader(page)
                    if trigger == "#journal-button":
                        page.locator("#tray [data-tab='achievements']").click()
                        page.locator("#remaining-discovery-count").click()
                        check_home_reader(page)
                        check_discovery_tiles(page)
                    if trigger == "#progress-button":
                        assert page.locator("#progress-welcome").is_visible()
                        assert not page.locator("#progress-records").is_visible()
                        assert page.locator("#next-discovery-name").inner_text() == "First Fish"
                        check_home_reader(page)
                        check_discovery_tiles(page)
                    assert page.evaluate("localStorage.getItem(ZQ.STORAGE_KEY)") == reader_save, "Home reading changed the save"
                    page.keyboard.press("Escape")
                    assert page.locator(trigger).evaluate("node => node===document.activeElement"), "Home reader lost its trigger focus"
                print(f"PASS Home readers reflow between rails at {width}x{height}, text {text_size}", flush=True)
            page.evaluate("document.documentElement.style.fontSize=''")
            page.locator("#journal-button").click()
            page.locator("#guide-defenses > summary").click()
            for width, height in [(412, 915), (915, 412)]:
                page.set_viewport_size({"width": width, "height": height})
                page.wait_for_timeout(200)
                check_home_reader(page)
                assert page.locator("#guide-defenses").evaluate("node => node.open"), "Rotation collapsed the guide"
                page.evaluate("""() => {
                    const world=document.getElementById('viewport').getBoundingClientRect();
                    if(Math.abs(ZQApp.renderer.width-world.width)>2 || Math.abs(ZQApp.renderer.height-world.height)>2)
                        throw Error('The live preview did not resize after rotation');
                }""")
            page.keyboard.press("Escape")
            page.set_viewport_size({"width": 1920, "height": 1080})
            page.wait_for_timeout(200)
            page.emulate_media(reduced_motion="no-preference")
            page.mouse.move(0, 0)
            tile = page.locator(".theme-option").first
            before = tile.bounding_box()
            selected_theme = page.locator(".theme-option[aria-pressed='true']").get_attribute("data-theme")
            page.mouse.move(before["x"] + before["width"] / 2, before["y"] + before["height"] - 1)
            page.wait_for_timeout(220)
            raised = tile.bounding_box()
            assert 3.5 <= before["y"] - raised["y"] <= 4.5, "Theme hover has no gentle lift or loses its original hit area"
            assert page.locator(".theme-option[aria-pressed='true']").get_attribute("data-theme") == selected_theme, "Hover changed the selected theme"
            page.evaluate("document.body.classList.add('reduced-motion')")
            assert abs(tile.bounding_box()["y"] - before["y"]) <= 0.5, "In-game reduced motion does not disable hover lift"
            page.evaluate("document.body.classList.remove('reduced-motion')")
            page.emulate_media(reduced_motion="reduce")
            page.wait_for_timeout(50)
            assert abs(tile.bounding_box()["y"] - before["y"]) <= 0.5, "System reduced motion does not disable hover lift"
            page.mouse.move(0, 0)
            page.emulate_media(reduced_motion="no-preference")
            print("PASS Theme hover lifts without selecting; both reduced-motion settings suppress the lift", flush=True)
            # Rotation must update the live renderer's actual preview dimensions.
            page.set_viewport_size({"width": 915, "height": 412})
            page.wait_for_timeout(250)
            page.evaluate("""() => {
                const world=document.getElementById('viewport').getBoundingClientRect();
                if(Math.abs(ZQApp.renderer.width-world.width)>2 ||
                   Math.abs(ZQApp.renderer.height-world.height)>2) throw Error('Renderer did not resize after rotation');
            }""")
            page.locator("#begin-button").click()
            page.locator("#menu-button").click()
            page.keyboard.press("Escape")
            page.locator("#feed-button").click()
            page.evaluate("""() => {
                if(document.getElementById('feed-button').getAttribute('aria-pressed')!=='true')
                    throw Error('Compact Feed no longer arms placement');
            }""")
            page.keyboard.press("Escape")
            page.locator("#pause-button").click()
            page.locator("#pause-home-button").click()
            page.evaluate("""() => {
                const resume=document.getElementById('resume-button');
                if(document.getElementById('resume-card').hidden || resume.hidden ||
                   resume.textContent!=='Resume last session' ||
                   (resume.getAttribute('aria-label') || resume.textContent)!=='Resume last session')
                    throw Error('Saved aquarium lost its Resume last session action');
            }""")
            kept_round = page.evaluate("JSON.stringify(JSON.parse(localStorage.getItem(ZQ.STORAGE_KEY)).session)")
            page.reload()
            page.wait_for_function("typeof ZQApp!=='undefined' && !document.getElementById('begin-button').disabled")
            assert page.locator("#resume-button").is_visible()
            assert page.evaluate("JSON.stringify(JSON.parse(localStorage.getItem(ZQ.STORAGE_KEY)).session)") == kept_round
            page.locator("#resume-button").click()
            kept_profile = page.evaluate("""() => {
                window.dispatchEvent(new Event('pagehide'));
                const checkpoint=JSON.parse(localStorage.getItem(ZQ.STORAGE_KEY)).session;
                if(!checkpoint || !checkpoint.paused || checkpoint.themeId!==ZQApp.game.theme.id)
                    throw Error('Backgrounding did not checkpoint the paused aquarium');
                return JSON.stringify(ZQApp.profile);
            }""")
            page.reload()
            page.wait_for_function("typeof ZQApp!=='undefined' && !document.getElementById('begin-button').disabled")
            assert page.locator("#resume-button").is_visible()
            assert page.evaluate("ZQApp.game===null")
            assert page.evaluate("JSON.stringify(ZQApp.profile)") == kept_profile
            page.locator("#begin-button").click()
            page.locator("#pause-button").click()
            page.locator("#pause-home-button").click()
            print("PASS Explicit and background checkpoints survive reload without advancing away time", flush=True)
            page.locator("[data-theme='deep']").click()
            page.locator("#begin-button").click()
            page.evaluate("""() => {
                if(document.getElementById('panel').open || ZQApp.game.theme.id!=='deep')
                    throw Error('Entering selected world adds confirmation instead of starting directly');
            }""")
            page.set_viewport_size({"width": 412, "height": 915})
            page.wait_for_timeout(250)
            page.evaluate("""() => {
                if(document.body.dataset.screen!=='game') throw Error('Rotation exited aquarium');
                const dock=document.querySelector('.dock').getBoundingClientRect();
                if(dock.height>56) throw Error('Rotated dock is too tall');
            }""")
            print("PASS Compact menu/feed/resume controls remain functional after rotation", flush=True)
            page.evaluate("""() => {
                window.checkCompactPanel = selector => {
                    const panel=document.querySelector(selector), box=panel.getBoundingClientRect();
                    const body=panel.querySelector('.panel-content'), header=panel.querySelector('.panel-heading,.tray-heading');
                    const check=(ok,message)=>{if(!ok)throw Error(selector+': '+message);};
                    check(box.left>=0 && box.right<=innerWidth && box.top>=0 && box.bottom<=innerHeight,'outside viewport');
                    check(box.width<= (selector!=='#tray' && innerWidth>innerHeight ? 522 : 422),'too wide');
                    if(header) check(header.getBoundingClientRect().height<=(innerWidth<=1100?64:100),'oversized heading');
                    if(selector==='#tray' && panel.dataset.kind!=='volume') {
                        const health=panel.dataset.anchor==='health';
                        const anchor=document.querySelector(health?'.game-hud':'#menu-button').getBoundingClientRect();
                        const notice=document.getElementById('toast');
                        const controls=['.game-hud','#menu-button','#exit-immersion']
                            .map(s=>document.querySelector(s)).filter(n=>n.getClientRects().length);
                        const rowBottom=Math.max(anchor.bottom,notice.hidden?0:notice.getBoundingClientRect().bottom,
                            ...controls.map(n=>n.getBoundingClientRect().bottom));
                        check(Math.abs(health?box.left-anchor.left:box.right-anchor.right)<=1 &&
                              box.top>=rowBottom && box.top-rowBottom<=12,
                              'Panel is not anchored below its originating widget');
                    }
                    check(body.clientHeight>=50,'no usable scrolling body');
                    check(body.scrollWidth<=body.clientWidth+1,'horizontal overflow');
                    const buttons=[...panel.querySelectorAll('button,select,input,summary')].filter(b=>!b.hidden && b.getClientRects().length);
                    for(const button of buttons) {
                        const r=button.getBoundingClientRect();
                        const nativeDesktopCheckbox=innerWidth>1100 && button.matches('input[type="checkbox"]');
                        check(nativeDesktopCheckbox || r.height>=44 && r.width>=44,'small touch target '+(button.id||button.textContent));
                    }
                    body.scrollTop=body.scrollHeight;
                    if(body.scrollHeight>body.clientHeight) check(body.scrollTop>0,'cannot scroll to last content');
                    body.scrollTop=0;
                };
                window.checkTopToast = () => {
                    const toast=document.getElementById('toast'), box=toast.getBoundingClientRect();
                    const tank=document.getElementById('viewport').getBoundingClientRect();
                    let left=tank.left+12,right=tank.right-12;
                    const controls=['.game-hud','#menu-button','#exit-immersion']
                        .map(s=>document.querySelector(s)).filter(n=>n.getClientRects().length)
                        .map(n=>n.getBoundingClientRect());
                    const health=document.querySelector('.game-hud');
                    if(health.getClientRects().length) left=Math.max(left,health.getBoundingClientRect().right+8);
                    for(const selector of ['#menu-button','#exit-immersion']) {
                        const node=document.querySelector(selector);
                        if(node.getClientRects().length) right=Math.min(right,node.getBoundingClientRect().left-8);
                    }
                    const shared=right-left>=90 && !matchMedia('(max-width: 600px) and (orientation: portrait)').matches;
                    const center=shared?(left+right)/2:(tank.left+tank.right)/2;
                    if(toast.hidden || Math.abs((box.left+box.right)/2-center)>1 ||
                       box.top<tank.top || box.top>tank.top+150 || box.left<tank.left || box.right>tank.right)
                        throw Error('Notification is not centered in the available top space');
                    for(const control of controls) {
                        if(Math.abs((control.top+control.bottom)/2-(controls[0].top+controls[0].bottom)/2)>1)
                            throw Error('Top controls are not middle aligned');
                        if(shared && Math.abs((control.top+control.bottom)/2-(box.top+box.bottom)/2)>1)
                            throw Error('Top controls and notification are not middle aligned');
                        if(!shared && box.top<control.bottom+7)
                            throw Error('Narrow-layout notification covers a top control');
                    }
                    if(shared && (box.left<left-1 || box.right>right+1)) throw Error('Notification overlaps a top control');
                    const warning=document.getElementById('save-warning');
                    if(!warning.hidden && box.top<warning.getBoundingClientRect().bottom+7)
                        throw Error('Notification covers a saving warning');
                };
            }""")
            for width, height in [(320, 480), (412, 915), (600, 960), (568, 320), (915, 412), (800, 1280), (1024, 768), (1440, 900)]:
                page.set_viewport_size({"width": width, "height": height})
                page.wait_for_timeout(200)
                page.evaluate("""() => {
                    const s=ZQApp.game.state;
                    s.creature=null;s.attacks=[];s.spawnTimer=90;s.score=500;s.reproduction.fill(180);
                    s.fish.forEach(f=>{f.hunger=100;f.health=100;});
                }""")
                page.locator("#menu-button").click()
                assert page.locator("#tray [data-menu-action]").count() == 5
                page.evaluate("""() => {
                    checkCompactPanel('#tray');
                    const menu=document.getElementById('tray').getBoundingClientRect();
                    const button=document.getElementById('menu-button').getBoundingClientRect();
                    if(menu.top<button.bottom || Math.abs(menu.right-button.right)>2)
                        throw Error('Menu does not open below its upper-right button');
                }""")
                page.locator("#menu-button").click()
                page.locator("#score-button").click()
                page.evaluate("""() => {
                    checkCompactPanel('#tray');
                    if(document.querySelector('#tray details').open) throw Error('Scoring reference is not collapsed');
                }""")
                for action in ["residents", "prizes", "activity"]:
                    page.locator(f"[data-menu-action='{action}']").click()
                    page.evaluate("checkCompactPanel('#tray')")
                    page.keyboard.press("Escape")
                    page.locator("#score-button").click()
                page.locator("#menu-button").click()
                page.evaluate("checkCompactPanel('#tray')")
                page.locator("[data-menu-action='camera']").click()
                page.evaluate("""() => {
                    checkCompactPanel('#tray');
                    if(document.getElementById('tray').dataset.anchor!=='menu')
                        throw Error('Camera from Menu inherited an old health anchor');
                }""")
                page.keyboard.press("Escape")
                page.evaluate("ZQApp.game.emit('birth','A little life joins your aquarium.',{amount:10})")
                page.wait_for_function("!document.getElementById('toast').hidden && document.getElementById('toast').textContent==='A little life joins your aquarium. +10 pts'")
                page.evaluate("checkTopToast()")
                if ARTIFACTS and width in [320, 568, 1024]:
                    page.screenshot(path=str(ARTIFACTS / f"top-notification-{width}x{height}.png"))
                page.locator("#menu-button").click()
                page.locator("[data-menu-action='immerse']").click()
                page.evaluate("checkTopToast()")
                page.locator("#exit-immersion").click()
                page.evaluate("checkTopToast()")
                page.locator("#shop-button").click()
                page.evaluate("""() => {
                    checkCompactPanel('#catalog');
                    const rows=[...document.querySelectorAll('.catalog-fish')];
                    if(rows.length!==4 || rows.some(r=>r.tagName!=='BUTTON' || r.getBoundingClientRect().height>52))
                        throw Error('Catalog is not four compact purchase buttons');
                    if(document.querySelector('#catalog .panel-heading, #catalog p, #catalog h3') ||
                       document.querySelectorAll('#catalog button').length!==4)
                        throw Error('Catalog has redundant content');
                    const body=document.getElementById('catalog-content');
                    if(body.scrollHeight>body.clientHeight+1)
                        throw Error('Four fish buttons do not fit without scrolling');
                    const preview=document.querySelector('.catalog-fish .species-preview').getBoundingClientRect();
                    if(preview.width>42 || preview.height>30) throw Error('Oversized fish preview');
                }""")
                page.locator("[data-buy='0']").click()
                page.evaluate("""() => {
                    if(document.getElementById('catalog').open!==true) throw Error('Purchase closes live catalog');
                }""")
                press_chevron_without_shift(page)
                page.evaluate("""() => {
                    const bar=document.getElementById('command-bar');
                    if(!bar.hidden || document.getElementById('catalog').open)
                        throw Error('Chevron did not hide the bar and catalog in one tap');
                    const toggle=document.getElementById('controls-toggle').getBoundingClientRect();
                    if(toggle.height<44 || toggle.width>50 || toggle.bottom>innerHeight)
                        throw Error('Hidden bar does not leave a small usable chevron');
                }""")
                page.locator("#menu-button").click()
                page.evaluate("checkCompactPanel('#tray')")
                page.keyboard.press("Escape")
                press_chevron_without_shift(page)
                page.locator("#volume-button").click()
                page.evaluate("checkCompactPanel('#tray')")
                page.locator("#dock-volume").fill("37")
                page.evaluate("""() => {
                    if(ZQApp.settings.volume!==0.37) throw Error('Direct volume did not change stored volume');
                }""")
                page.keyboard.press("Escape")
                page.locator("#zen-button").click()
                page.evaluate("""() => {
                    if(!ZQApp.game.state.auto || document.getElementById('zen-button').getAttribute('aria-pressed')!=='true')
                        throw Error('Zen button did not enable care');
                }""")
                page.locator("#zen-button").click()
                for action in ["residents", "score", "prizes", "settings", "journal", "activity", "progress"]:
                    if action in ["residents", "score", "prizes", "activity", "progress"]:
                        page.locator("#score-button").click()
                        if action != "score":
                            page.locator(f"[data-menu-action='{action}']").click()
                    else:
                        page.locator("#menu-button").click()
                        page.locator(f"[data-menu-action='{action}']").click()
                    page.evaluate("checkCompactPanel('#tray')")
                    if action == "settings":
                        assert page.locator("#tray-title").inner_text() == "Settings"
                        assert not page.locator("#settings-display").evaluate("section => section.open")
                        assert not page.locator("#setting-motion").evaluate("control => !!control.closest('details')")
                        assert page.locator("#export-button, #import-button, #import-file").count() == 0
                        assert page.locator("#setting-sound, #setting-volume, #end-session-button, #save-home-button").count() == 0
                        page.locator("#settings-display > summary").click()
                        page.evaluate("checkCompactPanel('#tray')")
                        page.locator("#settings-install > summary").click()
                        page.evaluate("checkCompactPanel('#tray')")
                    if action == "journal":
                        page.locator("[data-tab='achievements']").click()
                        page.evaluate("document.getElementById('remaining-discoveries').open=true")
                        page.evaluate("checkCompactPanel('#tray')")
                        check_discovery_tiles(page)
                    if action == "progress":
                        assert page.locator("#tray").get_attribute("data-anchor") == "health"
                        assert page.locator("#progress-records").is_visible()
                        assert not page.locator("#progress-welcome").is_visible()
                        page.evaluate("document.querySelectorAll('#tray details').forEach(node => node.open=true)")
                        page.evaluate("checkCompactPanel('#tray')")
                        check_discovery_tiles(page)
                    page.keyboard.press("Escape")
                page.locator("#pause-button").click()
                page.evaluate("""() => {
                    const pause=document.getElementById('pause-card').getBoundingClientRect();
                    if(pause.width>(innerWidth<=1100?322:382) || pause.top<0 || pause.bottom>innerHeight)
                        throw Error('Pause card does not fit small screen');
                    if(document.getElementById('unpause-button').getBoundingClientRect().height<44)
                        throw Error('Pause resume is too small');
                }""")
                page.locator("#unpause-button").click()
                page.evaluate("ZQApp.game.state.damage=80; ZQApp.game.state.dirt=0; ZQApp.game.state.tankHealth=20")
                page.wait_for_timeout(350)
                page.locator("#shop-button").click()
                page.evaluate("""() => {
                    checkCompactPanel('#catalog');
                    const care=document.getElementById('care-alert'), catalog=document.getElementById('catalog');
                    if(care.hidden || catalog.getBoundingClientRect().bottom>care.getBoundingClientRect().top-8)
                        throw Error('Catalog covers critical water care');
                }""")
                page.keyboard.press("Escape")
                page.evaluate("ZQApp.game.emit('birth','A baby joins your aquarium.',{amount:10})")
                page.wait_for_function("!document.getElementById('toast').hidden && document.getElementById('toast').textContent==='A baby joins your aquarium. +10 pts'")
                page.evaluate("checkTopToast()")
                page.evaluate("ZQApp.game.state.damage=0; ZQApp.game.state.tankHealth=100")
                page.wait_for_timeout(250)
                page.evaluate("""() => {
                    window.originalStorageWrite=Storage.prototype.setItem;
                    Storage.prototype.setItem=function() {throw new DOMException('Storage full','QuotaExceededError');};
                }""")
                page.locator("#pause-button").click()
                page.evaluate("""() => {
                    checkTopToast();
                    const warning=document.getElementById('save-warning').getBoundingClientRect();
                    const menu=document.getElementById('menu-button').getBoundingClientRect();
                    if(menu.top<warning.bottom+7) throw Error('Saving warning blocks access to Menu');
                    Storage.prototype.setItem=window.originalStorageWrite;
                }""")
                page.locator("#menu-button").click()
                page.locator("[data-menu-action='settings']").click()
                page.evaluate("checkCompactPanel('#tray')")
                page.keyboard.press("Escape")
                page.locator("#pause-button").click()
                page.locator("#pause-button").click()
                assert page.locator("#save-warning").is_hidden()
                page.locator("#unpause-button").click()
                print(f"PASS Compact catalog, dashboard, camera, settings, guide and discoveries at {width}x{height}", flush=True)
            page.locator("#score-button").click()
            for width, height in [(568, 320), (412, 915), (1440, 900)]:
                page.set_viewport_size({"width": width, "height": height})
                page.wait_for_timeout(250)
                page.evaluate("checkCompactPanel('#tray')")
            page.keyboard.press("Escape")
            for score, title, size in [(1000,"Bronze",(320,480)),(2500,"Silver",(1440,900)),
                                       (5000,"Gold",(568,320)),(10000,"Platinum",(412,915))]:
                page.set_viewport_size({"width":size[0],"height":size[1]})
                page.evaluate("""score => {
                    const s=ZQApp.game.state;
                    s.creature=null;s.attacks=[];s.spawnTimer=90;s.reproduction.fill(180);
                    s.score=score;s.damage=0;s.dirt=0;s.tankHealth=100;
                    s.fish.forEach(f=>{f.hunger=100;f.health=100;});
                }""",score)
                elapsed=page.evaluate("ZQApp.game.state.elapsed")
                page.wait_for_function("""title => {
                    const t=document.getElementById('toast');
                    return !t.hidden && t.dataset.kind==='milestone' && t.textContent.includes(title);
                }""",arg=title)
                page.evaluate("checkTopToast()")
                if ARTIFACTS:
                    page.screenshot(path=str(ARTIFACTS / f"milestone-{title.lower()}-{size[0]}x{size[1]}.png"))
                page.wait_for_function("document.getElementById('toast').classList.contains('fading')",timeout=5500)
                page.wait_for_function("""() => {
                    const opacity=Number(getComputedStyle(document.getElementById('toast')).opacity);
                    return opacity>0 && opacity<0.8;
                }""",timeout=1000)
                page.wait_for_function("""() => {
                    const t=document.getElementById('toast');
                    return t.hidden || t.dataset.kind!=='milestone';
                }""",timeout=1500)
                assert page.evaluate("!ZQApp.game.state.paused && !ZQApp.game.state.ended && !ZQApp.game.state.milestone")
                assert page.evaluate("ZQApp.game.state.elapsed")>elapsed+4
            print("PASS Bronze, Silver, Gold and Platinum fade in the shared top row while ignored milestones keep progressing",flush=True)
            page.set_viewport_size({"width": 1024, "height": 768})
            page.wait_for_timeout(250)
            page.evaluate("ZQApp.game.state.fish=[]; ZQApp.game.state.timers.empty=ZQ.CONFIG.emptyGrace")
            page.wait_for_function("document.getElementById('panel').open")
            for width, height in [(412, 915), (568, 320)]:
                page.set_viewport_size({"width": width, "height": height})
                page.wait_for_timeout(200)
                page.evaluate("checkCompactPanel('#panel')")
            print("PASS Session summary remains compact and scrollable in portrait and landscape", flush=True)
            checkpoint_cost = page.evaluate("""() => {
                const g=new ZQ.Game('deep', structuredClone(ZQApp.profile), {seed:123,width:1440,height:900});
                g.state.score=10000;
                while(g.state.fish.length<g.state.maxFish) g.addFish(g.state.fish.length%4);
                for(let i=0;i<20;i++) g.feed();
                for(let i=0;i<40;i++) g.emit('birth','A little life joins your aquarium.',{amount:10});
                g.spawnCreature();
                const data={version:ZQ.VERSION,savedAt:new Date().toISOString(),writer:'layout-check',
                    profile:g.profile,settings:ZQApp.settings,session:g.snapshot()};
                ZQ.validateSave(data);
                const timings=[];
                const key='zq3d-checkpoint-timing';
                const prior=localStorage.getItem(key);
                let text;
                try {
                    for(let i=0;i<25;i++) {
                        const start=performance.now();
                        data.session=g.snapshot();
                        text=JSON.stringify(data);
                        localStorage.setItem(key,text);
                        timings.push(performance.now()-start);
                    }
                } finally {
                    if(prior===null) localStorage.removeItem(key); else localStorage.setItem(key,prior);
                }
                timings.sort((a,b)=>a-b);
                return {residents:g.state.fish.length,food:g.state.food.length,bytes:new Blob([text]).size,
                    medianMs:timings[12],maxMs:timings[24]};
            }""")
            print(f"Desktop Edge checkpoint cost (not a phone guarantee): {checkpoint_cost}", flush=True)
            fallback = browser.new_context(viewport={"width": 320, "height": 480})
            try:
                fallback.add_init_script("""{
                    const original=HTMLCanvasElement.prototype.getContext;
                    HTMLCanvasElement.prototype.getContext=function(kind,...args){
                        return kind.startsWith('webgl')?null:original.call(this,kind,...args);
                    };
                }""")
                canvas_page = fallback.new_page()
                canvas_page.on("pageerror", lambda error: errors.append(str(error)))
                canvas_page.goto(f"http://127.0.0.1:{server.server_port}/index.html")
                canvas_page.wait_for_function("typeof ZQApp !== 'undefined' && ZQApp.renderer && !ZQApp.renderer.is3D")
                canvas_page.locator('[data-theme="koi"]').click()
                assert canvas_page.locator("#scene-name").inner_text() == "Koi Pond"
                assert "Koi Pond" in canvas_page.locator("#scene-caption").inner_text()
                canvas_page.locator("#sound-button").click()
                assert canvas_page.locator("#dock-volume").is_visible()
                canvas_page.keyboard.press("Escape")
                canvas_page.locator("#begin-button").click()
                assert not canvas_page.locator("#scene-caption").is_visible()
                print("PASS Canvas fallback keeps accessible theme information and the shared sound flyout", flush=True)
            finally:
                fallback.close()
            assert not errors, errors
        finally:
            browser.close()
finally:
    server.shutdown()
    server.server_close()
