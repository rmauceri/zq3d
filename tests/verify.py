"""Run deterministic game tests and real Chromium PWA/device smoke coverage.

Requires Python and Playwright for development only; the aquarium has no dependencies.
Use --browser chrome or --browser msedge with an installed browser, or chromium with
Playwright's browser download. The temporary HTTP server binds only to loopback.
"""

import argparse
import functools
import json
import socket
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parents[1]


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass

    def copyfile(self, source, outputfile):
        try:
            super().copyfile(source, outputfile)
        except (ConnectionAbortedError, ConnectionResetError, BrokenPipeError):
            print("Browser closed an in-flight test resource.", flush=True)


class TestServer(ThreadingHTTPServer):
    request_queue_size = socket.SOMAXCONN


def require(condition, message):
    if not condition:
        raise AssertionError(message)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--browser", default="msedge", choices=["msedge", "chrome", "chromium"])
    parser.add_argument("--artifacts", type=Path)
    args = parser.parse_args()
    artifacts = args.artifacts
    if artifacts:
        artifacts.mkdir(parents=True, exist_ok=True)
    handler = functools.partial(QuietHandler, directory=str(ROOT))
    server = TestServer(("127.0.0.1", 0), handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    origin = f"http://127.0.0.1:{server.server_port}"
    url = origin + "/index.html"
    failures = []
    report = {"core": [], "checks": [], "screenshots": []}

    def check(name, fn):
        try:
            fn()
            report["checks"].append({"name": name, "passed": True})
            print(f"PASS {name}", flush=True)
        except Exception as error:
            report["checks"].append({"name": name, "passed": False, "error": str(error)})
            failures.append(f"{name}: {error}")
            print(f"FAIL {name}: {error}", flush=True)

    def screenshot(page, name):
        if artifacts:
            target = artifacts / f"{name}.png"
            page.screenshot(path=str(target), full_page=True)
            report["screenshots"].append(str(target))

    try:
        with sync_playwright() as p:
            options = {
                "headless": True,
                "args": ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
            }
            if args.browser != "chromium":
                options["channel"] = args.browser
            browser = p.chromium.launch(**options)
            context = browser.new_context(viewport={"width": 1440, "height": 1000}, color_scheme="light")
            page = context.new_page()
            errors = []
            page.on("pageerror", lambda error: errors.append(str(error)))
            requests = []
            page.on("request", lambda request: requests.append(request.url))
            page.goto(url, wait_until="domcontentloaded")
            page.wait_for_function("typeof ZQApp !== 'undefined' && ZQApp.renderer && !document.getElementById('begin-button').disabled")
            page.add_script_tag(path=str(ROOT / "tests" / "core.test.js"))
            report["core"] = page.evaluate("ZQ_TEST_RESULTS")
            for result in report["core"]:
                if not result["passed"]:
                    failures.append(f"Core: {result['name']}: {result['error']}")
                    print(f"FAIL core {result['name']}: {result['error']}", flush=True)
            print(f"Core: {sum(r['passed'] for r in report['core'])}/{len(report['core'])} passed", flush=True)

            check("Real WebGL renders without GL errors", lambda: require(
                page.evaluate("ZQApp.renderer.is3D && ZQApp.renderer.gl.getError() === 0"),
                page.evaluate("ZQApp.renderer.failureReason || 'WebGL returned an error'")))
            screenshot(page, "desktop-welcome")
            page.locator("#begin-button").click()
            page.wait_for_function("ZQApp.game && ZQApp.game.state.fish.length === 2")

            def shop():
                page.locator("#shop-button").click()
                before = page.evaluate("ZQApp.game.state.elapsed")
                page.wait_for_function("(before) => ZQApp.game.state.elapsed > before", arg=before)
                require(page.evaluate("!document.getElementById('panel').open"), "The shop opened a modal")
                for index in [0, 2, 3]:
                    page.locator(f'[data-buy="{index}"]').click()
                    require(page.locator("#tray").is_visible(), "The live shop closed after a purchase")
                require(page.evaluate("ZQApp.game.state.fish.length") == 5, "Fish purchases did not reach five residents")
                require(page.evaluate("!!ZQApp.profile.achievements['full-spectrum']"), "Full Spectrum was not awarded")
                page.locator("#feed-button").click()
                require(page.locator("#tray").is_visible(), "Care controls could not be used alongside the shop")
                page.locator("#tray-close").click()

            check("Non-modal shop stays live, supports care controls, and awards biodiversity", shop)
            page.locator("#auto-button").click()
            page.locator("#feed-button").click()
            page.locator("#clean-button").click()
            screenshot(page, "desktop-aquarium")

            def manual_pause():
                page.locator("#pause-button").click()
                before = page.evaluate("JSON.stringify(ZQApp.game.state)")
                page.wait_for_timeout(250)
                require(page.evaluate("JSON.stringify(ZQApp.game.state)") == before, "Paused simulation changed")
                page.locator("#unpause-button").click()
                require(page.evaluate("!ZQApp.game.state.paused"), "Resume did not resume")

            check("Pause freezes all state and Resume works", manual_pause)

            def controls():
                original_yaw = page.evaluate("ZQApp.renderer.camera.yaw")
                page.locator("#orbit-button").click()
                require(page.evaluate("ZQApp.renderer.camera.yaw") != original_yaw, "Camera orbit was ignored")
                page.locator("#zoom-in-button").click()
                require(page.evaluate("ZQApp.renderer.camera.zoom") < 1, "Zoom failed")
                page.locator("#reset-camera-button").click()
                page.locator("#residents-button").click()
                page.locator("[data-follow]").first.click()
                require(page.evaluate("ZQApp.renderer.camera.follow !== null"), "Fish following did not start")
                page.locator("#follow-label").click()
                page.locator("#immerse-button").click()
                require(page.locator("#exit-immersion").is_visible(), "No accessible exit from immersion")
                page.locator("#exit-immersion").click()
                page.keyboard.press("f")
                page.keyboard.press("r")
                require(page.evaluate("ZQApp.game.state.food.length > 0"), "Keyboard feed failed")

            check("Orbit, zoom, following, immersive view, and keyboard actions", controls)

            def direct_glass_taps():
                target = page.evaluate("""() => {
                    const g = ZQApp.game, r = ZQApp.renderer, f = g.state.fish[0];
                    g.state.creature = null;
                    f.pos = [0, 0.5, 1]; f.vel = [0, 0, 0];
                    r.reset(); r.render(g.state, g.state.elapsed, 0);
                    const p = r.project(f.pos);
                    if (r.pick(g.state, p.x, p.y)?.kind !== 'fish') throw new Error('Fixture did not target a fish');
                    return {x:p.x, y:p.y, id:f.id, taps:g.state.stats.taps};
                }""")
                page.mouse.click(target["x"], target["y"])
                require(page.evaluate("ZQApp.game.state.stats.taps") == target["taps"] + 1, "A fish click did not directly tap the glass")
                require(page.evaluate("(id) => ZQApp.game.state.fish.find(f => f.id === id).fear > 0", target["id"]), "The tapped fish did not react")
                require(page.locator("#tray").is_hidden() and not page.evaluate("document.getElementById('panel').open"), "A glass tap opened an inspector or dialog")
                page.locator("#shop-button").click()
                taps = page.evaluate("ZQApp.game.state.stats.taps")
                page.mouse.click(720, 380)
                require(page.evaluate("ZQApp.game.state.stats.taps") == taps + 1, "An open tray blocked interaction with the aquarium")
                require(page.locator("#tray").is_visible() and "life" in page.locator("#tray-title").inner_text(), "Glass tapping replaced the existing tray")
                page.keyboard.press("g")
                require(page.evaluate("ZQApp.game.state.stats.taps") == taps + 2, "Keyboard-only glass tapping is unavailable")
                page.locator("#tray-close").click()
                page.locator("#residents-button").click()
                require(page.locator("[data-follow]").count() >= 2, "Secondary resident inspection is missing")
                require(page.locator("#tap-fish-button").count() == 0, "Glass tapping still requires an inspector action")
                before = page.evaluate("ZQApp.game.state.elapsed")
                page.wait_for_function("(before) => ZQApp.game.state.elapsed > before", arg=before)
                page.locator("#tray-close").click()

            check("Glass clicks react directly; resident details remain an optional live tray", direct_glass_taps)

            def live_details():
                page.locator("#score-button").click()
                before = page.locator("#detail-score").inner_text()
                page.evaluate("ZQApp.game.state.score += 40")
                page.wait_for_function("(before) => document.getElementById('detail-score').textContent !== before", arg=before)
                page.locator("#journal-button").click()
                page.locator('[data-tab="achievements"]').click()
                page.evaluate("ZQApp.game.unlock('glass-tapper')")
                page.wait_for_selector('[data-achievement="glass-tapper"].unlocked')
                page.locator("#residents-button").click()
                fish_id = page.evaluate("ZQApp.game.addFish(3, true).id")
                row = page.locator(f'[data-resident="{fish_id}"]')
                row.wait_for()
                require("Baby" in row.locator("[data-resident-name]").inner_text(), "A newborn did not appear in the live inspector")
                page.evaluate("(id) => ZQApp.game.state.fish.find(f => f.id === id).growth = 1", fish_id)
                page.wait_for_function("(id) => !document.querySelector(`[data-resident=\"${id}\"] [data-resident-name]`).textContent.includes('Baby')", arg=fish_id)
                require(not page.evaluate("document.getElementById('panel').open"), "Live details opened a modal")
                page.locator("#tray-close").click()

            check("Score, discoveries, and new residents refresh inside live trays", live_details)

            def persistence():
                page.locator("#pause-button").click()
                saved = page.evaluate("({ fish: ZQApp.game.state.fish.map(f => ({id:f.id,type:f.type,hunger:f.hunger})), elapsed: ZQApp.game.state.elapsed, score:ZQApp.game.state.score })")
                page.reload()
                page.wait_for_function("typeof ZQApp !== 'undefined'")
                require(page.locator("#resume-button").is_visible(), "No resume offer after reload")
                page.locator("#resume-button").click()
                actual = page.evaluate("({ fish: ZQApp.game.state.fish.map(f => ({id:f.id,type:f.type})), elapsed: ZQApp.game.state.elapsed, score:ZQApp.game.state.score })")
                require(actual["fish"] == [{"id": f["id"], "type": f["type"]} for f in saved["fish"]], "The saved residents changed")
                require(abs(actual["elapsed"] - saved["elapsed"]) < 0.5, "Offline time was applied to the simulation")
                require(actual["score"] >= saved["score"], "Saved score was lost")

            check("A full session survives reload without offline neglect", persistence)

            def background_lifecycle():
                page.evaluate("window.dispatchEvent(new PageTransitionEvent('pagehide'))")
                require(page.evaluate("ZQApp.game.state.paused"), "Pagehide did not pause")
                before = page.evaluate("ZQApp.game.state.elapsed")
                page.wait_for_timeout(200)
                require(page.evaluate("ZQApp.game.state.elapsed") == before, "Background time advanced")
                page.evaluate("window.dispatchEvent(new PageTransitionEvent('pageshow'))")
                require(page.evaluate("ZQApp.game.state.paused"), "Foreground unexpectedly auto-resumed")
                page.locator("#unpause-button").click()

            check("Background lifecycle requires explicit resume", background_lifecycle)

            def theme_and_layout():
                for width, height, label in [(390, 844, "phone"), (320, 568, "small-phone"), (768, 1024, "tablet"), (844, 390, "landscape")]:
                    page.set_viewport_size({"width": width, "height": height})
                    page.wait_for_timeout(180)
                    require(page.evaluate("document.documentElement.scrollWidth <= innerWidth"), f"{label} overflows horizontally")
                    for selector in ["#feed-button", "#clean-button", "#shop-button", "#pause-button", "#settings-button"]:
                        box = page.locator(selector).bounding_box()
                        require(box and box["width"] >= 43.9 and box["height"] >= 43.9, f"{label}: {selector} touch target too small")
                        require(box["x"] >= 0 and box["x"] + box["width"] <= width + 1, f"{label}: {selector} offscreen")
                        require(box["y"] >= 0 and box["y"] + box["height"] <= height + 1, f"{label}: {selector} offscreen")
                    screenshot(page, f"{label}-aquarium")
                page.locator("#home-button").click()
                page.set_viewport_size({"width": 1440, "height": 1000})
                for theme in ["koi", "deep", "zen", "ink", "tropical"]:
                    page.locator(f'[data-theme="{theme}"]').click()
                    page.wait_for_timeout(150)
                    require(page.evaluate("ZQApp.renderer.gl.getError() === 0"), f"{theme} produced a graphics error")
                    require(page.evaluate("""id => {
                        const root = document.documentElement, css = getComputedStyle(root), ui = ZQ.THEMES[id].ui;
                        return root.hasAttribute('data-aquarium-ui')
                            && css.getPropertyValue('--cp-accent').trim() === ui.accent
                            && css.getPropertyValue('--cp-bg').trim() === ui.bg
                            && css.getPropertyValue('--cp-text').trim() === ui.text
                            && root.dataset.theme === (id === 'ink' ? 'light' : 'dark')
                            && document.querySelector('meta[name="theme-color"]').content === ui.bg;
                    }""", theme), f"{theme}: the UI did not adopt the original aquarium palette")
                    screenshot(page, f"world-{theme}")
                page.set_viewport_size({"width": 390, "height": 844})
                page.wait_for_timeout(180)
                screenshot(page, "phone-welcome")
                require(page.locator("#begin-button").is_visible(), "Mobile begin action is missing")
                page.set_viewport_size({"width": 1440, "height": 1000})

            check("Desktop, tablet, phone, landscape, and every theme", theme_and_layout)

            def explicit_color_schemes():
                override_context = browser.new_context()
                override_page = override_context.new_page()
                try:
                    for scheme in ["light", "dark"]:
                        override_page.goto(url + "?clawpilotTheme=" + scheme, wait_until="domcontentloaded")
                        override_page.wait_for_function("typeof ZQApp !== 'undefined' && !!ZQApp.renderer")
                        override_page.locator('[data-theme="ink"]').click()
                        require(override_page.evaluate("""scheme => document.documentElement.dataset.theme === scheme
                            && !document.documentElement.hasAttribute('data-aquarium-ui')""", scheme),
                            f"Explicit {scheme} interface preference was overwritten")
                finally:
                    override_context.close()

            check("Explicit light/dark interface overrides remain available", explicit_color_schemes)

            def graphics_recovery():
                page.locator("#resume-button").click()
                supported = page.evaluate("!!ZQApp.renderer.gl.getExtension('WEBGL_lose_context')")
                require(supported, "Browser cannot exercise graphics context loss")
                page.evaluate("globalThis.lossExtension = ZQApp.renderer.gl.getExtension('WEBGL_lose_context'); lossExtension.loseContext()")
                page.wait_for_function("ZQApp.renderer.lost")
                require(page.evaluate("ZQApp.game.state.paused"), "Graphics loss did not pause the aquarium")
                page.evaluate("lossExtension.restoreContext()")
                page.wait_for_function("!ZQApp.renderer.lost", timeout=15000)
                code = page.evaluate("ZQApp.renderer.gl.getError()")
                require(code == 0, f"Restored renderer has GL error {code}")
                page.locator("#unpause-button").click()

            check("WebGL context loss safely pauses and rebuilds graphics", graphics_recovery)

            def audio_and_settings():
                page.locator("#sound-button").click()
                require(page.locator("#sound-button").get_attribute("aria-pressed") == "true", "Sound did not enable")
                page.locator("#settings-button").click()
                page.locator("#setting-quality").select_option("battery")
                page.locator("#setting-motion").select_option("reduced")
                page.locator("#tray-close").click()
                require(page.evaluate("ZQApp.renderer.level === 'battery' && ZQApp.renderer.reduced"), "Motion or quality setting did not apply")
                page.locator("#sound-button").click()
                require(page.locator("#sound-button").get_attribute("aria-pressed") == "false", "Sound did not mute")

            check("Synthesized sound, battery saver, and reduced motion", audio_and_settings)

            def challenges_and_prizes():
                def spawn(kind):
                    page.evaluate("""kind => {
                        const g = ZQApp.game;
                        g.state.creature = null;
                        const index = g.theme.visitors.findIndex(v => v.kind === kind);
                        const random = g.random;
                        g.random = () => (index + 0.1) / g.theme.visitors.length;
                        g.spawnCreature();
                        g.random = random;
                        g.state.creature.pos = [0, g.state.bounds.floor + (kind === 'crab' ? 0.42 : 0.85), 0.8];
                        g.state.creature.entered = true;
                    }""", kind)
                spawn("crab")
                page.wait_for_selector('#care-alert[data-challenge="crab"]:visible')
                page.locator("#shop-button").click()
                for width, height in [(320, 568), (390, 844), (768, 1024), (844, 390), (1440, 1000)]:
                    page.set_viewport_size({"width": width, "height": height})
                    page.wait_for_timeout(180)
                    for selector in ["#care-action", "#care-action-secondary", "#tray-close", "#dock-toggle", "#feed-button"]:
                        require(page.locator(selector).evaluate("""button => {
                            const r = button.getBoundingClientRect();
                            const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
                            return r.width >= 43.9 && r.height >= 43.9 && r.x >= 0 && r.y >= 0
                                && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1
                                && button.contains(hit);
                        }"""), f"{width}x{height}: {selector} is obscured or too small alongside a live tray")
                    if width == 320:
                        screenshot(page, "phone-live-challenge")
                page.locator("#tray-close").click()
                screenshot(page, "crab-challenge")
                for selector in ["#care-action", "#care-action-secondary", "#care-action"]:
                    page.locator(selector).click()
                    page.wait_for_timeout(420)
                require(page.evaluate("!!ZQApp.profile.prizes.arch"), "Crab defense did not unlock its arch")
                spawn("eel")
                page.evaluate("ZQApp.game.state.creature.phaseTimer = 0.01")
                page.wait_for_selector('#care-alert[data-ready="true"]:visible')
                page.locator("#care-action").click()
                require(page.evaluate("!!ZQApp.profile.prizes.lantern"), "Timed flash did not unlock its lantern")
                screenshot(page, "eel-challenge")
                page.evaluate("ZQApp.game.state.score = 1000; ZQApp.profile.stats.born = 1; ZQApp.game.checkPrizes()")
                page.wait_for_selector("#milestone-continue", timeout=10000)
                page.keyboard.press("Escape")
                require(page.evaluate("document.getElementById('panel').open"), "Milestone was dismissed without a choice")
                page.locator("#milestone-continue").click()
                page.locator("#prizes-button").click()
                require(page.evaluate("Object.keys(ZQApp.profile.prizes).length") == 4, "Not all four prize conditions worked")
                for prize in page.evaluate("ZQApp.profile.equippedPrizes.slice()"):
                    page.locator(f'[data-equip="{prize}"]').click()
                for prize in ["chest", "oyster", "lantern"]:
                    page.locator(f'[data-equip="{prize}"]').click()
                page.locator('[data-prize-play="chest"]').click()
                require(page.evaluate("ZQApp.game.state.prizeEffects.chest > 0"), "Chest did not react")
                require(page.evaluate("ZQApp.profile.equippedPrizes.length") == 3, "Prize placement exceeded its limit")
                require(page.locator('[data-equip="arch"]').is_disabled(), "A fourth prize can be placed")
                page.wait_for_timeout(250)
                screenshot(page, "live-prize-collection")
                page.locator("#tray-close").click()
                page.wait_for_timeout(200)
                screenshot(page, "earned-tank-prizes")
                page.locator("#dock-toggle").click()
                require(not page.locator("#feed-button").is_visible(), "Controls did not collapse")
                page.locator("#dock-toggle").click()
                require(page.locator("#feed-button").is_visible(), "Controls did not expand")

            check("Crab and eel defenses, milestone choice, persistent prizes, and collapsible controls", challenges_and_prizes)

            def offline():
                page.wait_for_function("ZQApp.offlineReady", timeout=15000)
                page.locator("#home-button").click()
                expected = page.evaluate("""() => {
                    const data = JSON.parse(localStorage.getItem('zenquarium_zq3d_v1'));
                    return { fish: data.session.fish.map(f => ({id:f.id,type:f.type})),
                        prizes: data.profile.prizes, equipped: data.profile.equippedPrizes };
                }""")
                page.evaluate("localStorage.setItem('zenquarium_save', JSON.stringify({sentinel:'original'}))")
                context.set_offline(True)
                try:
                    page.reload()
                    page.wait_for_function("typeof ZQApp !== 'undefined' && !!ZQApp.renderer")
                    page.locator("#resume-button").click()
                    actual = page.evaluate("""({
                        fish: ZQApp.game.state.fish.map(f => ({id:f.id,type:f.type})),
                        prizes: ZQApp.profile.prizes, equipped: ZQApp.profile.equippedPrizes
                    })""")
                    require(actual == expected, "Offline resume lost residents, prizes, or placements")
                    require(page.evaluate("JSON.parse(localStorage.getItem('zenquarium_save')).sentinel") == "original", "Original Zenquarium save changed")
                    require(page.evaluate("ZQApp.renderer.is3D"), "WebGL unavailable offline")
                finally:
                    context.set_offline(False)

            check("Installed shell reloads and resumes entirely offline", offline)

            def service_worker_isolation():
                value = page.evaluate("""async () => {
                    await caches.open('zenquarium-v4');
                    await caches.open('unrelated-app-cache');
                    return { scope: (await navigator.serviceWorker.getRegistration()).scope,
                        keys: await caches.keys(),
                        manifest: await (await fetch('./manifest.webmanifest')).json() };
                }""")
                require(value["scope"] == origin + "/", "Service worker scope does not match the application root")
                require("zenquarium-v4" in value["keys"] and "unrelated-app-cache" in value["keys"], "Foreign caches were removed")
                require(value["manifest"]["scope"] == "./" and value["manifest"]["start_url"] == "./index.html", "Manifest scope is wrong")
                require(any(i.get("purpose") == "maskable" for i in value["manifest"]["icons"]), "No maskable app icon")

            check("PWA identity and cache isolation", service_worker_isolation)
            check("No page errors or external network dependencies", lambda: (
                require(not errors, "; ".join(errors)),
                require(all(r.startswith(origin) or r.startswith("data:") or r.startswith("blob:") for r in requests), "An external dependency was requested")
            ))
            page.evaluate("window.dispatchEvent(new PageTransitionEvent('pagehide'))")

            def touch_controls():
                isolated = p.chromium.launch(**options)
                touch_context = isolated.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True)
                touch_page = touch_context.new_page()
                touch_errors = []
                touch_page.on("pageerror", lambda error: touch_errors.append(str(error)))
                try:
                    touch_page.goto(url, wait_until="domcontentloaded")
                    touch_page.wait_for_function("typeof ZQApp !== 'undefined' && !document.getElementById('begin-button').disabled")
                    touch_page.locator('[data-theme="deep"]').tap()
                    touch_page.locator("#begin-button").tap()
                    touch_page.evaluate("ZQApp.renderer.setQuality('battery')")
                    point = touch_page.evaluate("""() => {
                        const g = ZQApp.game, r = ZQApp.renderer;
                        g.state.fish[0].pos = [0, 0.5, 1];
                        r.render(g.state, g.state.elapsed, 0);
                        const p = r.project(g.state.fish[0].pos);
                        return {x:p.x, y:p.y};
                    }""")
                    touch_page.touchscreen.tap(point["x"], point["y"])
                    require(touch_page.evaluate("ZQApp.game.state.stats.taps") == 1, "Touching a fish did not tap the glass")
                    require(touch_page.locator("#tray").is_hidden(), "Touching a fish opened details")
                    client = touch_context.new_cdp_session(touch_page)
                    yaw = touch_page.evaluate("ZQApp.renderer.camera.yaw")
                    client.send("Input.dispatchTouchEvent", {"type": "touchStart", "touchPoints": [{"x": 220, "y": 350, "id": 1}]})
                    for x in [205, 190, 175, 160, 145]:
                        client.send("Input.dispatchTouchEvent", {"type": "touchMove", "touchPoints": [{"x": x, "y": 350, "id": 1}]})
                    client.send("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": []})
                    require(abs(touch_page.evaluate("ZQApp.renderer.camera.yaw") - yaw) > 0.2, "Touch drag did not orbit")
                    zoom = touch_page.evaluate("ZQApp.renderer.camera.zoom")
                    client.send("Input.dispatchTouchEvent", {"type": "touchStart", "touchPoints": [{"x": 110, "y": 430, "id": 1}, {"x": 230, "y": 430, "id": 2}]})
                    for left, right in [(105, 240), (100, 250), (90, 270)]:
                        client.send("Input.dispatchTouchEvent", {"type": "touchMove", "touchPoints": [{"x": left, "y": 430, "id": 1}, {"x": right, "y": 430, "id": 2}]})
                    client.send("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": []})
                    require(touch_page.evaluate("ZQApp.renderer.camera.zoom") < zoom, "Two-finger pinch did not zoom")
                    require(touch_page.evaluate("ZQApp.game.state.stats.taps") == 1, "A camera gesture accidentally stressed the fish")
                    touch_page.locator("#residents-button").tap()
                    require("Barreleye" in touch_page.locator("#resident-list").inner_text(), "Deep Ocean still lists a resident jellyfish")
                    touch_page.locator('[data-follow="2"]').tap()
                    require(touch_page.evaluate("ZQApp.renderer.camera.follow") == 2, "Secondary touch following is unavailable")
                    require(touch_page.evaluate("ZQApp.renderer.gl.getError()") == 0 and not touch_errors, "Touch scene has graphics or script errors")
                    screenshot(touch_page, "phone-direct-touch")
                finally:
                    isolated.close()

            check("Real touch taps, drag, pinch, and secondary Barreleye following", touch_controls)

            def fallback():
                isolated = p.chromium.launch(**options)
                fallback_context = isolated.new_context(viewport={"width": 390, "height": 844})
                fallback_context.add_init_script("""(() => {
                    const original = HTMLCanvasElement.prototype.getContext;
                    HTMLCanvasElement.prototype.getContext = function(type, ...args) {
                        return type === 'webgl' || type === 'webgl2' ? null : original.call(this, type, ...args);
                    };
                })();""")
                fallback_page = fallback_context.new_page()
                try:
                    fallback_page.goto(url, wait_until="domcontentloaded")
                    fallback_page.wait_for_function("typeof ZQApp !== 'undefined'")
                    require(fallback_page.evaluate("!ZQApp.renderer.is3D"), "Fallback renderer was not selected")
                    fallback_page.locator("#begin-button").click()
                    fallback_page.locator("#feed-button").click()
                    require(fallback_page.evaluate("ZQApp.game.state.food.length > 0"), "Fallback mode is not playable")
                    screenshot(fallback_page, "phone-compatibility")
                finally:
                    isolated.close()

            check("WebGL-unavailable compatibility mode remains playable", fallback)

            def bad_save():
                isolated = p.chromium.launch(**options)
                bad_context = isolated.new_context()
                bad_context.add_init_script("localStorage.setItem('zenquarium_zq3d_v1', '{bad-json');")
                bad_page = bad_context.new_page()
                try:
                    bad_page.goto(url, wait_until="domcontentloaded")
                    bad_page.wait_for_function("typeof ZQApp !== 'undefined'")
                    require(bad_page.locator("#save-warning").is_visible(), "Unreadable save failure was silent")
                    bad_page.locator("#begin-button").click()
                    require(bad_page.evaluate("localStorage.getItem('zenquarium_zq3d_v1')") == "{bad-json", "Unreadable save was overwritten")
                finally:
                    isolated.close()

            check("Unreadable saves are preserved and reported", bad_save)

            def denied_storage():
                isolated = p.chromium.launch(**options)
                denied_context = isolated.new_context()
                denied_context.add_init_script("""Object.defineProperty(window, 'localStorage', {
                    get() { throw new DOMException('Storage blocked', 'SecurityError'); }
                });""")
                denied_page = denied_context.new_page()
                try:
                    denied_page.goto(url, wait_until="domcontentloaded")
                    denied_page.wait_for_function("typeof ZQApp !== 'undefined'")
                    require(denied_page.locator("#save-warning").is_visible(), "Storage denial is silent")
                    denied_page.locator("#begin-button").click()
                    require(denied_page.evaluate("ZQApp.game.state.fish.length") == 2, "Storage denial prevents play")
                finally:
                    isolated.close()

            check("Private-mode storage denial still permits play with an explicit warning", denied_storage)

            def conflicts():
                other = context.new_page()
                other.goto(url, wait_until="domcontentloaded")
                other.wait_for_function("typeof ZQApp !== 'undefined'")
                other.evaluate("ZQApp.save()")
                page.wait_for_function("document.getElementById('save-warning').textContent.includes('Another window')")
                require(page.evaluate("ZQApp.game.state.paused"), "Concurrent edits did not pause")
                require(page.evaluate("ZQApp.save()") is False, "Stale window overwrote a newer save")
                other.close()

            check("Concurrent windows cannot silently overwrite each other", conflicts)
            context.close()
            browser.close()
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=2)
        if artifacts:
            (artifacts / "verification.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    if failures:
        raise SystemExit("\n".join(failures))
    print(f"All {len(report['core'])} core and {len(report['checks'])} browser checks passed.", flush=True)


if __name__ == "__main__":
    main()
