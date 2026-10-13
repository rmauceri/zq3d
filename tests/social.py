"""Real-renderer and touch checks for fish sexes and territorial encounters."""
import base64
import functools
import sys
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
ARTIFACTS = Path(sys.argv[1]) if len(sys.argv) > 1 else None


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
            for fallback in [False, True]:
                context = browser.new_context(viewport={"width": 1200, "height": 800}, has_touch=True)
                if fallback:
                    context.add_init_script("""{
                        const original=HTMLCanvasElement.prototype.getContext;
                        HTMLCanvasElement.prototype.getContext=function(kind,...args){
                            return kind.startsWith('webgl') ? null : original.call(this,kind,...args);
                        };
                    }""")
                page = context.new_page()
                errors = []
                page.on("pageerror", lambda error: errors.append(str(error)))
                page.goto(f"http://127.0.0.1:{server.server_port}/index.html")
                page.wait_for_function("typeof ZQApp !== 'undefined' && ZQApp.renderer")
                assert page.evaluate("ZQApp.renderer.is3D") != fallback
                mode = "canvas" if fallback else "webgl"
                for theme in ["koi", "tropical", "deep", "zen", "ink"]:
                    page.set_viewport_size({"width": 1200, "height": 800})
                    page.wait_for_timeout(180)
                    if page.evaluate("Boolean(ZQApp.game)"):
                        page.locator("#menu-button").click()
                        page.locator('[data-menu-action="home"]').click()
                    page.locator(f'[data-theme="{theme}"]').click()
                    page.locator("#begin-button").click()
                    report = page.evaluate("""() => {
                        const g=ZQApp.game,r=ZQApp.renderer;
                        g.state.paused=true; g.state.fish=[]; g.state.creature=null; g.state.attacks=[];
                        g.state.bubbles=[]; g.state.food=[]; g.state.dead=[]; r.reduced=true;
                        for(let type=0;type<4;type++){
                            const f=g.addFish(type,false,[-3+type*2,1.8,1]);
                            f.sex='female';f.yaw=0;f.pitch=0;f.roll=0;f.hunger=100;
                        }
                        const canvas=document.createElement('canvas');
                        canvas.width=r.canvas.width;canvas.height=r.canvas.height;
                        const ctx=canvas.getContext('2d');
                        const image=()=>{
                            r.render(g.state,0,0);ctx.drawImage(r.canvas,0,0);
                            return ctx.getImageData(0,0,canvas.width,canvas.height).data;
                        };
                        const difference=(a,b)=>{
                            let count=0;
                            for(let i=0;i<a.length;i+=4)if(Math.abs(a[i]-b[i])+Math.abs(a[i+1]-b[i+1])+Math.abs(a[i+2]-b[i+2])>15)count++;
                            return count;
                        };
                        const base=image(),counts=[];
                        for(const f of g.state.fish){
                            f.sex='male';counts.push({species:g.theme.fish[f.type].id,pixels:difference(base,image())});
                            f.sex='female';
                        }
                        g.state.fish.forEach(f=>{f.sex='male';});
                        const male=image();
                        g.state.fish.forEach(f=>{f.activity='display';});
                        const flare=difference(male,image());
                        g.state.fish.forEach(f=>{f.activity='cruise';});
                        image();
                        return {counts,flare,error:r.gl?r.gl.getError():0};
                    }""")
                    for count in report["counts"]:
                        assert count["pixels"] >= 25, f'{mode}: invisible male marking: {count}'
                    assert report["error"] == 0, f"{mode}: graphics error {report['error']}"
                    if ARTIFACTS:
                        page.locator("#viewport canvas").screenshot(path=str(ARTIFACTS / f"{mode}-{theme}-males.png"))
                        page.evaluate("ZQApp.game.state.fish.forEach(f=>{f.sex='female'});ZQApp.renderer.render(ZQApp.game.state,0,0)")
                        page.locator("#viewport canvas").screenshot(path=str(ARTIFACTS / f"{mode}-{theme}-females.png"))
                        page.evaluate("ZQApp.game.state.fish.forEach(f=>{f.sex='male'});ZQApp.renderer.render(ZQApp.game.state,0,0)")
                    if theme == "ink":
                        assert report["flare"] > 100, f"{mode}: no visible territorial fin flare"
                        if ARTIFACTS:
                            page.locator("#viewport canvas").screenshot(path=str(ARTIFACTS / f"{mode}-males.png"))
                    print(f"PASS {mode} {theme}: all four male markings visible; renderer error-free")
                    for width, height in [(1200, 800), (320, 480), (480, 320)]:
                        page.set_viewport_size({"width": width, "height": height})
                        page.wait_for_timeout(180)
                        contrast = page.evaluate("""() => {
                            const g=ZQApp.game,r=ZQApp.renderer;
                            g.state.fish=[];g.state.courtships=[];g.state.disputes=[];
                            const canvas=document.createElement('canvas');
                            canvas.width=r.canvas.width;canvas.height=r.canvas.height;
                            const ctx=canvas.getContext('2d');
                            const image=()=>{
                                r.render(g.state,0,0);ctx.drawImage(r.canvas,0,0);
                                return ctx.getImageData(0,0,canvas.width,canvas.height).data;
                            };
                            const distance=(a,b,i)=>Math.abs(a[i]-b[i])+Math.abs(a[i+1]-b[i+1])+Math.abs(a[i+2]-b[i+2]);
                            const background=image(),counts=[];
                            for(let type=0;type<4;type++){
                                g.state.fish=[];
                                const f=g.addFish(type,false,[0,1.8,1]);
                                f.sex='female';f.yaw=0;f.pitch=0;f.roll=0;f.hunger=100;
                                const female=image();f.sex='male';const male=image();
                                // These Zen species intentionally use quieter rose pink.
                                const margin=['zen-cloud','zen-danio','zen-threadfin'].includes(g.theme.fish[type].id)?45:90;
                                let area=0,strong=0;
                                for(let i=0;i<female.length;i+=4){
                                    if(Math.max(distance(female,background,i),distance(male,background,i))<30)continue;
                                    area++;if(distance(female,male,i)>=margin)strong++;
                                }
                                counts.push({species:g.theme.fish[type].id,area,strong,fraction:strong/area});
                            }
                            const zoom=r.camera.zoom;r.camera.zoom=1.4;
                            g.state.fish=[];
                            for(let type=0;type<4;type++){
                                for(let sex=0;sex<2;sex++){
                                    const f=g.addFish(type,false,[-1.25+sex*2.5,2.4-type*1.6,1]);
                                    f.sex=sex?'male':'female';f.yaw=0;f.pitch=0;f.roll=0;f.hunger=100;
                                }
                            }
                            image();const comparison=canvas.toDataURL();r.camera.zoom=zoom;
                            return {counts,comparison,error:r.gl?r.gl.getError():0};
                        }""")
                        faint = [count for count in contrast["counts"] if count["strong"] < 10 or count["fraction"] < 0.12]
                        assert not faint, f"{mode} {theme} {width}x{height}: male accent lacks visible coverage: {faint}"
                        assert contrast["error"] == 0
                        if ARTIFACTS:
                            (ARTIFACTS / f"{mode}-{theme}-pairs-{width}x{height}.png").write_bytes(
                                base64.b64decode(contrast["comparison"].split(",", 1)[1])
                            )
                        minimum = min(count["fraction"] for count in contrast["counts"])
                        print(f"PASS {mode} {theme} {width}x{height}: visible male accents cover at least {minimum:.0%} of each fish")
                for width, height in [(320, 480), (390, 844), (480, 320), (844, 390), (800, 1280), (1280, 800)]:
                    page.set_viewport_size({"width": width, "height": height})
                    page.wait_for_timeout(180)
                    page.evaluate("""() => {
                        const g=ZQApp.game;
                        g.state.fish=[];g.state.disputes=[];g.state.courtships=[];g.state.auto=false;
                        g.state.creature=null;g.state.attacks=[];g.state.spawnTimer=60;
                        for(let i=0;i<2;i++){
                            const f=g.addFish(0,false,[i*1.5,1.5,0]);f.sex='male';f.hunger=100;f.vel=[0,0,0];
                        }
                        g.state.paused=false;g.updateDisputes(.1);
                    }""")
                    page.keyboard.press("r")
                    page.wait_for_function("!document.getElementById('social-hint').hidden")
                    bounds = page.locator("#social-hint").bounding_box()
                    assert bounds["x"] >= 0 and bounds["x"] + bounds["width"] <= width
                    assert bounds["y"] >= 0 and bounds["y"] + bounds["height"] <= height
                    target = page.evaluate("""() => {
                        const p=ZQApp.renderer.project(ZQApp.game.state.fish[0].pos);
                        const b=document.getElementById('viewport').getBoundingClientRect();
                        return {x:p.x+b.left,y:p.y+b.top,visible:p.visible,taps:ZQApp.game.state.stats.taps};
                    }""")
                    assert target["visible"], f"{mode} {width}x{height}: centered rivals not visible"
                    if ARTIFACTS and (width, height) == (480, 320):
                        page.screenshot(path=str(ARTIFACTS / f"{mode}-landscape-dispute.png"))
                    page.touchscreen.tap(target["x"], target["y"])
                    assert page.evaluate("ZQApp.game.state.disputes.length") == 0
                    assert page.evaluate("ZQApp.game.state.stats.taps") == target["taps"]
                    print(f"PASS {mode} {width}x{height}: compact cue stays onscreen and a real touch separates rivals")
                    page.evaluate("""() => {
                        const g=ZQApp.game,random=g.random;
                        g.drainEvents();g.state.disputes=[];g.state.courtships=[];g.state.reproduction.fill(0);
                        g.state.fish.forEach((f,i)=>{
                            f.sex=i?'female':'male';f.pos=[i*1.5,1.5,0];f.fear=0;f.socialCooldown=0;f.hunger=100;f.health=100;
                        });
                        g.state.tankHealth=100;g.random=()=>0;g.reproduce(.1);
                        for(let i=0;i<41;i++)g.reproduce(.1);g.random=random;
                    }""")
                    page.keyboard.press("r")
                    page.wait_for_function("!document.getElementById('toast').hidden && document.getElementById('toast').dataset.kind==='birth'")
                    assert "A baby Brushstroke Betta!" in page.locator("#toast").inner_text()
                    assert page.evaluate("!ZQApp.game.state.paused && !document.getElementById('panel').open")
                    notice = page.locator("#toast").bounding_box()
                    assert notice["x"] >= 0 and notice["x"] + notice["width"] <= width
                    assert notice["y"] >= 0 and notice["y"] + notice["height"] <= height
                    if ARTIFACTS and (width, height) == (480, 320):
                        page.screenshot(path=str(ARTIFACTS / f"{mode}-landscape-birth.png"))
                    print(f"PASS {mode} {width}x{height}: actual birth announces the baby without pausing or overflowing")
                page.evaluate("""() => {
                    const data=JSON.parse(localStorage.getItem(ZQ.STORAGE_KEY));
                    data.version=9;localStorage.setItem(ZQ.STORAGE_KEY,JSON.stringify(data));
                    localStorage.setItem('unrelated-test-key','keep');
                }""")
                old = page.evaluate("localStorage.getItem(ZQ.STORAGE_KEY)")
                page.reload()
                page.wait_for_function("typeof ZQApp !== 'undefined' && ZQApp.renderer")
                assert "Reset local progress" in page.locator("#save-warning").inner_text()
                assert page.evaluate("localStorage.getItem(ZQ.STORAGE_KEY)") == old
                page.locator("#settings-button").click()
                assert page.locator("#reset-save-button").inner_text() == "Reset local progress"
                page.locator("#reset-save-button").click()
                page.locator("#cancel-action").click()
                assert page.evaluate("localStorage.getItem(ZQ.STORAGE_KEY)") == old
                page.locator("#settings-button").click()
                page.locator("#reset-save-button").click()
                page.locator("#confirm-action").click()
                page.wait_for_function("typeof ZQApp !== 'undefined' && !document.getElementById('begin-button').disabled")
                assert page.evaluate("localStorage.getItem(ZQ.STORAGE_KEY)") is None
                assert page.evaluate("localStorage.getItem('unrelated-test-key')") == "keep"
                page.locator("#begin-button").click()
                assert page.evaluate("JSON.parse(localStorage.getItem(ZQ.STORAGE_KEY)).version") == 10
                assert not errors, errors
                print(f"PASS {mode}: earlier save stays untouched until confirmed reset; only zq3d resets and new saving works")
                context.close()
        finally:
            browser.close()
finally:
    server.shutdown()
    server.server_close()
