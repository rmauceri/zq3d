'use strict';

const ZQApp = (() => {
    const APP_VERSION = '0.1.0';
    const $ = id => document.getElementById(id);
    const setText = (id, text) => {
        const node = $(id);
        if (node.textContent !== text) node.textContent = text;
    };
    const icon = name => `<svg class="icon" aria-hidden="true"><use href="#i-${name}"/></svg>`;
    const number = value => Math.floor(value).toLocaleString();
    const duration = seconds => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
    const safeText = text => String(text).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
    const PARAMS = { autosave: 12, hudInterval: 0.2, tapTravel: 8, tapDuration: 650, toastDuration: 4500,
        feedDoubleTap: 350, encounterHintDuration: 4, encounterHintFade: 1 };
    const writer = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    let profile = ZQ.createProfile();
    let settings = { ...ZQ.DEFAULT_SETTINGS };
    let savedSession = null, game = null, demo = null, renderer = null;
    let selectedTheme = 'tropical', panelKind = '', journalTab = 'guide';
    let lastSerialized = null, storageBlocked = false, storageConflict = false, saveFailure = '', freshSaveRequired = false;
    let failedSessionSave = false;
    let raf = 0, lastTime = 0, renderTime = 0, visualTime = 0, lastDraw = 0;
    let autosaveTime = 0, hudTime = 0, toastTimer = 0;
    let installPrompt = null, registration = null, offlineReady = false, appInstalled = false, wakeLock = null;
    let wakeGeneration = 0, pointers = new Map(), gesture = null, pinchDistance = 0;
    let lastPointer = null, cameraAngle = 0, initialized = false;
    let trayTrigger = null;
    let encounterFeedback = null;
    let placement = null;
    let lastFeedTap = -Infinity, encounterHint = null;
    const LIVE_TRAYS = new Set(['residents', 'journal', 'score', 'settings', 'prizes', 'menu', 'activity', 'volume', 'progress']);
    const panelContent = () => $('catalog').open ? $('catalog-content') : $('tray').hidden ? $('panel-content') : $('tray-content');
    const sound = new ZQAudio.Soundscape();
    const motionMedia = matchMedia('(prefers-reduced-motion: reduce)');

    function storageWarning(message) {
        saveFailure = message;
        $('save-warning').textContent = message;
        $('save-warning').hidden = false;
        updateSettingsStatus();
    }
    function load() {
        try {
            lastSerialized = localStorage.getItem(ZQ.STORAGE_KEY);
            if (!lastSerialized) return;
            const data = JSON.parse(lastSerialized);
            freshSaveRequired = Number.isInteger(data?.version) && data.version !== ZQ.VERSION;
            const saved = ZQ.validateSave(data);
            profile = saved.profile; settings = saved.settings;
            savedSession = saved.session && !saved.session.ended ? saved.session : null;
            if (savedSession) selectedTheme = savedSession.themeId;
        } catch (error) {
            storageBlocked = true;
            console.warn('zq3d: saved data was not loaded or overwritten.', error);
            storageWarning(freshSaveRequired ? 'This development version cannot read your saved format. Your old data is untouched. Open Settings to review Reset local progress.'
                : lastSerialized
                ? 'Your saved progress could not be read. It has not been changed. Open Settings to review Reset local progress.'
                : 'Local saving is unavailable in this browser. You can still play, but this tab cannot keep your sessions or progress after it closes.');
        }
    }
    // Routine writes keep lifetime progress, not the live aquarium.
    function save(session = savedSession) {
        if (storageBlocked || storageConflict) return false;
        try {
            const current = localStorage.getItem(ZQ.STORAGE_KEY);
            if (current !== lastSerialized) {
                conflict();
                return false;
            }
            const data = { version: ZQ.VERSION, savedAt: new Date().toISOString(), writer,
                profile, settings, session };
            const serialized = JSON.stringify(data);
            localStorage.setItem(ZQ.STORAGE_KEY, serialized);
            lastSerialized = serialized;
            if (saveFailure && (!failedSessionSave || session !== null)) {
                saveFailure = '';
                failedSessionSave = false;
                $('save-warning').hidden = true;
                updateSettingsStatus();
            }
            return true;
        } catch (error) {
            if (!saveFailure) console.warn('zq3d: local saving failed.', error);
            if (session !== null && game && !game.state.ended) failedSessionSave = true;
            storageWarning(failedSessionSave
                ? 'This aquarium could not be saved. Lifetime progress may still save. Keep this tab open, check browser storage, and try Save & Return again.'
                : 'This browser could not save your progress. Keep this tab open and check available browser storage before trying again.');
            return false;
        }
    }
    function conflict() {
        storageConflict = true;
        if (game && !game.state.ended) game.state.paused = true;
        storageWarning('Another window changed this aquarium. This window is paused to protect that save. Reload from Settings to use the latest version.');
        stopAnimation();
        suspendAudio();
        releaseWakeLock();
        refresh();
    }
    function toast(message, kind = 'info', amount = null) {
        clearTimeout(toastTimer);
        const value = amount !== null ? ` ${amount > 0 ? '+' : ''}${Number(amount.toFixed(1))} pts` : '';
        $('toast').textContent = message + value;
        $('toast').dataset.kind = kind;
        $('toast').hidden = false;
        toastTimer = setTimeout(() => { $('toast').hidden = true; }, PARAMS.toastDuration);
    }
    function applyColorScheme() {
        const requested = new URLSearchParams(location.search).get('clawpilotTheme');
        const override = ['light', 'dark'].includes(requested);
        const theme = game?.theme || ZQ.THEMES[selectedTheme];
        const root = document.documentElement;
        const inkWelcome = theme.id === 'ink' && !game;
        root.dataset.theme = override ? requested : theme.id === 'ink' && !inkWelcome ? 'light' : 'dark';
        root.toggleAttribute('data-aquarium-ui', !override);
        const palette = inkWelcome ? theme.welcomeUi : theme.ui;
        for (const [key, value] of Object.entries(palette)) root.style.setProperty(`--cp-aquarium-${key}`, value);
        document.querySelector('meta[name="theme-color"]').content = getComputedStyle(root).getPropertyValue('--cp-bg').trim();
    }
    function applyMotion() {
        const reduced = settings.motion === 'reduced' || settings.motion === 'system' && motionMedia.matches;
        document.body.classList.toggle('reduced-motion', reduced);
        if (renderer) renderer.reduced = reduced;
        requestFrame();
    }
    function canAnimate() {
        return !document.hidden && !$('panel').open && !renderer?.lost
            && (!game || !game.state.paused && !game.state.ended);
    }
    function suspendAudio() {
        sound.suspend().catch(error => {
            console.warn('zq3d: audio could not be suspended.', error);
            toast('Audio was interrupted. Use Volume to restart it.', 'warning');
        });
    }
    function syncAudio(fromGesture = false) {
        $('sound-button').setAttribute('aria-pressed', String(settings.sound));
        $('sound-button').setAttribute('aria-label', settings.sound ? 'Mute sound' : 'Enable sound');
        $('sound-button').innerHTML = icon(settings.sound ? 'sound' : 'muted') + `<span class="wide-label">${settings.sound ? 'Sound on' : 'Sound off'}</span>`;
        if (!settings.sound) {
            sound.disable().catch(error => {
                console.warn('zq3d: audio could not be disabled.', error);
                toast('Your browser could not suspend audio.', 'warning');
            });
            return;
        }
        if (!canAnimate()) { suspendAudio(); return; }
        const themeId = game ? game.state.themeId : selectedTheme;
        if (!sound.context && !fromGesture) return;
        sound.enable(themeId, settings.volume).catch(error => {
            console.warn('zq3d: audio could not be started.', error);
            settings.sound = false;
            save();
            $('sound-button').setAttribute('aria-pressed', 'false');
            $('sound-button').setAttribute('aria-label', 'Enable sound');
            $('sound-button').innerHTML = icon('muted') + '<span class="wide-label">Sound off</span>';
            refresh();
            toast('Sound could not start. Enable sound again when your browser allows audio.', 'warning');
        });
    }
    async function releaseWakeLock() {
        ++wakeGeneration;
        const lock = wakeLock;
        wakeLock = null;
        if (lock && !lock.released) {
            try { await lock.release(); }
            catch (error) { console.warn('zq3d: screen wake lock release failed.', error); }
        }
    }
    async function syncWakeLock() {
        if (!settings.keepAwake || !game || !canAnimate()) { await releaseWakeLock(); return; }
        if (!('wakeLock' in navigator) || wakeLock) return;
        const generation = ++wakeGeneration;
        try {
            const lock = await navigator.wakeLock.request('screen');
            if (generation !== wakeGeneration || !canAnimate()) { await lock.release(); return; }
            wakeLock = lock;
            lock.addEventListener('release', () => { if (wakeLock === lock) wakeLock = null; });
        } catch (error) {
            console.info('zq3d: the browser declined the optional wake lock.', error);
            toast('The browser is managing screen sleep. Your aquarium will pause safely in the background.');
        }
    }

    function preview(themeId, fromGesture = false) {
        if (!Object.hasOwn(ZQ.THEMES, themeId)) return;
        selectedTheme = themeId;
        const theme = ZQ.THEMES[themeId];
        applyColorScheme();
        demo = new ZQ.Game(themeId, ZQ.createProfile(), { demo: true, width: renderer.width, height: renderer.height, seed: 71437 });
        renderer.reset();
        renderer.setTheme(theme, demo.state.bounds);
        $('scene-name').textContent = theme.name;
        $('scene-subtitle').textContent = theme.subtitle;
        $('scene-description').textContent = theme.description;
        for (const button of $('theme-options').children) button.setAttribute('aria-pressed', String(button.dataset.theme === themeId));
        requestFrame();
        syncAudio(fromGesture);
    }
    function updateWelcome() {
        $('best-score').textContent = number(profile.highScore);
        $('achievement-count').innerHTML = `${Object.keys(profile.achievements).length} <small>/ 20</small>`;
        $('resume-card').hidden = !savedSession;
        $('resume-button').hidden = !savedSession;
    }
    function begin(resume = false) {
        if (storageConflict) { toast('Reload from Settings to use the aquarium saved by the other window.', 'warning'); return; }
        clearPointers();
        encounterFeedback = null;
        failedSessionSave = false;
        closePanel();
        document.body.dataset.screen = 'game';
        $('game-ui').hidden = false;
        renderer.resize();
        game = resume && savedSession
            ? new ZQ.Game(savedSession.themeId, profile, { snapshot: savedSession })
            : new ZQ.Game(selectedTheme, profile, { width: renderer.width, height: renderer.height });
        game.resize(renderer.width, renderer.height);
        applyColorScheme();
        savedSession = null;
        renderer.reset();
        renderer.setTheme(game.theme, game.state.bounds);
        visualTime = game.state.elapsed;
        renderTime = visualTime;
        autosaveTime = 0;
        if (resume) game.resume();
        if (resume && game.state.milestone) showMilestone();
        else if (!resume && profile.sessions === 0 && !profile.stats.food) toast('Drag to explore. Pinch or scroll to zoom.');
        consumeEvents();
        save();
        refresh();
        requestFrame();
        syncAudio(true);
        syncWakeLock();
        renderer.canvas.focus({ preventScroll: true });
    }
    function requestBegin() {
        if (storageConflict) { toast('Reload from Settings to use the aquarium saved by the other window.', 'warning'); return; }
        if (savedSession) {
            const previous = new ZQ.Game(savedSession.themeId, profile, { snapshot: savedSession });
            previous.finish();
            savedSession = null;
        }
        begin(false);
    }
    function goHome() {
        clearPointers();
        encounterFeedback = null;
        if (game && !game.state.ended) {
            pause();
            const snapshot = game.snapshot();
            if (!save(snapshot)) {
                toast('This session was not saved. It is still paused here. Check the saving warning and try Save & Return again.', 'warning');
                return false;
            }
            savedSession = snapshot;
        } else {
            savedSession = null;
            save();
        }
        game = null;
        $('milestone-notice').hidden = true;
        applyColorScheme();
        closePanel();
        document.body.dataset.screen = 'welcome';
        document.body.classList.remove('immersed');
        document.body.classList.remove('has-care-alert');
        $('exit-immersion').hidden = true;
        $('game-ui').hidden = true;
        clearTimeout(toastTimer); $('toast').hidden = true;
        renderer.resize();
        preview(selectedTheme);
        updateWelcome();
        releaseWakeLock();
        requestFrame();
        return true;
    }
    function pause(reason = 'Your aquarium is paused. Use Save & Return before closing to keep this session.') {
        if (!game || game.state.ended) return;
        encounterFeedback = null;
        clearPointers();
        game.state.paused = true;
        $('pause-reason').textContent = reason;
        stopAnimation();
        suspendAudio();
        releaseWakeLock();
        save();
        refresh();
        requestFrame();
    }
    function resume() {
        if (!game || storageConflict) { if (storageConflict) toast('Reload to use the latest saved aquarium.', 'warning'); return; }
        if (renderer.lost) { toast('Waiting for the graphics context to recover.', 'warning'); return; }
        game.resume();
        consumeEvents();
        encounterFeedback = null;
        refresh();
        requestFrame();
        syncAudio(true);
        syncWakeLock();
        save();
    }
    function act(action) {
        if (!game) return;
        action();
        consumeEvents();
        refresh();
        requestFrame();
        save();
    }
    function feed() {
        if (!game?.actionable()) return;
        const now = performance.now();
        const normalDrop = placement?.kind === 'food' && now - lastFeedTap <= PARAMS.feedDoubleTap;
        if (normalDrop) {
            clearPointers();
            act(() => game.feed());
            return;
        }
        closePanel(); clearPointers();
        lastFeedTap = now;
        placement = { kind: 'food', point: [0, 0, 0], valid: true };
        $('viewport').focus({ preventScroll: true });
        updatePlacement(); requestFrame();
    }
    function startPrizeMove(id) {
        if (!game?.actionable() || !game.state.equippedPrizes.includes(id)) return;
        closePanel(); clearPointers();
        const point = ZQ.prizePositions(game.state.bounds, [id], game.state.prizePositions)[0].pos;
        placement = { kind: 'prize', id, point: [...point], valid: true };
        $('viewport').focus({ preventScroll: true });
        updatePlacement(); requestFrame();
    }
    function cancelPlacement() {
        placement = null;
        lastFeedTap = -Infinity;
        if (renderer) renderer.prizePreview = null;
        $('placement-controls').hidden = true; $('placement-marker').hidden = true;
        $('feed-button').setAttribute('aria-pressed', 'false');
        setText('feed-detail', '\u22125 pts');
        $('viewport').classList.remove('feeding');
    }
    function updatePlacement() {
        if (!placement) return;
        if (!game?.actionable()) { cancelPlacement(); return; }
        const food = placement.kind === 'food';
        positionPlacementMarker();
        $('placement-marker').dataset.valid = String(placement.valid);
        $('placement-controls').hidden = food;
        setText('placement-hint', placement.message || (food
            ? 'Click the water to drop food. Double-tap Feed for a normal drop.'
            : 'Choose open sand. Arrows move; Enter places; Esc cancels.'));
        setText('placement-confirm', food ? 'Drop food \u22125' : 'Place here');
        $('placement-confirm').disabled = !placement.valid || food && game.state.score < ZQ.CONFIG.feedCost;
        $('feed-button').setAttribute('aria-pressed', String(food));
        setText('feed-detail', food ? 'Click water' : '\u22125 pts');
        renderer.prizePreview = !food && placement.valid ? { id: placement.id, pos: [...placement.point] } : null;
        $('viewport').classList.toggle('feeding', food);
    }
    function positionPlacementMarker() {
        if (!placement) return;
        if (placement.kind === 'food') { $('placement-marker').hidden = true; return; }
        const p = renderer.project(placement.point), rect = $('viewport').getBoundingClientRect();
        $('placement-marker').hidden = !p.visible;
        $('placement-marker').style.transform = `translate(${rect.left + p.x}px, ${rect.top + p.y}px)`;
    }
    function aimPlacement(x, y) {
        if (!placement || !game?.actionable()) return;
        if (placement.kind === 'food') {
            placement.point = game.constrain(renderer.worldPoint(x, y));
            placement.valid = true;
            placement.message = '';
        } else {
            const sand = renderer.sandPoint(x, y, game.state.bounds.floor);
            const point = sand && sand.map((n, i) => n + (gesture?.offset?.[i] || 0));
            const candidate = game.prizeMoveCandidate(placement.id, point);
            placement.valid = candidate.ok;
            placement.message = candidate.ok ? '' : candidate.message;
            if (point) placement.point = candidate.pos || [point[0], placement.point[1], point[2]];
        }
        updatePlacement(); requestFrame();
    }
    function commitPlacement() {
        if (!placement || !game?.actionable()) return;
        if (!placement.valid) { act(() => game.reject(placement.message)); return; }
        const current = placement;
        let result;
        act(() => { result = current.kind === 'food' ? game.feed(current.point) : game.movePrize(current.id, current.point); });
        if (result.ok || current.kind === 'food') cancelPlacement();
        else { placement.message = result.message; updatePlacement(); }
    }
    function consumeEvents() {
        if (!game) return;
        const events = game.drainEvents();
        let mostImportant = null;
        const priority = { milestone: 12, end: 12, defended: 11, prize: 11, challenge: 10, achievement: 9, attack: 8, loss: 7, warning: 6, visitor: 5, birth: 4, bonus: 3 };
        for (const event of events) {
            if (event.type === 'bubble') {
                const p = renderer.project(event.point);
                if (p.visible) sound.effect('bubble', p.x / renderer.width * 2 - 1);
                continue;
            }
            if (!['bonus', 'warning', 'achievement'].includes(event.type)) sound.effect(event.type, lastPointer ? lastPointer[0] / renderer.width * 2 - 1 : 0);
            if (event.type === 'milestone') { showMilestone(); continue; }
            if (event.type === 'end') { showSummary(); continue; }
            if (event.creature && event.rejected && event.encounter && event.encounter === game.state.creature) {
                encounterFeedback = { game, creature: event.encounter, message: event.message, until: game.state.elapsed + 2 };
            } else if (['decoy', 'defended', 'flash', 'challenge'].includes(event.type)) {
                encounterFeedback = null;
            }
            if (!event.creature && (event.rejected || event.type === 'birth' || event.type === 'defended' || event.type === 'loss' || event.type === 'attack' && !game.state.creature) &&
                (!mostImportant || (priority[event.type] || 1) >= (priority[mostImportant.type] || 1))) mostImportant = event;
        }
        if (mostImportant) toast(mostImportant.message, mostImportant.type, mostImportant.amount ?? null);
        if (events.some(e => ['achievement', 'milestone', 'end', 'loss', 'birth', 'prize', 'defended', 'dispute', 'separated'].includes(e.type))) save();
    }
    function updateSocialHint() {
        const node = $('social-hint'), pair = game?.state.disputes[0];
        node.hidden = !pair || game.state.paused || game.state.ended;
        if (node.hidden) return;
        const fish = pair.ids.map(id => game.state.fish.find(f => f.id === id));
        const p = renderer.project(fish[0].pos.map((n, i) => (n + fish[1].pos[i]) / 2));
        const direction = p.x < 0 ? 'left' : p.x > renderer.width ? 'right' : p.y < 0 ? 'above' : p.y > renderer.height ? 'below' : 'turn camera';
        const message = pair.phase === 'fight' ? 'Bettas fighting' : 'Rival males displaying';
        setText('social-hint', `${p.visible ? '' : `Outside view (${direction}): `}${message}. Tap near them or press K to separate.`);
        node.dataset.ready = String(pair.phase === 'fight');
        node.style.left = `${ZQ.clamp(p.x, Math.min(145, renderer.width / 2), Math.max(renderer.width / 2, renderer.width - 145))}px`;
        node.style.top = `${ZQ.clamp(p.y - 70, 80, Math.max(80, renderer.height - 160))}px`;
    }
    function updateEncounterHint() {
        const node = $('encounter-hint'), c = game?.state.creature;
        if (encounterFeedback && (encounterFeedback.game !== game || encounterFeedback.creature !== c ||
            c.defended || c.holdCharge > 0 || encounterFeedback.until <= game.state.elapsed)) encounterFeedback = null;
        node.hidden = !c || game.state.paused || game.state.ended;
        if (node.hidden) return;
        const p = renderer.project(c.pos);
        node.hidden = !c.entered || document.body.classList.contains('tray-open');
        if (node.hidden) {
            if (!c.entered || document.body.classList.contains('tray-open')) encounterHint = null;
            return;
        }
        if (!encounterHint || encounterHint.game !== game || encounterHint.creature !== c) {
            encounterHint = { game, creature: c, since: game.state.elapsed, phase: c.phase };
        }
        if ((c.phase === 'windup' && encounterHint.phase !== 'windup') ||
            (encounterFeedback && encounterHint.feedback !== encounterFeedback)) {
            encounterHint.since = game.state.elapsed;
            encounterHint.feedback = encounterFeedback;
        }
        encounterHint.phase = c.phase;
        const age = game.state.elapsed - encounterHint.since;
        const offscreenAttack = !p.visible && (c.phase === 'windup' || c.phase === 'dash');
        node.hidden = c.defended || !offscreenAttack && age >= PARAMS.encounterHintDuration + PARAMS.encounterHintFade;
        if (node.hidden) { setText('encounter-hint', ''); return; }
        node.style.opacity = offscreenAttack ? '1' : String(ZQ.clamp((PARAMS.encounterHintDuration + PARAMS.encounterHintFade - age) / PARAMS.encounterHintFade, 0, 1));
        const progress = `${c.defenseStep} / ${ZQ.CONFIG.repelSwipes}`;
        let hint = c.defended ? `${c.name} is retreating.`
            : c.kind === 'eel' ? c.phase === 'windup' ? 'Coiling! Press and hold on the eel (hold H).'
                : c.phase === 'dash' ? 'Electric pulse! Keep fish away; hold on the next coil.'
                : 'Eel approaching. Wait for its coil, then press and hold (H).'
            : c.kind === 'crab' ? `Crab: swipe ${c.lastLure === -1 ? 'right' : c.lastLure === 1 ? 'left' : 'left, then right'} (${c.lastLure === -1 ? 'L' : 'J'}). ${progress}`
            : `${c.name}: press and drag outward (X). ${progress}`;
        if (!c.defended && c.phase === 'windup' && c.kind !== 'eel') hint =
            `${c.kind === 'crab' ? 'Claws raised!' : c.kind === 'jellyfish' ? 'Spines dropping!' : 'Ink forming!'} ${hint}`;
        if (!c.defended && c.kind === 'crab' && c.phase === 'dash') hint = `Claw strike! ${hint}`;
        if (!c.defended && c.kind === 'crab' && c.phase === 'recover' && c.cooldown > ZQ.CONFIG.visitorKillCooldown - 1)
            hint = `Sand stirred; water quality is falling. ${hint}`;
        if (c.kind === 'eel' && c.holdCharge > 0) hint = 'Keep holding to discharge the eel!';
        if (!c.defended && encounterFeedback) hint = encounterFeedback.message;
        if (!p.visible) hint = `Outside your view${p.x < 0 ? ' to the left' : p.x > viewport.clientWidth ? ' to the right' : ''}: ${hint} Zoom out or orbit to find it.`;
        setText('encounter-hint', hint);
        node.dataset.ready = String(c.phase === 'windup');
    }
    function refresh() {
        updateSettingsStatus();
        if (!game) { updateWelcome(); return; }
        if (!$('tray').hidden && $('tray').dataset.anchor === 'health') {
            const health = document.querySelector('.game-hud').getBoundingClientRect();
            $('tray').style.setProperty('--health-tray-top', `${health.bottom + 8}px`);
            $('tray').style.setProperty('--health-tray-left', `${health.left}px`);
        }
        const s = game.state;
        const actionable = !s.paused && !s.ended && !storageConflict;
        setText('score', number(s.score));
        const condition = s.tankHealth < 30 ? 'Water needs care' : s.tankHealth < 60 ? 'Water settling' : 'Water clear';
        setText('status-condition', condition);
        $('status-condition').dataset.level = s.tankHealth < 30 ? 'critical' : s.tankHealth < 60 ? 'low' : 'clear';
        const follow = s.fish.find(f => f.id === renderer.camera.follow);
        if (!follow) renderer.camera.follow = null;
        setText('status-detail', follow ? `Following ${game.theme.fish[follow.type].name}` : `${s.fish.length} residents${s.auto ? ' \u00b7 Zen care' : ''}`);
        $('score-button').setAttribute('aria-label', `${number(s.score)} points. ${condition}, ${Math.ceil(s.tankHealth)} percent. ${s.fish.length} residents. Open aquarium status.`);
        $('feed-button').disabled = !actionable || s.score < ZQ.CONFIG.feedCost;
        $('clean-button').disabled = !actionable || s.score < ZQ.CONFIG.cleanCost;
        $('shop-button').disabled = !actionable;
        $('zen-button').disabled = !actionable;
        $('zen-button').setAttribute('aria-pressed', String(s.auto));
        $('pause-button').disabled = s.ended || storageConflict || renderer.lost;
        $('pause-button').setAttribute('aria-label', s.paused ? 'Resume aquarium' : 'Pause aquarium');
        $('pause-button').querySelector('use').setAttribute('href', `#i-${s.paused ? 'play' : 'pause'}`);
        $('pause-button').querySelector('span').textContent = s.paused ? 'Resume' : 'Pause';
        $('volume-button').querySelector('use').setAttribute('href', `#i-${settings.sound && settings.volume > 0 ? 'sound' : 'muted'}`);
        if (panelKind === 'volume' && $('volume-mute')) {
            $('volume-mute').textContent = settings.sound ? 'Mute' : 'Sound on';
            $('volume-mute').setAttribute('aria-pressed', String(settings.sound));
        }
        $('pause-card').hidden = !s.paused || s.ended || $('panel').open;
        $('milestone-notice').hidden = !s.milestone || s.ended;
        $('unpause-button').disabled = storageConflict || renderer.lost;
        let care = '', action = '', target = '';
        $('care-action').disabled = !actionable;
        if (!s.fish.length) {
            care = `Your aquarium is empty. ${Math.max(0, Math.ceil(ZQ.CONFIG.emptyGrace - s.timers.empty))} seconds to add a fish.`;
            action = 'Add fish'; target = 'shop';
        } else if (s.tankHealth < 30) {
            care = 'Your water needs care now.'; action = 'Clean \u221210'; target = 'clean';
        } else if (s.fish.some(f => f.hunger < 15)) {
            care = 'A resident is struggling with hunger.'; action = 'Feed \u22125'; target = 'feed';
        } else if (s.tankHealth < 40) {
            care = 'Your water needs a little care.'; action = 'Clean \u221210'; target = 'clean';
        } else if (s.fish.some(f => f.hunger < 25)) {
            care = 'Your fish are hungry. A little food would help.'; action = 'Feed \u22125'; target = 'feed';
        }
        $('care-alert').hidden = !care || s.ended || s.paused;
        document.body.classList.toggle('has-care-alert', !$('care-alert').hidden);
        setText('care-message', care);
        setText('care-action', action);
        $('care-action').dataset.action = target;
        updateEncounterHint();
        updateSocialHint();
        updatePlacement();
        if (panelKind === 'shop' && $('catalog').open) updateShopButtons();
        if (panelKind === 'residents' && !$('tray').hidden) updateResidents();
        if (panelKind === 'prizes' && !$('tray').hidden) updatePrizes();
        if (panelKind === 'journal' && !$('tray').hidden) updateJournal();
        if (panelKind === 'score' && !$('tray').hidden) updateScore();
        if (panelKind === 'menu' && !$('tray').hidden) updateMenu();
        if (panelKind === 'activity' && !$('tray').hidden) updateActivity();
    }

    function dismissInfoToast() {
        if ($('toast').dataset.kind !== 'info') return;
        clearTimeout(toastTimer);
        $('toast').hidden = true;
    }
    function openPanel(kind, title, eyebrow, html, anchor) {
        dismissInfoToast();
        clearPointers();
        if ($('catalog').open) $('catalog').close();
        panelKind = kind;
        if (LIVE_TRAYS.has(kind)) {
            if ($('panel').open) $('panel').close();
            $('panel-content').replaceChildren();
            if ($('tray').hidden) {
                trayTrigger = document.activeElement;
                $('tray').dataset.anchor = anchor || 'menu';
            } else if (anchor) {
                $('tray').dataset.anchor = anchor;
                trayTrigger = anchor === 'health' ? $('score-button') : $('menu-button');
            }
            $('tray-title').textContent = title;
            $('tray-eyebrow').textContent = eyebrow;
            $('tray-content').innerHTML = html;
            $('tray').hidden = false;
            $('tray').dataset.kind = kind;
            $('menu-button').setAttribute('aria-expanded', String(kind === 'menu'));
            document.body.classList.add('tray-open');
            $('tray-content').scrollTop = 0;
            $('tray').focus({ preventScroll: true });
            requestFrame();
        } else {
            $('tray').hidden = true;
            $('tray-content').replaceChildren();
            document.body.classList.remove('tray-open');
            $('menu-button').setAttribute('aria-expanded', 'false');
            const about = kind === 'about';
            $('panel-logo').hidden = !about;
            $('panel-version').hidden = !about;
            $('panel-eyebrow').hidden = about;
            $('app-version').textContent = about ? APP_VERSION : '';
            $('panel-title').textContent = title;
            $('panel-eyebrow').textContent = eyebrow;
            $('panel-content').innerHTML = html;
            if (!$('panel').open) $('panel').showModal();
            stopAnimation();
            suspendAudio();
            releaseWakeLock();
            $('panel').scrollTop = 0;
        }
        if (game) save();
        $('shop-button').setAttribute('aria-expanded', String($('catalog').open));
        $('volume-button').setAttribute('aria-expanded', String(kind === 'volume'));
        refresh();
    }
    function closePanel() {
        if ($('catalog').open) $('catalog').close();
        if ($('panel').open) $('panel').close();
        if (!$('tray').hidden) {
            $('tray').hidden = true;
            $('tray-content').replaceChildren();
            document.body.classList.remove('tray-open');
            $('menu-button').setAttribute('aria-expanded', 'false');
            if (trayTrigger?.isConnected) trayTrigger.focus({ preventScroll: true });
        }
        panelKind = '';
        $('shop-button').setAttribute('aria-expanded', 'false');
        $('volume-button').setAttribute('aria-expanded', 'false');
    }
    function toggleAutoCare() {
        act(() => {
            if (!game.actionable()) return game.reject('Resume your aquarium before changing Zen care.');
            game.state.auto = !game.state.auto;
            game.emit('care-mode', game.state.auto ? 'Zen care is tending the essentials.' : 'The little world is in your hands.');
        });
    }
    function toggleControls() {
        dismissInfoToast();
        const hidden = !$('command-bar').hidden;
        clearPointers();
        closePanel();
        $('command-bar').hidden = hidden;
        document.body.classList.toggle('controls-hidden', hidden);
        $('controls-toggle').setAttribute('aria-expanded', String(!hidden));
        $('controls-toggle').setAttribute('aria-label', hidden ? 'Show command bar' : 'Hide command bar');
    }
    function showVolume() {
        if (panelKind === 'volume' && !$('tray').hidden) { closePanel(); return; }
        openPanel('volume', 'Volume', '',
            `<div class="volume-controls"><button class="small-button" id="volume-mute" aria-pressed="${settings.sound}">${settings.sound ? 'Mute' : 'Sound on'}</button>
            <input id="dock-volume" aria-label="Volume" type="range" min="0" max="100" step="1" value="${Math.round(settings.volume * 100)}"></div>`);
        $('volume-mute').addEventListener('click', () => {
            settings.sound = !settings.sound;
            $('volume-mute').textContent = settings.sound ? 'Mute' : 'Sound on';
            $('volume-mute').setAttribute('aria-pressed', String(settings.sound));
            save(); syncAudio(true); refresh();
        });
        $('dock-volume').addEventListener('input', event => {
            settings.volume = Number(event.target.value) / 100;
            sound.setVolume(settings.volume); save(); refresh();
        });
    }
    function showMenu() {
        if (!game) return;
        const item = (action, symbol, label) => `<button class="menu-item" data-menu-action="${action}">${icon(symbol)}<span>${label}</span></button>`;
        openPanel('menu', 'Menu', game.theme.name,
            `<div class="aquarium-menu">
            ${item('residents', 'fish', 'Residents & following')}${item('score', 'award', 'Status & progress')}
            ${item('prizes', 'chest', 'Tank prizes')}${item('activity', 'book', 'Recent moments')}
            ${item('journal', 'book', 'Field guide')}${item('settings', 'settings', 'Settings')}
            ${item('immerse', 'expand', 'Immerse')}
            </div>
            <div class="menu-camera" role="group" aria-label="Camera controls">
            ${item('orbit', 'orbit', 'Orbit')}${item('view', 'eye', 'Angle')}
            ${item('zoom-in', 'zoom-in', 'Closer')}${item('zoom-out', 'zoom-out', 'Back')}
            ${item('reset', 'reset', 'Reset')}${item('unfollow', 'fish', 'Stop following')}
            </div>${item('home', 'home', 'Save & Return')}`, 'menu');
        updateMenu();
    }
    function updateMenu() {
        panelContent().querySelector('[data-menu-action="unfollow"]').hidden = !renderer.camera.follow;
    }
    function menuAction(action) {
        const actions = {
            residents: showResidents, score: showScore, prizes: showPrizes, journal: () => showJournal(),
            settings: showSettings, activity: showActivity,
            immerse: () => immerse(true), home: goHome,
            orbit: () => renderer.orbit(Math.PI / 8, 0),
            view: () => {
                cameraAngle = (cameraAngle + 1) % ZQRenderer.PARAMS.camera.views.length;
                renderer.camera.pitch = ZQRenderer.PARAMS.camera.views[cameraAngle];
                renderer.camera.follow = null;
            },
            'zoom-in': () => renderer.zoom(0.88), 'zoom-out': () => renderer.zoom(1.12),
            reset: () => renderer.reset(), unfollow: () => { renderer.camera.follow = null; }
        };
        if (actions[action]) { actions[action](); refresh(); requestFrame(); }
    }
    function showActivity() {
        openPanel('activity', 'Little moments.', 'YOUR AQUARIUM JOURNAL',
            '<p>Discoveries, arrivals, and care milestones stay here without interrupting the water.</p><div id="activity-list"></div>');
        updateActivity();
    }
    function updateActivity() {
        const entries = game.state.activity;
        const host = $('activity-list'), revision = JSON.stringify(entries);
        if (host.dataset.revision === revision) return;
        host.dataset.revision = revision;
        host.innerHTML = entries.length ? [...entries].reverse().map(entry =>
            `<div class="activity-entry"><span class="mono">${duration(entry.time)}</span><p>${safeText(entry.message)}${entry.amount !== null ? ` <small>${entry.amount > 0 ? '+' : ''}${Number(entry.amount.toFixed(1))} pts</small>` : ''}</p></div>`).join('')
            : '<p>The story of this aquarium is just beginning.</p>';
    }
    function confirmPanel(title, text, confirmText, callback) {
        openPanel('confirm', title, 'A MOMENT TO DECIDE',
            `<p>${safeText(text)}</p><div class="panel-actions"><button class="secondary-button" id="cancel-action">Cancel</button><button class="primary-button" id="confirm-action">${safeText(confirmText)}</button></div>`);
        $('cancel-action').addEventListener('click', closePanel);
        $('confirm-action').addEventListener('click', () => { closePanel(); callback(); });
        $('cancel-action').focus();
    }
    function showShop() {
        if ($('catalog').open) { closePanel(); return; }
        if (!game || !game.actionable()) return;
        dismissInfoToast();
        cancelPlacement(); clearPointers(); closePanel();
        trayTrigger = document.activeElement; panelKind = 'shop';
        $('catalog-content').innerHTML =
            `<div class="catalog-list">${game.theme.fish.map((f, i) => `
            <button class="catalog-fish" data-buy="${i}" aria-label="Add ${f.name} for ${f.cost} points" title="${safeText(f.traits.join(' & '))}">
            <span class="species-preview">${ZQRenderer.fishPreview(f)}</span><span class="catalog-name">${f.name}</span>
            <span class="catalog-cost">${f.cost}<small>pts</small></span></button>`).join('')}</div>`;
        $('catalog').show();
        panelContent().querySelectorAll('[data-buy]').forEach(button => button.addEventListener('click', () => {
            game.buy(Number(button.dataset.buy));
            consumeEvents(); save(); refresh();
            requestFrame();
        }));
        updateShopButtons();
        $('shop-button').setAttribute('aria-expanded', 'true');
        ($('catalog-content').querySelector('[data-buy]:not(:disabled)') || $('catalog')).focus({ preventScroll: true });
        requestFrame();
    }
    function updateShopButtons() {
        if (!$('catalog').open || !game) return;
        panelContent().querySelectorAll('[data-buy]').forEach(button => {
            button.disabled = !game.actionable() || game.state.score < game.theme.fish[Number(button.dataset.buy)].cost || game.state.fish.length >= game.state.maxFish;
        });
    }
    function residentActivity(f) {
        const social = { court: 'Courting', display: 'Territorial display', fight: 'Fighting' };
        if (social[f.activity]) return social[f.activity];
        const labels = { explore: 'Exploring formations', browse: 'Browsing plant edges', channel: 'Following the channel' };
        return f.activity === f.intent && labels[f.habitatActivity] || f.activity;
    }
    function residentRow(f) {
        const def = game.theme.fish[f.type];
        return `<div class="shop-row" data-resident="${f.id}"><div class="species-mark">${icon('fish')}</div><div class="species-info"><h3 data-resident-name>${def.name} \u00b7 ${f.sex === 'male' ? 'Male' : 'Female'}${f.growth < 1 ? ' \u00b7 Baby' : ''}</h3>
            <p data-resident-traits>${def.traits.join(' &amp; ')} \u00b7 ${safeText(residentActivity(f))}</p>
            <div class="resident-meters"><span><span data-health-label>Health ${Math.ceil(f.health)}%</span><span class="meter" data-health-meter><span style="width:${f.health}%"></span></span></span>
            <span><span data-hunger-label>Fullness ${Math.ceil(f.hunger)}%</span><span class="meter" data-hunger-meter><span style="width:${f.hunger}%"></span></span></span></div></div>
            <button class="small-button" data-follow="${f.id}" aria-label="Follow ${def.name}">Follow</button></div>`;
    }
    function showResidents() {
        if (!game) return;
        const residents = game.state.fish;
        openPanel('residents', 'Meet your residents.', game.theme.name,
            `<p>Males have contrasting fin colors, broad bright flank ribbons, or bolder natural spots and patches. Follow drifts alongside a fish.</p>
            <p id="breeding-summary"></p>
            <div id="resident-list">${residents.map(residentRow).join('')}</div>
            <p id="resident-empty" ${residents.length ? 'hidden' : ''}>Your aquarium is empty. Add a fish to bring it back to life.</p>`);
        $('resident-list').addEventListener('click', event => {
            const button = event.target.closest('[data-follow]');
            if (!button) return;
            const fishId = Number(button.dataset.follow);
            if (!game.state.fish.some(f => f.id === fishId)) { toast('This fish is no longer in the aquarium.', 'warning'); return; }
            renderer.camera.follow = fishId;
            closePanel(); refresh(); requestFrame();
        });
    }
    function updateResidents() {
        const list = $('resident-list');
        if (!list) return;
        for (const f of game.state.fish) {
            if (!list.querySelector(`[data-resident="${f.id}"]`)) list.insertAdjacentHTML('beforeend', residentRow(f));
        }
        $('resident-empty').hidden = game.state.fish.length > 0;
        setText('breeding-summary', game.theme.fish.map((def, type) => {
            const adults = game.state.fish.filter(f => f.type === type && f.growth === 1);
            if (!adults.length) return '';
            const males = adults.filter(f => f.sex === 'male').length, females = adults.length - males;
            const ready = adults.some(f => f.sex === 'male' && game.breedingFish(f)) &&
                adults.some(f => f.sex === 'female' && game.breedingFish(f));
            return `${def.name}: ${males} male / ${females} female${ready ? ' (breeding pair)' : ''}`;
        }).filter(Boolean).join(' \u00b7 '));
        list.querySelectorAll('[data-resident]').forEach(row => {
            const f = game.state.fish.find(f => f.id === Number(row.dataset.resident));
            row.querySelector('[data-follow]').disabled = !f;
            if (f) {
                const def = game.theme.fish[f.type];
                row.querySelector('[data-resident-name]').textContent = `${def.name} \u00b7 ${f.sex === 'male' ? 'Male' : 'Female'}` + (f.growth < 1 ? ' \u00b7 Baby' : '');
                row.querySelector('[data-resident-traits]').textContent = def.traits.join(' & ') + ` \u00b7 ${residentActivity(f)}${f.schooling ? ' \u00b7 Schooling' : ''}`;
            }
            row.querySelector('[data-health-label]').textContent = f ? `Health ${Math.ceil(f.health)}%` : 'This fish was lost.';
            row.querySelector('[data-hunger-label]').textContent = f ? `Fullness ${Math.ceil(f.hunger)}%` : '';
            row.querySelector('[data-health-meter] > span').style.width = `${f?.health || 0}%`;
            row.querySelector('[data-hunger-meter] > span').style.width = `${f?.hunger || 0}%`;
            row.querySelector('[data-health-meter]').classList.toggle('critical', Boolean(f && f.health < 30));
            row.querySelector('[data-hunger-meter]').classList.toggle('low', Boolean(f && f.hunger < 25));
        });
    }
    function showPrizes() {
        openPanel('prizes', 'Treasures with a story.', 'YOUR TANK PRIZES',
            `<p>Earned through care and courage in this round. A new aquarium starts a new collection; resuming keeps these treasures.</p>
            <div class="live-label"><span class="live-dot"></span><span id="prize-placement-count"></span></div>
            <div class="prize-grid">${ZQ.PRIZES.map(prize => `<article class="prize-card" data-prize-card="${prize.id}">
                <div class="species-mark">${icon(prize.id === 'chest' ? 'chest' : prize.id)}</div><h3>${prize.name}</h3>
                <p>${prize.description}</p><small>${prize.requirement}</small>
                <progress data-prize-progress="${prize.id}" max="${prize.goal}" value="0" aria-label="${prize.requirement}"></progress>
                <button class="small-button" data-equip="${prize.id}" aria-pressed="false">Not yet earned</button>
                <button class="small-button prize-play" data-prize-play="${prize.id}" hidden>Enjoy this prize</button>
                <button class="small-button" data-prize-move="${prize.id}" hidden>Move</button>
            </article>`).join('')}</div>
            <div class="note-box">Tap a prize to enjoy its animation, or drag it along the sand. Move also supports arrows and Enter. Prizes are purely for delight; placements are saved with this round.</div>`);
        panelContent().querySelectorAll('[data-equip]').forEach(button => button.addEventListener('click', () => {
            if (game) act(() => game.equipPrize(button.dataset.equip));
        }));
        panelContent().querySelectorAll('[data-prize-move]').forEach(button => button.addEventListener('click', () => startPrizeMove(button.dataset.prizeMove)));
        panelContent().querySelectorAll('[data-prize-play]').forEach(button => button.addEventListener('click', () => {
            if (game) act(() => game.interactPrize(button.dataset.prizePlay));
        }));
        updatePrizes();
    }
    function updatePrizes() {
        if (!$('prize-placement-count')) return;
        const s = game.state;
        $('prize-placement-count').textContent = `${s.equippedPrizes.length} of ${ZQ.CONFIG.prizeLimit} prizes placed \u00b7 ${Object.keys(s.prizes).length} of ${ZQ.PRIZES.length} earned this round`;
        for (const prize of ZQ.PRIZES) {
            const card = panelContent().querySelector(`[data-prize-card="${prize.id}"]`);
            if (!card) continue;
            const unlocked = Object.hasOwn(s.prizes, prize.id), placed = s.equippedPrizes.includes(prize.id);
            card.classList.toggle('unlocked', unlocked);
            const button = card.querySelector('[data-equip]');
            button.textContent = !unlocked ? 'Not yet earned' : placed ? 'Put away' : 'Place in tank';
            button.setAttribute('aria-pressed', String(placed));
            button.disabled = !unlocked || !game?.actionable() || !placed && s.equippedPrizes.length >= ZQ.CONFIG.prizeLimit;
            const play = card.querySelector('[data-prize-play]');
            play.hidden = !placed;
            play.disabled = !game?.actionable();
            const move = card.querySelector('[data-prize-move]');
            move.hidden = !placed; move.disabled = !game?.actionable();
            const progress = card.querySelector('progress');
            progress.hidden = unlocked;
            progress.value = prize.stat === 'score' ? s.score : s.stats[prize.stat];
        }
    }
    function discoveryContent() {
        return `<p>Twenty little reasons to look closer. Each discovery awards its bonus once per saved profile, multiplied by your current healthy streak.</p>
            <div class="achievement-grid">${ZQ.ACHIEVEMENTS.map(a => `<article data-achievement="${a.id}" class="achievement ${profile.achievements[a.id] ? 'unlocked' : ''}">
            <div class="achievement-top">${icon('award')}<span>+${a.bonus} pts</span></div><h3>${a.name}</h3><p>${a.description}</p><small>${profile.achievements[a.id] ? `Discovered ${profile.achievements[a.id]}` : 'Still to discover'}</small></article>`).join('')}</div>`;
    }
    function showProgress() {
        openPanel('progress', 'Your progress.', 'ACROSS YOUR AQUARIUMS',
            `<div class="session-stats">
                <div><strong>${number(profile.highScore)}</strong><small>PERSONAL BEST</small></div>
                <div><strong>${number(profile.sessions)}</strong><small>SESSIONS COMPLETED</small></div>
                <div><strong>${duration(profile.stats.longest)}</strong><small>LONGEST SESSION</small></div>
                <div><strong>${profile.themesPlayed.length} / ${Object.keys(ZQ.THEMES).length}</strong><small>WORLDS VISITED</small></div>
                <div><strong>${number(profile.stats.born)}</strong><small>BABIES BORN</small></div>
                <div><strong>${Object.keys(profile.achievements).length} / ${ZQ.ACHIEVEMENTS.length}</strong><small>DISCOVERIES</small></div>
            </div>
            <h3>Your discoveries</h3>${discoveryContent()}`);
    }
    function showAbout() {
        openPanel('about', 'Zenquarium 3D', '',
            `<p id="about-tagline" class="brand-tagline" tabindex="-1">A little world. <span>A deeper calm.</span></p>
            <p id="about-description">The calm of Zenquarium, in three dimensions. Explore five living worlds, care for curious fish, and enjoy locally generated sights and sound.</p>
            <p>Created with care. No accounts, telemetry, or external services. Your progress stays on this device.</p>
            <a class="original-link" href="https://rmauceri.github.io/zenquarium" target="_blank" rel="noopener noreferrer">Looking for the original Zenquarium? <span aria-hidden="true">&nearr;</span></a>`);
        $('about-tagline').focus({ preventScroll: true });
        $('panel-content').scrollTop = 0;
    }
    function showJournal(tab = journalTab) {
        journalTab = tab;
        const tabs = `<div class="panel-tabs" role="group" aria-label="Field guide sections">
            <button data-tab="guide" aria-pressed="${tab === 'guide'}">A little guidance</button>
            <button data-tab="achievements" aria-pressed="${tab === 'achievements'}">Discoveries &middot; ${Object.keys(profile.achievements).length}/20</button>
            <button data-tab="prizes" aria-pressed="false">Tank prizes</button></div>`;
        const guide = `
            <p>Same soul. A new perspective. Zenquarium 3D is a standalone companion to Zenquarium, made for a few quiet minutes or a longer journey.</p>
            <div class="guide-grid">
                ${icon('feed')}<div><h3>Tend, don't hurry.</h3><p>Tap Feed once, then click anywhere in the water to place flakes there. Double-tap Feed for a normal surface drop. Each drop costs 5 points; Escape cancels without spending. Clean for 10. Adult fish above 50% health earn 0.5 points per second. Babies grow into their role. Empty aquariums have a five-second rescue window; zero water health ends a session.</p></div>
                ${icon('award')}<div><h3>A healthy rhythm.</h3><p>Keep every fish above 80% health for \u00d71.5 at 30 seconds, \u00d72 at 90, and \u00d73 at 180. A fish below 50% resets it. The multiplier applies to positive earnings, not costs or penalties. All four species, happy schools, and baby fish bring bonuses.</p></div>
                ${icon('fish')}<div><h3>Defend their little world.</h3><p>Creatures persist until you fend them off. Help appears near the dock on entry and each attack warning, then fades. Press on a jellyfish, squid, or octopus, drag outward, then release; three swipes send it away. Octopus and squid ink, dropped jellyfish spines, and an eel's electric field kill any fish crossing them. Crabs grab fish with their claws and can jump off the floor. A lost fish rolls upside down, floats up, then dissolves. A message confirms successful defense.</p></div>
                ${icon('chest')}<div><h3>Claws and currents.</h3><p>Bright crabs steal fallen food and snap at nearby fish. Press the crab and swipe left, right, then left (or right, left, right). Eels coil before releasing an electric pulse and lunging. Press and hold on a coiling eel until its discharge cue. A short tap is not enough. With a keyboard: X swipes ordinary creatures, J/L alternate crab swipes, and holding H discharges a coiling eel. Defense gestures never count as stressful glass taps. Everything freezes when paused.</p></div>
                ${icon('oyster')}<div><h3>Care leaves its treasures.</h3><p>Reach 1,000 points for a Bubble Chest. Welcome a baby for a Pearl Oyster. Repel an eel for a Watchlight Lantern; outwit a crab for a Tidekeeper Arch. Earn them anew each round, place three at a time, and tap them to bring them to life.</p></div>
                ${icon('leaf')}<div><h3>Let the aquarium breathe.</h3><p>Each fish is randomly male or female, including babies. Males have contrasting fin colors, broad bright flank ribbons, or bolder natural spots and patches; each species keeps its recognizable pattern. Residents shows sex and adult pair counts. Adult parents need fullness above 60%, health above 70%, and water above 50%. They approach and circle before a birth; threats, poor water, or a full tank interrupt courtship. Babies must grow up before breeding. Sparse tanks breed more readily, after a shared 25-to-45-second respite that lengthens as the tank fills. A brief announcement welcomes each baby.</p></div>
                ${icon('fish')}<div><h3>Give rivals space.</h3><p>Two adult male Brushstroke Bettas may display when they meet, then fight after four seconds. Tap the glass near either rival, or press K even if they are outside your view. This protective tap separates them without stress or waking visitors. Eight more seconds of fighting costs a fish its life. Separated rivals retreat and settle for ninety seconds. Zen care separates them automatically; pause freezes courtship and disputes.</p></div>
                ${icon('leaf')}<div><h3>A gentle helping hand.</h3><p>Full fish have at least fifty seconds before seeking food; portions grow with the hungry population. Zen care automatically feeds, cleans, maintains a small population, and separates territorial rivals. Care still costs points; it is assistance, not invulnerability.</p></div>
                ${icon('orbit')}<div><h3>A whole new point of view.</h3><p>Drag empty water to orbit. Pinch or scroll to zoom. Outside food aiming, tap the glass, fish, or creature for a reaction; G is the keyboard equivalent. Glass taps stir resting visitors without defending them or skipping their warning. Repeated tapping causes stress. Creature gestures defend; tap prizes to enjoy them or drag them along open sand. Each new round earns its own prizes; saved rounds retain placements.</p></div>
                ${icon('wave')}<div><h3>A habitat, not a backdrop.</h3><p>Residents browse plant edges, explore formations, rest near shelter, and follow the lower channel in loose schools. Smaller fish can use openings that larger bodies cannot fit through. Crabs follow the sand banks and food settles on their slopes. Place prizes on level sand. Your aquarium keeps its shape when the screen rotates; the camera reframes instead.</p></div>
            </div>
            <h3>Small steps, meaningful milestones</h3>
            <p>Bronze at 1,000, Silver at 2,500, Gold at 5,000, and Platinum at 10,000 points. Master means keeping at least fifteen fish and all four species for three continuous minutes. A small notice celebrates each milestone without pausing: Continue dismisses it; Stop finishes with a victory.</p>
            <div class="note-box"><strong>Keep the flow</strong><br>The see-through fish catalog and score details leave the aquarium visible. Dialogs and trays dismiss with an outside tap or Escape. Routine discoveries and bonuses appear in Recent moments, not repeated popups. Milestone notices keep the water moving. Only explicit pause, confirmations, and session summaries stop time.</div>
            <div class="note-box"><strong>Keyboard</strong><br><span class="mono">M</span> menu &middot; <span class="mono">F</span> aim food &middot; <span class="mono">C</span> clean &middot; <span class="mono">B</span> catalog &middot; <span class="mono">T</span> tank prizes &middot; <span class="mono">Space</span> pause &middot; <span class="mono">I</span> immerse &middot; <span class="mono">R</span> reset camera &middot; arrow keys orbit &middot; <span class="mono">+ / -</span> zoom. During food aiming or a prize's Move action, arrows change x/depth, Enter confirms, and Escape cancels.</div>
            <div class="note-box">No accounts, tracking, external assets, or ads. Progress lives only on this device, separately from Zenquarium. Install from a secure web address for offline play. Time never advances while you are away.</div>`;
        openPanel('journal', 'The field guide.', 'CURIOSITY LOOKS GOOD ON YOU', tabs + (tab === 'guide' ? guide : discoveryContent()));
        panelContent().querySelectorAll('[data-tab]').forEach(button => button.addEventListener('click', () => button.dataset.tab === 'prizes' ? showPrizes() : showJournal(button.dataset.tab)));
    }
    function updateJournal() {
        panelContent().querySelector('[data-tab="achievements"]').textContent = `Discoveries \u00b7 ${Object.keys(profile.achievements).length}/${ZQ.ACHIEVEMENTS.length}`;
        panelContent().querySelectorAll('[data-achievement]').forEach(card => {
            const date = profile.achievements[card.dataset.achievement];
            card.classList.toggle('unlocked', Boolean(date));
            card.querySelector('small').textContent = date ? `Discovered ${date}` : 'Still to discover';
        });
    }
    function showScore(anchor) {
        if (!game) return;
        openPanel('score', 'A healthy rhythm.', 'YOUR SCORE, EXPLAINED',
            `<div class="session-stats"><div><strong id="detail-score"></strong><small>POINTS</small></div><div><strong id="detail-multiplier"></strong><small>MULTIPLIER</small></div><div><strong id="detail-rate"></strong><small>POINTS / SECOND</small></div></div>
            <div class="status-water"><div><span>Water health</span><strong id="water-value"></strong></div>
            <div class="meter" id="water-meter" role="progressbar" aria-label="Water health" aria-valuemin="0" aria-valuemax="100" aria-valuenow="100"><span id="water-bar"></span></div></div>
            <p id="detail-population"></p><p id="next-goal"></p><progress id="goal-progress" value="0" max="1000" aria-label="Next milestone"></progress>
            <div class="panel-actions"><button class="small-button" data-menu-action="residents">Meet residents</button><button class="small-button" data-menu-action="unfollow" id="status-unfollow" hidden>Stop following</button><button class="small-button" data-menu-action="activity">Recent moments</button></div>
            <p id="detail-streak"></p>
            <div class="note-box">30 seconds: \u00d71.5 &nbsp; / &nbsp; 90 seconds: \u00d72 &nbsp; / &nbsp; 180 seconds: \u00d73<br>All fish must be above 80% to build the streak. Below 50% resets your multiplier.</div>
            <h3>Care pays off</h3><p>Perfect Tank: +25 every 60 seconds with five fish above 90% health. Biodiversity: +15 every 45 seconds with all four species. Baby Born: +10. Clean Sweep: +20 when water is above 70% before cleaning.</p>
            <h3>Every resident matters</h3><p>Fish lost: \u221215; starvation: \u221220. Repeated glass tapping: \u22125 and water damage. Neglected water: \u221210 every 30 seconds below 25%. Scores never go below zero.</p>`, anchor);
    }
    function updateScore() {
        const s = game.state, earning = s.fish.filter(f => f.health > 50 && f.growth === 1).length;
        $('detail-score').textContent = number(s.score);
        $('detail-multiplier').textContent = `\u00d7${s.multiplier}`;
        $('detail-rate').textContent = (earning * ZQ.CONFIG.scoreRate * s.multiplier).toFixed(1);
        $('water-value').textContent = `${Math.ceil(s.tankHealth)}%`;
        $('water-bar').style.width = `${s.tankHealth}%`;
        $('water-meter').setAttribute('aria-valuenow', String(Math.ceil(s.tankHealth)));
        $('water-meter').classList.toggle('low', s.tankHealth < 60);
        $('water-meter').classList.toggle('critical', s.tankHealth < 30);
        $('detail-population').textContent = `${s.fish.length} of ${s.maxFish} residents \u00b7 ${game.theme.name}`;
        const milestone = ZQ.MILESTONES.find(m => m.score && !s.milestones.includes(m.id));
        $('next-goal').textContent = milestone ? `${number(s.score)} / ${number(milestone.score)} to ${milestone.name}` : 'Master: fifteen residents and all four species for three continuous minutes.';
        $('goal-progress').max = milestone ? milestone.score : 180;
        $('goal-progress').value = milestone ? s.score : s.thriving || 0;
        $('goal-progress').setAttribute('aria-label', milestone ? `Progress to ${milestone.name}` : 'Progress to Master Aquarist');
        $('status-unfollow').hidden = !renderer.camera.follow;
        $('detail-streak').textContent = `${earning} healthy adult fish earn ${ZQ.CONFIG.scoreRate} points each second, multiplied by your health streak. Your current continuous healthy streak is ${Math.floor(s.streak)} seconds.`;
    }
    function showMilestone() {
        if (!game?.state.milestone) return;
        const milestone = ZQ.MILESTONES.find(m => m.id === game.state.milestone);
        setText('milestone-title', `${milestone.name} achieved`);
        $('milestone-notice').hidden = false;
        save();
    }
    function showSummary() {
        if (!game) return;
        const s = game.state;
        savedSession = null;
        failedSessionSave = false;
        document.body.classList.remove('immersed'); $('exit-immersion').hidden = true;
        openPanel('summary', s.outcome === 'victory' ? 'A beautiful place to pause.' : s.outcome === 'defeat' ? 'Every aquarium teaches us.' : 'Time well spent.',
            s.outcome === 'victory' ? 'A WELL-EARNED VICTORY' : 'YOUR AQUARIUM JOURNAL',
            `<p${s.outcome === 'defeat' ? ' class="error-text"' : ''}>${safeText(s.reason)}</p>
            <div class="session-stats"><div><strong>${number(s.score)}</strong><small>FINAL SCORE</small></div><div><strong>${duration(s.elapsed)}</strong><small>ACTIVE TIME</small></div><div><strong>${number(profile.highScore)}</strong><small>PERSONAL BEST</small></div>
            <div><strong>${s.stats.born}</strong><small>BABIES BORN</small></div><div><strong>${s.stats.lost}</strong><small>FISH LOST</small></div><div><strong>${s.stats.peak}</strong><small>PEAK RESIDENTS</small></div></div>
            ${s.newAchievements.length ? `<h3>Discovered along the way</h3><p>${s.newAchievements.map(id => ZQ.ACHIEVEMENTS.find(a => a.id === id).name).join(' &middot; ')}</p>` : ''}
            <div class="panel-actions"><button class="primary-button" id="summary-home">Back to your worlds ${icon('arrow')}</button></div>`);
        $('summary-home').addEventListener('click', goHome);
        save();
    }
    function showSettings() {
        const fullscreen = document.fullscreenElement || document.fullscreenEnabled && document.documentElement.requestFullscreen;
        openPanel('settings', 'Settings', 'YOUR PREFERENCES',
            `<div id="settings-save-warning" class="note-box error-text" hidden></div>
            <div id="settings-save-actions" class="panel-actions" hidden>
                <button class="secondary-button" id="reload-button" hidden>Reload latest save</button>
                <button class="secondary-button" id="reset-save-button" hidden>Reset local progress</button>
            </div>
            <div id="settings-graphics-warning" class="note-box" hidden></div>
            <h3>Sound &amp; comfort</h3>
            <div class="setting-row"><label for="setting-sound">Sound<small>Underwater ambience and musical effects.</small></label><input id="setting-sound" type="checkbox" ${settings.sound ? 'checked' : ''}></div>
            <div class="setting-row"><label for="setting-volume">Volume</label><input id="setting-volume" type="range" min="0" max="100" step="1" value="${Math.round(settings.volume * 100)}"></div>
            <div class="setting-row"><label for="setting-motion">Motion<small>Reduced motion softens plants, fins, and floating details.</small></label><select id="setting-motion">
            ${[['system', 'Follow device'], ['full', 'Full'], ['reduced', 'Reduced']].map(([id, label]) => `<option value="${id}" ${settings.motion === id ? 'selected' : ''}>${label}</option>`).join('')}</select></div>
            <details class="settings-section" id="settings-display">
                <summary>Display &amp; battery</summary>
                <p>Automatic is recommended. These options affect appearance and power use, not the game rules.</p>
                <div class="setting-row"><label for="setting-quality">Visual quality<small>Automatic adapts to your device. Battery saver targets 30 frames per second.</small></label><select id="setting-quality">
                ${[['auto', 'Automatic'], ['high', 'High'], ['balanced', 'Balanced'], ['battery', 'Battery saver']].map(([id, label]) => `<option value="${id}" ${settings.quality === id ? 'selected' : ''}>${label}</option>`).join('')}</select></div>
                ${'wakeLock' in navigator ? `<div class="setting-row"><label for="setting-awake">Keep screen awake<small>Only while the aquarium is visible and running.</small></label><input id="setting-awake" type="checkbox" ${settings.keepAwake ? 'checked' : ''}></div>` : ''}
                ${fullscreen ? '<div class="panel-actions"><button class="secondary-button" id="fullscreen-button">Toggle fullscreen</button></div>' : ''}
                <p id="settings-renderer" class="settings-detail"></p>
            </details>
            <details class="settings-section" id="settings-install">
                <summary>Install &amp; offline</summary>
                <p id="settings-install-status"></p>
                <p id="settings-offline-status" class="settings-detail"></p>
                <button class="secondary-button" id="install-app" hidden>Install Zenquarium 3D</button>
            </details>
            <h3>Your progress</h3>
            <p>Lifetime stats, discoveries, and preferences are saved automatically on this device. Use <strong>Save &amp; Return</strong> each time you want to keep the current aquarium for later. Only one session is kept.</p>
            ${game && !game.state.ended ? '<div class="panel-actions"><button class="secondary-button" id="save-home-button">Save &amp; Return</button><button class="secondary-button" id="end-session-button">Finish this session</button></div>' : ''}`);
        $('setting-sound').addEventListener('change', event => { settings.sound = event.target.checked; save(); syncAudio(true); refresh(); });
        $('setting-volume').addEventListener('input', event => { settings.volume = Number(event.target.value) / 100; sound.setVolume(settings.volume); save(); refresh(); });
        $('setting-quality').addEventListener('change', event => {
            settings.quality = event.target.value; renderer.setQuality(settings.quality); save(); refresh(); requestFrame();
        });
        $('setting-motion').addEventListener('change', event => { settings.motion = event.target.value; applyMotion(); save(); });
        $('setting-awake')?.addEventListener('change', event => { settings.keepAwake = event.target.checked; save(); syncWakeLock(); });
        $('reload-button').addEventListener('click', () => location.reload());
        $('reset-save-button').addEventListener('click', () => {
            const expectedSave = lastSerialized;
            confirmPanel('Reset local progress?', 'This removes this device\'s saved aquarium, lifetime statistics, and discoveries for Zenquarium 3D. It cannot be undone. The original Zenquarium is not affected.', 'Reset progress', () => {
                try {
                    if (localStorage.getItem(ZQ.STORAGE_KEY) !== expectedSave) { conflict(); return; }
                    localStorage.removeItem(ZQ.STORAGE_KEY);
                    location.reload();
                } catch (error) {
                    console.error('zq3d: save reset failed.', error);
                    storageWarning('This browser did not allow the saved data to be removed.');
                }
            });
        });
        $('fullscreen-button')?.addEventListener('click', toggleFullscreen);
        $('install-app').addEventListener('click', install);
        $('save-home-button')?.addEventListener('click', goHome);
        $('end-session-button')?.addEventListener('click', () => confirmPanel('Finish this session?', 'This ends the aquarium and shows your results. To keep it for later instead, use Save & Return.', 'Finish session', () => act(() => game.finish())));
    }
    function updateSettingsStatus() {
        if (panelKind !== 'settings' || $('tray').hidden) return;
        setText('settings-save-warning', saveFailure);
        $('settings-save-warning').hidden = !saveFailure;
        const canReset = storageBlocked && lastSerialized !== null && !storageConflict;
        $('reload-button').hidden = !storageConflict;
        $('reset-save-button').hidden = !canReset;
        $('settings-save-actions').hidden = !storageConflict && !canReset;
        $('settings-graphics-warning').hidden = renderer.is3D && !renderer.lost;
        if (!$('settings-graphics-warning').hidden) {
            setText('settings-graphics-warning', renderer.lost
                ? '3D graphics were interrupted. Your aquarium is paused while they recover.'
                : 'WebGL 3D is unavailable. The aquarium is using a playable Canvas 2D perspective view.');
        }
        setText('settings-renderer', `${renderer.is3D ? 'WebGL 3D' : 'Canvas 2D compatibility'} \u00b7 ${renderer.level} quality`);
        const inFile = location.protocol === 'file:';
        const installed = appInstalled || matchMedia('(display-mode: standalone)').matches || navigator.standalone;
        const appleMobile = /iPad|iPhone|iPod/.test(navigator.userAgent)
            || navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
        const canInstall = !installed && !inFile && window.isSecureContext && Boolean(installPrompt);
        $('install-app').hidden = !canInstall;
        setText('settings-install-status', installed ? 'Installed on this device.'
            : inFile ? 'Installation is available from a secure web address, not a local file.'
            : !window.isSecureContext ? 'App installation needs a secure web address.'
            : canInstall ? 'Give your aquarium a place on this device.'
            : appleMobile ? 'Use Share, then Add to Home Screen.'
            : 'Use your browser\u2019s install command, if offered.');
        setText('settings-offline-status', inFile ? 'Local-file play works without an internet connection.'
            : offlineReady ? 'Ready for offline play.'
            : 'serviceWorker' in navigator && window.isSecureContext ? 'An offline copy is not ready. Keep a connection for now.'
            : 'Offline browser caching is unavailable here.');
    }
    async function toggleFullscreen() {
        try {
            if (document.fullscreenElement) await document.exitFullscreen();
            else if (document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen();
            else toast('Use Add to Home Screen for a full-screen aquarium on this device.');
        } catch (error) {
            console.info('zq3d: fullscreen was declined.', error);
            toast('Fullscreen is unavailable here. Your aquarium still works in this window.');
        }
    }
    function immerse(enabled) {
        if (!game) return;
        if (enabled) { clearPointers(); closePanel(); }
        document.body.classList.toggle('immersed', enabled);
        $('exit-immersion').hidden = !enabled;
        if (enabled) $('exit-immersion').focus(); else $('menu-button').focus();
        requestFrame();
    }
    function stopAnimation() {
        clearPointers();
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
        lastTime = 0;
    }
    function requestFrame() {
        if (!raf && !document.hidden && renderer) raf = requestAnimationFrame(frame);
    }
    function frame(now) {
        raf = 0;
        const dt = lastTime ? Math.min(0.1, (now - lastTime) / 1000) : 0;
        const frameMs = lastTime ? now - lastTime : 0;
        lastTime = now;
        const scene = game || demo;
        if (!scene) return;
        if (canAnimate()) {
            let remaining = dt;
            while (remaining > 0) {
                const step = Math.min(1 / 60, remaining);
                scene.update(step);
                remaining -= step;
            }
            visualTime += dt;
            renderTime = visualTime;
            if (game) {
                consumeEvents();
                autosaveTime += dt; hudTime += dt;
                if (autosaveTime >= PARAMS.autosave) { autosaveTime = 0; save(); }
                if (hudTime >= PARAMS.hudInterval) { hudTime = 0; refresh(); }
            }
        }
        if (now - lastDraw >= 1000 / renderer.fps - 1 || !canAnimate()) {
            renderer.render(scene.state, renderTime, dt);
            positionPlacementMarker();
            updateEncounterHint();
            updateSocialHint();
            lastDraw = now;
        }
        if (canAnimate()) {
            if (frameMs) renderer.sampleFrame(frameMs);
            requestFrame();
        } else lastTime = 0;
    }
    function resize() {
        if (!renderer) return;
        renderer.resize();
        const rect = $('viewport').getBoundingClientRect();
        document.body.style.setProperty('--preview-top', `${rect.top}px`);
        document.body.style.setProperty('--preview-bottom', `${Math.max(0, innerHeight - rect.top - rect.height)}px`);
        const scene = game || demo;
        if (scene) {
            scene.resize(renderer.width, renderer.height);
            renderer.setTheme(scene.theme, scene.state.bounds);
        }
        refresh();
        requestFrame();
    }
    function clearPointers() {
        pointers.clear(); gesture = null; pinchDistance = 0;
        cancelPlacement();
        $('viewport').classList.remove('feeding');
        if (game) { game.cursor = null; game.endCreatureHold(); }
    }
    function disputeAt(x, y) {
        if (!game?.actionable() || placement) return null;
        for (const pair of game.state.disputes) {
            const fish = pair.ids.map(id => game.state.fish.find(f => f.id === id));
            const points = [...fish.map(f => ({ pos: f.pos, fish: f })),
                { pos: fish[0].pos.map((n, i) => (n + fish[1].pos[i]) / 2), fish: fish[0] }];
            for (const point of points) {
                const p = renderer.project(point.pos);
                if (p.visible && Math.hypot(p.x - x, p.y - y) <= Math.max(32, p.scale * ZQ.fishScale(point.fish))) return point.fish;
            }
        }
        return null;
    }
    function pointerDown(event) {
        if (event.button !== 0 && event.pointerType === 'mouse' || $('panel').open) return;
        const rect = $('viewport').getBoundingClientRect();
        const point = { x: event.clientX - rect.left, y: event.clientY - rect.top };
        pointers.set(event.pointerId, point);
        $('viewport').setPointerCapture(event.pointerId);
        if (pointers.size === 1) {
            const social = disputeAt(point.x, point.y);
            const hit = !social && game?.actionable() && !placement ? renderer.pick(game.state, point.x, point.y) : null;
            const creature = hit?.kind === 'creature' && !hit.entity.defended ? hit.entity : null;
            const center = creature ? renderer.project(creature.pos) : null;
            gesture = { x: point.x, y: point.y, time: performance.now(), moved: false, multi: false, creature, center, social,
                placing: Boolean(placement), prize: hit?.kind === 'prize' ? hit.entity : null,
                threshold: center ? ZQ.clamp(center.scale * game.theme.visitors[creature.index].size * 0.33, 24, 64) : 24 };
            if (gesture.prize) {
                const sand = renderer.sandPoint(point.x, point.y, game.state.bounds.floor);
                gesture.offset = sand ? gesture.prize.pos.map((n, i) => i === 1 ? 0 : n - sand[i]) : [0, 0, 0];
            }
            if (creature?.kind === 'eel') act(() => game.beginCreatureHold());
        }
        if (pointers.size >= 2) {
            if (gesture) gesture.multi = true;
            cancelPlacement();
            game?.endCreatureHold();
            const values = [...pointers.values()];
            pinchDistance = Math.hypot(values[0].x - values[1].x, values[0].y - values[1].y);
        }
    }
    function pointerMove(event) {
        if (!renderer) return;
        const rect = $('viewport').getBoundingClientRect();
        const point = { x: event.clientX - rect.left, y: event.clientY - rect.top };
        lastPointer = [point.x, point.y];
        if (placement && !pointers.size) aimPlacement(point.x, point.y);
        if (game && event.pointerType === 'mouse' && !placement && !gesture?.prize) game.cursor = game.constrain(renderer.worldPoint(point.x, point.y));
        const previous = pointers.get(event.pointerId);
        if (!previous) return;
        pointers.set(event.pointerId, point);
        if (pointers.size >= 2) {
            const values = [...pointers.values()];
            const distance = Math.hypot(values[0].x - values[1].x, values[0].y - values[1].y);
            if (pinchDistance > 0 && distance > 0) renderer.zoom(pinchDistance / distance);
            pinchDistance = distance;
        } else {
            if (gesture && Math.hypot(point.x - gesture.x, point.y - gesture.y) > PARAMS.tapTravel) gesture.moved = true;
            if (gesture?.multi) return;
            if (gesture?.placing) {
                if (placement?.kind === 'food' && gesture.moved) {
                    cancelPlacement(); gesture.placing = false;
                    renderer.orbit(-(point.x - previous.x) * 0.006, (point.y - previous.y) * 0.005);
                } else aimPlacement(point.x, point.y);
            } else if (gesture?.prize) {
                if (gesture.moved && game?.actionable()) {
                    if (!placement) {
                        closePanel();
                        game.cursor = null;
                        placement = { kind: 'prize', id: gesture.prize.id, point: [...gesture.prize.pos], valid: true };
                    }
                    aimPlacement(point.x, point.y);
                }
            } else if (gesture?.creature) {
                if (gesture.creature.kind === 'eel' && Math.hypot(point.x - gesture.x, point.y - gesture.y) > 18) game.endCreatureHold();
            } else if (gesture?.moved) renderer.orbit(-(point.x - previous.x) * 0.006, (point.y - previous.y) * 0.005);
        }
        requestFrame();
    }
    function pointerUp(event) {
        const registered = pointers.get(event.pointerId);
        const rect = $('viewport').getBoundingClientRect();
        const point = registered ? { x: event.clientX - rect.left, y: event.clientY - rect.top } : null;
        pointers.delete(event.pointerId);
        if (!pointers.size && point && gesture && !gesture.multi && game?.actionable() && (gesture.placing || gesture.prize && gesture.moved)) {
            aimPlacement(point.x, point.y);
            commitPlacement();
            if (gesture.prize) cancelPlacement();
        } else if (!pointers.size && point && gesture?.creature && !gesture.multi && game?.actionable() && gesture.creature === game.state.creature) {
            const c = gesture.creature;
            game.endCreatureHold();
            if (!c.defended && !gesture.moved && performance.now() - gesture.time < PARAMS.tapDuration) {
                const social = disputeAt(point.x, point.y);
                if (social) act(() => game.tap([...social.pos]));
                else act(() => game.tapCreature());
            } else if (c.kind !== 'eel' && !c.defended) {
                const dx = point.x - gesture.x, dy = point.y - gesture.y;
                const length = Math.hypot(dx, dy);
                const startDistance = Math.hypot(gesture.x - gesture.center.x, gesture.y - gesture.center.y);
                const endDistance = Math.hypot(point.x - gesture.center.x, point.y - gesture.center.y);
                if (length >= gesture.threshold && endDistance >= startDistance + gesture.threshold * 0.4 &&
                    (c.kind !== 'crab' || Math.abs(dx) >= Math.abs(dy) * 0.7)) {
                    act(() => game.defendCreature('swipe', dx < 0 ? -1 : 1));
                } else act(() => game.rejectCreature(c.kind === 'crab' ? 'Press the crab and drag left or right, then release.'
                    : 'Press the creature and drag outward, then release.'));
            }
        } else if (!pointers.size && point && gesture && !gesture.creature && !gesture.moved && !gesture.multi && performance.now() - gesture.time < PARAMS.tapDuration && game && !game.state.paused) {
            const social = disputeAt(point.x, point.y);
            const hit = renderer.pick(game.state, point.x, point.y);
            if (social) act(() => game.tap([...social.pos]));
            else if (!gesture.social && hit?.kind === 'creature') act(() => game.tapCreature());
            else if (!gesture.social && hit?.kind === 'prize') act(() => game.interactPrize(hit.entity.id));
            else if (!gesture.social) act(() => game.tap(hit?.kind === 'fish' ? [...hit.entity.pos]
                : game.constrain(renderer.worldPoint(point.x, point.y))));
        }
        if (!pointers.size) { gesture = null; pinchDistance = 0; }
        if (!pointers.size) game?.endCreatureHold();
        if ($('viewport').hasPointerCapture(event.pointerId)) $('viewport').releasePointerCapture(event.pointerId);
    }
    function keyDown(event) {
        if (event.defaultPrevented || event.ctrlKey || event.altKey || event.metaKey) return;
        if (event.key === 'Escape' && $('catalog').open) { event.preventDefault(); closePanel(); return; }
        if (event.key === 'Escape' && placement) { event.preventDefault(); clearPointers(); return; }
        if (event.key === 'Escape' && !$('tray').hidden) { event.preventDefault(); closePanel(); return; }
        if (['INPUT', 'SELECT', 'TEXTAREA'].includes(event.target.tagName) || event.target.isContentEditable) return;
        if (['BUTTON', 'A', 'SUMMARY'].includes(event.target.tagName) && [' ', 'Enter'].includes(event.key)) return;
        if ($('panel').open) return;
        if (!game) return;
        const key = event.key.toLowerCase();
        if (placement && (key.startsWith('arrow') || key === 'enter')) {
            event.preventDefault();
            if (key === 'enter') { if (!event.repeat) commitPlacement(); return; }
            const point = [...placement.point], b = game.state.bounds;
            if (key === 'arrowleft') point[0] -= 0.25;
            if (key === 'arrowright') point[0] += 0.25;
            if (key === 'arrowup') point[2] -= 0.25;
            if (key === 'arrowdown') point[2] += 0.25;
            if (placement.kind === 'food') {
                placement.point = [ZQ.clamp(point[0], -b.width + 0.3, b.width - 0.3), point[1], ZQ.clamp(point[2], -b.depth, b.depth)];
                placement.valid = true; placement.message = '';
            }
            else {
                const candidate = game.prizeMoveCandidate(placement.id, point);
                placement.valid = candidate.ok; placement.message = candidate.ok ? '' : candidate.message;
                placement.point = [ZQ.clamp(point[0], -b.width, b.width), point[1], ZQ.clamp(point[2], -b.depth - 1.3, b.depth + 1.3)];
            }
            updatePlacement(); requestFrame(); return;
        }
        if ($('catalog').open) return;
        const actions = {
            f: feed, c: () => act(() => game.clean()), b: showShop, t: showPrizes,
            m: () => panelKind === 'menu' && !$('tray').hidden ? closePanel() : showMenu(),
            g: () => act(() => game.tap(game.constrain(renderer.worldPoint(renderer.width / 2, renderer.height / 2)))),
            k: () => {
                const pair = game.state.disputes[0], fish = pair && game.state.fish.find(f => f.id === pair.ids[0]);
                if (fish) act(() => game.tap([...fish.pos]));
            },
            x: () => act(() => game.defendCreature('swipe')),
            j: () => act(() => game.defendCreature('swipe', -1)),
            l: () => act(() => game.defendCreature('swipe', 1)),
            h: () => act(() => game.beginCreatureHold()),
            ' ': () => game.state.paused ? resume() : pause(),
            i: () => immerse(!document.body.classList.contains('immersed')),
            r: () => { renderer.reset(); refresh(); requestFrame(); },
            arrowleft: () => { renderer.orbit(-0.12, 0); requestFrame(); },
            arrowright: () => { renderer.orbit(0.12, 0); requestFrame(); },
            arrowup: () => { renderer.orbit(0, 0.08); requestFrame(); },
            arrowdown: () => { renderer.orbit(0, -0.08); requestFrame(); },
            '+': () => { renderer.zoom(0.9); requestFrame(); },
            '=': () => { renderer.zoom(0.9); requestFrame(); },
            '-': () => { renderer.zoom(1.1); requestFrame(); },
            escape: () => { if (document.body.classList.contains('immersed')) immerse(false); }
        };
        if (actions[key]) {
            event.preventDefault();
            if (event.repeat && !key.startsWith('arrow') && !['+', '-', '='].includes(key)) return;
            actions[key]();
        }
    }
    function background() {
        clearPointers();
        if (game && !game.state.ended) {
            game.state.paused = true;
            $('pause-reason').textContent = 'Welcome back. Your fish waited for you. Resume whenever you are ready.';
        }
        stopAnimation(); suspendAudio(); releaseWakeLock(); save(); refresh();
    }
    async function setupOffline() {
        if (location.protocol === 'file:' || !('serviceWorker' in navigator)) return;
        if (!window.isSecureContext) return;
        try {
            registration = await navigator.serviceWorker.register('./sw.js', { scope: './', updateViaCache: 'none' });
            offlineReady = registration.active?.state === 'activated';
            updateSettingsStatus();
            if (registration.waiting) $('update-button').hidden = false;
            const watch = worker => {
                if (!worker) return;
                worker.addEventListener('statechange', () => {
                    if (worker.state === 'installed') {
                        if (registration.active && registration.waiting) $('update-button').hidden = false;
                    } else if (worker.state === 'activated') {
                        offlineReady = true;
                        updateSettingsStatus();
                    } else if (worker.state === 'redundant') {
                        toast('The offline update did not finish. Your current aquarium is unchanged.', 'warning');
                    }
                });
            };
            watch(registration.installing);
            registration.addEventListener('updatefound', () => watch(registration.installing));
        } catch (error) {
            console.warn('zq3d: offline preparation failed.', error);
            toast('Offline installation is not ready. The aquarium still works here; reconnect and reload to retry.', 'warning');
        }
    }
    async function install() {
        const prompt = installPrompt;
        if (!prompt) return;
        try {
            await prompt.prompt();
            await prompt.userChoice;
            if (installPrompt === prompt) installPrompt = null;
            updateSettingsStatus();
        } catch (error) {
            console.info('zq3d: the install prompt was not available.', error);
            if (installPrompt === prompt) installPrompt = null;
            updateSettingsStatus();
            toast('Use your browser menu to install, or Add to Home Screen on iPhone and iPad.');
        }
    }
    function bind() {
        $('begin-button').addEventListener('click', requestBegin);
        $('resume-button').addEventListener('click', () => begin(true));
        $('about-button').addEventListener('click', showAbout);
        $('journal-button').addEventListener('click', () => showJournal('guide'));
        $('progress-button').addEventListener('click', showProgress);
        $('settings-button').addEventListener('click', showSettings);
        $('sound-button').addEventListener('click', () => { settings.sound = !settings.sound; save(); syncAudio(true); });
        $('feed-button').addEventListener('click', feed);
        $('clean-button').addEventListener('click', () => act(() => game.clean()));
        $('shop-button').addEventListener('click', showShop);
        $('zen-button').addEventListener('click', toggleAutoCare);
        $('pause-button').addEventListener('click', () => { closePanel(); game.state.paused ? resume() : pause(); });
        $('volume-button').addEventListener('click', showVolume);
        $('controls-toggle').addEventListener('click', toggleControls);
        $('menu-button').addEventListener('click', () => panelKind === 'menu' && !$('tray').hidden ? closePanel() : showMenu());
        $('unpause-button').addEventListener('click', resume);
        $('pause-home-button').addEventListener('click', goHome);
        $('score-button').addEventListener('click', () => showScore('health'));
        $('exit-immersion').addEventListener('click', () => immerse(false));
        $('care-action').addEventListener('click', event => {
            const action = event.currentTarget.dataset.action;
            if (action === 'shop') showShop();
            else if (action === 'clean') act(() => game.clean());
            else feed();
        });
        $('tray-content').addEventListener('click', event => {
            const button = event.target.closest('[data-menu-action]');
            if (button && !button.disabled) menuAction(button.dataset.menuAction);
        });
        $('placement-confirm').addEventListener('click', commitPlacement);
        $('placement-cancel').addEventListener('click', clearPointers);
        $('milestone-continue').addEventListener('click', () => act(() => game.continueMilestone()));
        $('milestone-end').addEventListener('click', () => {
            if (game?.state.milestone) {
                const milestone = ZQ.MILESTONES.find(m => m.id === game.state.milestone);
                act(() => game.finish('victory', milestone.name));
            }
        });
        $('catalog').addEventListener('close', () => {
            $('catalog-content').replaceChildren();
            if (panelKind === 'shop') panelKind = '';
            $('shop-button').setAttribute('aria-expanded', 'false');
            if (trayTrigger?.isConnected) trayTrigger.focus({ preventScroll: true });
        });
        document.addEventListener('pointerdown', event => {
            if ($('panel').open) {
                const rect = $('panel').getBoundingClientRect();
                if (!$('panel').contains(event.target) || event.target === $('panel') &&
                    (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) {
                    panelKind === 'summary' ? goHome() : closePanel();
                    event.preventDefault(); event.stopPropagation();
                }
                return;
            }
            if ($('catalog').open && !$('catalog').contains(event.target) &&
                !event.target.closest('.command-controls, .aquarium-menu-button, .game-hud, #milestone-notice, #care-alert')) {
                closePanel();
                event.preventDefault(); event.stopPropagation();
            } else if (!$('tray').hidden && !$('tray').contains(event.target) &&
                !event.target.closest('.command-controls, .aquarium-menu-button, .game-hud, #milestone-notice, #care-alert')) {
                closePanel();
                event.preventDefault(); event.stopPropagation();
            }
        }, true);
        $('panel').addEventListener('cancel', event => {
            event.preventDefault();
            panelKind === 'summary' ? goHome() : closePanel();
        });
        $('panel').addEventListener('close', () => {
            if ($('panel').open || !$('tray').hidden) return;
            panelKind = '';
            lastTime = 0;
            refresh(); requestFrame(); syncAudio(true); syncWakeLock();
        });
        $('viewport').addEventListener('pointerdown', pointerDown);
        $('viewport').addEventListener('pointermove', pointerMove);
        $('viewport').addEventListener('pointerup', pointerUp);
        $('viewport').addEventListener('pointercancel', clearPointers);
        $('viewport').addEventListener('lostpointercapture', event => {
            pointers.delete(event.pointerId);
            if (!pointers.size && gesture) clearPointers();
        });
        $('viewport').addEventListener('pointerleave', () => { if (game && !pointers.size) game.cursor = null; });
        $('viewport').addEventListener('wheel', event => {
            event.preventDefault(); renderer.zoom(Math.exp(ZQ.clamp(event.deltaY, -150, 150) * 0.001)); requestFrame();
        }, { passive: false });
        document.addEventListener('keydown', keyDown);
        document.addEventListener('keyup', event => { if (event.key.toLowerCase() === 'h') game?.endCreatureHold(); });
        window.addEventListener('blur', clearPointers);
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) background();
            else { lastTime = 0; refresh(); requestFrame(); if (!game) syncAudio(); }
        });
        window.addEventListener('pagehide', background);
        window.addEventListener('pageshow', () => { lastTime = 0; requestFrame(); });
        document.addEventListener('freeze', background);
        window.addEventListener('storage', event => {
            if (event.key === ZQ.STORAGE_KEY && event.newValue !== lastSerialized) conflict();
        });
        let resizeTimer = 0;
        window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(resize, 100); });
        window.visualViewport?.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(resize, 100); });
        motionMedia.addEventListener('change', applyMotion);
        window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); installPrompt = event; updateSettingsStatus(); });
        window.addEventListener('appinstalled', () => {
            installPrompt = null; appInstalled = true;
            updateSettingsStatus();
            toast('Zenquarium 3D has a new home. Your aquarium is ready whenever you are.');
        });
        $('update-button').addEventListener('click', () => {
            if (game && !game.state.ended) {
                if (!goHome()) return;
            } else if (!save()) {
                toast('The update was not applied because your progress could not be saved. Check the saving warning before trying again.', 'warning');
                return;
            }
            if (registration?.waiting) {
                navigator.serviceWorker.addEventListener('controllerchange', () => location.reload(), { once: true });
                registration.waiting.postMessage({ type: 'ACTIVATE_UPDATE' });
            } else location.reload();
        });
    }
    function init() {
        if (initialized) return;
        initialized = true;
        applyColorScheme();
        load();
        renderer = new ZQRenderer.Renderer($('viewport'), {
            fallback: message => {
                toast(`${message} A lighter perspective mode keeps your aquarium playable.`);
            },
            lost: () => pause('3D graphics were interrupted. Your aquarium is safely paused while the browser restores them.'),
            restored: () => {
                refresh(); requestFrame();
                toast('Graphics restored. Resume when you are ready.');
            }
        });
        renderer.setQuality(settings.quality);
        applyMotion();
        $('theme-options').innerHTML = Object.values(ZQ.THEMES).map(theme =>
            `<button class="theme-option" data-theme="${theme.id}" aria-pressed="${theme.id === selectedTheme}" aria-label="Preview ${theme.name}: ${theme.subtitle}. ${theme.description}">
            <span class="theme-copy"><strong>${theme.name}</strong><small class="theme-description">${theme.description}</small></span>${icon('check')}</button>`).join('');
        $('theme-options').querySelectorAll('[data-theme]').forEach(button => button.addEventListener('click', () => preview(button.dataset.theme, true)));
        new ResizeObserver(() => {
            document.body.style.setProperty('--care-height', `${$('care-alert').getBoundingClientRect().height}px`);
        }).observe($('care-alert'));
        new ResizeObserver(resize).observe($('viewport'));
        bind();
        preview(selectedTheme);
        updateWelcome();
        $('begin-button').disabled = false;
        setupOffline();
    }

    try { init(); }
    catch (error) {
        console.error('zq3d could not start.', error);
        $('begin-button').disabled = true;
        storageWarning('The aquarium could not start in this browser. Your saves are unchanged. Reload or try a browser with canvas support.');
    }
    return { version: APP_VERSION, get game() { return game; }, get renderer() { return renderer; },
        get profile() { return profile; }, get settings() { return settings; },
        get offlineReady() { return offlineReady; }, save };
})();
