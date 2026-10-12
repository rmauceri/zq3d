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
w.matchMedia = () => ({ matches: false, addEventListener() {} });
w.ResizeObserver = class { observe() {} };
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
    render() {} sampleFrame() {}
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
const audioEffects = [];
const ZQAudio = { Soundscape: class {
    suspend() { return Promise.resolve(); } disable() { return Promise.resolve(); }
    enable() { return Promise.resolve(); } setVolume() {} effect(type, pan) { audioEffects.push({ type, pan }); }
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

try {
    assert.equal($('preview-badge'), null);
    assert.equal($('renderer-label'), null);
    const initialTheme = w.document.querySelector('.theme-option[aria-pressed="true"]');
    for (const button of w.document.querySelectorAll('.theme-option')) {
        button.click();
        const theme = evaluate(`ZQ.THEMES['${button.dataset.theme}']`);
        assert.equal($('scene-name').textContent, theme.name);
        assert.equal($('scene-subtitle').textContent, theme.subtitle);
        assert.equal($('scene-description').textContent, theme.description);
    }
    initialTheme.click();
    console.log('PASS Welcome preview identifies each selected world with its name and two descriptive lines, without a renderer badge');
    $('begin-button').click(); pump(2);
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
    pump(24); swipe(500, 400, 'touch'); assert(evaluate('ZQApp.game.state.creature.defended'));
    assert(!$('toast').hidden && $('toast').textContent.includes('leaving'), 'Successful defense had no visible confirmation');
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
    swipe(600, 300); $('home-button').click(); $('resume-button').click(); pump(2);
    assert(!$('encounter-hint').textContent.includes('drag left or right'), 'Saved encounter inherited old feedback');
    evaluate('ZQApp.game.state.elapsed=200');
    swipe(600, 300); $('home-button').click(); $('begin-button').click(); pump(2);
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
    $('home-button').click();
    assert(!evaluate('ZQApp.renderer.prizePreview'), 'Welcome demo inherited a placement preview');
    $('resume-button').click(); pump(1);
    assert.deepEqual(evaluate('ZQApp.game.state.prizePositions.chest.slice()'), afterDrag);
    assert(evaluate('!!ZQApp.game.state.prizes.chest'));
    key('keydown', 'f'); key('keydown', 'i');
    assert($('placement-controls').hidden, 'Immersion hid the controls but kept an active placement');
    key('keydown', 'i');
    $('home-button').click(); $('begin-button').click(); pump(1);
    assert.equal(evaluate('Object.keys(ZQApp.game.state.prizes).length'), 0);
    assert.equal(evaluate('ZQApp.game.state.equippedPrizes.length'), 0);
    key('keydown', 't');
    assert(w.document.querySelector('[data-equip="chest"]').disabled);
    assert($('prize-placement-count').textContent.includes('0 of 4 earned this round'));
    console.log('PASS Resume retains this round’s collection and placements; starting anew resets prizes and tray progress');

    key('keydown', 'Escape');
    const tapsBeforeDismiss = evaluate('ZQApp.game.state.stats.taps');
    $('score-button').click();
    assert.equal($('tray').dataset.kind, 'score');
    pointer('pointerdown', 1000, 700); pointer('pointerup', 1000, 700);
    assert($('tray').hidden, 'Score details did not light-dismiss');
    assert.equal(evaluate('ZQApp.game.state.stats.taps'), tapsBeforeDismiss);

    $('home-button').click();
    $('begin-button').click();
    assert(!$('panel').open && evaluate('ZQApp.game !== null'), 'Entering a new aquarium added a confirmation');
    $('menu-button').click();
    w.document.querySelector('[data-menu-action="settings"]').click();
    $('end-session-button').click();
    assert($('panel').open, 'Finish-session confirmation was not modal');
    $('panel').getBoundingClientRect = () => ({ left: 300, right: 900, top: 200, bottom: 600 });
    $('panel').dispatchEvent(new w.MouseEvent('pointerdown', { bubbles: true, cancelable: true, clientX: 500, clientY: 300 }));
    assert($('panel').open, 'An inside tap dismissed the confirmation');
    const outside = new w.MouseEvent('pointerdown', { bubbles: true, cancelable: true, clientX: 20, clientY: 20 });
    $('panel').dispatchEvent(outside);
    assert(!$('panel').open, 'Confirmation did not dismiss on its backdrop');
    assert(!evaluate('ZQApp.game.state.ended'), 'Backdrop dismissal confirmed a destructive action');
    $('menu-button').click();
    w.document.querySelector('[data-menu-action="settings"]').click();
    $('end-session-button').click();
    $('panel').dispatchEvent(new w.Event('cancel', { cancelable: true }));
    assert(!$('panel').open, 'Escape did not cancel confirmation');
    $('home-button').click();
    w.document.querySelector('[data-theme="ink"]').click();
    assert.equal(w.document.documentElement.dataset.theme, 'dark', 'Pen & Ink welcome screen became light');
    assert.equal(w.document.documentElement.style.getPropertyValue('--cp-aquarium-bg'), '#0b1420');
    $('resume-button').click(); pump(1);
    evaluate('ZQApp.game.state.creature=null; ZQApp.game.state.attacks=[]; ZQApp.game.state.score=2500; ZQApp.game.state.milestones=["bronze"]; ZQApp.game.state.pending=null');
    pump(75);
    assert(!$('milestone-notice').hidden);
    assert(!$('panel').open && !evaluate('ZQApp.game.state.paused'), 'Milestone blocked the aquarium');
    assert($('milestone-title').textContent.includes('Silver'));
    const milestoneTime = evaluate('ZQApp.game.state.elapsed');
    pump(10);
    assert(evaluate('ZQApp.game.state.elapsed') > milestoneTime, 'Milestone stopped simulation time');
    $('home-button').click(); $('resume-button').click(); pump(1);
    assert(!$('milestone-notice').hidden && !evaluate('ZQApp.game.state.paused'), 'Resumed milestone restored a blocking pause');
    $('feed-button').click(); key('keydown', 'Escape');
    $('milestone-continue').click();
    assert($('milestone-notice').hidden && !evaluate('ZQApp.game.state.milestone'));
    evaluate('ZQApp.game.state.score=5000');
    pump(75);
    assert($('milestone-title').textContent.includes('Gold'));
    $('milestone-end').click();
    assert(evaluate('ZQApp.game.state.ended && ZQApp.game.state.outcome==="victory"'));
    assert($('panel').open && $('milestone-notice').hidden);
    $('panel').dispatchEvent(new w.MouseEvent('pointerdown', { bubbles: true, cancelable: true, clientX: 20, clientY: 20 }));
    assert(!$('panel').open && evaluate('ZQApp.game') === null, 'Summary did not light-dismiss home');
    $('begin-button').click(); pump(1);
    assert.equal(evaluate('ZQApp.game.theme.id'), 'ink');
    assert.equal(w.document.documentElement.dataset.theme, 'light', 'Pen & Ink lost its in-tank palette');
    console.log('PASS Confirmations, summaries, and score trays light-dismiss; milestones keep playing with one-click choices; Ink welcome stays dark');
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
    $('home-button').click();
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
    w.document.querySelector('[data-menu-action="score"]').click();
    assert.equal($('tray').dataset.anchor, 'menu', 'Menu status inherited the health anchor');
    $('score-button').click();
    assert.equal($('tray').dataset.anchor, 'health');
    key('keydown', 'Escape');
    assert.equal(w.document.activeElement.id, 'score-button');
    console.log('PASS Single-button fish shop, direct Zen/pause/volume, collapsible bar and immediate world entry preserve progress and light dismiss');
    $('home-button').click();
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
    const protectedSave = JSON.parse(w.localStorage.getItem(evaluate('ZQ.STORAGE_KEY')));
    assert(protectedSave.session.fish.every(f => f.sex === 'male' && f.socialCooldown === 90));
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
    evaluate(`{const g=ZQApp.game; g.state.fish[1].sex='female';
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
} finally {
    dom.window.close();
}
