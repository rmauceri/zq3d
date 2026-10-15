'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM } = require(process.env.ZQ_JSDOM || 'jsdom');
const root = path.join(__dirname, '..');
const dom = new JSDOM(fs.readFileSync(path.join(root, 'index.html'), 'utf8'), {
    url: 'https://aquarium.test/', runScripts: 'outside-only', pretendToBeVisual: true
});
const w = dom.window, context = dom.getInternalVMContext();
const evaluate = code => vm.runInContext(code, context);
let frame, clock = 1000;
w.performance.now = () => clock;
w.requestAnimationFrame = callback => { frame = callback; return 1; };
w.cancelAnimationFrame = () => { frame = null; };
const idleJobs = new Map();
let idleId = 0;
w.requestIdleCallback = callback => { idleJobs.set(++idleId, callback); return idleId; };
w.cancelIdleCallback = id => idleJobs.delete(id);
const flushIdle = () => {
    const jobs = [...idleJobs.values()]; idleJobs.clear();
    for (const job of jobs) job({ didTimeout: false, timeRemaining: () => 50 });
};
w.matchMedia = () => ({ matches: false, addEventListener() {} });
const resizeObservers = new Map();
w.ResizeObserver = class {
    constructor(callback) { this.callback = callback; }
    observe(target) { resizeObservers.set(target, this.callback); }
};
w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
w.HTMLDialogElement.prototype.show = function () { this.open = true; };
w.HTMLDialogElement.prototype.close = function () { this.open = false; this.dispatchEvent(new w.Event('close')); };
evaluate(fs.readFileSync(path.join(root, 'core.js'), 'utf8'));
evaluate(fs.readFileSync(path.join(root, 'renderer.js'), 'utf8').replace('const ZQRenderer =', 'const RendererMath ='));
// Keep input/DOM and simulation real; neither graphics nor audio requires a browser.
evaluate(`
const ZQRenderer = { fishPreview: RendererMath.fishPreview, PARAMS: { camera: { views: [0.14, 0.75, 0.02] } }, Renderer: class {
    constructor(host) {
        this.canvas = document.createElement('canvas'); host.prepend(this.canvas);
        this.width = 1200; this.height = 800; this.level = 'high'; this.is3D = true; this.fps = 60;
        this.reset();
    }
    reset() { this.camera = { yaw:0.12, pitch:0.14, zoom:1, follow:null }; }
    resize() {} setTheme() {} setQuality(level) { this.level = level; }
    worldPoint(x,y) { return [(x-600)/80,(400-y)/100,(y-400)/100]; }
    sandPoint(x,y,floor) { return y<100 ? null : [(x-600)/40,floor,(y-600)/40]; }
    render(state, time) { this.renderCount = (this.renderCount || 0) + 1; this.renderedState = state; this.renderTime = time; }
    sampleFrame() {}
    project() { return { x:600, y:400, scale:50, visible:true }; }
    pick(state,x,y) {
        if(state.creature && Math.hypot(x-600,y-400)<60) return {kind:'creature',entity:state.creature};
        if(state.fish.length && Math.hypot(x-450,y-350)<30) return {kind:'fish',entity:state.fish[0]};
        if(state.equippedPrizes.includes('chest') && Math.hypot(x-300,y-650)<40)
            return {kind:'prize',entity:ZQ.prizePositions(state.bounds,['chest'],state.prizePositions)[0]};
        return null;
    }
    orbit(dx,dy) { this.camera.yaw += dx; this.camera.pitch += dy; this.camera.follow = null; }
    zoom(amount) { this.camera.zoom *= amount; }
}};
const audioEffects = [], audioCalls = [];
const ZQAudio = { Soundscape: class {
    suspend() { audioCalls.push('suspend'); return Promise.resolve(); }
    disable() { audioCalls.push('disable'); return Promise.resolve(); }
    enable() { this.context = {}; audioCalls.push('enable'); return Promise.resolve(); }
    setVolume() {} effect(type, pan) { audioEffects.push({ type, pan }); }
}};
`);
const viewport = w.document.getElementById('viewport'), captures = new Set();
viewport.setPointerCapture = id => captures.add(id);
viewport.hasPointerCapture = id => captures.has(id);
viewport.releasePointerCapture = id => captures.delete(id);
viewport.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1200, height: 800 });
evaluate(fs.readFileSync(path.join(root, 'app.js'), 'utf8'));
const $ = id => w.document.getElementById(id);
const pointer = (type, x, y, id = 1, pointerType = 'mouse') => {
    const event = new w.Event(type, { bubbles: true });
    for (const [key, value] of Object.entries({ clientX: x, clientY: y, pointerId: id, pointerType, button: 0 })) {
        Object.defineProperty(event, key, { value });
    }
    viewport.dispatchEvent(event);
};
const key = (type, name, repeat = false) => w.document.dispatchEvent(new w.KeyboardEvent(type, {
    key: name, repeat, bubbles: true, cancelable: true
}));
const pump = (count = 20) => {
    for (let i = 0; i < count; i++) {
        const callback = frame; frame = null; clock += 17;
        if (callback) callback(clock);
    }
};
const spawn = kind => {
    evaluate(`{
        const g=ZQApp.game;
        g.endCreatureHold(); g.state.creature=null; g.state.attacks=[];
        g.state.auto=false; g.state.damage=0; g.state.dirt=0; g.state.tankHealth=100;
        if(!g.state.fish.length) g.addFish(0);
        g.state.fish.forEach(f=>{ f.hunger=100; f.health=100; f.pos=[4,2,2]; });
        const index=g.theme.visitors.findIndex(v=>v.kind===${JSON.stringify(kind)}), random=g.random;
        g.random=()=>(index+0.1)/g.theme.visitors.length;
        g.spawnCreature(); g.random=random;
        g.state.creature.pos=[0, ${kind === 'crab' ? '-2.83' : '0'}, 0]; g.state.creature.entered=true;
        if(g.state.creature.kind==='eel') g.state.creature.targetPoint=[1,0,0];
    }`);
    pump(1);
    $('toast').hidden = true;
};
const swipe = (x, y, type = 'mouse') => {
    pointer('pointerdown', 600, 400, 1, type);
    pointer('pointermove', x, y, 1, type);
    pointer('pointerup', x, y, 1, type);
};
const progress = () => evaluate('ZQApp.game.state.creature.defenseStep');
const stored = () => JSON.parse(w.localStorage.getItem(evaluate('ZQ.STORAGE_KEY')));
const returnHome = () => {
    if (!evaluate('ZQApp.game.state.paused')) $('pause-button').click();
    $('pause-home-button').click();
};

