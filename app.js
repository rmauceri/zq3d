'use strict';

const ZQApp = (() => {
    const $ = id => document.getElementById(id);
    const icon = name => `<svg class="icon" aria-hidden="true"><use href="#i-${name}"/></svg>`;
    const number = value => Math.floor(value).toLocaleString();
    const duration = seconds => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
    const safeText = text => String(text).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
    const PARAMS = { autosave: 12, hudInterval: 0.2, tapTravel: 8, tapDuration: 650, toastDuration: 4500 };
    const writer = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    let profile = ZQ.createProfile();
    let settings = { ...ZQ.DEFAULT_SETTINGS };
    let savedSession = null, game = null, demo = null, renderer = null;
    let selectedTheme = 'tropical', panelKind = '', journalTab = 'guide';
    let lastSerialized = null, storageBlocked = false, storageConflict = false, saveFailure = '';
    let raf = 0, lastTime = 0, renderTime = 0, visualTime = 0, lastDraw = 0;
    let autosaveTime = 0, hudTime = 0, toastTimer = 0;
    let installPrompt = null, registration = null, offlineReady = false, wakeLock = null;
    let wakeGeneration = 0, pointers = new Map(), gesture = null, pinchDistance = 0;
    let lastPointer = null, cameraAngle = 0, initialized = false;
    let trayTrigger = null;
    const LIVE_TRAYS = new Set(['shop', 'residents', 'journal', 'score', 'settings', 'prizes']);
    const panelContent = () => $('tray').hidden ? $('panel-content') : $('tray-content');
    const sound = new ZQAudio.Soundscape();
    const motionMedia = matchMedia('(prefers-reduced-motion: reduce)');

    function storageWarning(message) {
        saveFailure = message;
        $('save-warning').textContent = message;
        $('save-warning').hidden = false;
    }
    function load() {
        try {
            lastSerialized = localStorage.getItem(ZQ.STORAGE_KEY);
            if (!lastSerialized) return;
            const saved = ZQ.validateSave(JSON.parse(lastSerialized));
            profile = saved.profile; settings = saved.settings;
            savedSession = saved.session && !saved.session.ended ? saved.session : null;
            if (savedSession) selectedTheme = savedSession.themeId;
        } catch (error) {
            storageBlocked = true;
            console.warn('zq3d: saved data was not loaded or overwritten.', error);
            storageWarning(lastSerialized
                ? 'Your saved aquarium could not be read. It has not been changed. See Settings to recover or reset only zq3d data.'
                : 'Local saving is unavailable in this browser. You can still play, and export a backup from Settings before leaving.');
        }
    }
    function save() {
        if (storageBlocked || storageConflict) return false;
        const session = game && !game.state.ended ? game.snapshot() : savedSession;
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
            if (saveFailure) { saveFailure = ''; $('save-warning').hidden = true; }
            return true;
        } catch (error) {
            if (!saveFailure) console.warn('zq3d: local saving failed.', error);
            storageWarning('This browser could not save your aquarium. Keep this tab open or export a backup in Settings.');
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
    function exportSave() {
        const data = storageBlocked && lastSerialized ? lastSerialized : JSON.stringify({
            version: ZQ.VERSION, savedAt: new Date().toISOString(), writer,
            profile, settings, session: game && !game.state.ended ? game.snapshot() : savedSession
        }, null, 2);
        const url = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
        const a = document.createElement('a');
        a.href = url; a.download = `zq3d-${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    function restoreSave(file) {
        if (!file) return;
        if (file.size > 500000) { toast('That backup is too large. Choose a zq3d JSON backup under 500 KB.', 'warning'); return; }
        file.text().then(text => {
            let candidate;
            try { candidate = ZQ.validateSave(JSON.parse(text)); }
            catch (error) { console.warn('zq3d: backup rejected.', error); toast('That backup is not a valid zq3d save. Your current aquarium is unchanged.', 'warning'); return; }
            confirmPanel('Restore this aquarium?', 'This replaces only zq3d progress on this device. The original Zenquarium is never changed.', 'Restore backup', () => {
                try {
                    const data = { ...candidate, writer, savedAt: new Date().toISOString() };
                    localStorage.setItem(ZQ.STORAGE_KEY, JSON.stringify(data));
                    location.reload();
                } catch (error) {
                    console.error('zq3d: could not restore the backup.', error);
                    storageWarning('The backup was valid, but this browser could not store it. Free some storage and try again.');
                }
            });
        }).catch(error => {
            console.error('zq3d: backup file could not be read.', error);
            toast('The backup file could not be read. Your aquarium is unchanged.', 'warning');
        });
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
        root.dataset.theme = override ? requested : theme.id === 'ink' ? 'light' : 'dark';
        root.toggleAttribute('data-aquarium-ui', !override);
        for (const [key, value] of Object.entries(theme.ui)) root.style.setProperty(`--cp-aquarium-${key}`, value);
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
            toast('Audio was interrupted. Use Sound to restart it.', 'warning');
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
            toast('Sound could not start. Tap Sound again when your browser allows audio.', 'warning');
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
        $('scene-location').textContent = theme.location;
        $('scene-subtitle').textContent = theme.subtitle;
        for (const button of $('theme-options').children) button.setAttribute('aria-pressed', String(button.dataset.theme === themeId));
        requestFrame();
        syncAudio(fromGesture);
    }
    function updateWelcome() {
        $('best-score').textContent = number(profile.highScore);
        $('achievement-count').innerHTML = `${Object.keys(profile.achievements).length} <small>/ 20</small>`;
        $('resume-button').hidden = !savedSession;
        if (savedSession) $('resume-button').textContent = `Return to ${ZQ.THEMES[savedSession.themeId].name}`;
    }
    function begin(resume = false) {
        if (storageConflict) { toast('Reload from Settings to use the aquarium saved by the other window.', 'warning'); return; }
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
        if (resume && !game.state.milestone) game.resume();
        $('current-theme-name').textContent = game.theme.name;
        if (resume && game.state.milestone) showMilestone();
        else toast(resume ? 'Welcome back. Time stood still while you were away.' : 'Welcome to your little world. Feed, care, and watch it grow.');
        consumeEvents();
        save();
        refresh();
        requestFrame();
        syncAudio(true);
        syncWakeLock();
        if (!game.state.milestone) renderer.canvas.focus({ preventScroll: true });
    }
    function requestBegin() {
        if (savedSession) {
            confirmPanel('Begin a new aquarium?', 'Your existing session will be completed first. Your achievements and personal best stay with you.', 'Begin a new aquarium', () => {
                const previous = new ZQ.Game(savedSession.themeId, profile, { snapshot: savedSession });
                previous.finish();
                savedSession = null;
                begin(false);
            });
        } else begin(false);
    }
    function goHome() {
        if (game && !game.state.ended) {
            game.state.paused = true;
            savedSession = game.snapshot();
        } else savedSession = null;
        save();
        game = null;
        applyColorScheme();
        closePanel();
        document.body.dataset.screen = 'welcome';
        document.body.classList.remove('immersed');
        document.body.classList.remove('has-care-alert');
        $('exit-immersion').hidden = true;
        $('game-ui').hidden = true;
        $('follow-label').hidden = true;
        clearTimeout(toastTimer); $('toast').hidden = true;
        renderer.resize();
        preview(selectedTheme);
        updateWelcome();
        releaseWakeLock();
        requestFrame();
    }
    function pause(reason = 'Your aquarium is safely paused. Nothing changes while you are away.') {
        if (!game || game.state.ended) return;
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
        act(() => {
            const point = renderer.worldPoint(renderer.width / 2, renderer.height / 2);
            game.feed(point);
        });
    }
    function consumeEvents() {
        if (!game) return;
        const events = game.drainEvents();
        let mostImportant = null;
        const priority = { milestone: 12, end: 12, prize: 11, challenge: 10, achievement: 9, attack: 8, loss: 7, warning: 6, visitor: 5, birth: 4, bonus: 3 };
        for (const event of events) {
            sound.effect(event.type, lastPointer ? lastPointer[0] / renderer.width * 2 - 1 : 0);
            if (event.type === 'milestone') { showMilestone(); continue; }
            if (event.type === 'end') { showSummary(); continue; }
            if (!mostImportant || (priority[event.type] || 1) >= (priority[mostImportant.type] || 1)) mostImportant = event;
        }
        if (mostImportant) toast(mostImportant.type === 'achievement' ? `Discovery unlocked: ${mostImportant.message}` : mostImportant.message,
            mostImportant.type, mostImportant.amount ?? null);
        if (events.some(e => ['achievement', 'milestone', 'end', 'loss', 'birth', 'prize', 'defended'].includes(e.type))) save();
    }
    function refresh() {
        if (!game) { updateWelcome(); return; }
        const s = game.state;
        const actionable = !s.paused && !s.ended && !storageConflict;
        $('score').textContent = number(s.score);
        $('multiplier').textContent = `\u00d7${s.multiplier}`;
        $('multiplier').dataset.level = String(s.multiplier);
        $('water-value').textContent = `${Math.ceil(s.tankHealth)}%`;
        $('water-bar').style.width = `${s.tankHealth}%`;
        $('water-meter').setAttribute('aria-valuenow', String(Math.ceil(s.tankHealth)));
        $('water-meter').classList.toggle('low', s.tankHealth < 60);
        $('water-meter').classList.toggle('critical', s.tankHealth < 30);
        $('fish-count').textContent = `${s.fish.length} / ${s.maxFish}`;
        $('feed-button').disabled = !actionable || s.score < ZQ.CONFIG.feedCost;
        $('clean-button').disabled = !actionable || s.score < ZQ.CONFIG.cleanCost;
        $('shop-button').disabled = !actionable;
        $('auto-button').disabled = !actionable;
        $('auto-button').setAttribute('aria-pressed', String(s.auto));
        $('auto-button').setAttribute('aria-label', s.auto ? 'Disable Zen care' : 'Enable Zen care');
        $('auto-label').textContent = s.auto ? 'On' : 'Off';
        $('prize-count').textContent = `${Object.keys(profile.prizes).length} / ${ZQ.PRIZES.length}`;
        const pauseLabel = s.paused ? 'Resume' : 'Pause';
        $('pause-button').setAttribute('aria-label', `${pauseLabel} aquarium`);
        if ($('pause-label').textContent !== pauseLabel) $('pause-button').innerHTML = icon(s.paused ? 'play' : 'pause') + `<span id="pause-label">${pauseLabel}</span>`;
        $('pause-button').disabled = s.ended || Boolean(s.milestone) || storageConflict;
        $('pause-card').hidden = !s.paused || s.ended || Boolean(s.milestone) || $('panel').open;
        $('unpause-button').disabled = storageConflict || renderer.lost;
        const milestone = ZQ.MILESTONES.find(m => m.score && !s.milestones.includes(m.id));
        $('next-goal').textContent = milestone ? `${number(s.score)} / ${number(milestone.score)} to ${milestone.name.split(' ')[0]}` : 'A living balance: Master Aquarist';
        $('goal-progress').max = milestone ? milestone.score : 180;
        $('goal-progress').value = milestone ? s.score : s.thriving || 0;
        $('goal-progress').setAttribute('aria-label', milestone ? `Progress to ${milestone.name}` : 'Three continuous minutes with fifteen fish and all species');
        const follow = s.fish.find(f => f.id === renderer.camera.follow);
        if (!follow) renderer.camera.follow = null;
        $('follow-label').hidden = !follow;
        if (follow) $('follow-label').textContent = `Following ${game.theme.fish[follow.type].name} \u00b7 Stop following`;
        let care = '', action = '', target = '';
        const c = s.creature;
        $('care-action-secondary').hidden = true;
        $('care-action').disabled = !actionable;
        $('care-action-secondary').disabled = !actionable;
        $('care-alert').dataset.challenge = '';
        $('care-alert').dataset.ready = 'false';
        if (!s.fish.length) {
            care = `Your aquarium is empty. ${Math.max(0, Math.ceil(ZQ.CONFIG.emptyGrace - s.timers.empty))} seconds to add a fish.`;
            action = 'Add fish'; target = 'shop';
        } else if (c?.kind === 'crab' && !c.defended) {
            care = `${c.name}: alternate the left and right decoys. ${c.defenseStep} / ${ZQ.CONFIG.crabDefenses} distractions.`;
            action = 'Left decoy'; target = 'crab-left';
            $('care-action-secondary').hidden = false;
            $('care-action').disabled = !actionable || c.decoyCooldown > 0;
            $('care-action-secondary').disabled = !actionable || c.decoyCooldown > 0;
            $('care-alert').dataset.challenge = 'crab';
        } else if (c?.kind === 'eel' && !c.defended) {
            care = c.phase === 'windup' ? `${c.name} is coiling. Flash now! ${Math.max(0, c.phaseTimer).toFixed(1)}s`
                : c.phase === 'dash' ? `${c.name} lunged! Watch for its next coil.`
                : `${c.name} is stalking. Wait for it to coil, then flash the light.`;
            action = c.phase === 'windup' ? 'Flash light' : 'Watch for coil'; target = 'eel-flash';
            $('care-action').disabled = !actionable || c.phase !== 'windup';
            $('care-alert').dataset.challenge = 'eel';
            $('care-alert').dataset.ready = String(c.phase === 'windup');
        } else if (c && !c.provoked && !c.defended) {
            care = `${c.name} is visiting. One tap guides it away; three provoke it.`;
            action = 'Guide away'; target = 'visitor';
        } else if (s.tankHealth < 40) {
            care = 'Your water needs a little care.'; action = 'Clean \u221210'; target = 'clean';
        } else if (s.fish.some(f => f.hunger < 25)) {
            care = 'Your fish are hungry. A little food would help.'; action = 'Feed \u22125'; target = 'feed';
        }
        $('care-alert').hidden = !care || s.ended || s.paused;
        document.body.classList.toggle('has-care-alert', !$('care-alert').hidden);
        $('care-message').textContent = care;
        $('care-action').textContent = action;
        $('care-action').dataset.action = target;
        if (panelKind === 'shop' && !$('tray').hidden) updateShopButtons();
        if (panelKind === 'residents' && !$('tray').hidden) updateResidents();
        if (panelKind === 'prizes' && !$('tray').hidden) updatePrizes();
        if (panelKind === 'journal' && !$('tray').hidden) updateJournal();
        if (panelKind === 'score' && !$('tray').hidden) updateScore();
        updateWelcome();
    }

    function openPanel(kind, title, eyebrow, html) {
        panelKind = kind;
        if (LIVE_TRAYS.has(kind)) {
            if ($('panel').open) $('panel').close();
            $('panel-content').replaceChildren();
            if ($('tray').hidden) trayTrigger = document.activeElement;
            $('tray-title').textContent = title;
            $('tray-eyebrow').textContent = eyebrow;
            $('tray-content').innerHTML = html;
            $('tray').hidden = false;
            document.body.classList.add('tray-open');
            $('tray-content').scrollTop = 0;
            requestFrame();
        } else {
            $('tray').hidden = true;
            $('tray-content').replaceChildren();
            document.body.classList.remove('tray-open');
            $('panel-title').textContent = title;
            $('panel-eyebrow').textContent = eyebrow;
            $('panel-content').innerHTML = html;
            $('panel-close').hidden = kind === 'milestone';
            if (!$('panel').open) $('panel').showModal();
            stopAnimation();
            suspendAudio();
            releaseWakeLock();
            $('panel').scrollTop = 0;
        }
        if (game) save();
        refresh();
    }
    function closePanel() {
        if ($('panel').open) $('panel').close();
        if (!$('tray').hidden) {
            $('tray').hidden = true;
            $('tray-content').replaceChildren();
            document.body.classList.remove('tray-open');
            if (trayTrigger?.isConnected) trayTrigger.focus({ preventScroll: true });
        }
        panelKind = '';
    }
    function confirmPanel(title, text, confirmText, callback) {
        openPanel('confirm', title, 'A MOMENT TO DECIDE',
            `<p>${safeText(text)}</p><div class="panel-actions"><button class="secondary-button" id="cancel-action">Cancel</button><button class="primary-button" id="confirm-action">${safeText(confirmText)}</button></div>`);
        $('cancel-action').addEventListener('click', closePanel);
        $('confirm-action').addEventListener('click', () => { closePanel(); callback(); });
        $('cancel-action').focus();
    }
    function showShop() {
        if (!game || !game.actionable()) return;
        openPanel('shop', 'A little more life.', 'THE AQUARIUM SHOP',
            `<p>Every species brings its own personality. Healthy fish earn points; a varied aquarium earns a little extra.</p>
            <p id="shop-budget"></p>${game.theme.fish.map((f, i) => `
            <div class="shop-row"><div class="species-mark">${icon('fish')}</div><div class="species-info">
            <h3>${f.name}</h3><p>${f.traits.map(t => t[0].toUpperCase() + t.slice(1)).join(' &amp; ')}</p><small data-species-count="${i}">${f.cost} points &middot; ${game.state.fish.filter(fish => fish.type === i).length} in your aquarium</small>
            </div><button class="small-button" data-buy="${i}" aria-label="Add ${f.name} for ${f.cost} points">Add &middot; ${f.cost}</button></div>`).join('')}
            <div class="note-box">School three of the same species, or collect all four. Hungry large fish may hunt smaller neighbors. Feed them before they struggle.</div>`);
        panelContent().querySelectorAll('[data-buy]').forEach(button => button.addEventListener('click', () => {
            game.buy(Number(button.dataset.buy));
            consumeEvents(); save(); refresh();
            requestFrame();
        }));
        updateShopButtons();
    }
    function updateShopButtons() {
        if (!$('shop-budget') || !game) return;
        $('shop-budget').textContent = `${number(game.state.score)} points available \u00b7 ${game.state.fish.length} of ${game.state.maxFish} residents`;
        panelContent().querySelectorAll('[data-buy]').forEach(button => {
            button.disabled = !game.actionable() || game.state.score < game.theme.fish[Number(button.dataset.buy)].cost || game.state.fish.length >= game.state.maxFish;
        });
        panelContent().querySelectorAll('[data-species-count]').forEach(label => {
            const type = Number(label.dataset.speciesCount);
            label.textContent = `${game.theme.fish[type].cost} points \u00b7 ${game.state.fish.filter(f => f.type === type).length} in your aquarium`;
        });
    }
    function residentRow(f) {
        const def = game.theme.fish[f.type];
        return `<div class="shop-row" data-resident="${f.id}"><div class="species-mark">${icon('fish')}</div><div class="species-info"><h3 data-resident-name>${def.name}${f.growth < 1 ? ' \u00b7 Baby' : ''}</h3>
            <p data-resident-traits>${def.traits.join(' &amp; ')}${f.schooling ? ' \u00b7 Schooling' : ''}</p>
            <div class="resident-meters"><span><span data-health-label>Health ${Math.ceil(f.health)}%</span><span class="meter" data-health-meter><span style="width:${f.health}%"></span></span></span>
            <span><span data-hunger-label>Fullness ${Math.ceil(f.hunger)}%</span><span class="meter" data-hunger-meter><span style="width:${f.hunger}%"></span></span></span></div></div>
            <button class="small-button" data-follow="${f.id}" aria-label="Follow ${def.name}">Follow</button></div>`;
    }
    function showResidents() {
        if (!game) return;
        const residents = game.state.fish;
        openPanel('residents', 'Meet your residents.', game.theme.name,
            `<p>A closer look, whenever you want it. Follow lets the camera drift alongside a fish; ordinary taps on the aquarium simply tap the glass.</p>
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
        list.querySelectorAll('[data-resident]').forEach(row => {
            const f = game.state.fish.find(f => f.id === Number(row.dataset.resident));
            row.querySelector('[data-follow]').disabled = !f;
            if (f) {
                const def = game.theme.fish[f.type];
                row.querySelector('[data-resident-name]').textContent = def.name + (f.growth < 1 ? ' \u00b7 Baby' : '');
                row.querySelector('[data-resident-traits]').textContent = def.traits.join(' & ') + (f.schooling ? ' \u00b7 Schooling' : '');
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
            `<p>Not bought. Earned through care and courage. Keep up to three prizes in your aquarium; they follow you into every new world.</p>
            <div class="live-label"><span class="live-dot"></span><span id="prize-placement-count"></span></div>
            <div class="prize-grid">${ZQ.PRIZES.map(prize => `<article class="prize-card" data-prize-card="${prize.id}">
                <div class="species-mark">${icon(prize.id === 'chest' ? 'chest' : prize.id)}</div><h3>${prize.name}</h3>
                <p>${prize.description}</p><small>${prize.requirement}</small>
                <progress data-prize-progress="${prize.id}" max="${prize.goal}" value="0" aria-label="${prize.requirement}"></progress>
                <button class="small-button" data-equip="${prize.id}" aria-pressed="false">Not yet earned</button>
                <button class="small-button prize-play" data-prize-play="${prize.id}" hidden>Enjoy this prize</button>
            </article>`).join('')}</div>
            <div class="note-box">Tap a placed prize in the aquarium to enjoy its animation. Prizes are purely for delight: no extra currency, farming, or hidden advantage. Your collection is saved across sessions.</div>`);
        panelContent().querySelectorAll('[data-equip]').forEach(button => button.addEventListener('click', () => {
            if (game) act(() => game.equipPrize(button.dataset.equip));
        }));
        panelContent().querySelectorAll('[data-prize-play]').forEach(button => button.addEventListener('click', () => {
            if (game) act(() => game.interactPrize(button.dataset.prizePlay));
        }));
        updatePrizes();
    }
    function updatePrizes() {
        if (!$('prize-placement-count')) return;
        $('prize-placement-count').textContent = `${profile.equippedPrizes.length} of ${ZQ.CONFIG.prizeLimit} prizes placed \u00b7 ${Object.keys(profile.prizes).length} of ${ZQ.PRIZES.length} earned`;
        for (const prize of ZQ.PRIZES) {
            const card = panelContent().querySelector(`[data-prize-card="${prize.id}"]`);
            if (!card) continue;
            const unlocked = Object.hasOwn(profile.prizes, prize.id), placed = profile.equippedPrizes.includes(prize.id);
            card.classList.toggle('unlocked', unlocked);
            const button = card.querySelector('[data-equip]');
            button.textContent = !unlocked ? 'Not yet earned' : placed ? 'Put away' : 'Place in tank';
            button.setAttribute('aria-pressed', String(placed));
            button.disabled = !unlocked || !game?.actionable() || !placed && profile.equippedPrizes.length >= ZQ.CONFIG.prizeLimit;
            const play = card.querySelector('[data-prize-play]');
            play.hidden = !placed;
            play.disabled = !game?.actionable();
            const progress = card.querySelector('progress');
            progress.hidden = unlocked;
            progress.value = prize.stat === 'score' ? Math.max(profile.highScore, game?.state.score || 0) : profile.stats[prize.stat];
        }
    }
    function showJournal(tab = journalTab) {
        journalTab = tab;
        const tabs = `<div class="panel-tabs" role="group" aria-label="Field guide sections">
            <button data-tab="guide" aria-pressed="${tab === 'guide'}">A little guidance</button>
            <button data-tab="achievements" aria-pressed="${tab === 'achievements'}">Discoveries &middot; ${Object.keys(profile.achievements).length}/20</button>
            <button data-tab="prizes" aria-pressed="false">Tank prizes</button></div>`;
        const guide = `
            <p>Same soul. A new perspective. zq3d is a standalone 3D companion to Zenquarium, made for a few quiet minutes or a longer journey.</p>
            <div class="guide-grid">
                ${icon('feed')}<div><h3>Tend, don't hurry.</h3><p>Feed for 5 points. Clean for 10. Adult fish above 50% health earn 0.5 points per second. Babies grow into their role. Empty aquariums have a five-second rescue window; zero water health ends a session.</p></div>
                ${icon('award')}<div><h3>A healthy rhythm.</h3><p>Keep every fish above 80% health for \u00d71.5 at 30 seconds, \u00d72 at 90, and \u00d73 at 180. A fish below 50% resets it. The multiplier applies to positive earnings, not costs or penalties. All four species, happy schools, and baby fish bring bonuses.</p></div>
                ${icon('fish')}<div><h3>Visitors have boundaries.</h3><p>Jellyfish drift; octopus and squid hunt. Tap a visitor once to send it away. Three taps within five seconds release stingers or ink. Attacks and hunger stop when your aquarium is paused.</p></div>
                ${icon('chest')}<div><h3>New neighbors. New instincts.</h3><p>Crabs scavenge fallen food and pinch nearby fish. Alternate the left and right decoys three times to guide one away. Eels stalk, coil, then lunge: flash the light during the coil to send them retreating. The live alert offers keyboard and touch defenses.</p></div>
                ${icon('oyster')}<div><h3>Care leaves its treasures.</h3><p>Reach 1,000 points for a Bubble Chest. Welcome a baby for a Pearl Oyster. Repel an eel for a Watchlight Lantern; outwit a crab for a Tidekeeper Arch. Place three at a time, across all themes, and tap them to bring them to life.</p></div>
                ${icon('leaf')}<div><h3>Let the aquarium breathe.</h3><p>Zen care automatically feeds, cleans, and maintains a small population when you can afford it. The same rules still apply: it is assistance, not invulnerability.</p></div>
                ${icon('orbit')}<div><h3>A whole new point of view.</h3><p>Drag to orbit. Pinch or scroll to zoom. Click or tap the glass, including over a fish, to get a reaction without opening anything; G is the keyboard equivalent. Repeated tapping causes stress. Open Residents in the HUD when you want fish details or a following camera. Visitors and placed prizes keep their direct tap actions.</p></div>
            </div>
            <h3>Small steps, meaningful milestones</h3>
            <p>Bronze at 1,000, Silver at 2,500, Gold at 5,000, and Platinum at 10,000 points. Master means keeping at least fifteen fish and all four species for three continuous minutes. Each milestone pauses for a choice: keep going or end on a high note.</p>
            <div class="note-box"><strong>Keep the flow</strong><br>The shop, inspectors, guide, prizes, and settings are live, non-modal trays. Your aquarium keeps moving and care controls remain usable. Only explicit pause, milestones, confirmations, and session summaries stop time.</div>
            <div class="note-box"><strong>Keyboard</strong><br><span class="mono">F</span> feed &middot; <span class="mono">C</span> clean &middot; <span class="mono">B</span> shop &middot; <span class="mono">T</span> tank prizes &middot; <span class="mono">Space</span> pause &middot; <span class="mono">I</span> immerse &middot; <span class="mono">R</span> reset camera &middot; arrow keys orbit &middot; <span class="mono">+ / -</span> zoom. Escape closes a tray or exits immersive view.</div>
            <div class="note-box">No accounts, tracking, external assets, or ads. Progress lives only on this device, separately from Zenquarium. Install from a secure web address for offline play. Time never advances while you are away.</div>`;
        const achievements = `<p>Twenty little reasons to look closer. Each discovery awards its bonus once per saved profile, multiplied by your current healthy streak.</p>
            <div class="achievement-grid">${ZQ.ACHIEVEMENTS.map(a => `<article data-achievement="${a.id}" class="achievement ${profile.achievements[a.id] ? 'unlocked' : ''}">
            <div class="achievement-top">${icon('award')}<span>+${a.bonus} pts</span></div><h3>${a.name}</h3><p>${a.description}</p><small>${profile.achievements[a.id] ? `Discovered ${profile.achievements[a.id]}` : 'Still to discover'}</small></article>`).join('')}</div>`;
        openPanel('journal', 'The field guide.', 'CURIOSITY LOOKS GOOD ON YOU', tabs + (tab === 'guide' ? guide : achievements));
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
    function showScore() {
        if (!game) return;
        openPanel('score', 'A healthy rhythm.', 'YOUR SCORE, EXPLAINED',
            `<div class="session-stats"><div><strong id="detail-score"></strong><small>POINTS</small></div><div><strong id="detail-multiplier"></strong><small>MULTIPLIER</small></div><div><strong id="detail-rate"></strong><small>POINTS / SECOND</small></div></div>
            <p id="detail-streak"></p>
            <div class="note-box">30 seconds: \u00d71.5 &nbsp; / &nbsp; 90 seconds: \u00d72 &nbsp; / &nbsp; 180 seconds: \u00d73<br>All fish must be above 80% to build the streak. Below 50% resets your multiplier.</div>
            <h3>Care pays off</h3><p>Perfect Tank: +25 every 60 seconds with five fish above 90% health. Biodiversity: +15 every 45 seconds with all four species. Baby Born: +10. Clean Sweep: +20 when water is above 70% before cleaning.</p>
            <h3>Every resident matters</h3><p>Fish lost: \u221215; starvation: \u221220. Repeated glass tapping: \u22125 and water damage. Neglected water: \u221210 every 30 seconds below 25%. Scores never go below zero.</p>`);
    }
    function updateScore() {
        const s = game.state, earning = s.fish.filter(f => f.health > 50 && f.growth === 1).length;
        $('detail-score').textContent = number(s.score);
        $('detail-multiplier').textContent = `\u00d7${s.multiplier}`;
        $('detail-rate').textContent = (earning * ZQ.CONFIG.scoreRate * s.multiplier).toFixed(1);
        $('detail-streak').textContent = `${earning} healthy adult fish earn ${ZQ.CONFIG.scoreRate} points each second, multiplied by your health streak. Your current continuous healthy streak is ${Math.floor(s.streak)} seconds.`;
    }
    function showMilestone() {
        if (!game?.state.milestone) return;
        const milestone = ZQ.MILESTONES.find(m => m.id === game.state.milestone);
        document.body.classList.remove('immersed'); $('exit-immersion').hidden = true;
        openPanel('milestone', milestone.name, 'A MOMENT WORTH KEEPING',
            `<div class="milestone-art">${icon('award')}</div><p>${milestone.description}</p>
            <p>You have earned this moment. Stay a little longer, or finish with a victory and leave your aquarium on a high note.</p>
            <div class="panel-actions"><button class="secondary-button" id="milestone-end">End on a high note</button><button class="primary-button" id="milestone-continue">Keep playing ${icon('arrow')}</button></div>`);
        $('milestone-continue').addEventListener('click', () => {
            game.continueMilestone(); closePanel(); save(); refresh(); requestFrame(); syncAudio(true); syncWakeLock();
        });
        $('milestone-end').addEventListener('click', () => act(() => game.finish('victory', milestone.name)));
        save();
    }
    function showSummary() {
        if (!game) return;
        const s = game.state;
        savedSession = null;
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
        const inFile = location.protocol === 'file:';
        const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
        const installText = standalone ? 'Installed. Your aquarium has a home on this device.'
            : inFile ? 'Local-file mode works without a connection. To install as an app, serve this folder on localhost or HTTPS.'
            : offlineReady ? 'Ready for offline visits. Install with your browser menu, or Share \u2192 Add to Home Screen on iPhone and iPad.'
            : 'Offline installation needs HTTPS or localhost. Your browser is preparing the local app cache when supported.';
        openPanel('settings', 'Make yourself at home.', 'YOUR OWN PACE',
            `<div class="setting-row"><label for="setting-sound">Underwater sound<small>Handmade, synthesized soundscapes. Headphones welcome.</small></label><input id="setting-sound" type="checkbox" ${settings.sound ? 'checked' : ''}></div>
            <div class="setting-row"><label for="setting-volume">Volume<small>Soft by design.</small></label><input id="setting-volume" type="range" min="0" max="100" step="1" value="${Math.round(settings.volume * 100)}"></div>
            <div class="setting-row"><label for="setting-quality">Visual quality<small>Auto adapts to your device. Battery saver targets 30 frames per second.</small></label><select id="setting-quality">
            ${[['auto', 'Auto'], ['high', 'High'], ['balanced', 'Balanced'], ['battery', 'Battery saver']].map(([id, label]) => `<option value="${id}" ${settings.quality === id ? 'selected' : ''}>${label}</option>`).join('')}</select></div>
            <div class="setting-row"><label for="setting-motion">Motion<small>Reduced motion softens foliage, fins, and floating details.</small></label><select id="setting-motion">
            ${[['system', 'Follow device'], ['full', 'Full'], ['reduced', 'Reduced']].map(([id, label]) => `<option value="${id}" ${settings.motion === id ? 'selected' : ''}>${label}</option>`).join('')}</select></div>
            <div class="setting-row"><label for="setting-awake">Keep screen awake<small>Optional. Only while this aquarium is visible and running.</small></label><input id="setting-awake" type="checkbox" ${settings.keepAwake ? 'checked' : ''} ${'wakeLock' in navigator ? '' : 'disabled'}></div>
            <div class="note-box"><strong>${renderer.is3D ? 'WebGL 3D' : 'Perspective compatibility renderer'}</strong> &middot; ${renderer.level} quality<br>${safeText(installText)}</div>
            <div class="panel-actions">${installPrompt ? '<button class="secondary-button" id="install-app">Install zq3d</button>' : ''}<button class="secondary-button" id="fullscreen-button">Toggle fullscreen</button></div>
            <h3>Locally yours</h3><p>Progress is saved automatically, including your fish, visitors, hazards, and milestones. Switching apps pauses everything. zq3d never reads or modifies the original Zenquarium save.</p>
            ${saveFailure ? `<div class="note-box error-text">${safeText(saveFailure)}</div>` : ''}
            <div class="panel-actions"><button class="secondary-button" id="export-button">Export backup</button><button class="secondary-button" id="import-button">Restore backup</button>
            ${storageConflict ? '<button class="primary-button" id="reload-button">Reload latest save</button>' : ''}
            ${storageBlocked && lastSerialized ? '<button class="secondary-button" id="reset-save-button">Reset unreadable zq3d save</button>' : ''}</div>
            <input id="import-file" type="file" accept=".json,application/json" hidden>
            ${game && !game.state.ended ? '<div class="panel-actions"><button class="secondary-button" id="save-home-button">Save &amp; return home</button><button class="secondary-button" id="end-session-button">Finish this session</button></div>' : ''}
            <p style="margin-top:24px">zq3d &middot; A parallel Zenquarium experience<br>Created with care. No accounts, telemetry, or external services.</p>`);
        $('setting-sound').addEventListener('change', event => { settings.sound = event.target.checked; save(); syncAudio(true); });
        $('setting-volume').addEventListener('input', event => { settings.volume = Number(event.target.value) / 100; sound.setVolume(settings.volume); save(); });
        $('setting-quality').addEventListener('change', event => {
            settings.quality = event.target.value; renderer.setQuality(settings.quality); save(); requestFrame();
        });
        $('setting-motion').addEventListener('change', event => { settings.motion = event.target.value; applyMotion(); save(); });
        $('setting-awake').addEventListener('change', event => { settings.keepAwake = event.target.checked; save(); syncWakeLock(); });
        $('export-button').addEventListener('click', exportSave);
        $('import-button').addEventListener('click', () => $('import-file').click());
        $('import-file').addEventListener('change', event => restoreSave(event.target.files[0]));
        $('reload-button')?.addEventListener('click', () => location.reload());
        $('reset-save-button')?.addEventListener('click', () => confirmPanel('Reset the unreadable save?', 'This removes only zq3d data. Export the unreadable backup first if you want to keep it.', 'Reset zq3d', () => {
            try { localStorage.removeItem(ZQ.STORAGE_KEY); location.reload(); }
            catch (error) { console.error('zq3d: save reset failed.', error); storageWarning('This browser did not allow the saved data to be removed.'); }
        }));
        $('fullscreen-button').addEventListener('click', toggleFullscreen);
        $('install-app')?.addEventListener('click', install);
        $('save-home-button')?.addEventListener('click', goHome);
        $('end-session-button')?.addEventListener('click', () => confirmPanel('Finish this session?', 'Your score and discoveries will be recorded. To keep this aquarium for later instead, choose Save & return home.', 'Finish session', () => act(() => game.finish())));
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
        if (enabled) closePanel();
        document.body.classList.toggle('immersed', enabled);
        $('exit-immersion').hidden = !enabled;
        if (enabled) $('exit-immersion').focus(); else $('immerse-button').focus();
        requestFrame();
    }
    function stopAnimation() {
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
            sound.update(dt);
            if (game) {
                consumeEvents();
                autosaveTime += dt; hudTime += dt;
                if (autosaveTime >= PARAMS.autosave) { autosaveTime = 0; save(); }
                if (hudTime >= PARAMS.hudInterval) { hudTime = 0; refresh(); }
            }
        }
        if (now - lastDraw >= 1000 / renderer.fps - 1 || !canAnimate()) {
            renderer.render(scene.state, renderTime, dt, profile.equippedPrizes);
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
        if (game) game.cursor = null;
    }
    function pointerDown(event) {
        if (event.button !== 0 && event.pointerType === 'mouse' || $('panel').open) return;
        const rect = $('viewport').getBoundingClientRect();
        const point = { x: event.clientX - rect.left, y: event.clientY - rect.top };
        pointers.set(event.pointerId, point);
        $('viewport').setPointerCapture(event.pointerId);
        if (pointers.size === 1) gesture = { x: point.x, y: point.y, time: performance.now(), moved: false, multi: false };
        if (pointers.size >= 2) {
            if (gesture) gesture.multi = true;
            const values = [...pointers.values()];
            pinchDistance = Math.hypot(values[0].x - values[1].x, values[0].y - values[1].y);
        }
    }
    function pointerMove(event) {
        if (!renderer) return;
        const rect = $('viewport').getBoundingClientRect();
        const point = { x: event.clientX - rect.left, y: event.clientY - rect.top };
        lastPointer = [point.x, point.y];
        if (game && event.pointerType === 'mouse') game.cursor = game.constrain(renderer.worldPoint(point.x, point.y));
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
            if (gesture?.moved) renderer.orbit(-(point.x - previous.x) * 0.006, (point.y - previous.y) * 0.005);
        }
        refresh(); requestFrame();
    }
    function pointerUp(event) {
        const point = pointers.get(event.pointerId);
        pointers.delete(event.pointerId);
        if (!pointers.size && point && gesture && !gesture.moved && !gesture.multi && performance.now() - gesture.time < PARAMS.tapDuration && game && !game.state.paused) {
            const hit = renderer.pick(game.state, point.x, point.y);
            if (hit?.kind === 'creature') act(() => {
                if (hit.entity.kind === 'crab') game.defendCreature('decoy', point.x < renderer.project(hit.entity.pos).x ? -1 : 1);
                else game.tapCreature();
            });
            else if (hit?.kind === 'prize') act(() => game.interactPrize(hit.entity.id));
            else act(() => game.tap(hit?.kind === 'fish' ? [...hit.entity.pos]
                : game.constrain(renderer.worldPoint(point.x, point.y))));
        }
        if (!pointers.size) { gesture = null; pinchDistance = 0; }
        if ($('viewport').hasPointerCapture(event.pointerId)) $('viewport').releasePointerCapture(event.pointerId);
    }
    function keyDown(event) {
        if (event.defaultPrevented || event.ctrlKey || event.altKey || event.metaKey) return;
        if (event.key === 'Escape' && !$('tray').hidden) { event.preventDefault(); closePanel(); return; }
        if (['INPUT', 'SELECT', 'TEXTAREA'].includes(event.target.tagName) || event.target.isContentEditable) return;
        if (['BUTTON', 'A'].includes(event.target.tagName) && [' ', 'Enter'].includes(event.key)) return;
        if ($('panel').open) return;
        if (!game) return;
        const key = event.key.toLowerCase();
        const actions = {
            f: feed, c: () => act(() => game.clean()), b: showShop, t: showPrizes,
            g: () => act(() => game.tap(game.constrain(renderer.worldPoint(renderer.width / 2, renderer.height / 2)))),
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
            if (registration.waiting) $('update-button').hidden = false;
            const watch = worker => {
                if (!worker) return;
                worker.addEventListener('statechange', () => {
                    if (worker.state === 'installed') {
                        if (registration.active && registration.waiting) $('update-button').hidden = false;
                    } else if (worker.state === 'activated') {
                        offlineReady = true;
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
        if (!installPrompt) return;
        try {
            await installPrompt.prompt();
            await installPrompt.userChoice;
            installPrompt = null;
            if (panelKind === 'settings') showSettings();
        } catch (error) {
            console.info('zq3d: the install prompt was not available.', error);
            toast('Use your browser menu to install, or Add to Home Screen on iPhone and iPad.');
        }
    }
    function bind() {
        $('begin-button').addEventListener('click', requestBegin);
        $('resume-button').addEventListener('click', () => begin(true));
        $('home-button').addEventListener('click', () => { if (game) goHome(); });
        $('journal-button').addEventListener('click', () => showJournal());
        $('settings-button').addEventListener('click', showSettings);
        $('sound-button').addEventListener('click', () => { settings.sound = !settings.sound; save(); syncAudio(true); });
        $('feed-button').addEventListener('click', feed);
        $('clean-button').addEventListener('click', () => act(() => game.clean()));
        $('shop-button').addEventListener('click', showShop);
        $('prizes-button').addEventListener('click', showPrizes);
        $('dock-toggle').addEventListener('click', () => {
            const collapsed = document.body.classList.toggle('controls-collapsed');
            $('dock-toggle').setAttribute('aria-expanded', String(!collapsed));
            $('dock-toggle').setAttribute('aria-label', collapsed ? 'Show aquarium controls' : 'Hide aquarium controls');
            $('dock-toggle').title = collapsed ? 'Show controls' : 'Hide controls';
        });
        $('auto-button').addEventListener('click', () => act(() => {
            if (!game.actionable()) return game.reject('Resume your aquarium before changing Zen care.');
            game.state.auto = !game.state.auto;
            toast(game.state.auto ? 'Zen care is on. Your aquarium will tend to its essentials when it can afford them.' : 'Zen care is off. The little world is in your hands.');
        }));
        $('pause-button').addEventListener('click', () => game.state.paused ? resume() : pause());
        $('unpause-button').addEventListener('click', resume);
        $('pause-home-button').addEventListener('click', goHome);
        $('score-button').addEventListener('click', showScore);
        $('residents-button').addEventListener('click', () => showResidents());
        $('immerse-button').addEventListener('click', () => immerse(true));
        $('camera-immerse-button').addEventListener('click', () => immerse(true));
        $('exit-immersion').addEventListener('click', () => immerse(false));
        $('orbit-button').addEventListener('click', () => { renderer.orbit(Math.PI / 8, 0); refresh(); requestFrame(); });
        $('view-button').addEventListener('click', () => {
            cameraAngle = (cameraAngle + 1) % ZQRenderer.PARAMS.camera.views.length;
            renderer.camera.pitch = ZQRenderer.PARAMS.camera.views[cameraAngle];
            renderer.camera.follow = null; refresh(); requestFrame();
        });
        $('zoom-in-button').addEventListener('click', () => { renderer.zoom(0.88); requestFrame(); });
        $('zoom-out-button').addEventListener('click', () => { renderer.zoom(1.12); requestFrame(); });
        $('reset-camera-button').addEventListener('click', () => { renderer.reset(); refresh(); requestFrame(); });
        $('follow-label').addEventListener('click', () => { renderer.camera.follow = null; refresh(); requestFrame(); });
        $('care-action').addEventListener('click', event => {
            const action = event.currentTarget.dataset.action;
            if (action === 'shop') showShop();
            else if (action === 'visitor') act(() => game.tapCreature());
            else if (action === 'crab-left') act(() => game.defendCreature('decoy', -1));
            else if (action === 'eel-flash') act(() => game.defendCreature('flash'));
            else if (action === 'clean') act(() => game.clean());
            else feed();
        });
        $('care-action-secondary').addEventListener('click', () => act(() => game.defendCreature('decoy', 1)));
        $('tray-close').addEventListener('click', closePanel);
        $('panel-close').addEventListener('click', () => panelKind === 'summary' ? goHome() : closePanel());
        $('panel').addEventListener('cancel', event => {
            if (panelKind === 'milestone') event.preventDefault();
            else if (panelKind === 'summary') { event.preventDefault(); goHome(); }
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
            if (!pointers.size) { gesture = null; pinchDistance = 0; }
        });
        $('viewport').addEventListener('pointerleave', () => { if (game && !pointers.size) game.cursor = null; });
        $('viewport').addEventListener('wheel', event => {
            event.preventDefault(); renderer.zoom(Math.exp(ZQ.clamp(event.deltaY, -150, 150) * 0.001)); requestFrame();
        }, { passive: false });
        document.addEventListener('keydown', keyDown);
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
        window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); installPrompt = event; });
        window.addEventListener('appinstalled', () => { installPrompt = null; toast('zq3d has a new home. Your aquarium is ready whenever you are.'); });
        $('update-button').addEventListener('click', () => {
            if (!save()) { toast('Export a backup before reloading because this browser cannot save right now.', 'warning'); return; }
            if (game) pause();
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
                $('renderer-label').textContent = 'PERSPECTIVE MODE';
                toast(`${message} A lighter perspective mode keeps your aquarium playable.`);
            },
            lost: () => pause('3D graphics were interrupted. Your aquarium is safely paused while the browser restores them.'),
            restored: () => {
                refresh(); requestFrame();
                toast('Graphics restored. Resume when you are ready.');
            },
            quality: level => {
                $('renderer-label').textContent = renderer.is3D ? `3D \u00b7 ${level.toUpperCase()}` : 'PERSPECTIVE MODE';
            }
        });
        renderer.setQuality(settings.quality);
        applyMotion();
        $('theme-options').innerHTML = Object.values(ZQ.THEMES).map((theme, i) =>
            `<button class="theme-option" data-theme="${theme.id}" aria-pressed="${theme.id === selectedTheme}" aria-label="Preview ${theme.name}: ${theme.subtitle}">
            <span class="theme-number">0${i + 1}${icon('arrow')}</span><strong>${theme.name}</strong></button>`).join('');
        $('theme-options').querySelectorAll('[data-theme]').forEach(button => button.addEventListener('click', () => preview(button.dataset.theme, true)));
        new ResizeObserver(() => {
            document.body.style.setProperty('--care-height', `${$('care-alert').getBoundingClientRect().height}px`);
        }).observe($('care-alert'));
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
    return { get game() { return game; }, get renderer() { return renderer; },
        get profile() { return profile; }, get settings() { return settings; },
        get offlineReady() { return offlineReady; }, save };
})();