try {
    assert.equal(evaluate('ZQApp.settings.sound'), true, 'First-run sound is not enabled');
    assert.equal(evaluate('ZQApp.settings.volume'), 0.45);
    assert.equal($('sound-button').getAttribute('aria-label'), 'Sound controls. Sound on');
    assert(!evaluate("audioCalls.includes('enable')"), 'Audio started before a user interaction');
    w.document.querySelector('.theme-option[aria-pressed="true"]').click();
    assert.equal(evaluate('audioCalls.at(-1)'), 'enable', 'Choosing a theme did not start the enabled soundscape');
    assert.equal(evaluate('ZQApp.game'), null, 'Enabling preview sound started an aquarium');
    assert.equal($('preview-badge'), null);
    assert.equal($('renderer-label'), null);
    assert($('resume-card').hidden && $('resume-button').hidden, 'An empty profile offered a saved aquarium');
    const home = w.document.querySelector('.home-layout'), footer = home.querySelector('.welcome-footer');
    assert.deepEqual([...home.children].map(node => node.className), ['site-header', 'preview-stage', 'welcome-footer']);
    assert.equal(home.querySelector('.brand-name').textContent, 'Zenquarium 3D');
    assert.equal(home.querySelector('.brand-tagline').textContent, 'A little world. A deeper calm.');
    assert.equal($('about-button').getAttribute('aria-label'), 'About Zenquarium 3D');
    assert.equal($('about-button').getAttribute('aria-haspopup'), 'dialog');
    assert.match(w.document.title, /^Zenquarium 3D - /);
    assert.equal(w.document.querySelector('meta[name="apple-mobile-web-app-title"]').content, 'Zenquarium 3D');
    const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.webmanifest'), 'utf8'));
    assert.equal(manifest.name, 'Zenquarium 3D');
    assert.equal(manifest.short_name, 'Zenquarium 3D');
    assert.equal(manifest.id, './', 'The rebrand changed the installed app identity');
    const artwork = new w.DOMParser().parseFromString(fs.readFileSync(path.join(root, 'icon.svg'), 'utf8'), 'image/svg+xml');
    const logoPaths = [...artwork.querySelectorAll('#enso-mark > path')].map(node => node.getAttribute('d'));
    assert.equal(logoPaths.length, 2, 'The Enso mark lost its ring or fish');
    assert.deepEqual([...$('i-enso').querySelectorAll('path')].map(node => node.getAttribute('d')), logoPaths,
        'The inline logo differs from the favicon artwork');
    assert.equal($('about-button').querySelector('use').getAttribute('href'), '#i-enso');
    assert.equal(w.document.querySelector('link[rel="icon"][type="image/png"]').getAttribute('href'), './icons/favicon-32.png');
    for (const [name, size] of [['favicon-32.png', 32], ['icon-192.png', 192], ['icon-512.png', 512],
        ['maskable-512.png', 512], ['apple-touch-icon.png', 180]]) {
        const png = fs.readFileSync(path.join(root, 'icons', name));
        assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', `${name} is not a PNG`);
        assert.equal(png.readUInt32BE(16), size, `${name} has the wrong width`);
        assert.equal(png.readUInt32BE(20), size, `${name} has the wrong height`);
    }
    for (const id of ['best-score', 'achievement-count', 'progress-button', 'resume-button']) {
        assert(footer.contains($(id)), `${id} is not in the bottom rail`);
    }
    assert.equal($('progress-button').tagName, 'BUTTON');
    assert.equal($('progress-button').type, 'button');
    assert($('progress-button').classList.contains('lifetime-stats'));
    assert.equal($('progress-button').getAttribute('aria-label'), 'View your progress');
    assert.equal($('progress-button').getAttribute('aria-controls'), 'tray');
    assert($('progress-button').contains($('best-score')) && $('progress-button').contains($('achievement-count')),
        'The progress trigger does not contain both footer statistics');
    assert.equal($('progress-button').querySelector('button, a, .icon'), null, 'The footer retains a separate progress link');
    assert.equal($('resume-note'), null);
    assert.equal(typeof resizeObservers.get(viewport), 'function');
    resizeObservers.get(viewport)();
    assert.equal(w.document.body.style.getPropertyValue('--preview-top'), '0px');
    const picker = w.document.querySelector('.world-picker');
    assert(picker.contains($('theme-options')) && picker.contains($('begin-button')),
        'Theme selection and Start are not grouped together');
    assert(!picker.contains($('resume-button')), 'Resume is mixed into the new-aquarium chooser');
    assert.equal(footer.querySelector('.original-link'), null, 'The original-game link remains in the footer');
    const initialTheme = w.document.querySelector('.theme-option[aria-pressed="true"]');
    const initialSave = w.localStorage.getItem(evaluate('ZQ.STORAGE_KEY'));
    const initialProfile = evaluate('JSON.stringify(ZQApp.profile)');
    $('about-button').focus();
    $('about-button').click();
    assert($('panel').open, 'The branding did not open About');
    assert.equal($('panel-title').textContent, 'Zenquarium 3D');
    const aboutHeading = $('panel').querySelector('.panel-heading');
    assert(aboutHeading.contains($('panel-logo')) && !$('panel-logo').hidden);
    assert.equal($('panel-logo').querySelector('use').getAttribute('href'), '#i-enso');
    assert.equal($('panel-title').nextElementSibling, $('panel-version'));
    assert(!$('panel-version').hidden && $('panel-eyebrow').hidden);
    assert.equal($('about-close'), null, 'About still has a Done button');
    assert.equal($('panel-content').firstElementChild, $('about-tagline'));
    assert.equal($('about-tagline').textContent, 'A little world. A deeper calm.');
    assert($('about-tagline').classList.contains('brand-tagline'));
    assert.equal($('about-tagline').querySelector('span').textContent, 'A deeper calm.');
    assert.equal($('about-tagline').nextElementSibling, $('about-description'));
    assert.equal(w.document.activeElement, $('about-tagline'), 'About did not begin at its tagline');
    assert.match(evaluate('ZQApp.version'), /^\d+\.\d+\.\d+$/);
    assert.equal($('app-version').textContent, evaluate('ZQApp.version'));
    assert($('panel-content').textContent.includes('No account is needed.'));
    assert($('panel-content').textContent.includes('Your aquarium and progress are saved on this device, not sent to analytics.'));
    assert($('panel-content').textContent.includes('The hosted site uses Vercel Web Analytics'));
    assert($('panel-content').textContent.includes('This is telemetry, separate from your saved progress.'));
    assert(!/No accounts, telemetry, or external services/.test($('panel-content').textContent),
        'About still claims analytics-free operation');
    const analyticsPrivacy = $('panel-content').querySelector('a[href="https://vercel.com/docs/analytics/privacy-policy"]');
    assert(analyticsPrivacy && analyticsPrivacy.target === '_blank' && analyticsPrivacy.relList.contains('noopener'),
        'About is missing a safe link to the analytics privacy disclosure');
    assert(!/GitHub Pages|IP addresses/.test($('panel-content').textContent), 'About assumes an online hosting provider');
    const originalLink = $('panel-content').querySelector('.original-link');
    assert.equal(originalLink.href, 'https://rmauceri.github.io/zenquarium');
    assert.equal(originalLink.target, '_blank');
    assert(originalLink.relList.contains('noopener'));
    assert.equal(evaluate('ZQApp.game'), null, 'Opening About started a game');
    assert.equal(evaluate('JSON.stringify(ZQApp.profile)'), initialProfile, 'Opening About changed progress');
    assert.equal(w.localStorage.getItem(evaluate('ZQ.STORAGE_KEY')), initialSave, 'Opening About changed the save');
    assert.equal(frame, null, 'About did not suspend the preview');
    const outsideAbout = new w.MouseEvent('pointerdown', { bubbles: true, cancelable: true });
    w.document.body.dispatchEvent(outsideAbout);
    assert(!$('panel').open && outsideAbout.defaultPrevented, 'About did not consume its outside-dismiss tap');
    $('about-button').click();
    $('panel').dispatchEvent(new w.Event('cancel', { cancelable: true }));
    assert(!$('panel').open, 'Escape did not dismiss About');
    console.log('PASS Zenquarium 3D branding opens About with version, privacy and original-game link without changing progress');
    $('progress-button').focus();
    $('best-score').click();
    assert.equal($('tray').dataset.kind, 'progress');
    assert.equal($('tray-title').textContent, 'Your progress.');
    assert.match($('progress-button').textContent, /PERSONAL BEST/);
    assert.match($('progress-button').textContent, /DISCOVERIES/);
    assert(!/Progress/.test($('progress-button').textContent), 'The footer retains a visible Progress label');
    assert(!$('progress-welcome').hidden, 'A genuinely new profile has no welcome');
    assert($('progress-records').hidden && $('completed-sessions').hidden, 'A new player sees a wall of zero statistics');
    assert($('earned-discoveries').hidden && !$('remaining-discoveries').open);
    assert.equal($('next-discovery-name').textContent, 'First Fish');
    assert.equal($('next-discovery-description').textContent, 'Buy your first fish.');
    assert.equal($('tray-content').querySelectorAll('.session-stats > div').length, 6);
    assert.equal($('tray-content').querySelectorAll('[data-achievement]').length, 20);
    for (const card of $('remaining-discovery-grid').children) {
        assert(card.querySelector('.achievement-top').contains(card.querySelector('h3')),
            'A discovery title takes up a separate header row');
        assert(card.querySelector('.achievement-bonus').textContent.endsWith(' pts'));
        assert(card.querySelector('time').hidden && !card.querySelector('small'),
            'An unearned discovery repeats the collection status');
    }
    assert.equal(evaluate('ZQApp.game'), null, 'Opening progress started a game');
    assert.equal(w.localStorage.getItem(evaluate('ZQ.STORAGE_KEY')), initialSave, 'Opening progress changed the save');
    key('keydown', 'Escape');
    assert($('tray').hidden);
    assert.equal(w.document.activeElement, $('progress-button'), 'Closing progress lost its trigger focus');
    $('achievement-count').click();
    assert.equal($('tray').dataset.kind, 'progress', 'The discoveries statistic does not open progress');
    assert(!$('tray').hidden);
    key('keydown', 'Escape');
    $('journal-button').click();
    assert.equal($('tray-content').querySelector('[data-tab="guide"]').getAttribute('aria-pressed'), 'true');
    assert.equal($('tray-content').querySelector('[data-tab="guide"]').textContent, 'How to play');
    const guideSections = [...$('tray-content').querySelectorAll('.guide-section')];
    assert.deepEqual(guideSections.map(section => section.id),
        ['guide-care', 'guide-defenses', 'guide-breeding', 'guide-scoring', 'guide-prizes', 'guide-controls', 'guide-saving', 'guide-keyboard']);
    assert(guideSections.every(section => !section.open && section.firstElementChild.tagName === 'SUMMARY'),
        'The guide does not start with collapsed, native disclosures');
    const guideWordCount = node => node.textContent.trim().split(/\s+/).length;
    assert(guideWordCount($('tray-content').querySelector('.guide-intro')) <= 55,
        'The How to play introduction became another long reference');
    assert(guideWordCount($('tray-content')) <= 500, 'The touch-first guide is no longer concise');
    for (const section of guideSections) {
        assert(guideWordCount(section) <= (section.id === 'guide-keyboard' ? 90 : 65),
            `${section.id} has grown beyond a short, scannable section`);
        if (section.id !== 'guide-keyboard') {
            assert(!/\b(?:Escape|Enter|[Kk]eyboard)\b|\b(?:[Pp]ress|[Hh]old) [A-Z]\b/.test(section.textContent),
                `${section.id} mixes keyboard shortcuts into touch instructions`);
        }
    }
    assert.equal($('guide-keyboard').nextElementSibling, null, 'Keyboard shortcuts are not in their own final section');
    assert($('guide-context').hidden, 'Home guidance adds an unnecessary animation-status note');
    assert($('guide-care').textContent.includes('Tap Feed, then tap the water'));
    assert($('guide-care').textContent.includes('You still defend against visitors'));
    assert.equal($('guide-defenses').querySelectorAll('li').length, 3);
    assert($('guide-defenses').textContent.includes('hold it while it coils'));
    assert(guideWordCount($('guide-saving')) <= 45, 'Saving guidance includes more than the essentials');
    assert($('guide-saving').textContent.includes('Resume last session'));
    assert($('guide-saving').textContent.includes("Nothing changes while you're away"));
    assert($('guide-saving').textContent.includes('Starting a new aquarium replaces the saved one'));
    const sharedScoring = $('guide-scoring').querySelector('.scoring-guide').innerHTML;
    assert(sharedScoring.includes(evaluate("`${ZQ.CONFIG.defenseRewardMin}\u2013${ZQ.CONFIG.defenseRewardMax}`")));
    assert(sharedScoring.includes('without the multiplier'));
    assert(sharedScoring.includes('fade without interrupting play'));
    key('keydown', 'Escape');
    console.log('PASS Home Progress welcomes a new player without starting, saving, or displaying zero-filled records');
    for (const button of w.document.querySelectorAll('.theme-option')) {
        const previewBeforeHover = $('scene-name').textContent;
        button.dispatchEvent(new w.MouseEvent('mouseover', { bubbles: true }));
        assert.equal($('scene-name').textContent, previewBeforeHover, 'Hovering changed the preview');
        assert.equal(evaluate('ZQApp.game'), null, 'Hovering started a game');
        button.click();
        const theme = evaluate(`ZQ.THEMES['${button.dataset.theme}']`);
        assert.equal($('scene-name').textContent, theme.name);
        assert.equal($('scene-subtitle').textContent, theme.subtitle);
        assert.equal($('scene-description').textContent, theme.description);
        assert.equal(w.document.documentElement.style.getPropertyValue('--cp-aquarium-accent'),
            (theme.welcomeUi || theme.ui).accent, 'The preview ignored the configured accent');
        assert.equal($('begin-label').textContent, 'Start');
        assert.equal(button.querySelector('.theme-description').textContent, theme.description);
        assert(button.getAttribute('aria-label').includes(theme.description));
        assert.equal(button.getAttribute('aria-pressed'), 'true');
        assert.equal(w.document.querySelectorAll('.theme-option[aria-pressed="true"]').length, 1);
        assert.equal(button.querySelector('use').getAttribute('href'), '#i-check');
        assert.equal(evaluate('ZQApp.game'), null, 'Previewing a theme started a game');
        assert.equal(w.localStorage.getItem(evaluate('ZQ.STORAGE_KEY')), initialSave, 'Previewing wrote a save');
    }
    initialTheme.click();
    console.log('PASS Theme selection, preview, checkmark and grouped Start label agree; hover does not select or launch');
    const initialVolume = evaluate('ZQApp.settings.volume');
    $('sound-button').focus(); $('sound-button').click();
    assert.equal($('tray').dataset.kind, 'volume');
    assert.equal($('tray').dataset.anchor, 'sound');
    assert.equal($('sound-button').getAttribute('aria-expanded'), 'true');
    assert(evaluate('ZQApp.settings.sound'), 'Opening sound controls muted the first-run sound');
    $('dock-volume').value = '45'; $('dock-volume').dispatchEvent(new w.Event('input', { bubbles: true }));
    $('volume-mute').click();
    assert.equal(stored().settings.sound, false, 'Muting was not saved');
    assert.equal(evaluate('audioCalls.at(-1)'), 'disable', 'Muting left the soundscape enabled');
    $('volume-mute').click();
    assert.equal(stored().settings.sound, true, 'Enabling sound was not saved');
    assert.equal(evaluate('ZQApp.settings.volume'), 0.45, 'Muting lost the preferred volume');
    $('dock-volume').value = String(initialVolume * 100);
    $('dock-volume').dispatchEvent(new w.Event('input', { bubbles: true }));
    key('keydown', 'Escape');
    assert.equal(w.document.activeElement, $('sound-button'));
    assert.equal($('sound-button').getAttribute('aria-expanded'), 'false');
    assert.equal(evaluate('ZQApp.game'), null);
    console.log('PASS Welcome sound uses the shared light-dismiss volume flyout without starting a tank or discarding mute volume');
    assert(evaluate('ZQApp.settings.sound'));
    pump(3);
    const homeRenderer = evaluate('ZQApp.renderer');
    const homeProfile = evaluate('JSON.stringify(ZQApp.profile)');
    const retainedAquarium = JSON.stringify(stored().session);
    for (const id of ['journal-button', 'settings-button', 'progress-button']) {
        const scene = homeRenderer.renderedState, elapsed = scene.elapsed, visual = homeRenderer.renderTime;
        const draws = homeRenderer.renderCount;
        const audioBefore = evaluate('audioCalls.length');
        $(id).focus(); $(id).click();
        pump(20);
        assert(frame, `${id} stopped the live preview loop`);
        assert(homeRenderer.renderCount > draws, `${id} stopped drawing the preview`);
        assert(scene.elapsed > elapsed, `${id} stopped simulating the preview`);
        assert(homeRenderer.renderTime > visual, `${id} froze the animated scene`);
        assert.equal(evaluate('audioCalls.length'), audioBefore, `${id} interrupted the soundtrack`);
        assert.equal(evaluate('JSON.stringify(ZQApp.profile)'), homeProfile, 'Reading changed lifetime progress');
        assert.equal(JSON.stringify(stored().session), retainedAquarium, 'Reading changed the retained aquarium');
        const beforeResize = homeRenderer.renderCount;
        resizeObservers.get(viewport)();
        pump(3);
        assert(homeRenderer.renderCount > beforeResize && frame, 'Resizing a home panel stopped the live preview');
        if (id === 'settings-button') {
            const quality = evaluate('ZQApp.settings.quality'), motion = evaluate('ZQApp.settings.motion');
            for (const [setting, value] of [['quality', 'battery'], ['motion', 'reduced'], ['quality', quality], ['motion', motion]]) {
                const before = homeRenderer.renderCount, beforeTime = scene.elapsed;
                $(`setting-${setting}`).value = value;
                $(`setting-${setting}`).dispatchEvent(new w.Event('change', { bubbles: true }));
                pump(3);
                assert(homeRenderer.renderCount > before && frame, `Changing ${setting} froze the preview`);
                assert(scene.elapsed > beforeTime, `Changing ${setting} stopped the demo`);
            }
            assert.equal(evaluate('audioCalls.length'), audioBefore, 'Display changes interrupted the soundtrack');
        }
        if (id === 'journal-button') {
            $('guide-defenses').open = true;
            const disclosureAudio = evaluate('audioCalls.length');
            pump(5);
            assert($('guide-defenses').open, 'The guide collapsed while reading');
            assert(frame, 'Expanding guidance stopped the preview');
            assert.equal(evaluate('audioCalls.length'), disclosureAudio);
            $('tray-content').querySelector('[data-tab="achievements"]').click();
            pump(3);
            assert(frame, 'Switching to discoveries stopped the home preview');
            $('tray-content').querySelector('[data-tab="guide"]').click();
            assert.equal($('guide-scoring').querySelector('.scoring-guide').innerHTML, sharedScoring);
        }
        key('keydown', 'Escape');
        assert.equal(w.document.activeElement, $(id), 'Dismissal lost the home-panel trigger');
        const beforeDismiss = scene.elapsed;
        pump(2);
        assert(scene.elapsed > beforeDismiss && frame, 'Dismissing a home panel stopped the preview');
        assert.equal(evaluate('audioCalls.length'), audioBefore, 'Dismissal restarted the soundtrack');
    }
    const aboutTime = homeRenderer.renderedState.elapsed, aboutDraws = homeRenderer.renderCount;
    $('about-button').focus(); $('about-button').click();
    pump(20);
    assert.equal(frame, null, 'About stopped suspending the preview');
    assert.equal(homeRenderer.renderCount, aboutDraws);
    assert.equal(homeRenderer.renderedState.elapsed, aboutTime);
    assert.equal(evaluate('audioCalls.at(-1)'), 'suspend', 'About stopped suspending audio');
    $('panel').dispatchEvent(new w.Event('cancel', { cancelable: true }));
    pump(3);
    assert(homeRenderer.renderedState.elapsed > aboutTime && frame, 'Closing About did not restore the live view');
    assert.equal(evaluate('audioCalls.at(-1)'), 'enable', 'Closing About did not restore the soundtrack');
    $('journal-button').focus(); $('journal-button').click();
    const hiddenDescriptor = Object.getOwnPropertyDescriptor(w.document, 'hidden');
    const backgroundTime = homeRenderer.renderedState.elapsed;
    try {
        Object.defineProperty(w.document, 'hidden', { value: true, configurable: true });
        w.document.dispatchEvent(new w.Event('visibilitychange'));
        assert.equal(evaluate('audioCalls.at(-1)'), 'suspend', 'Backgrounding failed to suspend home audio');
        assert.equal(frame, null);
        pump(20);
        assert.equal(homeRenderer.renderedState.elapsed, backgroundTime, 'The hidden preview kept simulating');
        Object.defineProperty(w.document, 'hidden', { value: false, configurable: true });
        w.document.dispatchEvent(new w.Event('visibilitychange'));
        pump(1);
        assert.equal(homeRenderer.renderedState.elapsed, backgroundTime, 'The preview caught up on time spent away');
        pump(3);
        assert(frame, 'Foregrounding left the preview frozen behind the guide');
        assert(homeRenderer.renderedState.elapsed > backgroundTime);
        assert.equal(evaluate('audioCalls.at(-1)'), 'enable', 'Foregrounding left the chosen soundtrack suspended');
    } finally {
        if (hiddenDescriptor) Object.defineProperty(w.document, 'hidden', hiddenDescriptor);
        else delete w.document.hidden;
    }
    $('sound-button').focus(); $('sound-button').click();
    pump(3);
    assert(frame, 'The home sound flyout stopped the live preview');
    $('volume-mute').click(); key('keydown', 'Escape');
    assert(!evaluate('ZQApp.settings.sound'));
    assert.equal(w.document.activeElement, $('sound-button'));
    $('progress-button').click();
    const outsideReader = new w.MouseEvent('pointerdown', { bubbles: true, cancelable: true });
    w.document.body.dispatchEvent(outsideReader);
    assert($('tray').hidden && outsideReader.defaultPrevented, 'The home reader did not consume its outside-dismiss tap');
    pump(3);
    assert(frame, 'Outside dismissal stopped the preview');
    console.log('PASS Home panels keep the preview and soundtrack live, About still suspends both, and background return resumes without catch-up');
    $('begin-button').click(); pump(2);
    const initialGame = JSON.parse(evaluate('JSON.stringify(ZQApp.game.snapshot())'));
    assert.equal(initialGame.themeId, initialTheme.dataset.theme);
    assert(stored().session, 'Starting did not create a best-effort initial checkpoint');
    assert.equal(evaluate('ZQApp.save()'), true);
    assert.equal(stored().session.elapsed, 0, 'A routine preference save unexpectedly rebuilt the checkpoint');
    returnHome();
    assert(!$('resume-card').hidden && !$('resume-button').hidden);
    const resumeLabel = 'Resume last session';
    assert.equal($('resume-button').textContent, resumeLabel);
    assert.equal($('resume-button').getAttribute('aria-label') || $('resume-button').textContent, resumeLabel);
    const savedAquarium = w.localStorage.getItem(evaluate('ZQ.STORAGE_KEY'));
    assert.equal(stored().session.elapsed, initialGame.elapsed);
    assert.equal(stored().session.paused, true);
    $('progress-button').focus(); $('progress-button').click();
    assert($('progress-welcome').hidden && !$('progress-records').hidden,
        'An unfinished, resumable aquarium was mistaken for an empty profile');
    assert.equal($('lifetime-sessions').textContent, '0');
    assert.equal($('lifetime-population').textContent, '2');
    assert.equal($('lifetime-milestone').textContent, 'Not yet');
    assert(!$('completed-sessions').open, 'Completed-session metrics crowd out ongoing progress');
    assert.equal(w.localStorage.getItem(evaluate('ZQ.STORAGE_KEY')), savedAquarium);
    key('keydown', 'Escape');
    $('about-button').click();
    assert.equal(evaluate('ZQApp.game'), null);
    assert.equal(w.localStorage.getItem(evaluate('ZQ.STORAGE_KEY')), savedAquarium, 'About replaced the resumable aquarium');
    $('panel').dispatchEvent(new w.Event('cancel', { cancelable: true }));
    for (const id of ['journal-button', 'settings-button', 'progress-button']) {
        $(id).click(); pump(3);
        assert.equal(w.localStorage.getItem(evaluate('ZQ.STORAGE_KEY')), savedAquarium,
            `${id} modified an existing retained aquarium or lifetime profile`);
        key('keydown', 'Escape');
    }
    for (const button of w.document.querySelectorAll('.theme-option')) {
        button.click();
        assert.equal($('begin-label').textContent, 'Start');
        assert.equal($('resume-button').textContent, resumeLabel, 'A preview changed the Resume destination');
        assert.equal(w.localStorage.getItem(evaluate('ZQ.STORAGE_KEY')), savedAquarium, 'A preview changed the saved round');
        assert.equal(evaluate('ZQApp.game'), null);
    }
    $('resume-button').click();
    assert(stored().session, 'Resuming lost its recoverable checkpoint');
    assert.equal(evaluate('ZQApp.game.state.themeId'), initialGame.themeId, 'Resume started the previewed theme');
    assert.equal(evaluate('ZQApp.game.state.elapsed'), initialGame.elapsed);
    assert.equal(evaluate('JSON.stringify(ZQApp.game.state.fish.map(f => [f.id, f.sex, f.health, f.hunger]))'),
        JSON.stringify(initialGame.fish.map(f => [f.id, f.sex, f.health, f.hunger])));
    assert.equal(evaluate('ZQApp.profile.sessions'), 0, 'Returning to a saved aquarium finished the round');
    returnHome(); initialTheme.click(); $('resume-button').click();
    console.log('PASS Resume last session stays independent of the preview and preserves saved residents and active time');
    spawn('octopus');
    const yaw = evaluate('ZQApp.renderer.camera.yaw');
    pointer('pointerdown', 600, 400); pointer('pointerup', 600, 400);
    const taps = evaluate('ZQApp.game.state.stats.taps');
    assert.equal(taps, 1, 'A creature click did not stir the water');
    assert(evaluate('ZQApp.game.state.creature.provoked'));
    assert.equal(progress(), 0);
    assert($('toast').hidden, 'A creature tap opened a popup');
    assert($('encounter-hint').textContent.includes('drag outward'));
    swipe(608, 403); assert.equal(progress(), 0);
    swipe(700, 400); assert.equal(progress(), 1);
    assert.equal(evaluate('ZQApp.renderer.camera.yaw'), yaw, 'Defense drag orbited the camera');
    assert.equal(evaluate('ZQApp.game.state.stats.taps'), taps, 'Defense became a glass tap');
    assert($('care-alert').hidden, 'Encounter produced a control alert');
    assert.equal($('encounter-hint').querySelectorAll('button').length, 0);
    assert.equal($('care-action-secondary'), null);
    pump(24); swipe(600, 300, 'touch'); assert.equal(progress(), 2);
    pump(24);
    const quickDefenseScore = evaluate('ZQApp.game.state.score');
    swipe(500, 400, 'touch'); assert(evaluate('ZQApp.game.state.creature.defended'));
    assert.equal(evaluate('ZQApp.game.state.score') - quickDefenseScore, 60);
    assert(!$('toast').hidden && $('toast').textContent.includes('chased away') && $('toast').textContent.includes('pts'),
        'Successful defense had no visible reward confirmation');
    console.log('PASS Mouse/touch outward swipes defend directly without camera movement, stressful taps, or popup controls');

    spawn('crab');
    swipe(600, 300); assert.equal(progress(), 0, 'Vertical drag counted as a claw swipe');
    swipe(500, 400); assert.equal(progress(), 1);
    pump(24); swipe(500, 400); assert.equal(progress(), 1, 'Repeated claw advanced defense');
    pump(24); swipe(700, 400); assert.equal(progress(), 2);
    pump(24); key('keydown', 'j'); assert(evaluate('ZQApp.game.state.creature.defended'));
    assert(evaluate('!!ZQApp.game.state.prizes.arch'));
    console.log('PASS Crab swipe directions alternate and keyboard defenses use the same simulation rules');

    spawn('jellyfish');
    pointer('pointerdown', 645, 400); pointer('pointermove', 600, 400); pointer('pointerup', 600, 400);
    assert.equal(progress(), 0, 'Inward motion counted as an outward swipe');
    pointer('pointerdown', 600, 400); pointer('pointermove', 700, 400);
    pointer('pointercancel', 700, 400); pointer('pointerup', 700, 400);
    assert.equal(progress(), 0, 'Cancelled drag defended');
    pointer('pointerdown', 600, 400, 1, 'touch'); pointer('pointerdown', 700, 400, 2, 'touch');
    pointer('pointermove', 760, 400, 2, 'touch');
    pointer('pointerup', 760, 400, 2, 'touch'); pointer('pointerup', 600, 400, 1, 'touch');
    assert.equal(progress(), 0, 'Pinching became a defense');
    assert.notEqual(evaluate('ZQApp.renderer.camera.zoom'), 1);
    pointer('pointerdown', 200, 200); pointer('pointermove', 260, 230); pointer('pointerup', 260, 230);
    assert.notEqual(evaluate('ZQApp.renderer.camera.yaw'), yaw);
    assert.equal(evaluate('ZQApp.game.state.stats.taps'), taps);
    key('keydown', 'x'); assert.equal(progress(), 1);
    key('keydown', 'x', true); assert.equal(progress(), 1);
    console.log('PASS Inward/cancelled gestures and multitouch do not defend; empty-water drags still orbit');

    for (const kind of ['crab', 'eel', 'octopus', 'jellyfish']) {
        spawn(kind);
        evaluate('ZQApp.game.state.creature.phase="recover"; ZQApp.game.state.creature.phaseTimer=6');
        pointer('pointerdown', 600, 400); pointer('pointerup', 600, 400);
        assert.equal(evaluate('ZQApp.game.state.creature.phase'), 'stalk', `${kind} did not react to a tap`);
        assert(evaluate('ZQApp.game.state.creature.phaseTimer <= 1.2'));
        assert.equal(progress(), 0, 'A wake-up tap became a defense');
    }
    console.log('PASS Brief clicks wake resting crab, eel, and ordinary visitors without replacing their defense gestures');

    spawn('eel');
    evaluate('ZQApp.game.state.creature.phase="windup"; ZQApp.game.state.creature.phaseTimer=2.6');
    pointer('pointerdown', 600, 400); pump(12); pointer('pointerup', 600, 400);
    assert(!evaluate('ZQApp.game.state.creature.defended'));
    assert.equal(evaluate('ZQApp.game.state.creature.holdCharge'), 0);
    pointer('pointerdown', 600, 400); pointer('pointermove', 630, 400); pump(45); pointer('pointerup', 630, 400);
    assert(!evaluate('ZQApp.game.state.creature.defended'), 'Moving away completed a hold');
    evaluate('ZQApp.game.state.creature.phaseTimer=2.6');
    pointer('pointerdown', 600, 400); pump(12); pointer('pointercancel', 600, 400); pump(32);
    assert(!evaluate('ZQApp.game.state.creature.defended'), 'Cancelled hold completed');
    evaluate('ZQApp.game.state.creature.phaseTimer=2.6');
    key('keydown', 'h'); pump(12); key('keyup', 'h'); pump(32);
    assert(!evaluate('ZQApp.game.state.creature.defended'), 'Key release did not cancel a hold');
    evaluate('ZQApp.game.state.creature.phaseTimer=2.6');
    key('keydown', 'h'); pump(48); key('keyup', 'h');
    assert(evaluate('ZQApp.game.state.creature.defended'));
    assert(evaluate('!!ZQApp.game.state.prizes.lantern'));
    console.log('PASS Eel holds require active-time charging; pointer movement/cancel and key release interrupt them');

    spawn('eel');
    evaluate('ZQApp.game.state.creature.phase="windup"; ZQApp.game.state.creature.phaseTimer=2.6');
    pointer('pointerdown', 600, 400); pump(12); key('keydown', ' ');
    assert(evaluate('ZQApp.game.state.paused'));
    assert.equal(evaluate('ZQApp.game.state.creature.holdCharge'), 0);
    key('keydown', ' '); pump(48);
    assert(!evaluate('ZQApp.game.state.creature.defended'));
    evaluate('ZQApp.game.state.creature.phaseTimer=2.6');
    const tapsBeforeHold = evaluate('ZQApp.game.state.stats.taps');
    pointer('pointerdown', 600, 400); pump(48); pointer('pointerup', 600, 400);
    assert(evaluate('ZQApp.game.state.creature.defended'));
    assert.equal(evaluate('ZQApp.game.state.stats.taps'), tapsBeforeHold);
    console.log('PASS Pause clears held gestures; a fresh sustained mouse hold discharges the eel');

    spawn('crab');
    $('menu-button').click();
    assert.equal(w.document.querySelectorAll('[data-menu-action="crab-left"], [data-menu-action="eel-flash"], #menu-visitor button').length, 0);
    key('keydown', 'Escape');
    evaluate('ZQApp.game.state.tankHealth=20; ZQApp.game.state.damage=80');
    pump(20);
    assert.equal($('care-action').dataset.action, 'clean', 'Creature hint displaced critical care');
    assert(!$('encounter-hint').hidden);
    console.log('PASS Encounter hints coexist with critical care and no menu defense controls remain');

    spawn('crab'); swipe(600, 300);
    assert($('encounter-hint').textContent.includes('drag left or right'));
    spawn('eel');
    assert($('encounter-hint').textContent.includes('coil'));
    assert(!$('encounter-hint').textContent.toLowerCase().includes('crab'), 'Crab error leaked into the eel hint');
    spawn('octopus');
    assert($('encounter-hint').textContent.includes('drag outward'));
    assert(!$('encounter-hint').textContent.toLowerCase().includes('crab'), 'Crab error leaked into the octopus hint');
    spawn('crab'); swipe(500, 400); pump(24); swipe(500, 400);
    assert($('encounter-hint').textContent.includes('other claw'));
    spawn('crab');
    assert(!$('encounter-hint').textContent.includes('other claw'), 'Same-species replacement inherited feedback');
    evaluate('ZQApp.game.rejectCreature("Old crab feedback")');
    spawn('octopus');
    assert(!$('encounter-hint').textContent.includes('Old crab feedback'), 'Queued old-encounter event replaced the new hint');
    spawn('crab'); swipe(600, 300); swipe(500, 400);
    assert.equal(progress(), 1);
    assert(!$('encounter-hint').textContent.includes('drag left or right'), 'Successful defense retained an error');
    console.log('PASS Rejection feedback stays with its exact creature, including replacements and queued old events');

    spawn('crab'); swipe(600, 300); pump(130);
    assert(!$('encounter-hint').textContent.includes('drag left or right'), 'Feedback did not expire');
    swipe(600, 300); key('keydown', ' '); key('keydown', ' '); pump(2);
    assert(!$('encounter-hint').textContent.includes('drag left or right'), 'Pause/resume retained stale feedback');
    swipe(600, 300); returnHome(); $('resume-button').click(); pump(2);
    assert(!$('encounter-hint').textContent.includes('drag left or right'), 'Saved encounter inherited old feedback');
    evaluate('ZQApp.game.state.elapsed=200');
    swipe(600, 300); returnHome(); $('begin-button').click(); pump(2);
    spawn('eel');
    assert(evaluate('ZQApp.game.state.elapsed < 1'));
    assert(!$('encounter-hint').textContent.toLowerCase().includes('crab'), 'Restarted clock prolonged stale feedback');
    key('keydown', 'h'); key('keyup', 'h');
    evaluate('ZQApp.game.state.creature.phase="windup"; ZQApp.game.state.creature.phaseTimer=2.6');
    key('keydown', 'h'); pump(6);
    assert($('encounter-hint').textContent.includes('Keep holding'), 'Valid hold retained an earlier rejection');
    key('keyup', 'h');
    console.log('PASS Feedback expires and clears across pause, saved-session resume, and a fresh aquarium');

    spawn('octopus');
    const initialHint = $('encounter-hint').textContent;
    assert(initialHint.includes('drag outward'));
    assert(!$('encounter-hint').hidden);
    assert.equal($('encounter-hint').style.transform, '', 'Hint still tracked and obscured the creature');
    evaluate('ZQApp.game.state.elapsed += 4.5'); pump(1);
    assert(Number($('encounter-hint').style.opacity) < 0.55);
    evaluate('ZQApp.game.state.elapsed += 1'); pump(1);
    assert($('encounter-hint').hidden);
    swipe(608, 403); pump(1);
    assert(!$('encounter-hint').hidden, 'Rejected defense did not explain the required gesture');
    evaluate('ZQApp.game.state.creature.phase="windup"; ZQApp.game.state.creature.phaseTimer=2.6'); pump(1);
    assert(!$('encounter-hint').hidden, 'Next warning did not restore defense instructions');
    key('keydown', ' '); key('keydown', ' '); pump(1);
    assert(!$('encounter-hint').hidden, 'Pause/resume lost active defense help');
    spawn('crab'); assert(!$('encounter-hint').hidden); assert($('encounter-hint').textContent.includes('Crab'));
    spawn('eel');
    evaluate('ZQApp.game.state.creature.entered=false; ZQApp.game.state.creature.pos[0]=ZQApp.game.state.bounds.width+1'); pump(1);
    assert($('encounter-hint').hidden);
    evaluate('ZQApp.game.state.elapsed+=10; ZQApp.game.state.creature.entered=true; ZQApp.game.state.creature.pos=[0,0,0]'); pump(1);
    assert(!$('encounter-hint').hidden && $('encounter-hint').textContent.includes('coil'),
        'Entry consumed the eel instructions before it reached the tank');
    console.log('PASS Encounter help fades away from the visitor and returns for warnings or rejected gestures');

    evaluate('ZQApp.game.state.creature=null; ZQApp.game.state.attacks=[]; ZQApp.game.state.food=[]; ZQApp.game.state.score=500');
    const foodCount = () => evaluate('ZQApp.game.state.food.length');
    const score = evaluate('ZQApp.game.state.score');
    const tapsBeforeFood = evaluate('ZQApp.game.state.stats.taps');
    $('feed-button').click();
    assert($('placement-controls').hidden, 'Food drop mode opened a control panel');
    assert($('placement-marker').hidden, 'Food drop mode added a targeting overlay');
    assert.equal($('feed-button').getAttribute('aria-pressed'), 'true');
    assert.equal(foodCount(), 0, 'Entering aim mode spent food');
    assert.equal(evaluate('ZQApp.game.state.score'), score);
    key('keydown', 'Escape'); assert($('placement-controls').hidden); assert.equal(foodCount(), 0);
    $('feed-button').click();
    pointer('pointerdown', 680, 640); pointer('pointerup', 680, 640);
    assert.equal(evaluate('ZQApp.game.state.score'), score - 5);
    assert(evaluate('ZQApp.game.state.food.every(f=>Math.abs(f.pos[0]-1)<=.4 && Math.abs(f.pos[1]+2.4)<=.12 && Math.abs(f.pos[2]-2.4)<=.35)'));
    assert($('placement-controls').hidden);
    evaluate('ZQApp.game.state.food=[]');
    key('keydown', 'f');
    const beforeAimYaw = evaluate('ZQApp.renderer.camera.yaw');
    key('keydown', 'ArrowRight'); key('keydown', 'ArrowUp'); key('keydown', 'Enter');
    assert(evaluate('ZQApp.game.state.food.every(f=>Math.abs(f.pos[0]-.25)<=.4 && Math.abs(f.pos[2]+.25)<=.35)'));
    assert.equal(evaluate('ZQApp.renderer.camera.yaw'), beforeAimYaw);
    evaluate('ZQApp.game.state.food=[]');
    key('keydown', 'f'); pointer('pointerdown', 850, 550, 1, 'touch');
    pointer('pointercancel', 850, 550, 1, 'touch'); pointer('pointerup', 850, 550, 1, 'touch');
    assert.equal(foodCount(), 0); assert($('placement-controls').hidden);
    key('keydown', 'f'); pointer('pointerdown', 850, 550, 1, 'touch');
    pointer('pointerdown', 950, 550, 2, 'touch');
    pointer('pointerup', 950, 550, 2, 'touch'); pointer('pointerup', 850, 550, 1, 'touch');
    assert.equal(foodCount(), 0);
    key('keydown', 'f'); pointer('pointerdown', 680, 640, 1, 'touch'); pointer('pointerup', 680, 640, 1, 'touch');
    assert(foodCount() > 0);
    evaluate('ZQApp.game.state.food=[]; ZQApp.game.state.fish[0].pos=[-2,1,-1.5]');
    key('keydown', 'f'); pointer('pointerdown', 450, 350); pointer('pointerup', 450, 350);
    assert(evaluate('ZQApp.game.state.food.every(f=>Math.abs(f.pos[0]+1.875)<=.4 && Math.abs(f.pos[1]-.5)<=.12 && Math.abs(f.pos[2]+.5)<=.35)'),
        'A clicked fish was followed instead of dropping at the clicked water position');
    evaluate('ZQApp.game.state.food=[]');
    const waterDropScore = evaluate('ZQApp.game.state.score');
    key('keydown', 'f'); pointer('pointerdown', 1100, 200); pointer('pointerup', 1100, 200);
    assert(foodCount() > 0); assert.equal(evaluate('ZQApp.game.state.score'), waterDropScore - 5);
    assert.equal($('feed-button').getAttribute('aria-pressed'), 'false');
    assert.equal(evaluate('ZQApp.game.state.stats.taps'), tapsBeforeFood, 'Targeted food tapped the glass');
    key('keydown', 'f'); key('keydown', ' '); assert($('placement-controls').hidden);
    key('keydown', ' '); pump(1);
    evaluate('ZQApp.game.state.food=[]');
    let normalScore = evaluate('ZQApp.game.state.score');
    $('feed-button').click(); clock += 120; $('feed-button').click();
    assert(foodCount() > 0); assert.equal(evaluate('ZQApp.game.state.score'), normalScore - 5);
    assert(evaluate('ZQApp.game.state.food.every(f=>Math.abs(f.pos[0])<=.75 && f.pos[1]>=ZQApp.game.state.bounds.surface-.5 && f.pos[1]<=ZQApp.game.state.bounds.surface-.25)'));
    assert.equal($('feed-button').getAttribute('aria-pressed'), 'false');
    evaluate('ZQApp.game.state.food=[]');
    normalScore = evaluate('ZQApp.game.state.score');
    $('feed-button').dispatchEvent(new w.MouseEvent('click', { bubbles: true, detail: 1 }));
    clock += 180;
    $('feed-button').dispatchEvent(new w.MouseEvent('click', { bubbles: true, detail: 1 }));
    assert(foodCount() > 0); assert.equal(evaluate('ZQApp.game.state.score'), normalScore - 5, 'Touch double-tap charged twice');
    evaluate('ZQApp.game.state.food=[]');
    $('feed-button').click(); clock += 500; $('feed-button').click();
    assert.equal(foodCount(), 0, 'Two separate taps incorrectly became a double-tap');
    pointer('pointerdown', 900, 200); pointer('pointerup', 900, 200);
    assert(foodCount() > 0);
    evaluate('ZQApp.game.state.food=[]');
    normalScore = evaluate('ZQApp.game.state.score');
    $('feed-button').click(); pointer('pointerdown', 200, 200); pointer('pointermove', 280, 240); pointer('pointerup', 280, 240);
    assert.equal(foodCount(), 0); assert.equal(evaluate('ZQApp.game.state.score'), normalScore);
    assert.equal($('feed-button').getAttribute('aria-pressed'), 'false', 'Camera drag kept food armed');
    evaluate('ZQApp.game.state.food=Array.from({length:90},()=>({pos:[0,0,0],age:0,speed:.3,phase:0}))');
    $('feed-button').click(); pointer('pointerdown', 900, 200); pointer('pointerup', 900, 200);
    assert.equal(evaluate('ZQApp.game.state.score'), normalScore);
    assert.equal($('feed-button').getAttribute('aria-pressed'), 'false');
    assert(!$('toast').hidden, 'A full-water rejection was silent');
    evaluate('ZQApp.game.state.food=[]');
    console.log('PASS Feed uses a bare next-click drop or one normal double-tap drop; cancelled gestures never charge');

    $('shop-button').focus(); $('shop-button').click();
    assert($('catalog').open); assert($('tray').hidden); assert(!$('panel').open);
    const previews = [...w.document.querySelectorAll('#catalog .fish-preview')];
    assert.equal(previews.length, 4);
    assert.equal(new Set(previews.map(p => p.getAttribute('data-species'))).size, 4);
    assert(previews.every(p => p.querySelector('ellipse') && !p.querySelector('use')));
    const beforeCatalogTime = evaluate('ZQApp.game.state.elapsed');
    pump(10); assert(evaluate('ZQApp.game.state.elapsed') > beforeCatalogTime, 'Catalog paused the world');
    const bought = evaluate('ZQApp.game.state.stats.bought');
    w.document.querySelector('#catalog [data-buy="2"]').click();
    assert.equal(evaluate('ZQApp.game.state.stats.bought'), bought + 1);
    assert($('catalog').open);
    const beforeDismissTaps = evaluate('ZQApp.game.state.stats.taps');
    pointer('pointerdown', 100, 100); pointer('pointerup', 100, 100);
    assert(!$('catalog').open);
    assert.equal(evaluate('ZQApp.game.state.stats.taps'), beforeDismissTaps);
    $('shop-button').click(); key('keydown', 'Escape'); assert(!$('catalog').open);
    $('shop-button').click(); key('keydown', 'Escape'); assert(!$('catalog').open);
    assert.equal(w.document.activeElement.id, 'shop-button');
    console.log('PASS Species previews, live repeat purchases, outside-click/Escape dismissal, and focus return work in the catalog');

    evaluate(`{
        const g=ZQApp.game; g.state.stats.born=1; g.state.score=1200; g.checkPrizes();
        for(const id of g.state.equippedPrizes.slice()) if(id!=='chest') g.equipPrize(id);
        g.state.score=500;
    }`);
    const beforePrizeYaw = evaluate('ZQApp.renderer.camera.yaw');
    key('keydown', 't');
    const original = evaluate("ZQApp.game.state.prizePositions.chest.slice()");
    w.document.querySelector('[data-prize-move="chest"]').click();
    assert(!$('placement-controls').hidden); assert($('tray').hidden);
    assert.equal(w.document.activeElement.id, 'viewport');
    key('keydown', 'ArrowRight');
    assert.equal(evaluate('ZQApp.renderer.camera.yaw'), beforePrizeYaw);
    key('keydown', 'Escape');
    assert.deepEqual(evaluate('ZQApp.game.state.prizePositions.chest.slice()'), original);
    key('keydown', 't'); w.document.querySelector('[data-prize-move="chest"]').click();
    key('keydown', 'ArrowRight'); key('keydown', 'Enter');
    assert.equal(evaluate('ZQApp.game.state.prizePositions.chest[0]'), original[0] + 0.25);
    assert($('placement-controls').hidden);
    const moved = evaluate('ZQApp.game.state.prizePositions.chest.slice()');
    const dragYaw = evaluate('ZQApp.renderer.camera.yaw');
    pointer('pointerdown', 300, 650); pointer('pointermove', 310, 650); pointer('pointerup', 310, 650);
    assert(Math.abs(evaluate('ZQApp.game.state.prizePositions.chest[0]') - (moved[0] + 0.25)) < 1e-9);
    assert.equal(evaluate('ZQApp.renderer.camera.yaw'), dragYaw);
    const afterDrag = evaluate('ZQApp.game.state.prizePositions.chest.slice()');
    pointer('pointerdown', 300, 650, 1, 'touch'); pointer('pointermove', 320, 650, 1, 'touch');
    pointer('pointercancel', 320, 650, 1, 'touch'); pointer('pointerup', 320, 650, 1, 'touch');
    assert.deepEqual(evaluate('ZQApp.game.state.prizePositions.chest.slice()'), afterDrag);
    pointer('pointerdown', 300, 650, 1, 'touch'); pointer('pointermove', 320, 650, 1, 'touch');
    pointer('pointerdown', 400, 650, 2, 'touch'); pointer('pointerup', 400, 650, 2, 'touch'); pointer('pointerup', 320, 650, 1, 'touch');
    assert.deepEqual(evaluate('ZQApp.game.state.prizePositions.chest.slice()'), afterDrag);
    pointer('pointerdown', 300, 650); pointer('pointermove', 2000, 650); pointer('pointerup', 2000, 650);
    assert.deepEqual(evaluate('ZQApp.game.state.prizePositions.chest.slice()'), afterDrag);
    assert(!$('toast').hidden, 'Invalid movement did not explain why placement failed');
    pointer('pointerdown', 300, 650); pointer('pointerup', 300, 650);
    assert(evaluate('ZQApp.game.state.prizeEffects.chest > 0'));
    console.log('PASS Sand dragging and keyboard Move preserve camera controls; invalid/cancelled/multitouch gestures keep saved positions');

    key('keydown', 't'); w.document.querySelector('[data-prize-move="chest"]').click();
    key('keydown', 'ArrowRight');
    assert(evaluate('!!ZQApp.renderer.prizePreview'));
    returnHome();
    assert(!evaluate('ZQApp.renderer.prizePreview'), 'Welcome demo inherited a placement preview');
    $('resume-button').click(); pump(1);
    assert.deepEqual(evaluate('ZQApp.game.state.prizePositions.chest.slice()'), afterDrag);
    assert(evaluate('!!ZQApp.game.state.prizes.chest'));
    key('keydown', 'f'); key('keydown', 'i');
    assert($('placement-controls').hidden, 'Immersion hid the controls but kept an active placement');
    key('keydown', 'i');
    returnHome(); $('begin-button').click(); pump(1);
    assert.equal(evaluate('Object.keys(ZQApp.game.state.prizes).length'), 0);
    assert.equal(evaluate('ZQApp.game.state.equippedPrizes.length'), 0);
    key('keydown', 't');
    assert(w.document.querySelector('[data-equip="chest"]').disabled);
    assert($('prize-placement-count').textContent.includes('0 of 4 earned this round'));
    console.log('PASS Resume retains this round’s collection and placements; starting anew resets prizes and tray progress');

    key('keydown', 'Escape');
    const tapsBeforeDismiss = evaluate('ZQApp.game.state.stats.taps');
    $('score-button').focus(); $('score-button').click();
    assert.equal($('tray').dataset.kind, 'score');
    assert.equal($('tray-content').querySelector('.scoring-guide').innerHTML, sharedScoring,
        'Guide and dashboard scoring explanations drifted apart');
    w.document.querySelector('[data-menu-action="progress"]').click();
    assert.equal($('tray').dataset.kind, 'progress');
    assert.equal($('tray').dataset.anchor, 'health', 'Lifetime progress moved away from its in-game entry point');
    assert.equal($('lifetime-score').textContent, evaluate('Math.floor(ZQApp.profile.highScore).toLocaleString()'));
    assert.equal($('lifetime-population').textContent, evaluate('Math.floor(ZQApp.profile.stats.peak).toLocaleString()'));
    assert.equal($('lifetime-milestone').textContent,
        evaluate("ZQ.MILESTONES.find(m => m.id === ZQApp.profile.bestMilestone)?.name || 'Not yet'"));
    const progressTime = evaluate('ZQApp.game.state.elapsed');
    pump(15);
    assert(evaluate('ZQApp.game.state.elapsed') > progressTime && frame, 'Lifetime progress interrupted the aquarium');
    pointer('pointerdown', 1000, 700); pointer('pointerup', 1000, 700);
    assert($('tray').hidden, 'Lifetime progress did not light-dismiss');
    assert.equal(w.document.activeElement, $('score-button'), 'Progress lost the aquarium status trigger');
    assert.equal(evaluate('ZQApp.game.state.stats.taps'), tapsBeforeDismiss);

    returnHome();
    $('begin-button').click();
    assert(!$('panel').open && evaluate('ZQApp.game !== null'), 'Entering a new aquarium added a confirmation');
    $('menu-button').click();
    w.document.querySelector('[data-menu-action="settings"]').click();
    assert(!$('end-session-button') && !$('save-home-button'), 'Settings still contains redundant or destructive session exits');
    const settingsTime = evaluate('ZQApp.game.state.elapsed'), settingsAudio = evaluate('audioCalls.length');
    pump(5);
    assert(evaluate('ZQApp.game.state.elapsed') > settingsTime, 'Settings paused the running aquarium');
    assert.equal(evaluate('audioCalls.length'), settingsAudio, 'In-game Settings interrupted audio');
    key('keydown', 'Escape');
    $('menu-button').click();
    w.document.querySelector('[data-menu-action="journal"]').click();
    assert($('tray-content').querySelector('.guide-context').textContent.includes('keeps running'));
    const gameGuideTime = evaluate('ZQApp.game.state.elapsed'), gameGuideAudio = evaluate('audioCalls.length');
    const defenseSummary = $('guide-defenses').querySelector('summary');
    defenseSummary.focus();
    for (const activation of [' ', 'Enter']) {
        const event = new w.KeyboardEvent('keydown', { key: activation, bubbles: true, cancelable: true });
        defenseSummary.dispatchEvent(event);
        assert(!event.defaultPrevented, 'The guide blocked native keyboard disclosure activation');
        assert(!evaluate('ZQApp.game.state.paused'), 'Opening a guide disclosure paused the aquarium');
    }
    $('guide-defenses').open = true;
    pump(20);
    assert(evaluate('ZQApp.game.state.elapsed') > gameGuideTime, 'The in-game guide stopped simulation');
    assert.equal(evaluate('audioCalls.length'), gameGuideAudio, 'The in-game guide interrupted audio');
    assert($('guide-defenses').open, 'Live guide refresh collapsed the current reference');
    $('viewport').focus(); key('keydown', ' ');
    assert(evaluate('ZQApp.game.state.paused'));
    assert($('guide-context').textContent.includes('is paused'), 'The guide claims a paused aquarium is running');
    const pausedGuideTime = evaluate('ZQApp.game.state.elapsed');
    pump(5);
    assert.equal(evaluate('ZQApp.game.state.elapsed'), pausedGuideTime);
    key('keydown', ' ');
    assert($('guide-context').textContent.includes('keeps running'));
    assert($('guide-defenses').open, 'Pause/resume lost the current guide section');
    key('keydown', 'Escape');
    $('menu-button').click();
    assert.deepEqual([...w.document.querySelectorAll('#tray [data-menu-action]')].map(b => b.dataset.menuAction),
        ['journal', 'settings', 'immerse', 'camera', 'home']);
    w.document.querySelector('[data-menu-action="camera"]').click();
    assert.equal($('tray').dataset.kind, 'camera');
    assert.equal(w.document.querySelectorAll('#tray [data-menu-action]').length, 6);
    const cameraBefore = evaluate('ZQApp.renderer.camera.yaw');
    w.document.querySelector('[data-menu-action="orbit"]').click();
    assert.notEqual(evaluate('ZQApp.renderer.camera.yaw'), cameraBefore);
    key('keydown', 'Escape');
    returnHome();
    w.document.querySelector('[data-theme="ink"]').click();
    assert.equal(w.document.documentElement.dataset.theme, 'dark', 'Pen & Ink welcome screen became light');
    assert.equal(w.document.documentElement.style.getPropertyValue('--cp-aquarium-bg'), '#0b1420');
    assert.equal(w.document.documentElement.style.getPropertyValue('--cp-aquarium-accent'), '#c4a1ed');
    $('resume-button').click(); pump(1);
    evaluate('ZQApp.game.state.creature=null; ZQApp.game.state.attacks=[]; ZQApp.game.state.score=2500; ZQApp.game.state.milestones=["bronze"]; ZQApp.game.state.pending=null');
    pump(75);
    assert(!$('toast').hidden && $('toast').dataset.kind === 'milestone');
    assert(!$('panel').open && !evaluate('ZQApp.game.state.paused'), 'Milestone blocked the aquarium');
    assert($('toast').textContent.includes('Silver'));
    assert(!$('milestone-notice') && !$('milestone-continue') && !$('milestone-end'));
    assert(!evaluate('ZQApp.game.state.milestone'), 'Ignoring a notice blocked later milestones');
    const milestoneTime = evaluate('ZQApp.game.state.elapsed');
    pump(10);
    assert(evaluate('ZQApp.game.state.elapsed') > milestoneTime, 'Milestone stopped simulation time');
    returnHome(); $('resume-button').click(); pump(1);
    assert(!evaluate('ZQApp.game.state.paused || ZQApp.game.state.milestone'), 'Resume restored a pending milestone prompt');
    $('feed-button').click(); key('keydown', 'Escape');
    evaluate('ZQApp.game.state.score=5000');
    pump(75);
    assert($('toast').textContent.includes('Gold'));
    assert(!evaluate('ZQApp.game.state.ended || ZQApp.game.state.paused'));
    evaluate("ZQApp.game.update=()=>ZQApp.game.finish('defeat','Your last fish was lost.')");
    pump(1);
    assert($('panel').open);
    $('panel').dispatchEvent(new w.MouseEvent('pointerdown', { bubbles: true, cancelable: true, clientX: 20, clientY: 20 }));
    assert(!$('panel').open && evaluate('ZQApp.game') === null, 'Summary did not light-dismiss home');
    $('begin-button').click(); pump(1);
    assert.equal(evaluate('ZQApp.game.theme.id'), 'ink');
    assert.equal(w.document.documentElement.dataset.theme, 'light', 'Pen & Ink lost its in-tank palette');
    assert.equal(w.document.documentElement.style.getPropertyValue('--cp-aquarium-accent'), '#735096');
    console.log('PASS Confirmations and summaries light-dismiss; milestones use ordinary notifications and never block later milestones');
    const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
    const opacity = Number(css.match(/--cp-panel: color-mix\(in srgb, var\(--cp-aquarium-bg\) (\d+)%, transparent\)/)[1]) / 100;
    assert.equal(opacity, 0.84);
    const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)];
    for (const selector of ['.panel', '.catalog', '.tray', '.game-hud', '.pause-card', '.placement-controls']) {
        const rule = rules.find(r => r[1].trim().split(',').map(s => s.trim()).includes(selector));
        assert(rule && /background:\s*var\(--cp-panel\)/.test(rule[2]), `${selector} diverged from the shared panel surface`);
    }
    assert(!css.includes('38%') && !css.includes('backdrop-filter'));
    const rgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
    const luminance = color => color.map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
        .reduce((sum, n, i) => sum + n * [0.2126, 0.7152, 0.0722][i], 0);
    const textWeights = [1, ...['muted', 'soft'].map(kind =>
        Number(css.match(new RegExp(`--cp-text-${kind}: color-mix\\(in srgb, var\\(--cp-aquarium-text\\) (\\d+)%`))[1]) / 100)];
    for (const theme of evaluate('Object.values(ZQ.THEMES)')) {
        const bg = rgb(theme.ui.bg), fg = rgb(theme.ui.text);
        for (const weight of textWeights) for (const water of [0, 1]) {
            const panel = bg.map(n => n * opacity + water * (1 - opacity));
            const text = fg.map((n, i) => n * weight + bg[i] * (1 - weight));
            const a = luminance(panel), b = luminance(text);
            const contrast = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
            assert(contrast >= 4.5, `${theme.id}: panel text contrast fell to ${contrast}`);
        }
    }
    for (const palette of evaluate('[ZQ.THEMES.ink.ui, ZQ.THEMES.ink.welcomeUi]')) {
        for (const background of [palette.bg, palette.surface]) {
            const a = luminance(rgb(palette.accent)), b = luminance(rgb(background));
            const contrast = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
            assert(contrast >= 4.5, `Pen & Ink's lavender accent contrast fell to ${contrast}`);
        }
    }
    assert.equal(evaluate('ZQ.THEMES.ink.water'), '#858aaa');
    assert.equal(evaluate('ZQ.THEMES.ink.surface'), '#c9cfe1');
    console.log('PASS Catalog, score, menu, and dialogs share readable translucency with 4.5:1 text contrast across themes');
    spawn('eel');
    evaluate(`ZQApp.renderer.project = () => ({ x: -100, y: 400, scale: 50, visible: false });
        ZQApp.game.state.creature.phase = 'windup'; ZQApp.game.state.creature.phaseTimer = 2.6;`);
    pump(1);
    assert(!$('encounter-hint').hidden);
    assert($('encounter-hint').textContent.includes('Outside your view to the left'));
    assert($('encounter-hint').textContent.includes('Zoom out or orbit'));
    assert($('encounter-hint').textContent.includes('hold'));
    evaluate('ZQApp.game.state.creature.phase="dash"; ZQApp.game.state.creature.phaseTimer=1.2');
    pump(1);
    assert(!$('encounter-hint').hidden && $('encounter-hint').textContent.includes('Electric pulse'));
    evaluate('ZQApp.game.state.creature.defended=true; ZQApp.game.state.creature.flee=5');
    pump(1);
    assert($('encounter-hint').hidden);
    console.log('PASS Offscreen attack warnings remain readable without sticky creature labels or camera recentering');
    const bubblesBefore = evaluate('audioEffects.length');
    const toastBefore = $('toast').textContent;
    evaluate(`ZQApp.renderer.project = point => ({ x: point[0], y: 400, scale: 50, visible: point[0] >= 0 });
        ZQApp.game.emit('bubble', '', { point: [900, 0, 0], fishId: 1 });
        ZQApp.game.emit('bubble', '', { point: [-100, 0, 0], fishId: 2 });`);
    pump(1);
    const bubbleSounds = evaluate(`audioEffects.slice(${bubblesBefore}).filter(e => e.type === 'bubble')`);
    assert.equal(bubbleSounds.length, 1);
    assert.equal(bubbleSounds[0].pan, 0.5, 'Bubble sound followed the pointer instead of its fish');
    assert.equal($('toast').textContent, toastBefore, 'A bubble created a notification');
    console.log('PASS Fish bubble sounds follow their visible source without offscreen chatter or notifications');
    assert.equal(w.document.querySelectorAll('#catalog button').length, 0);
    $('shop-button').click();
    assert.equal(w.document.querySelectorAll('#catalog button').length, 4);
    assert.equal(w.document.querySelectorAll('#catalog .panel-heading, #catalog h3, #catalog p').length, 0);
    assert(w.document.querySelectorAll('#catalog [data-buy]').length === 4);
    assert(!w.document.querySelector('#tray-close, #catalog-close, #panel-close'));
    key('keydown', 'Escape');
    const autoBefore = evaluate('ZQApp.game.state.auto');
    $('zen-button').click();
    assert.equal(evaluate('ZQApp.game.state.auto'), !autoBefore);
    assert.equal($('zen-button').getAttribute('aria-pressed'), String(!autoBefore));
    $('pause-button').click();
    assert(evaluate('ZQApp.game.state.paused'));
    assert.equal($('pause-button').getAttribute('aria-label'), 'Resume aquarium');
    $('pause-button').click();
    assert(!evaluate('ZQApp.game.state.paused'));
    $('volume-button').click();
    assert.equal($('tray').dataset.kind, 'volume');
    $('dock-volume').value = '23';
    $('dock-volume').dispatchEvent(new w.Event('input', { bubbles: true }));
    assert.equal(evaluate('ZQApp.settings.volume'), 0.23);
    assert.equal(JSON.parse(w.localStorage.getItem(evaluate('ZQ.STORAGE_KEY'))).settings.volume, 0.23);
    const soundBefore = evaluate('ZQApp.settings.sound');
    $('volume-mute').click();
    assert.equal(evaluate('ZQApp.settings.sound'), !soundBefore);
    $('controls-toggle').click();
    assert($('command-bar').hidden && $('tray').hidden);
    assert.equal($('controls-toggle').getAttribute('aria-expanded'), 'false');
    const timeBeforeHidden = evaluate('ZQApp.game.state.elapsed');
    pump(5);
    assert(evaluate('ZQApp.game.state.elapsed') > timeBeforeHidden, 'Hiding controls paused the aquarium');
    $('menu-button').click();
    assert(!$('tray').hidden, 'Menu was inaccessible with hidden controls');
    key('keydown', 'Escape');
    $('controls-toggle').click();
    assert(!$('command-bar').hidden);
    assert(!$('restart-button'), 'Redundant Restart button remains');
    $('pause-button').click();
    const profileBeforeBegin = evaluate('JSON.stringify(ZQApp.profile)');
    returnHome();
    w.document.querySelector('[data-theme="deep"]').click();
    $('begin-button').click();
    assert(!$('panel').open, 'Entering a selected world asked for redundant confirmation');
    assert.equal(evaluate('ZQApp.game.theme.id'), 'deep');
    assert.equal(evaluate('ZQApp.game.state.elapsed'), 0);
    assert(!evaluate('ZQApp.game.state.ended || ZQApp.game.state.paused'));
    assert.equal(evaluate('ZQApp.settings.volume'), 0.23);
    const oldProfile = JSON.parse(profileBeforeBegin), newProfile = JSON.parse(evaluate('JSON.stringify(ZQApp.profile)'));
    assert.equal(newProfile.sessions, oldProfile.sessions + 1);
    assert.equal(newProfile.highScore, oldProfile.highScore);
    assert.deepEqual(newProfile.achievements, oldProfile.achievements);
    assert(!w.document.querySelector('.theme-number'));
    $('score-button').click();
    assert.equal($('tray').dataset.anchor, 'health');
    w.document.querySelector('[data-menu-action="residents"]').click();
    assert.equal($('tray').dataset.anchor, 'health', 'Health descendants lost their source anchor');
    $('menu-button').click();
    assert.equal($('tray').dataset.anchor, 'menu');
    w.document.querySelector('[data-menu-action="camera"]').click();
    assert.equal($('tray').dataset.anchor, 'menu', 'Camera controls inherited the health anchor');
    $('score-button').click();
    assert.equal($('tray').dataset.anchor, 'health');
    key('keydown', 'Escape');
    assert.equal(w.document.activeElement.id, 'score-button');
    console.log('PASS Single-button fish shop, direct Zen/pause/volume, collapsible bar and immediate world entry preserve progress and light dismiss');
    returnHome();
    w.document.querySelector('[data-theme="ink"]').click();
    $('begin-button').click(); pump(1);
    const setupDispute = () => evaluate(`{
        const g=ZQApp.game;
        g.state.fish=[]; g.state.disputes=[]; g.state.courtships=[]; g.state.creature=null; g.state.attacks=[];
        g.state.auto=false; g.state.paused=false; g.state.spawnTimer=60; g.state.reproduction.fill(60);
        for(let i=0;i<2;i++){const f=g.addFish(0,false,[i*1.5,1.5,0]); f.sex='male'; f.hunger=100; f.vel=[0,0,0];}
        ZQApp.renderer.project=()=>({x:600,y:400,scale:50,visible:true});
        g.updateDisputes(.1);
    }`);
    setupDispute(); pump(1);
    assert(!$('social-hint').hidden && $('social-hint').textContent.includes('displaying'));
    const protectiveTaps = evaluate('ZQApp.game.state.stats.taps');
    evaluate(`{
        const g=ZQApp.game, random=g.random, index=g.theme.visitors.findIndex(v=>v.kind==='eel');
        g.random=()=>(index+.1)/g.theme.visitors.length; g.spawnCreature(); g.random=random;
        g.state.creature.pos=[...g.state.fish[0].pos]; g.state.creature.entered=true;
        g.state.creature.phase='windup';
    }`);
    pointer('pointerdown', 600, 400, 1, 'touch'); pointer('pointerup', 600, 400, 1, 'touch');
    assert.equal(evaluate('ZQApp.game.state.disputes.length'), 0);
    assert.equal(evaluate('ZQApp.game.state.stats.taps'), protectiveTaps);
    assert(!evaluate('ZQApp.game.state.creature.provoked'));
    assert.equal(evaluate('ZQApp.game.state.creature.holdCharge'), 0, 'Protective tap started an overlapping eel hold');
    assert.equal(captures.size, 0);
    assert($('social-hint').hidden);
    assert.equal(stored().session.disputes.length, 0, 'A protective glass tap rebuilt the cached checkpoint');
    returnHome();
    const protectedSave = stored();
    assert(protectedSave.session.fish.every(f => f.sex === 'male' && f.socialCooldown === 90));
    $('resume-button').click();
    setupDispute();
    evaluate(`{
        const g=ZQApp.game, random=g.random, index=g.theme.visitors.findIndex(v=>v.kind==='eel');
        g.random=()=>(index+.1)/g.theme.visitors.length;g.spawnCreature();g.random=random;
        g.state.creature.pos=[0,0,0];g.state.creature.entered=true;
        ZQApp.renderer.project=pos=>({x:pos===g.state.creature.pos?600:100,y:400,scale:50,visible:true});
    }`);
    pointer('pointerdown', 600, 400);
    evaluate("ZQApp.renderer.project=()=>({x:600,y:400,scale:50,visible:true})");
    pointer('pointerup', 600, 400);
    assert.equal(evaluate('ZQApp.game.state.disputes.length'), 0, 'Rivals moving under a visitor click were not protected at release');
    assert(!evaluate('ZQApp.game.state.creature.provoked'));
    assert.equal(evaluate('ZQApp.game.state.stats.taps'), protectiveTaps);
    setupDispute();
    pointer('pointerdown', 600, 400, 1, 'touch'); pointer('pointercancel', 600, 400, 1, 'touch');
    assert.equal(evaluate('ZQApp.game.state.disputes.length'), 1);
    pointer('pointerdown', 600, 400, 1, 'touch'); pointer('pointerdown', 630, 400, 2, 'touch');
    pointer('pointerup', 600, 400, 1, 'touch'); pointer('pointerup', 630, 400, 2, 'touch');
    assert.equal(evaluate('ZQApp.game.state.disputes.length'), 1);
    const socialYaw = evaluate('ZQApp.renderer.camera.yaw');
    pointer('pointerdown', 600, 400); pointer('pointermove', 700, 450); pointer('pointerup', 700, 450);
    assert.equal(evaluate('ZQApp.game.state.disputes.length'), 1);
    assert.notEqual(evaluate('ZQApp.renderer.camera.yaw'), socialYaw, 'Dragging near rivals broke camera orbit');
    evaluate("ZQApp.renderer.project=()=>({x:-100,y:400,scale:50,visible:false})");
    pump(1);
    assert($('social-hint').textContent.includes('Outside view (left)'));
    key('keydown', 'k');
    assert.equal(evaluate('ZQApp.game.state.disputes.length'), 0);
    assert.equal(evaluate('ZQApp.game.state.stats.taps'), protectiveTaps);
    console.log('PASS Rival cues, touch and keyboard separation take priority over overlapping visitors without stress; drags and cancelled/multitouch gestures stay safe');
    setupDispute(); pump(1);
    w.dispatchEvent(new w.Event('pagehide'));
    assert(stored().session?.paused, 'Backgrounding did not checkpoint the paused round');
    const socialPaused = evaluate('JSON.stringify(ZQApp.game.snapshot())');
    assert($('social-hint').hidden);
    pump(30);
    assert.equal(evaluate('JSON.stringify(ZQApp.game.snapshot())'), socialPaused, 'Background time advanced a dispute');
    key('keydown', 'k');
    assert.equal(evaluate('ZQApp.game.state.disputes.length'), 1, 'Paused keyboard interaction separated fish');
    $('pause-button').click();
    $('zen-button').click(); pump(80);
    assert.equal(evaluate('ZQApp.game.state.disputes.length'), 0);
    assert.equal(evaluate('ZQApp.game.state.stats.lost'), 0);
    assert($('social-hint').hidden);
    $('zen-button').click();
    evaluate(`{const g=ZQApp.game; g.state.fish=g.state.fish.slice(0,2);g.state.fish[1].sex='female';
        g.state.fish.forEach(f=>{f.socialCooldown=0;f.fear=0;f.hunger=100;f.health=100;});}`);
    $('score-button').click(); w.document.querySelector('[data-menu-action="residents"]').click();
    assert($('resident-list').textContent.includes('Male') && $('resident-list').textContent.includes('Female'));
    assert($('breeding-summary').textContent.includes('1 male / 1 female (breeding pair)'));
    assert.equal($('tray').dataset.anchor, 'health');
    key('keydown', 'Escape');
    console.log('PASS Background and pause freeze disputes, Zen separates automatically, and compact Residents shows sexes and breeding-pair counts');
    const bornBefore = evaluate('ZQApp.game.state.stats.born');
    const birthSoundsBefore = evaluate("audioEffects.filter(e=>e.type==='birth').length");
    evaluate(`{
        const g=ZQApp.game, random=g.random;
        g.drainEvents();g.state.creature=null;g.state.attacks=[];g.state.courtships=[];
        g.state.fish=g.state.fish.slice(0,2);g.state.reproduction.fill(0);g.state.tankHealth=100;
        g.state.fish.forEach((f,i)=>{f.sex=i?'female':'male';f.pos=[i*1.5,1.5,0];f.hunger=100;f.health=100;});
        g.random=()=>0;g.reproduce(.1);for(let i=0;i<41;i++)g.reproduce(.1);g.random=random;
    }`);
    pump(1);
    assert.equal(evaluate('ZQApp.game.state.stats.born'), bornBefore + 1);
    assert(!$('toast').hidden && $('toast').dataset.kind === 'birth', 'A real birth had no visible announcement');
    assert($('toast').textContent.includes('A baby Brushstroke Betta!'));
    assert($('toast').textContent.includes('pts'), 'The birth announcement omitted its bonus');
    assert(!$('panel').open && !evaluate('ZQApp.game.state.paused'), 'Birth interrupted the aquarium');
    assert.equal(evaluate("audioEffects.filter(e=>e.type==='birth').length"), birthSoundsBefore + 1);
    const announced = $('toast').textContent;
    evaluate("ZQApp.game.emit('bonus','Routine reward'); ZQApp.game.emit('prize','A new prize')");
    pump(1);
    assert.equal($('toast').textContent, announced, 'Routine rewards overwrote the birth announcement');
    evaluate("ZQApp.game.emit('birth','Another baby'); ZQApp.game.emit('loss','A resident was lost')");
    pump(1);
    assert.equal($('toast').dataset.kind, 'loss', 'Birth announcements displaced urgent loss information');
    assert.equal($('toast').textContent, 'A resident was lost');
    console.log('PASS Real births announce the baby and bonus without pausing; routine rewards do not replace them and urgent loss still takes priority');

    {
        const schedule = w.setTimeout, cancel = w.clearTimeout;
        const notices = new Map();
        let timerId = -1;
        w.setTimeout = function (callback, delay, ...args) {
            if (delay !== 4100 && delay !== 400) return schedule.call(this, callback, delay, ...args);
            const id = timerId--;
            notices.set(id, () => callback(...args));
            return id;
        };
        w.clearTimeout = function (id) {
            if (!notices.delete(id)) cancel.call(this, id);
        };
        const tickNotice = () => {
            const next = notices.entries().next().value;
            assert(next, 'The visible notice has no expiration timer');
            notices.delete(next[0]);
            next[1]();
        };
        const finishNotice = () => { tickNotice(); tickNotice(); };
        const normalUpdate = evaluate('ZQApp.game.update');
        try {
            evaluate("ZQApp.game.reject('Preparing discovery acknowledgements')");
            pump(1);
            for (let i = 0; notices.size && i < 100; i++) tickNotice();
            assert.equal(notices.size, 0, 'Earlier acknowledgements could not finish');
            evaluate(`{
                const g = ZQApp.game;
                g.update = () => {};
                g.profile.achievements = {};
                g.state.newAchievements = [];
                g.state.multiplier = 2;
                g.drainEvents();
            }`);
            $('score-button').click();
            w.document.querySelector('[data-menu-action="progress"]').click();
            $('remaining-discoveries').open = true;
            $('remaining-discovery-count').focus();
            const discoveries = JSON.parse(evaluate('JSON.stringify(ZQ.ACHIEVEMENTS)'));
            evaluate('for (const discovery of ZQ.ACHIEVEMENTS.slice(0, 2)) ZQApp.game.unlock(discovery.id)');
            pump(15);
            assert($('remaining-discoveries').open, 'An unlock collapsed the collection being read');
            assert.equal(w.document.activeElement, $('remaining-discovery-count'), 'An unlock replaced the focused disclosure');
            assert.equal($('next-discovery-name').textContent, 'Full Spectrum', 'Try next still suggests a collected discovery');
            assert.deepEqual([...$('discovered-grid').children].map(card => card.dataset.achievement), ['schooling', 'first-fish']);
            for (const card of $('discovered-grid').children) {
                const date = evaluate(`ZQApp.profile.achievements[${JSON.stringify(card.dataset.achievement)}]`);
                const timestamp = card.querySelector('time');
                assert(card.querySelector('.achievement-top').contains(timestamp) && !timestamp.hidden);
                assert.equal(timestamp.dateTime, date);
                assert.equal(timestamp.getAttribute('aria-label'), `Discovered ${date}`);
                assert(card.querySelector('.achievement-bonus').hidden,
                    'A collected discovery still advertises an unearned bonus');
            }
            evaluate('for (const discovery of ZQ.ACHIEVEMENTS.slice(2)) ZQApp.game.unlock(discovery.id)');
            pump(15);
            assert.equal($('discovered-grid').children.length, discoveries.length);
            assert.deepEqual([...$('discovered-grid').children].map(card => card.dataset.achievement),
                discoveries.map(discovery => discovery.id).reverse(), 'Newest discoveries are not first');
            assert($('remaining-discoveries').hidden && $('next-discovery').hidden,
                'The completed collection still suggests an earned discovery');
            assert.equal(w.document.activeElement, $('discovered-count'), 'Completing the collection lost keyboard focus');
            assert.equal($('toast').textContent, 'New discovery: First Fish +50 pts');
            evaluate("ZQApp.game.emit('loss', 'A resident needs attention')");
            pump(1);
            assert.equal($('toast').dataset.kind, 'loss', 'Discovery messages displaced urgent information');
            finishNotice();
            assert.equal($('toast').textContent, 'New discovery: First Fish +50 pts',
                'An interruption discarded the current discovery');
            const hidden = Object.getOwnPropertyDescriptor(w.document, 'hidden');
            try {
                Object.defineProperty(w.document, 'hidden', { value: true, configurable: true });
                w.document.dispatchEvent(new w.Event('visibilitychange'));
                assert($('toast').hidden && notices.size === 0, 'A discovery expired while the tab was hidden');
                Object.defineProperty(w.document, 'hidden', { value: false, configurable: true });
                w.document.dispatchEvent(new w.Event('visibilitychange'));
                assert.equal($('toast').textContent, 'New discovery: First Fish +50 pts');
            } finally {
                if (hidden) Object.defineProperty(w.document, 'hidden', hidden);
                else delete w.document.hidden;
            }
            $('unpause-button').click();
            $('about-button').click();
            assert($('panel').open && $('toast').hidden && notices.size === 0,
                'A discovery was consumed behind a modal');
            $('panel').dispatchEvent(new w.Event('cancel', { cancelable: true }));
            for (const discovery of discoveries) {
                assert(!$('toast').hidden && $('toast').dataset.kind === 'achievement');
                assert.equal($('toast').textContent, `New discovery: ${discovery.name} +${discovery.bonus * 2} pts`,
                    `${discovery.id} did not receive its own acknowledgement`);
                assert(!evaluate('ZQApp.game.state.paused') && !$('panel').open);
                finishNotice();
            }
            assert($('toast').hidden && notices.size === 0, 'The acknowledgement queue did not drain');
            assert.equal(Object.keys(stored().profile.achievements).length, discoveries.length);
            evaluate('for (const discovery of ZQ.ACHIEVEMENTS) ZQApp.game.unlock(discovery.id)');
            pump(2);
            assert($('toast').hidden, 'An already-collected discovery was announced again');
            $('menu-button').click();
            w.document.querySelector('[data-menu-action="journal"]').click();
            w.document.querySelector('[data-tab="achievements"]').click();
            assert.deepEqual([...$('discovered-grid').children].map(card => card.dataset.achievement),
                discoveries.map(discovery => discovery.id).reverse(), 'The guide uses a different discovery collection');
            assert($('remaining-discoveries').hidden && $('next-discovery').hidden);
            key('keydown', 'Escape');
            evaluate(`{
                const g = ZQApp.game, ids = ['first-fish', 'schooling'];
                g.state.newAchievements = g.state.newAchievements.filter(id => !ids.includes(id));
                for (const id of ids) { delete g.profile.achievements[id]; g.unlock(id); }
            }`);
            pump(1);
            assert.equal($('toast').textContent, 'New discovery: First Fish +50 pts');
            const write = w.Storage.prototype.setItem, exitingGame = evaluate('ZQApp.game');
            try {
                w.Storage.prototype.setItem = function () { throw new w.DOMException('Storage full', 'QuotaExceededError'); };
                returnHome();
                assert.equal(evaluate('ZQApp.game'), exitingGame, 'A failed save exited the aquarium');
                assert.equal($('toast').dataset.kind, 'warning');
                assert($('toast').textContent.includes('was not saved'));
            } finally {
                w.Storage.prototype.setItem = write;
            }
            finishNotice();
            assert.equal($('toast').textContent, 'New discovery: First Fish +50 pts',
                'A failed Save & Return discarded pending acknowledgements');
            tickNotice();
            assert($('toast').classList.contains('fading'));
            $('pause-home-button').click();
            assert.equal(evaluate('ZQApp.game'), null);
            assert($('toast').hidden && notices.size === 0 && !$('toast').classList.contains('fading'),
                'Save & Return left an active discovery or its timer on Start');
            assert.equal(Object.keys(stored().profile.achievements).length, discoveries.length,
                'Clearing notices removed earned discoveries');
            $('progress-button').click(); pump(5);
            assert($('toast').hidden && notices.size === 0, 'A Start refresh replayed queued discoveries');
            key('keydown', 'Escape');
            $('resume-button').click(); pump(2);
            assert($('toast').hidden && notices.size === 0, 'Resume replayed the discarded notice queue');
            evaluate('ZQApp.game').update = normalUpdate;
            returnHome(); $('begin-button').click();
            evaluate(`{
                delete ZQApp.profile.achievements.pacifist;
                const g = ZQApp.game;
                g.state.elapsed = 120; g.state.stats.lost = 0;
                g.update = () => g.finish();
            }`);
            pump(2);
            assert($('panel').open && $('panel-content').textContent.includes('New discoveries'));
            assert($('panel-content').textContent.includes('Pacifist'), 'The completion-only discovery was not acknowledged');
            $('panel').dispatchEvent(new w.Event('cancel', { cancelable: true }));
            assert($('toast').hidden, 'The summary acknowledgement replayed after dismissal');
            $('begin-button').click();
            evaluate('delete ZQApp.profile.achievements.pacifist; ZQApp.game.state.elapsed = 120; ZQApp.game.state.stats.lost = 0');
            returnHome(); $('begin-button').click();
            assert.equal($('toast').textContent, 'New discovery: Pacifist \u00b7 Previous aquarium',
                'Replacing a saved aquarium discarded its completion discovery or credited the new aquarium');
            assert.equal(evaluate('ZQApp.game.state.score'), evaluate('ZQ.CONFIG.startingScore'));
            finishNotice();
            pump(3);
        } finally {
            if (evaluate('ZQApp.game')) evaluate('ZQApp.game').update = normalUpdate;
            w.setTimeout = schedule; w.clearTimeout = cancel;
        }
    }
    console.log('PASS All twenty discoveries receive acknowledgements; failed exits preserve them and successful exits clear notices without losing records');

    $('menu-button').click();
    w.document.querySelector('[data-menu-action="settings"]').click();
    assert.equal($('tray-title').textContent, 'Settings');
    assert(!$('settings-display').open && !$('settings-install').open);
    assert(!$('setting-sound') && !$('setting-volume'), 'Settings duplicates the integrated sound control');
    for (const id of ['setting-motion']) {
        assert(!$(id).closest('details'), `${id} is hidden among device options`);
    }
    assert.equal($('setting-quality').closest('details'), $('settings-display'));
    assert.equal($('setting-quality').querySelector('[value="auto"]').textContent, 'Automatic');
    assert(!$('export-button') && !$('import-button') && !$('import-file'));
    assert(!$('tray-content').textContent.includes('Created with care'));
    assert.equal(Boolean($('setting-awake')), 'wakeLock' in w.navigator);
    assert.equal(Boolean($('fullscreen-button')),
        Boolean(w.document.fullscreenElement || w.document.fullscreenEnabled && w.document.documentElement.requestFullscreen));
    const displaySummary = $('settings-display').querySelector('summary');
    displaySummary.focus();
    for (const activation of [' ', 'Enter']) {
        const event = new w.KeyboardEvent('keydown', { key: activation, bubbles: true, cancelable: true });
        displaySummary.dispatchEvent(event);
        assert(!event.defaultPrevented, 'An aquarium shortcut blocked native details activation');
        assert(!evaluate('ZQApp.game.state.paused'), 'Opening device options paused the aquarium');
    }
    $('settings-display').open = true;
    $('setting-quality').value = 'battery';
    $('setting-quality').dispatchEvent(new w.Event('change', { bubbles: true }));
    $('setting-motion').value = 'reduced';
    $('setting-motion').dispatchEvent(new w.Event('change', { bubbles: true }));
    assert.equal(evaluate('ZQApp.renderer.level'), 'battery');
    assert(evaluate('ZQApp.renderer.reduced'));
    assert($('settings-display').open, 'Changing a preference collapsed the section');
    assert.equal(stored().settings.quality, 'battery');
    assert.equal(stored().settings.motion, 'reduced');
    const preferenceCheckpoint = stored().session;
    assert(preferenceCheckpoint, 'Changing preferences erased the checkpoint');
    evaluate('ZQApp.renderer.is3D=false');
    $('setting-quality').dispatchEvent(new w.Event('change', { bubbles: true }));
    assert(!$('settings-graphics-warning').hidden && !$('settings-graphics-warning').closest('details'));
    assert($('settings-graphics-warning').textContent.includes('Canvas 2D'));
    evaluate('ZQApp.renderer.is3D=true');
    $('setting-quality').dispatchEvent(new w.Event('change', { bubbles: true }));
    assert($('settings-graphics-warning').hidden);
    const secureContext = Object.getOwnPropertyDescriptor(w, 'isSecureContext');
    Object.defineProperty(w, 'isSecureContext', { value: true, configurable: true });
    const installOffer = new w.Event('beforeinstallprompt', { cancelable: true });
    w.dispatchEvent(installOffer);
    assert(installOffer.defaultPrevented && !$('install-app').hidden);
    w.dispatchEvent(new w.Event('appinstalled'));
    assert($('install-app').hidden);
    assert.equal($('settings-install-status').textContent, 'Installed on this device.');
    assert.notEqual($('settings-offline-status').textContent, 'Ready for offline play.',
        'Installation falsely claimed the offline copy was ready');
    if (secureContext) Object.defineProperty(w, 'isSecureContext', secureContext);
    else delete w.isSecureContext;
    key('keydown', 'Escape');
    console.log('PASS Settings retain motion/device preferences without redundant sound or exit controls');

    const runningRound = evaluate('ZQApp.game'), storageKey = evaluate('ZQ.STORAGE_KEY');
    const originalWrite = w.Storage.prototype.setItem;
    const previousCheckpoint = stored().session;
    w.Storage.prototype.setItem = function (key, value) {
        if (key === storageKey && JSON.stringify(JSON.parse(value).session) !== JSON.stringify(previousCheckpoint)) {
            throw new w.DOMException('No room for the aquarium snapshot', 'QuotaExceededError');
        }
        return originalWrite.call(this, key, value);
    };
    try {
        returnHome();
        assert.equal(evaluate('ZQApp.game'), runningRound, 'Failed Save & Return abandoned the live round');
        assert(evaluate('ZQApp.game.state.paused'));
        assert.equal(w.document.body.dataset.screen, 'game');
        assert.deepEqual(stored().session, previousCheckpoint, 'A failed checkpoint erased the earlier aquarium');
        assert(!$('save-warning').hidden);
        $('menu-button').click();
        w.document.querySelector('[data-menu-action="settings"]').click();
        assert(!$('settings-save-warning').hidden && !$('settings-save-warning').closest('details'));
        $('setting-motion').value = 'full';
        $('setting-motion').dispatchEvent(new w.Event('change', { bubbles: true }));
        assert.equal(stored().settings.motion, 'full', 'A failed session save blocked independent preference writes');
        assert(!$('save-warning').hidden && !$('settings-save-warning').hidden,
            'A stats-only write hid a failed session save');
    } finally {
        w.Storage.prototype.setItem = originalWrite;
    }
    key('keydown', 'Escape');
    $('pause-home-button').click();
    assert.equal(evaluate('ZQApp.game'), null);
    assert(stored().session && !$('resume-button').hidden);
    assert($('save-warning').hidden, 'A successful retry did not clear the session-save warning');
    const keptRound = stored().session;
    $('sound-button').click();
    $('dock-volume').value = '61';
    $('dock-volume').dispatchEvent(new w.Event('input', { bubbles: true }));
    assert.deepEqual(stored().session, keptRound, 'Home preferences replaced the explicitly saved round');
    key('keydown', 'Escape');
    $('resume-button').click();
    assert(stored().session, 'Resume discarded the recoverable round');
    assert.equal(evaluate('ZQApp.settings.volume'), 0.61);
    console.log('PASS Failed session saves stay paused and visible; retry saves one round and home preferences preserve it');

    evaluate(`{
        const g=ZQApp.game;
        g.state.creature=null;g.state.attacks=[];g.state.disputes=[];g.state.courtships=[];
        g.state.spawnTimer=90;g.state.reproduction.fill(180);g.state.milestone=null;
        g.state.damage=0;g.state.dirt=0;g.state.tankHealth=100;
        g.state.fish.forEach(f=>{f.hunger=100;f.health=100;});
    }`);
    flushIdle();
    const checkpointGame = evaluate('ZQApp.game'), originalSnapshot = checkpointGame.snapshot;
    let snapshotCalls = 0;
    checkpointGame.snapshot = function () { snapshotCalls++; return originalSnapshot.call(this); };
    const checkpointElapsed = stored().session.elapsed;
    pump(760);
    assert.equal(snapshotCalls, 0, 'Periodic checkpoint cloning ran inside the animation loop');
    assert.equal(idleJobs.size, 1, 'Automatic checkpoints are missing or queued repeatedly');
    assert.equal(stored().session.elapsed, checkpointElapsed);
    flushIdle();
    assert.equal(snapshotCalls, 1, 'An idle checkpoint rebuilt the tank more than once');
    assert(stored().session.elapsed > checkpointElapsed);
    evaluate('ZQ.validateSave(JSON.parse(localStorage.getItem(ZQ.STORAGE_KEY)))');
    checkpointGame.snapshot = originalSnapshot;
    const recoverable = stored().session;
    w.Storage.prototype.setItem = function (key, value) {
        if (key === storageKey && JSON.parse(value).session?.elapsed > recoverable.elapsed) {
            throw new w.DOMException('Checkpoint storage unavailable', 'QuotaExceededError');
        }
        return originalWrite.call(this, key, value);
    };
    try {
        pump(760); flushIdle();
        assert(!evaluate('ZQApp.game.state.paused'), 'A best-effort checkpoint failure interrupted gameplay');
        assert.deepEqual(stored().session, recoverable);
        assert(!$('save-warning').hidden, 'A failed automatic checkpoint was silently ignored');
        assert.equal(evaluate('ZQApp.save()'), true);
        assert(!$('save-warning').hidden, 'A cached checkpoint write hid a failed fresh checkpoint');
    } finally {
        w.Storage.prototype.setItem = originalWrite;
    }
    pump(760); flushIdle();
    assert($('save-warning').hidden, 'A later successful checkpoint did not clear its warning');
    assert(stored().session.elapsed > recoverable.elapsed);
    pump(760);
    assert.equal(idleJobs.size, 1);
    let backgroundWrites = 0;
    w.Storage.prototype.setItem = function (key, value) {
        if (key === storageKey) backgroundWrites++;
        return originalWrite.call(this, key, value);
    };
    try {
        w.dispatchEvent(new w.Event('pagehide'));
        w.document.dispatchEvent(new w.Event('freeze'));
        assert.equal(backgroundWrites, 1, 'Overlapping lifecycle events duplicate expensive checkpoint writes');
        assert.equal(idleJobs.size, 0, 'Backgrounding left a stale automatic save scheduled');
        assert(stored().session.paused);
    } finally {
        w.Storage.prototype.setItem = originalWrite;
    }
    w.dispatchEvent(new w.Event('pageshow'));
    $('pause-button').click();
    console.log('PASS Checkpoints are paced outside rendering, failures leave play and prior saves intact, retries recover, and background writes deduplicate');

    const idleSchedule = w.requestIdleCallback, idleCancel = w.cancelIdleCallback, timeoutSchedule = w.setTimeout;
    let fallbackCheckpoint;
    delete w.requestIdleCallback; delete w.cancelIdleCallback;
    w.setTimeout = function (callback, delay, ...args) {
        if (delay === 0) { fallbackCheckpoint = callback; return 999999; }
        return timeoutSchedule.call(this, callback, delay, ...args);
    };
    try {
        pump(760);
        assert.equal(typeof fallbackCheckpoint, 'function', 'Browsers without idle callbacks have no checkpoint fallback');
        const beforeFallback = stored().session.elapsed;
        fallbackCheckpoint();
        assert(stored().session.elapsed > beforeFallback);
    } finally {
        w.requestIdleCallback = idleSchedule; w.cancelIdleCallback = idleCancel; w.setTimeout = timeoutSchedule;
    }
    console.log('PASS Checkpoints fall back to a separate timer task when idle callbacks are unavailable');

    pump(760);
    assert.equal(idleJobs.size, 1);
    const staleCheckpoint = [...idleJobs.values()][0];
    returnHome();
    assert.equal(idleJobs.size, 0, 'Save & Return left a checkpoint queued for the abandoned game');
    const resumeCheckpoint = stored().session;
    w.Storage.prototype.setItem = function () { throw new w.DOMException('Storage full', 'QuotaExceededError'); };
    try {
        $('resume-button').click();
        assert(!$('save-warning').hidden);
    } finally {
        w.Storage.prototype.setItem = originalWrite;
    }
    assert.equal(evaluate('ZQApp.save()'), true);
    assert.deepEqual(stored().session, resumeCheckpoint, 'A failed initial resume checkpoint erased the previous one');
    assert(!$('save-warning').hidden, 'A cached resume write hid the failed fresh checkpoint');
    returnHome();
    $('begin-button').click();
    const initialCheckpoint = stored().session;
    staleCheckpoint();
    assert.deepEqual(stored().session, initialCheckpoint, 'A stale task checkpointed a different aquarium');
    pump(760);
    assert.equal(idleJobs.size, 1);
    evaluate("ZQApp.game.update=()=>ZQApp.game.finish('defeat','Your last fish was lost.')");
    pump(1);
    assert.equal(idleJobs.size, 0, 'Completing a round left a pending checkpoint');
    assert.equal(stored().session, null, 'Completing a round left a resumable aquarium');
    key('keydown', 'Escape');
    $('begin-button').click();
    console.log('PASS Returning home and completing rounds cancel pending saves; stale tasks cannot replace a new tank');

    const newerSave = JSON.stringify({ ...stored(), writer: 'another-window' });
    w.localStorage.setItem(storageKey, newerSave);
    w.dispatchEvent(new w.StorageEvent('storage', { key: storageKey, newValue: newerSave, storageArea: w.localStorage }));
    assert(evaluate('ZQApp.game.state.paused'));
    $('pause-home-button').click();
    assert(evaluate('ZQApp.game'), 'A stale window claimed to save and return');
    assert.equal(w.localStorage.getItem(storageKey), newerSave);
    assert.equal(evaluate('ZQApp.save()'), false);
    $('menu-button').click();
    w.document.querySelector('[data-menu-action="settings"]').click();
    assert(!$('reload-button').hidden && $('reset-save-button').hidden);
    assert(!$('settings-save-warning').hidden);
    console.log('PASS Stale windows cannot save over another window and expose reload rather than destructive reset');
} finally {
    dom.window.close();
}
