'use strict';

(() => {
    const core = typeof ZQ !== 'undefined' ? ZQ : require('../core.js');
    const results = [];
    const assert = (condition, message = 'Assertion failed') => { if (!condition) throw new Error(message); };
    const equal = (actual, expected) => assert(JSON.stringify(actual) === JSON.stringify(expected), `Expected ${JSON.stringify(expected)}; received ${JSON.stringify(actual)}`);
    const near = (actual, expected, epsilon = 1e-7) => assert(Math.abs(actual - expected) <= epsilon, `Expected ${expected}; received ${actual}`);
    const throws = fn => { let threw = false; try { fn(); } catch { threw = true; } assert(threw, 'Expected invalid input to throw'); };
    const test = (name, fn) => {
        if (globalThis.ZQ_TEST_FILTER && !globalThis.ZQ_TEST_FILTER.test(name)) return;
        try { fn(); results.push({ name, passed: true }); }
        catch (error) { results.push({ name, passed: false, error: error.message }); }
    };
    const established = () => {
        const profile = core.createProfile();
        for (const a of core.ACHIEVEMENTS) profile.achievements[a.id] = '2026-01-01';
        return profile;
    };
    const make = (theme = 'tropical', profile = established()) => new core.Game(theme, profile, { seed: 12345, width: 1200, height: 800 });
    const envelope = game => ({ version: core.VERSION, profile: game.profile, settings: { ...core.DEFAULT_SETTINGS }, session: game.snapshot() });
    const breedingPair = (g, type = 0) => {
        while (g.state.fish.filter(f => f.type === type).length < 2) g.addFish(type);
        const fish = g.state.fish.filter(f => f.type === type).slice(0, 2);
        fish.forEach((f, i) => {
            f.sex = i ? 'female' : 'male'; f.growth = 1; f.hunger = 100; f.health = 100;
            f.fear = 0; f.socialCooldown = 0; f.pos = [i * 1.5, 1.5, 0]; f.vel = [0, 0, 0];
        });
        return fish;
    };
    const steps = (game, seconds, dt = 1 / 60) => {
        for (let i = 0; i < Math.round(seconds / dt); i++) game.update(dt);
    };
    const spawn = (game, kind) => {
        const original = game.random;
        const index = game.theme.visitors.findIndex(v => v.kind === kind);
        assert(index >= 0, 'Missing challenge variant');
        game.random = () => (index + 0.1) / game.theme.visitors.length;
        game.spawnCreature();
        game.random = original;
        return game.state.creature;
    };

    test('Five worlds preserve four species, existing prices, and progression', () => {
        equal(Object.keys(core.THEMES), ['koi', 'tropical', 'deep', 'zen', 'ink']);
        equal(Object.values(core.THEMES).map(t => t.fish.map(f => f.cost)),
            [[20, 25, 30, 15], [20, 25, 30, 10], [30, 20, 15, 25], [25, 15, 30, 20], [20, 25, 15, 30]]);
        for (const theme of Object.values(core.THEMES)) {
            equal(theme.fish.length, 4);
            equal(new Set(theme.fish.map(f => f.id)).size, 4);
            assert(theme.music.notes.length >= 4 && theme.visitors.length >= 2);
        }
        equal(core.ACHIEVEMENTS.length, 20);
        equal(core.MILESTONES.length, 5);
    });
    test('Barreleye is a finned resident distinct from the Crystal Jelly visitor', () => {
        const theme = core.THEMES.deep;
        equal(theme.fish[1].id, 'barreleye');
        equal(theme.fish[1].name, 'Barreleye');
        equal(theme.fish[1].shape, 'slim');
        equal(theme.fish[1].cost, 20);
        equal(theme.fish[1].traits, ['shy', 'explorer']);
        assert(theme.fish.every(f => f.id !== 'jelly' && f.name !== 'Jellyfish'));
        assert(theme.visitors.some(v => v.kind === 'jellyfish' && v.name === 'Crystal Jelly'));
        for (const version of [core.VERSION]) {
            const g = make('deep');
            g.state.fish[1].health = 83;
            g.state.fish[1].hunger = 68;
            const saved = envelope(g);
            saved.version = version;
            const before = JSON.stringify(saved);
            const loaded = core.validateSave(saved);
            const resumed = new core.Game('deep', loaded.profile, { snapshot: loaded.session });
            equal(resumed.state.fish, saved.session.fish);
            equal(resumed.theme.fish[resumed.state.fish[1].type].name, 'Barreleye');
            equal(resumed.state.score, saved.session.score);
            equal(JSON.stringify(saved), before);
        }
    });
    test('Initial state starts with 100 points, two healthy fish, and no unearned purchase achievement', () => {
        const g = make('koi', core.createProfile());
        equal(g.state.score, 100);
        equal(g.state.fish.map(f => f.type), [0, 1]);
        assert(g.state.fish.every(f => f.health === 100 && f.hunger === 50));
        assert(!g.profile.achievements['first-fish']);
    });
    test('Purchase spends the species price and awards First Fish only once across sessions', () => {
        const p = core.createProfile(), g = make('koi', p);
        assert(g.buy(3).ok);
        equal(g.state.score, 110);
        assert(g.buy(3).ok);
        equal(g.state.score, 95);
        const next = make('koi', p);
        next.buy(3);
        equal(next.state.score, 85);
        equal(g.state.stats.bought, 2);
    });
    test('Every discovery emits its name and actual bonus once per profile, including after resume', () => {
        for (const discovery of core.ACHIEVEMENTS) {
            const g = make('koi', core.createProfile());
            g.drainEvents();
            g.state.multiplier = 3;
            const before = g.state.score;
            assert(g.unlock(discovery.id), `Missing unlock for ${discovery.id}`);
            const events = g.drainEvents();
            equal(events.length, 1);
            equal(events[0], { type: 'achievement', message: `New discovery: ${discovery.name}`,
                achievement: discovery.id, amount: discovery.bonus * 3 });
            equal(g.state.score, before + discovery.bonus * 3);
            equal(g.state.newAchievements, [discovery.id]);
            equal(g.state.activity.at(-1), { type: 'achievement', message: events[0].message,
                time: g.state.elapsed, amount: events[0].amount });
            assert(!g.unlock(discovery.id), `Repeated reward for ${discovery.id}`);
            equal(g.drainEvents(), []);
            const loaded = core.validateSave(envelope(g));
            const resumed = new core.Game('koi', loaded.profile, { snapshot: loaded.session });
            assert(!resumed.unlock(discovery.id), `Resume repeated ${discovery.id}`);
            equal(resumed.drainEvents(), []);
            equal(resumed.state.score, g.state.score);
        }
    });
    test('Unaffordable, invalid, over-capacity, paused, and ended purchases do not change balance', () => {
        const g = make();
        g.state.score = 0;
        assert(!g.buy(0).ok);
        equal(g.state.score, 0);
        g.state.score = 100;
        assert(!g.buy(99).ok);
        g.state.paused = true; assert(!g.buy(0).ok); g.state.paused = false;
        while (g.state.fish.length < g.state.maxFish) g.addFish(0);
        assert(!g.buy(0).ok);
        equal(g.state.score, 100);
        g.state.ended = true; assert(!g.buy(0).ok);
    });
    test('Positive events receive the multiplier; penalties and purchases do not', () => {
        const g = make();
        g.state.multiplier = 3;
        g.award(25, 'Test');
        equal(g.state.score, 175);
        g.award(-20, 'Penalty');
        equal(g.state.score, 155);
        g.buy(3);
        equal(g.state.score, 145);
        g.feed();
        equal(g.state.score, 140);
        g.award(-1000, 'Floor');
        equal(g.state.score, 0);
    });
    test('Base rate counts healthy adults, not babies or unhealthy fish', () => {
        const g = make();
        g.state.fish[0].health = 49;
        g.addFish(2, true);
        g.progression(1);
        near(g.state.score, 100.5);
    });
    test('Streak thresholds are exactly 30, 90, and 180 active healthy seconds', () => {
        const g = make();
        g.progression(29.9); equal(g.state.multiplier, 1);
        g.progression(0.1); equal(g.state.multiplier, 1.5);
        g.progression(59.9); equal(g.state.multiplier, 1.5);
        g.progression(0.1); equal(g.state.multiplier, 2);
        g.progression(89.9); equal(g.state.multiplier, 2);
        g.progression(0.1); equal(g.state.multiplier, 3);
    });
    test('Interrupted health streak stops building; below 50 resets even before the first threshold', () => {
        const g = make();
        g.state.streak = 20; g.state.fish[0].health = 49;
        g.progression(0.01);
        equal(g.state.streak, 0); equal(g.state.multiplier, 1);
        g.state.multiplier = 2; g.state.fish[0].health = 70;
        g.progression(1);
        equal(g.state.streak, 0); equal(g.state.multiplier, 2);
        g.state.fish[0].health = 49; g.progression(0.01);
        equal(g.state.multiplier, 1);
    });
    test('A genuinely empty tank resets the multiplier', () => {
        const g = make();
        g.state.fish = []; g.state.multiplier = 3;
        g.progression(0.01);
        equal(g.state.multiplier, 1);
    });
    test('Clean Sweep checks water health before cleaning', () => {
        const healthy = make(); healthy.state.dirt = 20; healthy.state.tankHealth = healthy.waterHealth();
        healthy.clean();
        equal(healthy.state.score, 110); equal(healthy.state.tankHealth, 100);
        const dirty = make(); dirty.state.dirt = 31; dirty.state.tankHealth = dirty.waterHealth();
        dirty.clean();
        equal(dirty.state.score, 90); equal(dirty.state.tankHealth, 100);
        dirty.state.damage = 20; dirty.state.tankHealth = dirty.waterHealth(); dirty.clean();
        equal(dirty.state.damage, 0);
    });
    test('Perfect Tank requires five fish each above 90%, not just clean water', () => {
        const g = make(); g.addFish(0); g.addFish(0); g.addFish(0);
        g.state.fish[0].health = 85;
        g.state.timers.perfect = 59.99; g.progression(0.02);
        equal(g.state.timers.perfect, 0);
        g.state.fish[0].health = 100;
        g.state.tankHealth = 60; g.state.timers.perfect = 59.99;
        g.progression(0.02);
        assert(g.drainEvents().some(e => e.message === 'Perfect Tank'));
    });
    test('Biodiversity requires all four living species for 45 continuous seconds', () => {
        const g = make(); g.addFish(2); g.addFish(3);
        g.state.timers.diversity = 44.99; g.progression(0.02);
        assert(g.drainEvents().some(e => e.message === 'Biodiversity'));
        g.state.timers.diversity = 44; g.state.fish.pop(); g.progression(0.1);
        equal(g.state.timers.diversity, 0);
    });
    test('Hunger and recovery are simulation-time based, bounded, and pause safely', () => {
        const g = make();
        g.state.fish[0].hunger = 100; g.state.fish[0].health = 90;
        steps(g, 1);
        near(g.state.fish[0].hunger, 100 - core.CONFIG.hungerDecay, 1e-5);
        near(g.state.fish[0].health, 92, 1e-5);
        g.state.paused = true;
        const snapshot = JSON.stringify(g.state);
        steps(g, 2);
        equal(JSON.stringify(g.state), snapshot);
    });
    test('Deaths are charged and counted once, with a larger starvation penalty', () => {
        const g = make(), f = g.state.fish[0];
        g.kill(f, 'starvation'); g.kill(f, 'starvation');
        equal(g.state.score, 80); equal(g.state.stats.lost, 1); equal(g.profile.stats.lost, 1);
        g.kill(g.state.fish[0], 'predator');
        equal(g.state.score, 65); equal(g.state.stats.lost, 2);
    });
    test('Empty aquariums get five seconds and a purchase resets the rescue timer', () => {
        const g = make();
        g.state.fish = [];
        steps(g, 4);
        assert(!g.state.ended);
        g.buy(3);
        equal(g.state.timers.empty, 0);
        steps(g, 2);
        assert(!g.state.ended);
        g.state.fish = [];
        steps(g, 5.1);
        assert(g.state.ended);
        equal(g.state.outcome, 'defeat');
    });
    test('Zero water health ends the game immediately', () => {
        const g = make();
        g.state.dirt = 100;
        g.update(1 / 60);
        assert(g.state.ended);
        equal(g.state.reason, 'The water became uninhabitable.');
    });
    test('Milestones wait one active second and acknowledgment stays nonblocking', () => {
        const g = make();
        g.state.score = 1000;
        steps(g, 0.5);
        assert(g.state.pending && !g.state.milestone);
        steps(g, 0.6);
        equal(g.state.milestone, 'bronze'); assert(!g.state.paused);
        const elapsed = g.state.elapsed;
        steps(g, 0.5); assert(g.state.elapsed > elapsed);
        assert(g.feed().ok);
        assert(g.resume().ok); assert(!g.state.paused);
        g.state.paused = true;
        g.continueMilestone();
        assert(g.state.paused, 'Continue ignored an explicit pause'); equal(g.state.milestone, null);
        g.resume();
        steps(g, 2);
        assert(!g.state.milestone);
        equal(g.profile.bestMilestone, 'bronze');
    });
    test('Milestone messages distinguish a new lifetime record from a repeated milestone', () => {
        const g = make();
        g.profile.bestMilestone = 'silver';
        for (const id of ['bronze', 'silver', 'gold']) {
            const milestone = core.MILESTONES.find(m => m.id === id);
            g.state.score = milestone.score;
            g.progression(1);
            const events = g.drainEvents().filter(event => event.type === 'milestone');
            equal(events.length, 1);
            equal(events[0].message, `${milestone.name}${id === 'gold' ? ' \u2014 new highest milestone!' : ' achieved!'}`);
            assert(g.state.activity.some(entry => entry.type === 'milestone' && entry.message === events[0].message));
            equal(g.profile.bestMilestone, id === 'gold' ? 'gold' : 'silver');
            assert(!g.state.paused);
            g.continueMilestone();
        }
    });
    test('Master requires fifteen residents, four species, and three continuous minutes', () => {
        const g = make();
        g.state.milestones = ['bronze', 'silver', 'gold', 'platinum'];
        while (g.state.fish.length < 15) g.addFish(g.state.fish.length % 4);
        g.state.thriving = 179; g.progression(0.9);
        assert(!g.state.pending);
        g.state.fish.pop(); g.progression(0.1);
        equal(g.state.thriving, 0);
        g.addFish(2); g.state.thriving = 179.99; g.progression(0.02);
        equal(g.state.pending.id, 'master');
    });
    test('Ending records the Pacifist bonus in the final score and cannot double-count sessions', () => {
        const p = core.createProfile(), g = make('koi', p);
        g.state.elapsed = 120;
        g.finish();
        equal(g.state.score, 300);
        equal(p.highScore, 300);
        equal(p.sessions, 1);
        assert(p.achievements.pacifist);
        assert(g.drainEvents().some(event => event.type === 'achievement' && event.achievement === 'pacifist'
            && event.message === 'New discovery: Pacifist' && event.amount === 200));
        g.finish();
        equal(p.sessions, 1);
        equal(g.state.score, 300);
    });
    test('Victory requires a reached milestone', () => {
        const g = make();
        assert(!g.finish('victory').ok);
        assert(!g.state.ended);
        g.state.milestone = 'bronze'; g.state.milestones = ['bronze'];
        assert(g.finish('victory', 'Bronze Aquarist').ok);
        equal(g.state.outcome, 'victory');
    });
    test('Rotation reframes the habitat without moving residents, food, or threats', () => {
        equal(core.capacity(320, 568), 15);
        equal(core.capacity(1200, 800), 20);
        equal(core.capacity(4000, 3000), 20);
        const g = make();
        while (g.state.fish.length < 20) g.addFish(0);
        g.feed(); spawn(g, 'eel');
        const before = g.snapshot(), habitat = JSON.stringify(g.habitat);
        g.resize(320, 568);
        equal(g.state.fish.length, 20); equal(g.state.maxFish, 15);
        equal(g.state.bounds, before.bounds); equal(g.state.fish, before.fish);
        equal(g.state.food, before.food); equal(g.state.creature, before.creature);
        equal(JSON.stringify(g.habitat), habitat);
        equal(core.boundsFor(320, 568), core.boundsFor(1200, 800));
        assert(g.state.fish.every(f => Math.abs(f.pos[0]) <= g.state.bounds.width));
        assert(!g.buy(0).ok);
    });
    test('Personal space follows actual fish size and growth in all three dimensions', () => {
        const adult = { size: 1.3, growth: 1 }, baby = { size: 1.3, growth: 0 };
        near(core.fishScale(adult), 1.3 * core.CONFIG.fishScale);
        near(core.fishScale(baby), core.fishScale(adult) * 0.3);
        assert(core.fishSpacing(adult, adult) > core.fishSpacing(adult, baby));
        assert(core.fishSpacing(adult, baby) > core.fishSpacing(baby, baby));
        const g = make('koi', core.createProfile());
        g.state.fish = [];
        for (let i = 0; i < 3; i++) {
            const f = g.addFish(0);
            f.pos = [0, 0, (i - 1) * 0.1];
            f.vel = [0, 0, 0]; f.target = [5, 0, 0]; f.retarget = 4; f.hunger = 100;
        }
        steps(g, 3);
        const distances = g.state.fish.flatMap((f, i) => g.state.fish.slice(i + 1).map(o => core.distance(f.pos, o.pos)));
        assert(Math.min(...distances) > 0.9, 'A school collapsed into overlapping bodies');
        assert(g.profile.achievements.schooling, 'Looser schools must still unlock School\'s In');
    });
    test('Coincident residents separate without invalid vectors or permanent overlap', () => {
        const g = make('koi');
        g.state.fish.forEach(f => {
            f.pos = [0, 0, 0]; f.vel = [0, 0, 0]; f.target = [5, 0, 0]; f.retarget = 4; f.hunger = 100;
        });
        steps(g, 2);
        assert(core.distance(g.state.fish[0].pos, g.state.fish[1].pos) > 0.8);
        assert(g.state.fish.every(f => f.pos.every(Number.isFinite) && f.vel.every(Number.isFinite)));
    });
    test('Ordinary populations stay spread through the 3D volume on desktop and phones', () => {
        for (const theme of Object.keys(core.THEMES)) for (const width of [1200, 390]) {
            const g = new core.Game(theme, core.createProfile(), { demo: true, seed: 71437, width, height: 800 });
            let crowded = 0, nearest = 0, samples = 0;
            const span = [0, 0, 0];
            for (let frame = 0; frame < 2700; frame++) {
                g.update(1 / 30);
                if (frame < 900 || frame % 30) continue;
                samples++;
                const fish = g.state.fish;
                for (const f of fish) {
                    const others = fish.filter(o => o !== f);
                    nearest += Math.min(...others.map(o => core.distance(f.pos, o.pos))) / fish.length;
                    crowded += others.some(o => core.distance(f.pos, o.pos) < (core.fishScale(f) + core.fishScale(o)) * 0.76) / fish.length;
                }
                for (let axis = 0; axis < 3; axis++) {
                    span[axis] += Math.max(...fish.map(f => f.pos[axis])) - Math.min(...fish.map(f => f.pos[axis]));
                }
            }
            const label = `${theme} at ${width}px`;
            assert(crowded / samples < 0.1, `${label}: more than 10% of residents remain body-close`);
            assert(nearest / samples > 1.65, `${label}: neighbors do not have breathing room`);
            assert(span[0] / samples > g.state.bounds.width * 1.2, `${label}: fish ignore the tank's width (${span[0] / samples})`);
            assert(span[1] / samples > 3.2 && span[2] / samples > 3.6, `${label}: fish have flattened into a narrow layer (${span.map(n => n / samples)})`);
        }
    });
    test('Food has a bounded lifetime and a hard population limit', () => {
        const g = make();
        g.state.score = 10000;
        for (let i = 0; i < 40; i++) g.feed();
        assert(g.state.food.length <= core.CONFIG.foodLimit);
        assert(!g.feed().ok);
        g.state.fish.forEach(f => { f.hunger = 100; });
        const food = g.state.food[0];
        food.age = 14.99;
        g.update(0.02);
        assert(!g.state.food.includes(food));
    });
    test('Repeated taps incur the exact stress penalty and persistent water damage', () => {
        const g = make();
        for (let i = 0; i < 4; i++) g.tap([0, 0, 0]);
        equal(g.state.score, 95);
        equal(g.state.damage, 2);
        g.update(0.05);
        assert(g.state.tankHealth < 98);
    });
    test('Visitors cannot attack outside the aquarium and warn before releasing repeated hazards', () => {
        const g = make('koi');
        const c = spawn(g, 'jellyfish');
        g.state.fish.forEach(f => { f.pos = [...c.pos]; });
        const count = g.state.fish.length;
        g.updateCreature(0.01);
        equal(g.state.fish.length, count);
        c.pos = [0, 0, 0]; c.flee = 0; c.phaseTimer = 0;
        g.state.fish.forEach(f => { f.pos = [0, 0, 0]; });
        g.updateCreature(0.01);
        equal(g.state.fish.length, count);
        equal(c.phase, 'windup'); equal(g.state.attacks.length, 0);
        near(c.phaseTimer, core.CONFIG.encounterWarning);
        c.phaseTimer = 0.01;
        g.updateCreature(0.02);
        equal(g.state.attacks.length, 1);
        equal(g.state.attacks[0].kind, 'stingers');
        near(c.cooldown, core.CONFIG.visitorKillCooldown);
        g.updateCreature(0.01);
        equal(g.state.attacks.length, 1);
        assert(c.cooldown > 7.9);
    });
    test('Three outward swipes repel ordinary creatures; taps stir them without defending', () => {
        const g = make('koi');
        spawn(g, 'jellyfish');
        const c = g.state.creature;
        c.pos = [0, 0, 0];
        assert(g.tapCreature().ok);
        assert(c.provoked);
        equal(c.defenseStep, 0);
        assert(g.defendCreature('swipe', -1).ok);
        assert(!g.defendCreature('swipe', 1).ok);
        equal(g.state.attacks.length, 0);
        c.decoyCooldown = 0;
        assert(g.defendCreature('swipe', 1).ok);
        c.decoyCooldown = 0;
        assert(g.defendCreature('swipe', 1).ok);
        assert(c.defended); equal(c.phase, 'leaving');
        equal(g.state.stats.taps, 1); equal(g.state.stress, 3);
        equal(g.state.attacks.length, 0);
        assert(!g.tapCreature().ok);
        core.validateSave(envelope(g));
    });
    test('Quick defense rewards meet exact timing thresholds for every creature and cannot double-award', () => {
        for (const kind of ['jellyfish', 'squid', 'octopus', 'crab', 'eel']) {
            const theme = Object.values(core.THEMES).find(t => t.visitors.some(v => v.kind === kind));
            for (const [seconds, expected] of [[0, 60], [3, 60], [3.5, 59], [13, 40], [23, 20], [90, 20]]) {
                const g = make(theme.id), c = spawn(g, kind);
                c.age = 100; c.defenseStartedAt = 100 - seconds;
                const before = g.state.score;
                g.state.multiplier = 3;
                g.drainEvents();
                g.repelChallenge(c);
                equal(g.state.score - before, expected);
                g.checkAchievements();
                equal(g.profile.highScore, Math.floor(g.state.score));
                const reward = g.drainEvents().filter(e => e.type === 'defended');
                equal(reward.length, 1); equal(reward[0].amount, expected);
                assert(g.state.activity.some(e => e.type === 'defended' && e.amount === expected));
                const stats = JSON.stringify(g.state.stats);
                g.repelChallenge(c);
                equal(g.state.score - before, expected);
                equal(JSON.stringify(g.state.stats), stats);
                equal(g.drainEvents().filter(e => e.type === 'defended').length, 0);
                const data = core.validateSave(envelope(g));
                const restored = new core.Game(g.theme.id, data.profile, {snapshot: data.session});
                restored.resume();
                const restoredScore = restored.state.score;
                restored.repelChallenge(restored.state.creature);
                equal(restored.state.score, restoredScore);
            }
        }
    });
    test('Defenses start timing on entry or the first early swipe, not the approach', () => {
        const g = make('koi'), c = spawn(g, 'jellyfish');
        c.age = 20; c.pos = [0, 0, 0]; c.entered = true;
        g.advanceEncounter(c, 0.1, true);
        equal(c.defenseStartedAt, 20);
        c.age = 33;
        const before = g.state.score;
        g.repelChallenge(c); equal(g.state.score - before, 40);
        const early = make('koi'), visitor = spawn(early, 'jellyfish');
        visitor.age = 15;
        early.defendCreature('swipe', 1);
        equal(visitor.defenseStartedAt, 15);
        visitor.age = 28;
        visitor.decoyCooldown = 0; early.defendCreature('swipe', 1);
        visitor.decoyCooldown = 0;
        const beforeEarly = early.state.score;
        early.defendCreature('swipe', 1);
        equal(early.state.score - beforeEarly, 40);
    });
    test('Eel mandatory waits and milestone acknowledgments do not penalize or interrupt a prompt hold', () => {
        const g = make(), c = spawn(g, 'eel');
        c.pos = [0, -2, -1.2]; c.entered = true; c.age = 30;
        equal(c.defenseStartedAt, null);
        for (let i = 0; i < 61 && c.phase !== 'windup'; i++) g.updateCreature(0.1);
        equal(c.phase, 'windup');
        assert(c.defenseStartedAt >= 35.9);
        const before = g.state.score;
        assert(g.beginCreatureHold().ok); g.updateCreature(0.3);
        g.state.milestone = 'bronze'; g.state.milestones = ['bronze'];
        g.continueMilestone();
        assert(g.heldCreature === c); near(c.holdCharge, 0.3);
        for (let i = 0; i < 5 && !c.defended; i++) g.updateCreature(0.1);
        assert(c.defended); equal(g.state.score - before, 60);
    });
    test('Defense clocks freeze while paused, persist through saves and reject invalid timing fields', () => {
        const g = make(), c = spawn(g, 'crab');
        c.age = 30; c.defenseStartedAt = 17;
        g.state.paused = true;
        steps(g, 30); equal(c.age, 30);
        const data = core.validateSave(envelope(g));
        const resumed = new core.Game(g.theme.id, data.profile, {snapshot: data.session});
        resumed.resume();
        const before = resumed.state.score;
        resumed.repelChallenge(resumed.state.creature);
        equal(resumed.state.score - before, 40);
        for (const value of [-1, 31, '17', NaN, Infinity, undefined]) {
            const invalid = envelope(g); invalid.session.creature.defenseStartedAt = value;
            throws(() => core.validateSave(invalid));
        }
        const older = envelope(g); delete older.session.creature.defenseStartedAt;
        core.validateSave(older);
        const compatible = new core.Game(g.theme.id, older.profile, {snapshot: older.session});
        equal(compatible.state.creature.defenseStartedAt, null);
    });
    test('Only active current visitors earn defense points and peaceful departure stays a separate one-time bonus', () => {
        const g = make('koi'), c = spawn(g, 'jellyfish'), before = g.state.score;
        g.state.paused = true; g.repelChallenge(c); assert(!c.defended); equal(g.state.score, before);
        g.state.paused = false;
        g.repelChallenge({...c}); assert(!c.defended); equal(g.state.score, before);
        g.repelChallenge(null); equal(g.state.score, before);
        g.repelChallenge(c); equal(g.state.score, before + 60);
        c.pos = [g.state.bounds.width + 2, 0, g.state.bounds.depth + 2.5];
        g.updateCreature(0.01);
        equal(g.state.creature, null); equal(g.state.score, before + 90);
        g.updateCreature(0.01); equal(g.state.score, before + 90);
        const crab = make(), hungry = spawn(crab, 'crab');
        hungry.eaten = 1;
        const crabBefore = crab.state.score;
        crab.repelChallenge(hungry); equal(crab.state.score, crabBefore + 60);
        hungry.pos = [crab.state.bounds.width + 2, crab.state.bounds.floor + 0.42, crab.state.bounds.depth + 2.5];
        crab.updateCreature(0.01);
        equal(crab.state.creature, null); equal(crab.state.score, crabBefore + 60);
    });
    test('Attack survival bonuses wait for active-time expiry and require living survivors', () => {
        const g = make();
        g.state.attacks = [{ kind: 'ink', age: 9.9, life: 10, pos: [100, 100, 100], nodes: [], lostBefore: 0 }];
        g.state.paused = true;
        g.update(0.1);
        equal(g.state.attacks[0].age, 9.9);
        equal(g.state.score, 100);
        g.state.paused = false;
        g.updateAttacks(0.11);
        equal(g.state.score, 140);
        equal(g.state.stats.attacksSurvived, 1);
        equal(g.state.attacks.length, 0);
        const empty = make();
        empty.state.fish = [];
        empty.state.attacks = [{ kind: 'ink', age: 9.9, life: 10, pos: [0, 0, 0], nodes: [], lostBefore: 0 }];
        empty.updateAttacks(0.11);
        equal(empty.state.score, 100);
    });
    test('A fish loss invalidates the attack-survivor award', () => {
        const g = make();
        g.state.attacks = [{ kind: 'ink', age: 9.9, life: 10, pos: [100, 100, 100], nodes: [], lostBefore: 0 }];
        g.kill(g.state.fish[0], 'starvation');
        g.updateAttacks(0.11);
        equal(g.state.score, 80);
        equal(g.state.stats.attacksSurvived, 0);
    });
    test('Reproduction obeys the Zen care population cap across all species in one step', () => {
        const g = make();
        g.state.auto = true;
        for (let type = 0; type < 4; type++) while (g.state.fish.filter(f => f.type === type).length < 2) g.addFish(type);
        g.addFish(0);
        g.state.fish.forEach(f => { f.hunger = 100; f.health = 100; });
        breedingPair(g);
        g.state.reproduction.fill(0);
        g.random = () => 0;
        g.reproduce(0.1);
        equal(g.state.stats.born, 0);
        for (let i = 0; i < 41; i++) g.reproduce(0.1);
        equal(g.state.fish.length, 10);
        equal(g.state.stats.born, 1);
        assert(g.state.fish.some(f => f.growth === 0));
    });
    test('Zen care uses the ordinary costs and preserves the cap', () => {
        const g = make();
        g.state.auto = true;
        g.state.fish.forEach(f => { f.hunger = 40; });
        g.state.dirt = 45; g.state.tankHealth = g.waterHealth();
        g.autoCare(0.01);
        equal(g.state.fish.length, 3);
        assert(g.state.food.length >= 3 && g.state.food.length <= 6);
        equal(g.state.tankHealth, 100);
        assert(g.state.score >= 55 && g.state.score <= 75);
    });
    test('Save snapshots round-trip every active mechanic and resume paused', () => {
        const g = make('deep');
        g.feed(); g.buy(2); g.state.auto = true;
        const c = spawn(g, 'jellyfish');
        g.releaseCreatureAttack(c);
        g.state.fish[0].hunger = 88; g.state.streak = 19;
        const data = core.validateSave(JSON.parse(JSON.stringify(envelope(g))));
        const resumed = new core.Game('deep', data.profile, { snapshot: data.session });
        assert(resumed.state.paused);
        equal(resumed.state.fish, g.state.fish);
        equal(resumed.state.food, g.state.food);
        equal(resumed.state.attacks, g.state.attacks);
        equal(resumed.state.creature, g.state.creature);
        equal(resumed.state.seed, g.state.seed);
        resumed.resume();
        resumed.update(0.01);
        assert(resumed.state.elapsed > g.state.elapsed);
    });
    test('Malformed nested saves are rejected, not partially loaded', () => {
        const mutations = [
            d => { d.version = 999; }, d => { d.session.themeId = 'unknown'; },
            d => { d.session.fish[0].pos = [0, null, 1]; },
            d => { d.session.fish[0].traits = null; },
            d => { d.session.fish[1].id = d.session.fish[0].id; },
            d => { d.session.food = [{ pos: [0, 0, 0] }]; },
            d => { d.profile.stats = {}; }, d => { d.settings.quality = 'ultra'; },
            d => { d.session.pending = { id: 'fake', remaining: 1 }; },
            d => { d.session.score = -1; }, d => { d.session.attacks = [{}]; }
        ];
        for (const mutation of mutations) {
            const data = envelope(make()); mutation(data); throws(() => core.validateSave(data));
        }
    });
    test('Demo aquariums do not award achievements or simulate neglect', () => {
        const p = core.createProfile(), g = new core.Game('tropical', p, { demo: true, seed: 12345 });
        steps(g, 60);
        equal(g.state.score, 100);
        equal(g.state.tankHealth, 100);
        equal(g.state.fish.length, 9);
        equal(p.themesPlayed, []);
        equal(p.achievements, {});
    });
    test('Seeded simulation is deterministic at the same simulation timestep', () => {
        const a = make(), b = make();
        steps(a, 10); steps(b, 10);
        equal(a.state, b.state);
        throws(() => a.update(Infinity)); throws(() => a.update(-1)); throws(() => a.update(1));
    });
    test('Zen care survives a bounded active-time soak with valid snapshots and bounded effects', () => {
        for (const id of Object.keys(core.THEMES)) {
            const g = make(id);
            g.state.auto = true;
            for (let i = 0; i < 18000 && !g.state.ended; i++) {
                if (g.state.milestone) g.continueMilestone();
                g.update(1 / 30);
                if (i % 900 === 0) core.validateSave(envelope(g));
            }
            core.validateSave(envelope(g));
            assert(g.state.food.length <= core.CONFIG.foodLimit);
            assert(g.state.fish.length <= g.state.maxFish);
            assert(Number.isFinite(g.state.score));
            assert(g.state.elapsed >= 120, `${id} failed too early: ${g.state.elapsed}`);
        }
    });
    test('Matrix inversion supports picking after camera rotation', () => {
        if (typeof ZQRenderer === 'undefined') return;
        const vp = ZQRenderer.multiply(ZQRenderer.perspective(1.4), ZQRenderer.lookAt([6, 4, 12], [0, 0, 0]));
        const inverse = ZQRenderer.inverse(vp);
        const p = [2, -1, 0.4, 1], clip = ZQRenderer.transform(vp, p), restored = ZQRenderer.transform(inverse, clip);
        for (let i = 0; i < 3; i++) near(restored[i] / restored[3], p[i], 1e-4);
    });
    test('Every camera limit and following pose keeps the near plane above a continuous floor', () => {
        if (typeof ZQRenderer === 'undefined') return;
        for (const [width, height] of [[1440, 1000], [390, 844], [320, 568], [844, 390], [3000, 600], [200, 1400]]) {
            const g = new core.Game('tropical', core.createProfile(), { width, height, seed: 12345 });
            const r = Object.create(ZQRenderer.Renderer.prototype);
            Object.assign(r, { width, height, level: 'battery', reduced: true });
            r.setTheme(g.theme, g.state.bounds);
            const b = g.state.bounds, limits = ZQRenderer.PARAMS.camera;
            for (const follow of [null, g.state.fish[0].id]) for (const fishY of [b.floor + 0.6, b.surface - 0.45]) {
                g.state.fish[0].pos = [b.width - 0.3, fishY, b.depth];
                for (let turn = 0; turn < 8; turn++) for (const pitch of [-2, 0.02, 0.75, 3]) for (const zoom of [0.1, 1, 4]) {
                    r.camera = { yaw: turn * Math.PI / 4, pitch, zoom, target: [0, 0, 0], follow };
                    r.updateCamera(g.state, 1 / 60);
                    assert(r.camera.pitch >= limits.minPitch && r.camera.pitch <= limits.maxPitch);
                    assert(r.camera.zoom >= limits.minZoom && r.camera.zoom <= limits.maxZoom);
                    assert(r.eye[1] >= b.floor + limits.floorClearance, 'Camera eye went below the sand');
                    const inv = ZQRenderer.inverse(r.vp);
                    for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) {
                        const clip = ZQRenderer.transform(inv, [x, y, z, 1]);
                        const p = clip.slice(0, 3).map(n => n / clip[3]);
                        if (z === -1) assert(p[1] > b.floor + 0.095, 'Near plane can cut beneath the terrain');
                        assert(Math.abs(p[0]) < r.groundExtent && Math.abs(p[2]) < r.groundExtent, 'The camera can expose a floor edge');
                    }
                    const polygon = r.floorPolygon(b.floor);
                    assert(polygon.length >= 3, 'Compatibility floor disappeared');
                    assert(polygon.every(p => Number.isFinite(p.x) && Number.isFinite(p.y)
                        && p.x >= -0.01 && p.x <= width + 0.01 && p.y >= -0.01 && p.y <= height + 0.01),
                    'Compatibility ground was not clipped to the view');
                    for (const x of [0, width]) assert(polygon.some(p => Math.abs(p.x - x) < 0.01 && Math.abs(p.y - height) < 0.01),
                        'Compatibility floor leaves a gap at the bottom');
                }
            }
        }
    });
    test('Glass coordinates stay under the pointer through full orbits and camera gestures respect bounds', () => {
        if (typeof ZQRenderer === 'undefined') return;
        const g = make();
        const r = Object.create(ZQRenderer.Renderer.prototype);
        Object.assign(r, { width: 1200, height: 800, reduced: true, camera: {} });
        r.reset();
        for (let turn = 0; turn < 8; turn++) {
            r.camera.yaw = turn * Math.PI / 4;
            r.updateCamera(g.state, 1 / 60);
            for (const [x, y] of [[250, 200], [600, 400], [1000, 650]]) {
                const p = r.project(r.worldPoint(x, y));
                near(p.x, x, 0.02); near(p.y, y, 0.02);
            }
        }
        r.orbit(0, -1000);
        equal(r.camera.pitch, ZQRenderer.PARAMS.camera.minPitch);
        r.orbit(0, 1000);
        equal(r.camera.pitch, ZQRenderer.PARAMS.camera.maxPitch);
        r.zoom(0.0001);
        equal(r.camera.zoom, ZQRenderer.PARAMS.camera.minZoom);
        r.zoom(1000);
        equal(r.camera.zoom, ZQRenderer.PARAMS.camera.maxZoom);
    });
    test('Every theme adds distinct crab and eel variants without replacing its existing visitors', () => {
        for (const theme of Object.values(core.THEMES)) {
            assert(theme.visitors.some(v => v.kind === 'crab'));
            assert(theme.visitors.some(v => v.kind === 'eel'));
            assert(theme.visitors.some(v => v.kind === 'jellyfish'));
            assert(theme.visitors.some(v => v.kind === 'octopus'));
        }
    });
    test('Crabs require three alternating swipes, reject rapid repeats, and award a round arch once', () => {
        const g = make();
        const c = spawn(g, 'crab');
        c.pos = [0, g.state.bounds.floor + 0.42, 0.8]; c.entered = true;
        assert(g.defendCreature('swipe', -1).ok);
        assert(!g.defendCreature('swipe', 1).ok);
        c.decoyCooldown = 0;
        assert(!g.defendCreature('swipe', -1).ok);
        equal(c.defenseStep, 1);
        c.decoyCooldown = 0; g.defendCreature('swipe', 1);
        c.decoyCooldown = 0; g.defendCreature('swipe', -1);
        assert(c.defended); equal(c.phase, 'leaving');
        equal(g.profile.stats.crabsRepelled, 1);
        assert(g.state.prizes.arch);
        assert(g.state.equippedPrizes.includes('arch'));
        assert(!g.defendCreature('swipe', 1).ok);
        equal(g.profile.stats.crabsRepelled, 1);
        core.validateSave(envelope(g));
    });
    test('An undefended crab steals settled food and leaves extra dirt', () => {
        const g = make();
        const c = spawn(g, 'crab');
        c.pos = [0, g.state.bounds.floor + 0.42, 0.8];
        const item = { pos: [0, g.state.bounds.floor + 0.1, 0.8], age: 10, speed: 0.3, phase: 1 };
        g.state.food.push(item);
        g.updateCreature(0.01);
        assert(!g.state.food.includes(item));
        near(g.state.dirt, 1.5);
    });
    test('Eels require a sustained hold during their coil to discharge and unlock the lantern', () => {
        const g = make();
        const c = spawn(g, 'eel');
        c.pos = [0, -2, -1.2]; c.entered = true; c.phaseTimer = 0;
        assert(!g.beginCreatureHold().ok);
        g.updateCreature(0.01);
        equal(c.phase, 'windup');
        near(c.phaseTimer, core.CONFIG.eelWarning);
        assert(!g.defendCreature('flash').ok);
        assert(g.beginCreatureHold().ok);
        g.updateCreature(0.1);
        assert(!c.defended);
        g.endCreatureHold(); near(c.holdCharge, 0);
        assert(g.beginCreatureHold().ok);
        for (let i = 0; i < 8 && !c.defended; i++) g.updateCreature(0.1);
        assert(c.defended); equal(c.phase, 'leaving');
        equal(g.profile.stats.eelsRepelled, 1);
        assert(g.state.prizes.lantern);
        assert(!g.beginCreatureHold().ok);
        core.validateSave(envelope(g));
    });
    test('Ignoring an eel coil leads to a dash; pausing freezes its warning window', () => {
        const g = make();
        const c = spawn(g, 'eel');
        c.pos = [0, -2, -1.2]; c.entered = true; c.phaseTimer = 0;
        g.updateCreature(0.01);
        g.state.paused = true;
        steps(g, 1);
        near(c.phaseTimer, core.CONFIG.eelWarning);
        g.state.paused = false; c.phaseTimer = 0.01;
        g.updateCreature(0.02);
        equal(c.phase, 'dash');
        assert(!g.defendCreature('flash').ok);
        assert(!g.state.prizes.lantern);
    });
    test('New visitors do not accidentally satisfy the original Creature Collector achievement', () => {
        const g = make('koi', core.createProfile());
        g.state.stats.creaturesSeen = ['jellyfish', 'crab'];
        spawn(g, 'eel');
        assert(!g.profile.achievements['creature-collector']);
        g.state.creature = null;
        g.state.stats.creaturesSeen = ['jellyfish', 'octopus', 'crab', 'eel'];
        spawn(g, 'squid');
        assert(g.profile.achievements['creature-collector']);
    });
    test('Prizes belong to each round, cap at three placements, survive resume, and never award farmable score', () => {
        const g = make();
        g.state.score = 1000;
        g.state.stats.born = 1; g.state.stats.eelsRepelled = 1; g.state.stats.crabsRepelled = 1;
        g.checkPrizes();
        equal(Object.keys(g.state.prizes).length, 4);
        equal(g.state.equippedPrizes.length, 3);
        assert(!g.equipPrize('arch').ok);
        assert(g.equipPrize('chest').ok);
        assert(g.equipPrize('arch').ok);
        const score = g.state.score;
        for (let i = 0; i < 10; i++) assert(g.interactPrize('oyster').ok);
        equal(g.state.score, score);
        equal(g.state.prizeEffects.oyster, core.CONFIG.prizeInteraction);
        const next = make('ink', g.profile);
        equal(next.state.equippedPrizes, []);
        equal(next.state.prizes, {});
        const saved = core.validateSave(envelope(g));
        const resumed = new core.Game(g.state.themeId, saved.profile, { snapshot: saved.session });
        equal(resumed.state.equippedPrizes, g.state.equippedPrizes);
        equal(resumed.state.prizes, g.state.prizes);
        equal(resumed.state.prizePositions, g.state.prizePositions);
        core.validateSave(envelope(g));
    });
    test('Unearned prizes cannot be placed and prize animations freeze while paused', () => {
        const g = make();
        assert(!g.equipPrize('chest').ok);
        assert(!g.interactPrize('chest').ok);
        g.state.stats.born = 1; g.checkPrizes();
        g.interactPrize('oyster');
        g.state.paused = true; steps(g, 2);
        equal(g.state.prizeEffects.oyster, 6);
        g.state.paused = false; steps(g, 0.5);
        near(g.state.prizeEffects.oyster, 5.5);
    });
    test('Older development saves are rejected unchanged with a fresh aquarium explanation', () => {
        for (let version = 1; version < core.VERSION; version++) {
            const old = envelope(make('deep')); old.version = version;
            const before = JSON.stringify(old);
            let error;
            try { core.validateSave(old); } catch (e) { error = e; }
            assert(error?.message.includes('fresh zq3d aquarium'));
            equal(JSON.stringify(old), before);
        }
    });

    test('Shared habitats are deterministic, quality independent, and include solid stacked rocks', () => {
        for (const theme of Object.keys(core.THEMES)) {
            const g = make(theme);
            equal(g.habitat, core.createHabitat(theme, g.state.bounds));
            equal(g.habitat.plants.length, theme === 'zen' ? 12 : 20);
            equal(g.habitat.shelters.length, 6);
            equal(g.habitat.rocks.length, theme === 'zen' ? 8 : theme === 'ink' ? 23 : 20);
            assert(g.habitat.rocks.every(r => r.radius.every(n => n > 0)));
            if (typeof ZQRenderer !== 'undefined') for (const level of ['high', 'balanced', 'battery']) {
                const r = Object.create(ZQRenderer.Renderer.prototype);
                Object.assign(r, { width: 1200, height: 800, level });
                r.setTheme(g.theme, g.state.bounds);
                equal(r.decor.rocks, g.habitat.rocks.flatMap(rock =>
                    rock.parts ? rock.parts.map(part => ({ ...part, moss: rock.moss })) : [rock]));
                equal(r.decor.plants, g.habitat.plants);
            }
        }
    });
    test('Residents choose sustained, species-influenced intentions and investigate clear habitat routes', () => {
        const g = make('koi');
        const f = g.state.fish[0];
        f.hunger = 100; f.intent = 'cruise'; f.intentTime = 12; f.target = [5, 2, 2];
        steps(g, 2);
        equal(f.intent, 'cruise'); near(f.intentTime, 10, 1e-5);
        const shy = g.state.fish[1];
        const random = g.random;
        g.random = () => 0.2;
        g.chooseIntent(f);
        equal(f.intent, 'rest');
        g.chooseIntent(shy);
        equal(shy.intent, 'investigate');
        assert(['browse', 'explore'].includes(shy.habitatActivity));
        equal(shy.target, shy.habitatRoute[0]);
        assert(shy.habitatRoute.every(point => g.habitat.obstacles.every(rock =>
            core.rockDistance(point, rock, core.fishScale(shy) * 0.8) >= 0.99)));
        assert(shy.intentTime >= 6);
        g.random = random;
    });
    test('Fish avoid solid scenery with bounded acceleration, turns, and banking in every world', () => {
        for (const theme of Object.keys(core.THEMES)) {
            const g = new core.Game(theme, core.createProfile(), { demo: true, seed: 71437 });
            const f = g.state.fish[0], rock = g.habitat.rocks[0];
            f.pos = g.clearRock([rock.pos[0] - rock.radius[0] - 1, rock.pos[1], rock.pos[2]], core.fishScale(f) * 0.8);
            f.target = [...rock.pos]; f.intentTime = 16;
            let previous = g.state.fish.map(f => ({ id: f.id, vel: [...f.vel], yaw: f.yaw }));
            for (let frame = 0; frame < 1800; frame++) {
                g.update(1 / 30);
                for (const fish of g.state.fish) {
                    const before = previous.find(p => p.id === fish.id);
                    assert(fish.pos.every(Number.isFinite));
                    assert(g.habitat.rockSolids.every(r => core.rockDistance(fish.pos, r, core.fishScale(fish) * 0.8) >= 0.99), `${theme}: resident entered a rock`);
                    assert(core.distance(fish.vel, before.vel) <= 5 / 30 + 0.3, `${theme}: acceleration jumped`);
                    assert(Math.abs(fish.yaw - before.yaw) <= 1.8 / 30 + 1e-6);
                    assert(Math.abs(fish.roll) <= 0.28);
                }
                previous = g.state.fish.map(f => ({ id: f.id, vel: [...f.vel], yaw: f.yaw }));
            }
        }
    });
    test('Residents notice local threats without rewriting creature-specific attacks', () => {
        const g = make('tropical');
        const f = g.state.fish[0];
        f.pos = [0, 0, 0]; f.vel = [0, 0, 0]; f.hunger = 100;
        const c = spawn(g, 'octopus');
        c.pos = [1.2, 0, 0];
        f.yaw = Math.PI;
        g.updateFish(f, 1 / 60);
        equal(f.activity, 'evade');
        assert(f.vel[0] < 0);
        c.defended = true;
        g.updateFish(f, 1 / 60);
        assert(f.activity !== 'evade');
        g.state.attacks.push({ kind: 'stingers', nodes: [[0.5, 0, 0]], pos: [0.5, 0, 0] });
        g.updateFish(f, 1 / 60);
        equal(f.activity, 'evade');
    });
    test('Narrow saved habitats retain their shape and residents can clear boundary rocks', () => {
        for (const theme of Object.keys(core.THEMES)) {
            const legacy = envelope(make(theme));
            legacy.session.bounds.width = 3.4;
            const saved = core.validateSave(legacy);
            const g = new core.Game(theme, saved.profile, { snapshot: saved.session });
            g.resize(1440, 1000);
            equal(g.state.bounds.width, 3.4);
            for (const rock of g.habitat.rockSolids) for (const side of [-1, 1]) {
                const radius = core.fishScale(g.state.fish[0]) * 0.8;
                const point = g.clearRock([rock.pos[0] + side * rock.radius[0], rock.pos[1], rock.pos[2]], radius);
                assert(g.habitat.rockSolids.every(r => core.rockDistance(point, r, radius) >= 0.99));
                assert(Math.abs(point[0]) <= g.state.bounds.width - 0.3);
            }
        }
    });
    test('Current drift is gentle, three dimensional, bounded, and freezes with the aquarium', () => {
        const g = make();
        g.state.fish.forEach(f => { f.hunger = 100; });
        g.feed([g.state.bounds.width, 0, g.state.bounds.depth]);
        const before = g.snapshot();
        steps(g, 0.5);
        assert(g.state.food.length > 0);
        assert(g.state.food.some((f, i) => f.pos[2] !== before.food[i].pos[2]));
        assert(g.state.food.every(f => Math.abs(f.pos[0]) < g.state.bounds.width && Math.abs(f.pos[2]) <= g.state.bounds.depth));
        const current = core.currentAt([2, 0, 1], 10);
        assert(Math.hypot(...current) < 0.08);
        g.state.paused = true;
        const paused = g.snapshot();
        steps(g, 2);
        equal(g.snapshot(), paused);
    });
    test('Intentions and recent moments survive save reload with deterministic continuation', () => {
        const g = make('ink');
        g.state.auto = true;
        steps(g, 8);
        const saved = core.validateSave(envelope(g));
        const resumed = new core.Game('ink', JSON.parse(JSON.stringify(saved.profile)), { snapshot: saved.session });
        equal(resumed.habitat, g.habitat);
        resumed.resume();
        steps(g, 5); steps(resumed, 5);
        equal(resumed.snapshot(), g.snapshot());
    });
    test('Recent moments are bounded, persist discoveries, and reject malformed new save fields', () => {
        const g = make();
        for (let i = 0; i < 60; i++) g.emit('arrival', `Moment ${i}`);
        equal(g.state.activity.length, 40);
        equal(g.state.activity[0].message, 'Moment 20');
        g.award(10, 'A quiet bonus');
        equal(g.state.activity.at(-1).amount, 10);
        const badActivity = envelope(g);
        badActivity.session.activity[0].time = -1;
        throws(() => core.validateSave(badActivity));
        for (const [key, value] of [['intent', 'teleport'], ['activity', 'unknown'], ['intentTime', 999], ['roll', 2]]) {
            const bad = envelope(g); bad.session.fish[0][key] = value;
            throws(() => core.validateSave(bad));
        }
    });

    test('Swimming stays body-aligned and upright while species retain distinct rhythms', () => {
        for (const theme of Object.keys(core.THEMES)) {
            const g = new core.Game(theme, core.createProfile(), { demo: true, seed: 71437 });
            const rates = new Map();
            for (let frame = 0; frame < 1200; frame++) {
                g.update(1 / 30);
                for (const f of g.state.fish) {
                    if (frame < 60) continue;
                    const speed = Math.hypot(...f.vel);
                    if (speed > 0.15) {
                        const dot = (Math.cos(f.yaw) * Math.cos(f.pitch) * f.vel[0] + Math.sin(f.pitch) * f.vel[1] -
                            Math.sin(f.yaw) * Math.cos(f.pitch) * f.vel[2]) / speed;
                        assert(dot > Math.cos(Math.PI / 12), `${theme}: sideways swimming`);
                    }
                    assert(Math.abs(f.roll) <= 0.12);
                    if (!['evade', 'forage'].includes(f.activity)) assert(Math.abs(f.pitch) <= 0.75);
                    rates.set(f.type, f.phase / f.age);
                }
            }
            assert(Math.max(...rates.values()) - Math.min(...rates.values()) > 0.3, `${theme}: identical swimming rhythm`);
        }
    });
    test('Habitat visits arrive, dwell, pause for threats, and depart without consuming their rest early', () => {
        const g = make('koi'), f = g.state.fish[0];
        g.state.fish = [f]; f.hunger = 100;
        f.pos = [0, 0, 0]; f.vel = [0, 0, 0]; f.yaw = 0; f.pitch = 0;
        f.target = [1.5, 0, 0]; f.intent = 'rest'; f.activity = 'rest';
        f.intentTime = 30; f.visitPhase = 'approach'; f.dwellTime = 0;
        for (let i = 0; i < 600 && f.visitPhase !== 'dwell'; i++) g.updateFish(f, 1 / 60);
        equal(f.visitPhase, 'dwell'); assert(f.dwellTime >= 4);
        const remaining = f.dwellTime;
        f.fear = 1; g.updateFish(f, 0.1);
        near(f.dwellTime, remaining); equal(f.activity, 'evade');
        f.fear = 0; f.vel = [0, 0, 0];
        for (let i = 0; i < 700 && f.intent === 'rest'; i++) g.updateFish(f, 1 / 60);
        assert(f.intent !== 'rest' || f.visitPhase === 'approach', 'Rest never ends');
    });
    test('Natural populations complete habitat approaches in every theme', () => {
        for (const theme of Object.keys(core.THEMES)) {
            const g = new core.Game(theme, core.createProfile(), { demo: true, seed: 71437 });
            let visits = 0;
            const phases = new Map();
            for (let i = 0; i < 3600; i++) {
                g.update(1 / 30);
                for (const f of g.state.fish) {
                    if (f.visitPhase === 'dwell' && phases.get(f.id) !== 'dwell') visits++;
                    phases.set(f.id, f.visitPhase);
                }
            }
            assert(visits >= 6, `${theme}: only ${visits} completed approaches in two minutes`);
        }
    });
    test('Crabs keep their footprint on the sand and eel bodies clear solid habitat during lunges', () => {
        for (const theme of Object.keys(core.THEMES)) for (const kind of ['crab', 'eel']) {
            const g = make(theme), c = spawn(g, kind), r = g.habitat.rocks[0];
            g.state.fish = [];
            c.pos = [r.pos[0] - r.radius[0] - 1.5, g.state.bounds.floor + (kind === 'crab' ? 0.42 : 0.85), r.pos[2]];
            c.direction = 1; c.yaw = 0; c.entered = true;
            const destination = [r.pos[0] + r.radius[0] + 1.5, c.pos[1], r.pos[2]];
            if (kind === 'crab') g.state.food.push({ pos: destination, age: 0, speed: 0.3, phase: 0 });
            else { c.phase = 'dash'; c.phaseTimer = 1.2; c.targetPoint = destination; }
            const scale = g.theme.visitors[c.index].size * 0.55;
            for (let i = 0; i < 120 && g.state.creature; i++) {
                if (i === 80) { c.defended = true; c.flee = 5; }
                g.updateCreature(0.1);
                if (kind === 'crab') near(c.pos[1], g.floorAt(c.pos[0], c.pos[2]) + 0.42);
                const points = kind === 'crab' ? [c.pos] : Array.from({ length: 8 }, (_, n) => {
                    const offset = (1.05 - n * 3.15 / 7) * scale;
                    return [c.pos[0] + Math.cos(c.yaw) * offset, c.pos[1], c.pos[2] - Math.sin(c.yaw) * offset];
                });
                for (const p of points) assert(g.habitat.obstacles.every(obstacle =>
                    core.rockDistance(p, obstacle, core.creaturePadding(kind, g.theme.visitors[c.index].size)) >= 0.99),
                    `${theme}: ${kind} clips a solid feature at step ${i}, position ${p}, center ${c.pos}`);
            }
        }
    });
    test('Crab obstacle steering makes progress around a rock rather than only blocking penetration', () => {
        const g = make(), c = spawn(g, 'crab');
        g.state.fish = [];
        const rock = { pos: [0, g.state.bounds.floor + 0.45, 0], radius: [0.8, 0.6, 0.6] };
        g.habitat = { rocks: [rock], obstacles: [rock], ceiling: rock.pos[1] + rock.radius[1] };
        c.pos = [-3, g.state.bounds.floor + 0.42, 0]; c.entered = true; c.yaw = 0;
        g.state.food = [{ pos: [3, c.pos[1], 0], age: 0, speed: 0.3, phase: 0 }];
        for (let i = 0; i < 450 && g.state.food.length; i++) g.updateCreature(0.1);
        equal(g.state.food.length, 0);
        assert(c.pos[0] > 2, 'The crab remained stuck on its original side of the rock');
    });
    test('Saved visit fields reject invalid data', () => {
        const g = make();
        for (const [key, value] of [['visitPhase', 'teleport'], ['dwellTime', -1], ['dwellTime', 10]]) {
            const bad = JSON.parse(JSON.stringify(envelope(g)));
            bad.session.fish[0][key] = value;
            throws(() => core.validateSave(bad));
        }
    });
    test('Resize reuses all meshes and quality changes rebuild scenery without rebuilding residents', () => {
        if (typeof ZQRenderer === 'undefined') return;
        const r = Object.create(ZQRenderer.Renderer.prototype);
        let builds = 0, releases = 0;
        Object.assign(r, { width: 1200, height: 800, level: 'high', gl: {},
            mesh: geometry => ({ id: ++builds, count: geometry.vertices.length / 10 }),
            releaseMesh: () => { releases++; } });
        r.setTheme(core.THEMES.deep, core.boundsFor(1200, 800));
        const initial = builds, initialReleases = releases, fish = r.fishMeshes, visitors = r.creatureMeshes, plants = r.decor.sceneryPlants.length;
        r.width = 2560; r.height = 1080;
        r.setTheme(core.THEMES.deep, core.boundsFor(2560, 1080));
        equal(builds, initial); equal(releases, initialReleases);
        r.level = 'battery'; r.setTheme(core.THEMES.deep, r.bounds);
        equal(builds, initial + 1); assert(r.fishMeshes === fish && r.creatureMeshes === visitors);
        assert(plants > r.decor.sceneryPlants.length);
        assert(r.decor.sceneryRocks.some(rock => Math.abs(rock.pos[0]) > r.bounds.width));
        equal(r.decor.rocks, core.createHabitat('deep', r.bounds).rocks.flatMap(rock =>
            rock.parts ? rock.parts.map(part => ({ ...part, moss: rock.moss })) : [rock]));
    });

    test('Crabs enter from the open foreground and threaten exposed bottom residents in every theme', () => {
        for (const theme of Object.keys(core.THEMES)) for (const direction of [-1, 1]) {
            const g = make(theme), c = spawn(g, 'crab');
            c.direction = direction;
            c.pos[0] = -direction * (g.state.bounds.width + 1.5);
            const padding = core.creaturePadding('crab', g.theme.visitors[c.index].size);
            g.state.fish.forEach(f => { f.pos = [0, -2.3, 2.2]; });
            let enteredAt = null;
            for (let i = 0; i < 600; i++) {
                const before = [...c.pos], phase = c.phase;
                g.updateCreature(0.1);
                if (c.entered && enteredAt === null) enteredAt = i / 10;
                assert(g.habitat.obstacles.every(o => core.rockDistance(c.pos, o, padding) >= 0.99), `${theme}: crab crossed a solid feature`);
                if (phase === 'windup' && c.phase === 'windup') near(core.distance(before, c.pos), 0);
            }
            assert(enteredAt !== null && enteredAt < 15, `${theme}: crab remained outside`);
            assert(g.state.stats.lost > 0, `${theme}: crab never threatened an exposed bottom resident`);
            assert(g.state.creature === c, `${theme}: unattended crab left`);
        }
    });
    test('Unattended creatures persist beyond two minutes and keep repeating bounded warned attacks', () => {
        for (const kind of ['jellyfish', 'squid', 'octopus', 'crab', 'eel']) {
            const g = make('koi'), c = spawn(g, kind);
            c.pos = [0, kind === 'crab' ? g.state.bounds.floor + 0.42 : 0, 0]; c.entered = true;
            g.state.fish.forEach(f => { f.pos = [4, 2.5, 2]; });
            let attacks = 0, warnings = 0;
            g.drainEvents();
            for (let i = 0; i < 1300; i++) {
                if (!g.state.fish.length) g.addFish(0, false, [4, 2.5, 2]);
                g.updateCreature(0.1);
                for (const event of g.drainEvents()) {
                    if (event.type === 'attack') attacks++;
                    if (event.type === 'challenge') warnings++;
                }
                assert(g.state.attacks.length <= 4);
                assert(g.state.creature === c, `${kind}: left without being repelled`);
            }
            assert(attacks >= 3 && warnings >= attacks, `${kind}: stopped threatening residents`);
            assert(c.age > 120);
            core.validateSave(envelope(g));
        }
    });
    test('Ignoring ink and stinger warnings causes real species-specific hazards and resident losses', () => {
        for (const kind of ['jellyfish', 'squid', 'octopus']) {
            const g = make('koi'), c = spawn(g, kind), f = g.state.fish[0];
            c.pos = [0, 0, 0]; c.entered = true; c.phase = 'windup'; c.phaseTimer = 0.1;
            g.state.fish = [f]; f.pos = kind === 'jellyfish' ? [0.65, -0.25, 0] : [0, 0, 0];
            g.updateCreature(0.05); equal(g.state.attacks.length, 0);
            g.updateCreature(0.06);
            const attack = g.state.attacks[0];
            equal(attack.kind, kind === 'jellyfish' ? 'stingers' : 'ink');
            if (kind !== 'jellyfish') assert(g.state.damage >= 15);
            g.updateAttacks(0.01); equal(g.state.fish.length, 0);
            equal(g.state.stats.lost, 1);
        }
    });
    test('Crab claws warn before killing at close range and do not remotely harm fish', () => {
        const g = make(), c = spawn(g, 'crab'), f = g.state.fish[0];
        g.state.fish = [f];
        c.pos = [0, g.state.bounds.floor + 0.42, g.state.bounds.depth]; c.entered = true;
        f.pos = [0.5, c.pos[1], c.pos[2]]; c.phase = 'windup'; c.phaseTimer = 0.2;
        c.targetPoint = [...f.pos];
        g.updateCreature(0.1); equal(g.state.fish.length, 1);
        g.updateCreature(0.1); equal(g.state.fish.length, 0); equal(c.phase, 'dash');
        near(g.state.dirt, 0);
        for (let i = 0; i < Math.ceil(core.CONFIG.crabDash / 0.1) + 1; i++) g.updateCreature(0.1);
        equal(g.state.fish.length, 0); equal(c.phase, 'recover');
        near(g.state.dirt, core.CONFIG.crabDirt);
        const distant = g.addFish(0, false, [4, 2, 1]);
        g.releaseCreatureAttack(c); assert(g.state.fish.includes(distant));
    });
    test('Crab strikes intercept moving prey along the ground, reload safely, and can be interrupted before sand damage', () => {
        const g = make(), c = spawn(g, 'crab'), f = g.state.fish[0];
        g.state.fish = [f];
        c.pos = [0, g.state.bounds.floor + 0.42, g.state.bounds.depth]; c.entered = true;
        f.pos = [1.5, c.pos[1] + 0.3, c.pos[2]];
        c.phaseTimer = 0;
        g.updateCreature(0.1); equal(c.phase, 'windup');
        equal(c.targetId, f.id);
        const start = [...c.pos];
        f.pos = [4, 2, 0]; c.phaseTimer = 0.01;
        g.updateCreature(0.1); equal(c.phase, 'dash');
        f.pos.forEach((n, i) => near(c.targetPoint[i], n + f.vel[i] * 0.2));
        near(c.pos[1], g.floorAt(c.pos[0], c.pos[2]) + 0.42); near(g.state.dirt, 0);
        assert(core.distance(c.pos, start) <= core.CONFIG.crabSpeed * 0.1 + 0.01);
        const saved = core.validateSave(envelope(g));
        const resumed = new core.Game('tropical', saved.profile, { snapshot: saved.session });
        for (let i = 0; i < Math.ceil(core.CONFIG.crabDash / 0.1) + 1; i++) resumed.updateCreature(0.1);
        near(resumed.state.dirt, core.CONFIG.crabDirt);
        equal(resumed.state.stats.lost, 0);
        assert(g.defendCreature('swipe', -1).ok);
        for (let i = 0; i < 6; i++) g.updateCreature(0.1);
        near(g.state.dirt, 0); equal(g.state.stats.lost, 0);
        const invalid = JSON.parse(JSON.stringify(saved)); invalid.session.creature.targetPoint = null;
        throws(() => core.validateSave(invalid));
    });
    test('Ignored crabs worsen water with freely swimming fish in every theme; successful defense stops added dirt', () => {
        for (const theme of Object.keys(core.THEMES)) {
            const g = make(theme), c = spawn(g, 'crab');
            let attacks = 0, crabDirt = 0, lowestWater = 100;
            g.drainEvents();
            for (let i = 0; i < 900 && !g.state.ended; i++) {
                if (g.state.fish.length < 2) g.addFish(i % 4);
                g.state.fish.forEach(f => { f.hunger = 100; f.health = 100; });
                g.state.dirt = 0; g.state.damage = 0;
                g.update(0.1);
                crabDirt += Math.max(0, g.state.dirt - core.CONFIG.dirtRate * 0.1);
                lowestWater = Math.min(lowestWater, g.state.tankHealth);
                attacks += g.drainEvents().filter(e => e.type === 'attack').length;
                if (g.state.milestone) g.continueMilestone();
            }
            assert(g.state.creature === c && attacks >= 4, `${theme}: no recurring crab threat`);
            near(crabDirt, attacks * core.CONFIG.crabDirt);
            assert(crabDirt >= 20, `${theme}: swimming fish made the crab harmless`);
            assert(lowestWater <= 100 - core.CONFIG.crabDirt, `${theme}: sand did not affect water quality`);
            g.state.dirt = 0; g.state.damage = 0; g.state.score = 100;
            for (const side of [-1, 1, -1]) {
                assert(g.defendCreature('swipe', side).ok);
                for (let i = 0; i < 4; i++) g.updateCreature(0.1);
            }
            assert(c.defended);
            for (let i = 0; i < 50; i++) g.updateCreature(0.1);
            near(g.state.dirt, 0);
            g.state.dirt = 20; g.state.tankHealth = g.waterHealth();
            assert(g.clean().ok); near(g.state.tankHealth, 100);
        }
    });
    test('Stinger contact follows visible trails and fish bodies, not line of sight to the visitor', () => {
        const g = make(), c = spawn(g, 'jellyfish'), f = g.state.fish[0];
        g.state.fish = [f]; c.pos = [0, 0, 0];
        g.releaseCreatureAttack(c);
        const node = g.state.attacks[0].nodes[0];
        f.pos = [node[0] + core.fishScale(f) * 0.45, node[1] + core.CONFIG.stingerLength * 0.7, node[2]];
        assert(core.distance(f.pos, node) > 0.2, 'Fixture only exercised the old endpoint');
        const before = [...f.pos]; f.vel = [0.01, 0.01, 0];
        g.updateFish(f, 1 / 60); assert(core.distance(before, f.pos) > 0);
        g.updateAttacks(1 / 60); equal(g.state.stats.lost, 1);
        const protectedFish = g.addFish(0, false, [0.65, 0.5, 0]);
        g.habitat.rocks = [{ pos: [0.3, 0.25, 0], radius: [0.3, 0.4, 0.5] }];
        assert(g.sheltered(c.pos, protectedFish.pos));
        g.updateAttacks(0.01); assert(!g.state.fish.includes(protectedFish));
    });
    test('Unattended ink, stingers and electricity cause consequences with naturally swimming, well-cared-for residents', () => {
        for (const kind of ['jellyfish', 'squid', 'octopus', 'eel']) {
            let damaged = 0;
            for (const theme of kind === 'eel' || kind === 'jellyfish' ? Object.keys(core.THEMES) : ['koi']) {
                const g = make(theme);
                spawn(g, kind);
                let attacks = 0, warnings = 0, waterDamage = 0;
                g.drainEvents();
                for (let i = 0; i < 1800 && !g.state.ended; i++) {
                    if (g.state.fish.length < 2) g.addFish(i % 4);
                    g.state.fish.forEach(f => { f.hunger = 100; f.health = 100; });
                    g.state.dirt = 0; g.state.damage = 0;
                    g.update(0.1);
                    damaged += g.state.stats.lost;
                    waterDamage += g.state.damage;
                    for (const event of g.drainEvents()) {
                        if (event.type === 'challenge') warnings++;
                        if (event.type === 'attack') attacks++;
                    }
                    if (g.state.milestone) g.continueMilestone();
                }
                assert(attacks >= 3 && warnings >= attacks, `${theme} ${kind}: missing recurring warned attacks`);
                if (kind !== 'jellyfish' && kind !== 'eel') assert(waterDamage >= 45, `${kind}: ink never affected water quality`);
            }
            if (kind === 'eel') assert(damaged > 0, 'Normal swimming made electric pulses harmless');
            if (kind === 'jellyfish') assert(damaged > 0, 'Normal swimming made tentacle trails harmless');
        }
    });
    test('Crossing the electric field kills immediately, records victims on reload, and never charges a loss twice', () => {
        const g = make(), c = spawn(g, 'eel');
        g.habitat = { rocks: [], stems: [], prizeObstacles: [], obstacles: [], ceiling: g.state.bounds.floor, routes: [] };
        c.pos = [0, 0, 0]; c.entered = true; c.phase = 'windup'; c.phaseTimer = 0.01;
        c.targetPoint = [1, 0, 0];
        g.state.fish.forEach(f => { f.pos = [1, 0, 0]; });
        g.updateCreature(0.02);
        equal(c.phase, 'dash'); equal(g.state.attacks[0].kind, 'shock');
        g.updateAttacks(0.3);
        equal(g.state.fish.length, 0); equal(g.state.stats.lost, 2);
        const score = g.state.score;
        g.updateAttacks(0.1); equal(g.state.score, score);
        const saved = core.validateSave(envelope(g));
        const resumed = new core.Game('tropical', saved.profile, { snapshot: saved.session });
        resumed.resume(); resumed.updateAttacks(0.1);
        equal(resumed.state.fish.length, 0); equal(resumed.state.stats.lost, 2);
        g.updateAttacks(core.CONFIG.shockLife);
        g.releaseCreatureAttack(c); g.updateAttacks(0.3);
        equal(g.state.fish.length, 0); equal(g.state.stats.lost, 2);
    });
    test('Visible electric field contact is lethal even behind a rock; outside the field stays safe', () => {
        const g = make(), c = spawn(g, 'eel'), f = g.state.fish[0];
        g.state.fish = [f]; c.pos = [-1, 0, 0]; f.pos = [1, 0, 0];
        g.habitat.rocks = [{ pos: [0, 0, 0], radius: [0.4, 0.8, 0.6] }];
        assert(g.sheltered(c.pos, f.pos));
        g.releaseCreatureAttack(c); g.updateAttacks(0.3); assert(!g.state.fish.includes(f));
        g.habitat.rocks = [];
        f.health = 100; f.pos = [2, 0, 0];
        g.state.attacks = []; g.releaseCreatureAttack(c); g.updateAttacks(0.01);
        equal(f.health, 100);
    });
    test('Late, paused and interrupted eel holds cannot skip warnings or earn duplicate prizes', () => {
        const g = make(), c = spawn(g, 'eel');
        c.pos = [0, 0, 0]; c.entered = true; c.phase = 'windup'; c.phaseTimer = 0.3;
        c.targetPoint = [1, 0, 0];
        assert(g.beginCreatureHold().ok);
        for (let i = 0; i < 4; i++) g.updateCreature(0.1);
        assert(!c.defended); equal(c.phase, 'dash');
        assert(!g.state.prizes.lantern); equal(c.holdCharge, 0);
        c.phase = 'windup'; c.phaseTimer = 2.6;
        g.beginCreatureHold(); g.updateCreature(0.1);
        g.state.paused = true; const before = g.snapshot();
        steps(g, 2); equal(g.snapshot(), before);
        g.resume(); equal(c.holdCharge, 0);
        const saved = core.validateSave(envelope(g));
        saved.session.creature.holdCharge = 0.5;
        const reloaded = new core.Game('tropical', saved.profile, { snapshot: saved.session });
        equal(reloaded.state.creature.holdCharge, 0); assert(!reloaded.heldCreature);
    });
    test('Completed gesture defenses lead to departure instead of leaving a permanent blocked visitor', () => {
        for (const theme of Object.keys(core.THEMES)) for (const kind of ['crab', 'eel', 'jellyfish', 'octopus']) {
            const g = make(theme), c = spawn(g, kind);
            c.pos = [0, kind === 'crab' ? g.state.bounds.floor + 0.42 : 0, kind === 'crab' ? g.state.bounds.depth : 0]; c.entered = true;
            if (kind === 'crab') assert(g.habitat.obstacles.every(obstacle =>
                core.rockDistance(c.pos, obstacle, core.creaturePadding(kind, g.theme.visitors[c.index].size)) >= 1), 'Invalid crab departure fixture');
            g.repelChallenge(c);
            for (let i = 0; i < 400 && g.state.creature === c; i++) g.updateCreature(0.1);
            assert(g.state.creature !== c, `${theme} ${kind}: blocked on retreat`);
        }
    });
    test('Encounter warning state and shock victim identities are validated', () => {
        const g = make(), c = spawn(g, 'octopus');
        g.releaseCreatureAttack(c);
        const old = JSON.parse(JSON.stringify(envelope(g)));
        const saved = core.validateSave(old);
        equal(saved.version, core.VERSION);
        equal(saved.session.creature.phase, old.session.creature.phase);
        equal(saved.session.creature.phaseTimer, old.session.creature.phaseTimer);
        equal(saved.session.attacks[0].kind, 'ink');
        equal(saved.session.attacks[0].hitIds, []);
        equal(old.version, core.VERSION);
        for (const mutate of [
            d => { d.session.creature.holdCharge = 9; },
            d => { d.session.creature.defenseStep = 1.5; },
            d => { d.session.creature.phase = 'teleport'; },
            d => { d.session.attacks[0].hitIds = [1]; }
        ]) {
            const bad = JSON.parse(JSON.stringify(envelope(g))); mutate(bad);
            throws(() => core.validateSave(bad));
        }
    });
    test('Encounter visual cues include warning rings, swipe progress and shock effects in the shared particle path', () => {
        if (typeof ZQRenderer === 'undefined') return;
        const g = make(), c = spawn(g, 'eel'), r = Object.create(ZQRenderer.Renderer.prototype);
        Object.assign(r, { theme: g.theme, level: 'battery', prizes: [], palette: { light: ZQRenderer.color(g.theme.light) } });
        c.pos = [0, 0, 0]; c.phase = 'stalk';
        const baseline = r.particleData(g.state, 1).length;
        c.phase = 'windup'; c.phaseTimer = 2.6; c.holdCharge = 0.35;
        assert(r.particleData(g.state, 1).length >= baseline + 24 * 9);
        c.phase = 'recover'; g.releaseCreatureAttack(c);
        assert(r.particleData(g.state, 1).length >= baseline + 32 * 9);
        for (const theme of Object.values(core.THEMES)) {
            const crab = theme.visitors.find(v => v.kind === 'crab');
            const rgb = ZQRenderer.color(crab.body);
            assert(Math.max(...rgb) - Math.min(...rgb) >= 0.25, `${theme.id}: crab shell is still desaturated`);
        }
        const crabGame = make(), crab = spawn(crabGame, 'crab');
        const quietSand = r.particleData(crabGame.state, 1).length;
        crab.phase = 'recover'; crab.cooldown = core.CONFIG.visitorKillCooldown;
        const disturbedSand = r.particleData(crabGame.state, 1);
        equal(disturbedSand.length, quietSand + 12 * 9);
        assert(disturbedSand.every(Number.isFinite));
    });

    test('Creature clearance contains animated legs, tentacles and the complete eel mesh', () => {
        if (typeof ZQRenderer === 'undefined') return;
        for (const def of core.THEMES.koi.visitors) {
            const mesh = ZQRenderer.creatureGeometry(def), scale = def.size * 0.55;
            const padding = core.creaturePadding(def.kind, def.size);
            for (let phase = 0; phase < Math.PI * 8; phase += Math.PI / 4) {
                for (let i = 0; i < mesh.vertices.length; i += 10) {
                    let [x, y, z] = mesh.vertices.slice(i, i + 3);
                    const part = mesh.vertices[i + 9];
                    if (def.kind === 'eel') z += Math.sin(phase + x * 4) * (0.06 + Math.max(0, -x) * 0.17);
                    else if (part > 8.5) {
                        x += Math.sin(phase + y * 4 + z * 3) * Math.abs(y) * 0.14;
                        z += Math.cos(phase * 0.8 + y * 3) * Math.abs(y) * 0.08;
                    } else if (part > 7.5) { x *= 1 + Math.sin(phase) * 0.045; z *= 1 + Math.sin(phase) * 0.045; }
                    if (def.kind === 'eel') {
                        const closest = Math.min(...Array.from({ length: 8 }, (_, n) => Math.hypot(
                            (x - (1.05 - n * 3.15 / 7)) * scale, y * scale, z * scale)));
                        assert(closest <= padding, 'Eel mesh extends outside its full-body capsule');
                    } else for (const yaw of ['crab', 'jellyfish'].includes(def.kind) ? [0] : [-1.4, 0, 1.4]) {
                        assert(Math.abs((Math.cos(yaw) * x + Math.sin(yaw) * z) * scale) <= padding[0] &&
                            Math.abs(y * scale) <= padding[1] &&
                            Math.abs((-Math.sin(yaw) * x + Math.cos(yaw) * z) * scale) <= padding[2],
                        `${def.kind}: animated mesh extends outside clearance`);
                    }
                }
            }
        }
    });
    test('Shared prize volumes cover rendered geometry and moving lids without filling the arch opening', () => {
        if (typeof ZQRenderer === 'undefined') return;
        for (const theme of Object.keys(core.THEMES)) {
            const g = make(theme);
            for (const prize of core.PRIZES) {
                const placement = core.prizePositions(g.state.bounds, [prize.id])[0];
                const solids = core.createPrizeObstacles(g.state.bounds, [prize.id]);
                const geometry = ZQRenderer.prizeGeometry(g.theme, prize.id);
                const covered = pos => assert(solids.some(s => core.rockDistance(pos, s) <= 1.000001),
                    `${theme} ${prize.id}: uncovered mesh vertex ${JSON.stringify(pos)}`);
                for (const mesh of [geometry.base, geometry.pearl].filter(Boolean)) for (let i = 0; i < mesh.vertices.length; i += 10) {
                    covered(placement.pos.map((n, axis) => n + mesh.vertices[i + axis]));
                }
                if (geometry.lid) for (let angle = 0; angle <= 1.10001; angle += 0.1) {
                    for (let i = 0; i < geometry.lid.vertices.length; i += 10) {
                        const [x, y, z] = geometry.lid.vertices.slice(i, i + 3);
                        covered([placement.pos[0] + x,
                            placement.pos[1] + (prize.id === 'chest' ? 0.44 : 0.15) + Math.cos(angle) * y + Math.sin(angle) * z,
                            placement.pos[2] + (prize.id === 'chest' ? -0.35 : -0.33) - Math.sin(angle) * y + Math.cos(angle) * z]);
                    }
                }
                if (prize.id === 'arch') assert(solids.every(s => core.rockDistance(
                    [placement.pos[0], placement.pos[1] + 0.6, placement.pos[2]], s, 0.2) >= 1), 'Arch passage was filled');
            }
        }
        const g = make(), r = Object.create(ZQRenderer.Renderer.prototype);
        Object.assign(r, { theme: g.theme, lost: false, gl: null, updateCamera() {}, draw2D() {} });
        for (const level of ['high', 'balanced', 'battery']) {
            g.state.equippedPrizes = ['chest', 'oyster', 'arch'];
            r.level = level; r.render(g.state, 0, 0.1);
            equal(r.prizes, core.prizePositions(g.state.bounds, ['chest', 'oyster', 'arch']));
        }
    });
    test('Crabs and full eel bodies clear each prize and continue past it rather than stopping against it', () => {
        for (const theme of Object.keys(core.THEMES)) for (const prize of core.PRIZES) for (const kind of ['crab', 'eel']) {
            const g = make(theme), c = spawn(g, kind);
            const placement = core.prizePositions(g.state.bounds, [prize.id])[0];
            const obstacles = core.createPrizeObstacles(g.state.bounds, [prize.id]);
            g.habitat = { rocks: [], stems: [], prizeObstacles: obstacles, obstacles,
                ceiling: Math.max(...obstacles.map(o => o.pos[1] + o.radius[1])) };
            c.pos = [placement.pos[0] - 4.5, g.state.bounds.floor + (kind === 'crab' ? 0.42 : 0.85), placement.pos[2]];
            c.yaw = 0; c.entered = true;
            const size = g.theme.visitors[c.index].size, padding = core.creaturePadding(kind, size);
            for (let i = 0; i < 300 && c.pos[0] < placement.pos[0] + 4; i++) {
                g.navigateCreature(c, [1, 0, 0], 0.1);
                const points = kind === 'crab' ? [c.pos] : Array.from({ length: 8 }, (_, n) => {
                    const offset = (1.05 - n * 3.15 / 7) * size * 0.55;
                    return [c.pos[0] + Math.cos(c.yaw) * offset, c.pos[1], c.pos[2] - Math.sin(c.yaw) * offset];
                });
                assert(points.every(p => obstacles.every(o => core.rockDistance(p, o, padding) >= 0.99)),
                    `${theme} ${kind}: entered ${prize.id}`);
                if (kind === 'crab') near(c.pos[1], g.state.bounds.floor + 0.42);
            }
            assert(c.pos[0] > placement.pos[0] + 3.9, `${theme} ${kind}: blocked by ${prize.id}`);
        }
    });
    test('Placed prizes remain solid during real creature entrances, attacks and retreats in every theme', () => {
        for (const theme of Object.keys(core.THEMES)) for (const visitor of core.THEMES[theme].visitors) {
            const g = make(theme);
            g.state.equippedPrizes = ['chest', 'oyster', 'lantern'];
            for (const id of g.state.equippedPrizes) g.state.prizes[id] = '2026-01-01';
            g.refreshPrizeObstacles();
            const c = spawn(g, visitor.kind);
            g.state.fish.forEach(f => { f.pos = [0, g.state.bounds.floor + 1, 0.2]; });
            const size = visitor.size, padding = core.creaturePadding(c.kind, size);
            for (let i = 0; i < 700 && g.state.creature === c; i++) {
                if (i === 300) { assert(c.entered, `${theme} ${c.kind}: blocked at entrance`); g.repelChallenge(c); }
                g.updateCreature(0.1);
                const points = c.kind === 'eel' ? Array.from({ length: 8 }, (_, n) => {
                    const offset = (1.05 - n * 3.15 / 7) * size * 0.55;
                    return [c.pos[0] + Math.cos(c.yaw) * offset, c.pos[1], c.pos[2] - Math.sin(c.yaw) * offset];
                }) : [c.pos];
                assert(points.every(p => g.habitat.prizeObstacles.every(o => core.rockDistance(p, o, padding) >= 0.99)),
                    `${theme} ${c.kind}: clipped a placed prize`);
            }
            assert(g.state.creature !== c, `${theme} ${c.kind}: prize blocked retreat`);
        }
    });
    test('Prize placement, removal, automatic unlocks and loaded overlaps immediately update solid habitat', () => {
        for (const kind of ['crab', 'eel', 'octopus', 'jellyfish']) for (const width of [3.4, 6.8]) {
            const g = make('tropical');
            g.state.prizes.chest = '2026-01-01';
            g.state.bounds.width = width;
            g.habitat = core.createHabitat('tropical', g.state.bounds);
            const c = spawn(g, kind);
            const placement = core.prizePositions(g.state.bounds, ['chest'])[0];
            c.pos = [placement.pos[0], g.state.bounds.floor + (kind === 'crab' ? 0.42 : 0.85), placement.pos[2]];
            c.yaw = 0; c.entered = true;
            const f = g.state.fish[0]; f.pos = [placement.pos[0], g.state.bounds.floor + 0.8, placement.pos[2]];
            assert(g.equipPrize('chest').ok);
            const padding = core.creaturePadding(kind, g.theme.visitors[c.index].size);
            const clear = game => {
                const visitor = game.state.creature, size = game.theme.visitors[visitor.index].size;
                const points = kind === 'eel' ? Array.from({ length: 8 }, (_, i) => {
                    const offset = (1.05 - i * 3.15 / 7) * size * 0.55;
                    return [visitor.pos[0] + Math.cos(visitor.yaw) * offset, visitor.pos[1], visitor.pos[2] - Math.sin(visitor.yaw) * offset];
                }) : [visitor.pos];
                assert(points.every(p => game.habitat.prizeObstacles.every(o => core.rockDistance(p, o, padding) >= 0.99)), `${kind}: placement/load left an overlap`);
            };
            clear(g);
            assert(g.habitat.prizeObstacles.every(o => core.rockDistance(f.pos, o, core.fishScale(f) * 0.8) >= 1));
            const saved = core.validateSave(envelope(g));
            saved.session.creature.pos = [placement.pos[0], g.state.bounds.floor + (kind === 'crab' ? 0.42 : 0.85), placement.pos[2]];
            const resumed = new core.Game('tropical', saved.profile, { snapshot: saved.session });
            clear(resumed);
            assert(g.equipPrize('chest').ok); equal(g.habitat.prizeObstacles, []);
            assert(g.habitat.obstacles.every(o => !o.prizeId));
            delete g.state.prizes.chest; g.state.score = 1000;
            g.checkPrizes();
            assert(g.state.equippedPrizes.includes('chest'));
            assert(g.habitat.obstacles.some(o => o.prizeId === 'chest'));
        }
    });

    test('Lifetime rewards do not unlock prizes in a new round; round progress does', () => {
        const profile = established();
        profile.highScore = 100000;
        for (const stat of ['born', 'crabsRepelled', 'eelsRepelled']) profile.stats[stat] = 50;
        for (const prize of core.PRIZES) profile.prizes[prize.id] = '2026-01-01';
        profile.equippedPrizes = ['chest', 'oyster', 'arch'];
        const g = make('ink', profile);
        g.checkPrizes();
        equal(g.state.prizes, {}); equal(g.state.equippedPrizes, []);
        equal(g.habitat.prizeObstacles, []);
        g.state.stats.born = 1; g.checkPrizes();
        equal(Object.keys(g.state.prizes), ['oyster']);
        const next = make('deep', profile);
        next.checkPrizes(); equal(next.state.prizes, {});
        equal(profile.highScore, 100000); equal(profile.stats.born, 50);
    });
    test('Current saves retain round collections and species-specific Ink residents', () => {
        for (const theme of Object.keys(core.THEMES)) {
            const g = make(theme), old = envelope(g);
            g.state.score = 1000; g.state.stats.born = 1; g.checkPrizes();
            g.equipPrize('chest'); g.equipPrize('oyster');
            Object.assign(old, envelope(g));
            if (theme === 'ink') {
                for (let i = 2; i < 4; i++) g.addFish(i);
                old.session.fish = g.snapshot().fish;
                old.session.nextId = g.state.nextId;
                old.session.fish.forEach(f => {
                    const traits = core.THEMES.ink.fish[f.type].traits;
                    f.traits = Object.fromEntries(traits.map((t, i) => [t, 0.8 + i * 0.4]));
                    f.hunger = 72; f.health = 87; f.growth = 0.73;
                });
            }
            const before = JSON.stringify(old), saved = core.validateSave(old);
            equal(saved.version, core.VERSION);
            equal(saved.session.prizes, old.session.prizes);
            equal(saved.session.equippedPrizes, old.session.equippedPrizes);
            const refreshed = new core.Game(theme, saved.profile, { snapshot: saved.session });
            for (const id of saved.session.equippedPrizes)
                assert(refreshed.prizeMoveCandidate(id, core.prizePositions(refreshed.state.bounds, [id], saved.session.prizePositions)[0].pos).ok);
            equal(JSON.stringify(old), before);
            saved.session.fish.forEach((f, i) => {
                const original = old.session.fish[i], { traits, ...rest } = f;
                const { traits: oldTraits, ...oldRest } = original;
                equal(rest, oldRest);
                equal(Object.keys(traits), core.THEMES[theme].fish[f.type].traits);
                if (theme === 'ink') equal(Object.values(traits), Object.values(oldTraits));
            });
            const resumed = new core.Game(theme, saved.profile, { snapshot: saved.session });
            equal(resumed.state.prizes, old.session.prizes);
            const fresh = make(theme, saved.profile);
            fresh.checkPrizes(); equal(fresh.state.prizes, {});
        }
        const bad = envelope(make('ink'));
        bad.session.fish[0].traits = { social: NaN, lazy: 1 };
        throws(() => core.validateSave(bad));
    });
    test('Targeted feeding drops at the chosen water position; normal feeding stays at the surface', () => {
        const g = make(), b = g.state.bounds, point = [3.1, -1.1, -1.3];
        const score = g.state.score;
        assert(g.feed(point).ok);
        equal(g.state.score, score - core.CONFIG.feedCost);
        assert(g.state.food.length > 0);
        for (const item of g.state.food) {
            assert(Math.abs(item.pos[0] - point[0]) <= 0.4);
            assert(Math.abs(item.pos[2] - point[2]) <= 0.35);
            assert(Math.abs(item.pos[1] - point[1]) <= 0.12);
        }
        const after = g.state.score, food = JSON.stringify(g.state.food);
        for (const invalid of [[NaN, 0, 0], [1, 2], 'center', [Infinity, 0, 0], [100, 0, 0], [0, 0, 100]]) assert(!g.feed(invalid).ok);
        equal(g.state.score, after); equal(JSON.stringify(g.state.food), food);
        g.state.food = []; assert(g.feed().ok);
        assert(g.state.food.every(f => f.pos[1] >= b.surface - 0.5 && f.pos[1] <= b.surface - 0.25));
    });
    test('Moved prizes save their floor positions, reject blocked sand, and update creature and fish clearance immediately', () => {
        for (const theme of Object.keys(core.THEMES)) for (const prize of core.PRIZES) {
            const g = make(theme), b = g.state.bounds;
            g.state.prizes[prize.id] = '2026-01-01';
            assert(g.equipPrize(prize.id).ok);
            const original = [...g.state.prizePositions[prize.id]], obstacles = JSON.stringify(g.habitat.prizeObstacles);
            assert(!g.movePrize(prize.id, [100, b.floor, 0]).ok);
            const rock = g.habitat.rocks[0];
            assert(!g.movePrize(prize.id, rock.pos).ok);
            equal(g.state.prizePositions[prize.id], original); equal(JSON.stringify(g.habitat.prizeObstacles), obstacles);
            let target = null;
            for (let z = -b.depth; z < b.depth && !target; z += 0.5) for (let x = -b.width + 1; x < b.width - 1; x += 0.5) {
                const result = g.prizeMoveCandidate(prize.id, [x, b.floor, z]);
                if (result.ok && Math.hypot(x - original[0], z - original[2]) > 1.5) { target = result.pos; break; }
            }
            assert(target, `${theme} ${prize.id} has no free spot`);
            const c = spawn(g, 'crab');
            c.pos = [target[0], b.floor + 0.42, target[2]]; c.entered = true;
            g.state.fish[0].pos = [target[0], b.floor + 0.7, target[2]];
            assert(g.movePrize(prize.id, target).ok);
            equal(g.state.prizePositions[prize.id], target);
            const solids = core.createPrizeObstacles(b, [prize.id], { [prize.id]: target });
            equal(g.habitat.prizeObstacles, solids);
            const padding = core.creaturePadding('crab', g.theme.visitors[c.index].size);
            assert(solids.every(s => core.rockDistance(c.pos, s, padding) >= 0.99));
            assert(solids.every(s => core.rockDistance(g.state.fish[0].pos, s, core.fishScale(g.state.fish[0]) * 0.8) >= 0.99));
            const saved = core.validateSave(envelope(g)), resumed = new core.Game(theme, saved.profile, { snapshot: saved.session });
            equal(resumed.state.prizePositions, g.state.prizePositions);
            equal(resumed.habitat.prizeObstacles, solids);
            assert(g.equipPrize(prize.id).ok); assert(!g.movePrize(prize.id, target).ok);
            assert(g.equipPrize(prize.id).ok); equal(g.state.prizePositions[prize.id], target);
        }
    });
    test('Prize position validation rejects nonfinite, floating, out-of-bounds, and overlapping placements', () => {
        const g = make(); g.state.stats.born = 1; g.checkPrizes();
        const id = 'oyster', b = g.state.bounds;
        for (const pos of [[0, 0, 0], [100, b.floor + 0.08, 0], [NaN, b.floor + 0.08, 0],
            [g.habitat.rocks[0].pos[0], b.floor + 0.08, g.habitat.rocks[0].pos[2]]]) {
            const bad = envelope(g); bad.session.prizePositions[id] = pos;
            throws(() => core.validateSave(bad));
        }
        const bad = envelope(g); bad.session.prizePositions.unknown = [0, b.floor, 0];
        throws(() => core.validateSave(bad));
    });
    test('Sand ray picking round-trips at every camera angle and Ink catalog previews have distinct silhouettes', () => {
        if (typeof ZQRenderer === 'undefined') return;
        const { multiply, perspective, lookAt } = ZQRenderer;
        const r = Object.create(ZQRenderer.Renderer.prototype), g = make('ink');
        Object.assign(r, { width: 1200, height: 800 });
        for (const eye of [[0, 1, 13], [8, 6, 9], [-8, 3, 9]]) {
            r.vp = multiply(perspective(1.5), lookAt(eye, [0, 0, 0]));
            const point = [1.2, g.state.bounds.floor, -0.5], p = r.project(point);
            const actual = r.sandPoint(p.x, p.y, point[1]);
            actual.forEach((n, i) => near(n, point[i], 0.0001));
        }
        r.vp = null; equal(r.sandPoint(600, 400, -3), null);
        equal(g.theme.fish.map(f => f.id), ['ink-betta', 'ink-zebra', 'ink-killifish', 'ink-glass']);
        const previews = g.theme.fish.map(ZQRenderer.fishPreview);
        equal(new Set(previews).size, 4);
        for (const [i, preview] of previews.entries()) {
            assert(preview.includes(`data-species="${g.theme.fish[i].id}"`));
            assert(!preview.includes('<use')); assert(preview.length < 5000);
            assert(ZQRenderer.fishGeometry(g.theme.fish[i]).vertices.every(Number.isFinite));
        }
        near(ZQRenderer.prizeOpening('oyster', Math.PI / 0.32 * 1.5, 0, false), 0);
        near(ZQRenderer.prizeOpening('oyster', 2, 0, true), 0);
        assert(ZQRenderer.prizeOpening('oyster', 0, 6, true) > 0.42);
        assert(ZQRenderer.prizeGeometry(g.theme, 'oyster').pearl);
    });

    test('Placement previews remain separate from saved solids and do not become pickable prizes', () => {
        if (typeof ZQRenderer === 'undefined') return;
        const g = make(), r = Object.create(ZQRenderer.Renderer.prototype);
        g.state.prizes.chest = '2026-01-01'; g.equipPrize('chest');
        const before = JSON.stringify(g.snapshot()), original = g.state.prizePositions.chest;
        Object.assign(r, { theme: g.theme, lost: false, gl: null, updateCamera() {}, draw2D() {},
            project: pos => ({ x: pos[0] * 100, y: pos[2] * 100, visible: true, scale: 1 }),
            prizePreview: { id: 'chest', pos: [5, original[1], -2] } });
        r.render(g.state, 0);
        equal(r.prizes.length, 2);
        equal(r.prizes[0].pos, original);
        assert(r.prizes[1].preview);
        const noFish = { ...g.state, fish: [] };
        equal(r.pick(noFish, 500, -200), null);
        equal(JSON.stringify(g.snapshot()), before);
        r.prizePreview = null; r.render(g.state, 0);
        equal(r.prizes.length, 1);
    });
    test('Both prize renderers omit the pearl when closed and reveal it only after an adequate opening', () => {
        if (typeof ZQRenderer === 'undefined') return;
        const g = make(), r = Object.create(ZQRenderer.Renderer.prototype), draws = [];
        g.state.fish = []; g.state.dead = []; g.state.food = [];
        const gl = new Proxy({}, { get: (_, key) => /^[A-Z_]+$/.test(key) ? 0 : () => {} });
        const program = { program: {}, uniform: key => key };
        Object.assign(r, { gl, theme: g.theme, reduced: true, width: 1200, height: 800, ratio: 1,
            canvas: { width: 1200, height: 800 }, main: program, background: program, particles: program,
            palette: { water: [0, 0, 0], surface: [0, 0, 0], light: [1, 1, 1] },
            prizes: core.prizePositions(g.state.bounds, ['oyster']),
            prizeMeshes: { oyster: { base: 'shell', lid: 'lid', pearl: 'pearl' } },
            sceneMesh: 'scenery', drawMesh: mesh => draws.push(mesh), attributes() {},
            particleData: () => new Float32Array(0) });
        r.drawGL(g.state, 5);
        assert(!draws.includes('pearl')); assert(draws.includes('lid'));
        draws.length = 0; g.state.prizeEffects.oyster = 6; r.drawGL(g.state, 5);
        assert(draws.includes('pearl'));
        const arcs = [];
        const ctx = new Proxy({}, {
            get: (target, key) => key in target ? target[key] : key.includes('Gradient') ? () => ({ addColorStop() {} })
                : key === 'arc' ? (...args) => arcs.push({ radius: args[2], fill: target.fillStyle }) : () => {},
            set: (target, key, value) => { target[key] = value; return true; }
        });
        Object.assign(r, { gl: null, ctx, camera: { yaw: 0 },
            decor: { rocks: [], plants: [], sceneryRocks: [], sceneryPlants: [] },
            floorPolygon: () => [{ x: 0, y: 400 }, { x: 1200, y: 400 }, { x: 1200, y: 800 }],
            project: () => ({ x: 600, y: 400, scale: 40, visible: true, depth: 10 }) });
        g.state.prizeEffects.oyster = 0; r.draw2D(g.state, 5);
        assert(!arcs.some(a => a.radius === 0.13 && a.fill === ZQRenderer.PARAMS.pearl));
        arcs.length = 0; g.state.prizeEffects.oyster = 6; r.draw2D(g.state, 5);
        assert(arcs.some(a => a.radius === 0.13 && a.fill === ZQRenderer.PARAMS.pearl));
    });

    test('Ink contact covers all three visible blobs and fish bodies, including the fading footprint', () => {
        for (const age of [0.1, 2, 7, 9.5]) for (let index = 0; index < 3; index++) {
            const g = make(), f = g.state.fish[0];
            g.state.fish = [f];
            const attack = { kind: 'ink', age, life: core.CONFIG.inkLife, pos: [0, 1, 0], nodes: [], hitIds: [], lostBefore: 0 };
            const blobs = core.inkBlobs(attack), blob = blobs[index];
            f.pos = [...blob.pos]; g.state.attacks = [attack];
            g.updateAttacks(0);
            equal(g.state.fish.length, 0); equal(g.state.stats.lost, 1);
            equal(g.profile.stats.lost, 1); equal(g.state.score, 85);
            g.updateAttacks(0); equal(g.state.stats.lost, 1);
            const outside = g.addFish(0, false, [4, 1, 0]);
            outside.pos = [4, 1, 0];
            g.updateAttacks(0);
            assert(g.state.fish.includes(outside), 'Ink killed a fish outside its visible footprint');
        }
        const g = make(), f = g.state.fish[0];
        const attack = { kind: 'ink', age: 5, life: 10, pos: [0, 1, 0], nodes: [], hitIds: [], lostBefore: 0 };
        const blobs = core.inkBlobs(attack), edge = blobs.reduce((a, b) => a.pos[0] + a.radius[0] > b.pos[0] + b.radius[0] ? a : b);
        f.pos = [edge.pos[0] + edge.radius[0] + core.fishScale(f) * 0.4, edge.pos[1], edge.pos[2]];
        assert(blobs.every(blob => core.rockDistance(f.pos, blob) > 1), 'Fixture placed the fish center inside the ink');
        g.state.fish = [f]; g.state.attacks = [attack]; g.updateAttacks(0);
        equal(g.state.stats.lost, 1);
        const late = g.addFish(0, false, [0, 1, 0]); attack.age = 9.99;
        g.updateAttacks(0.02);
        assert(g.state.fish.includes(late), 'An expired cloud killed a fish');
        equal(g.state.attacks, []);
        equal(g.state.stats.attacksSurvived, 0, 'Contact death still earned a survivor bonus');
        equal(core.inkBlobs({ ...attack, age: 10 }), []);
        assert(core.inkBlobs({ ...attack, age: 9.5 })[0].radius[0] < core.inkBlobs({ ...attack, age: 7 })[0].radius[0]);
    });
    test('Contact with visible stingers kills even when the source is obscured, but not across depths or after expiry', () => {
        const g = make(), f = g.state.fish[0];
        g.state.fish = [f];
        const attack = { kind: 'stingers', pos: [-3, 0, 0], nodes: [[0, 0, 0]], age: 0, life: 15, hitIds: [], lostBefore: 0 };
        g.habitat.rocks = [{ pos: [-1.5, 0.2, 0], radius: [0.8, 0.7, 0.8] }];
        f.pos = [0, 0.5, 0];
        assert(g.sheltered(attack.pos, f.pos));
        g.state.attacks = [attack]; g.updateAttacks(0);
        equal(g.state.stats.lost, 1); equal(g.state.score, 85);
        const farDepth = g.addFish(0, false, [0, 0.5, 1.5]);
        g.updateAttacks(0); assert(g.state.fish.includes(farDepth));
        const expired = g.addFish(0, false, [0, 0.5, 0]);
        attack.age = 14.99; g.updateAttacks(0.02);
        assert(g.state.fish.includes(expired)); equal(g.state.attacks.length, 0);
        equal(g.state.stats.attacksSurvived, 0);
    });
    test('Crab reach kills nearby fish throughout active movement, honors cooldown, and leaves swimmers above or behind rocks safe', () => {
        for (const theme of Object.keys(core.THEMES)) {
            const g = make(theme), c = spawn(g, 'crab'), f = g.state.fish[0];
            c.pos = [0, g.state.bounds.floor + 0.42, 2]; c.entered = true; c.phaseTimer = 5;
            g.state.fish = [f]; f.pos = [0.4, c.pos[1] + 0.25, 2];
            g.updateCreature(1 / 60);
            equal(g.state.stats.lost, 1); equal(c.eaten, 1); near(c.cooldown, 8);
            const second = g.addFish(0, false, [...c.pos]);
            g.updateCreature(1 / 60); assert(g.state.fish.includes(second));
            equal(c.eaten, 1);
            c.cooldown = 0; c.phase = 'stalk'; c.phaseTimer = 5;
            g.updateCreature(1 / 60); assert(!g.state.fish.includes(second));
            equal(c.eaten, 2);
            const above = g.addFish(0, false, [c.pos[0], c.pos[1] + 2, c.pos[2]]);
            c.cooldown = 0; c.phase = 'stalk'; c.phaseTimer = 5;
            g.updateCreature(1 / 60); assert(g.state.fish.includes(above));
            const protectedFish = g.addFish(0, false, [c.pos[0] + 0.8, c.pos[1], c.pos[2]]);
            g.habitat.rocks = [{ pos: [c.pos[0] + 0.4, c.pos[1], c.pos[2]], radius: [0.2, 0.5, 0.4] }];
            assert(g.sheltered(c.pos, protectedFish.pos));
            g.catchResident(c); assert(g.state.fish.includes(protectedFish));
            g.repelChallenge(c); protectedFish.pos = [...c.pos];
            g.updateCreature(1 / 60); assert(g.state.fish.includes(protectedFish));
        }
    });
    test('Ordinary visitors harm residents through their distinct hazards, not generic body contact', () => {
        for (const kind of ['jellyfish', 'squid', 'octopus']) {
            const g = make('koi'), c = spawn(g, kind), f = g.state.fish[0];
            c.pos = [0, 1, 0]; c.entered = true; c.phaseTimer = 5; f.pos = [...c.pos];
            g.state.fish = [f];
            g.updateCreature(1 / 60);
            equal(g.state.stats.lost, 0); equal(c.eaten, 0);
            g.catchResident(c); assert(g.state.fish.includes(f));
            g.releaseCreatureAttack(c);
            f.pos = kind === 'jellyfish' ? [...g.state.attacks[0].nodes[0]] : [...c.pos];
            g.updateAttacks(0.1);
            equal(g.state.stats.lost, 1);
        }
    });
    test('A freely swimming population can lose fish to each unattended contact creature across themes', () => {
        for (const kind of ['jellyfish', 'squid', 'octopus', 'crab']) {
            let totalLost = 0;
            for (const theme of Object.keys(core.THEMES)) {
                if (!core.THEMES[theme].visitors.some(v => v.kind === kind)) continue;
                const g = make(theme); spawn(g, kind);
                while (g.state.fish.length < 12) g.addFish(g.state.fish.length % 4);
                for (let i = 0; i < 1200 && !g.state.ended; i++) {
                    g.state.fish.forEach(f => { f.hunger = 100; f.health = 100; });
                    g.state.dirt = 0; g.state.damage = 0; g.state.score = 300;
                    if (g.state.milestone) g.continueMilestone();
                    g.update(0.1); g.drainEvents();
                }
                totalLost += g.state.stats.lost;
            }
            assert(totalLost > 0, `${kind}: naturally swimming residents never suffered a loss`);
        }
    });

    test('Births return sooner in sparse tanks, retain a shared respite, and taper near capacity', () => {
        const g = make();
        for (let type = 0; type < 4; type++) while (g.state.fish.filter(f => f.type === type).length < 2) g.addFish(type);
        g.state.fish.forEach(f => { f.hunger = 100; f.health = 100; });
        breedingPair(g);
        assert(g.state.reproduction.every(n => n >= 25 && n <= 45));
        g.state.reproduction.fill(0); g.random = () => 0;
        g.reproduce(0.1); equal(g.state.stats.born, 0);
        for (let i = 0; i < 41; i++) g.reproduce(0.1);
        equal(g.state.stats.born, 1);
        assert(g.state.reproduction.every(n => n >= 25));
        for (let i = 0; i < 349; i++) g.reproduce(0.1);
        equal(g.state.stats.born, 1);
        const saved = core.validateSave(envelope(g));
        equal(saved.session.reproduction, g.state.reproduction);
        const next = make();
        while (next.state.fish.length < next.state.maxFish - 1) next.addFish(0);
        next.state.fish.forEach(f => f.hunger = 100);
        breedingPair(next);
        next.state.reproduction.fill(0);
        next.random = () => core.CONFIG.birthChancePerSecond * 0.25;
        next.reproduce(1);
        equal(next.state.stats.born, 0, 'A nearly full tank ignored density-dependent reproduction');
    });
    test('Manual food portions cover hungry residents for one charge and fullness lasts at least fifty seconds', () => {
        const g = make();
        while (g.state.fish.length < g.state.maxFish) g.addFish(0);
        g.state.fish.forEach(f => f.hunger = 40);
        const score = g.state.score;
        assert(g.feed().ok);
        assert(g.state.food.length >= g.state.fish.length);
        equal(g.state.score, score - core.CONFIG.feedCost);
        const f = g.state.fish[0]; f.hunger = 100;
        for (let i = 0; i < 500; i++) g.updateFish(f, 0.1);
        assert(f.hunger >= 69.99, 'Feeding still demands attention every few seconds');
    });
    test('Glass taps wake every visitor without defending it, resetting a live warning, or changing the kill cooldown', () => {
        for (const kind of ['crab', 'eel', 'jellyfish', 'squid', 'octopus']) {
            const g = make('koi'), c = spawn(g, kind);
            c.entered = true; c.phase = 'recover'; c.phaseTimer = 6; c.cooldown = 4;
            assert(g.tap([0, 0, 0]).ok);
            equal(c.phase, 'stalk'); near(c.phaseTimer, 1.2); near(c.cooldown, 4);
            assert(c.provoked && !c.defended); equal(c.defenseStep, 0);
            c.phase = 'windup'; c.phaseTimer = 1;
            c.targetPoint = [...g.state.fish[0].pos];
            assert(g.tapCreature().ok);
            equal(c.phase, 'windup'); near(c.phaseTimer, 1);
            core.validateSave(envelope(g));
        }
    });
    test('Entered visitors keep cycling at the tank edge, and coiled eels keep pursuing during recovery', () => {
        const g = make(), c = spawn(g, 'eel');
        c.pos = [g.state.bounds.width - 0.5, 0, 0]; c.entered = true;
        c.phase = 'recover'; c.phaseTimer = 0.01;
        g.state.fish.forEach(f => f.pos = [0, 1, 0]);
        g.updateCreature(0.1); equal(c.phase, 'stalk');
        c.phase = 'recover'; c.phaseTimer = 5;
        const start = [...c.pos];
        g.updateCreature(0.1);
        assert(core.distance(start, c.pos) > 0.01, 'Recovery made the eel lie still');
        c.phase = 'dash'; c.phaseTimer = 1; c.targetId = g.state.fish[0].id;
        c.targetPoint = [...g.state.fish[0].pos];
        g.releaseCreatureAttack(c); g.updateCreature(0.1);
        equal(g.state.attacks[0].pos, c.pos, 'The electric pulse was left behind during the lunge');
    });
    test('Unattended crabs and eels cause losses in every habitat across moving, cared-for populations', () => {
        for (const theme of Object.keys(core.THEMES)) for (const kind of ['crab', 'eel']) {
            let losses = 0;
            for (const seed of [12345, 42, 7319]) {
                const g = new core.Game(theme, established(), { seed, width: 1200, height: 800 });
                while (g.state.fish.length < 12) g.addFish(g.state.fish.length % 4);
                const c = spawn(g, kind);
                let still = 0;
                for (let i = 0; i < 1800 && !g.state.ended; i++) {
                    g.state.fish.forEach(f => f.hunger = 90);
                    g.state.dirt = 0; g.state.damage = 0;
                    const before = [...c.pos];
                    g.update(0.1);
                    if (g.state.milestone) g.continueMilestone();
                    g.drainEvents();
                    still = c.entered && c.phase !== 'windup' && core.distance(before, c.pos) < 0.001 ? still + 0.1 : 0;
                    if (kind === 'eel' && g.state.fish.length) assert(still < 15, `${theme}: eel became permanently stranded`);
                }
                losses += g.state.stats.lost;
            }
            assert(losses > 0, `${theme} ${kind}: ignored visitor never hurt moving fish`);
        }
    });

    test('Crabs leap off the sand to grab elevated residents, while warned or defended crabs cannot kill', () => {
        const g = make(), c = spawn(g, 'crab'), f = g.state.fish[0];
        g.state.fish = [f];
        c.pos = [0, g.state.bounds.floor + 0.42, g.state.bounds.depth]; c.entered = true;
        f.pos = [0.2, c.pos[1] + 1.6, c.pos[2]]; f.vel = [0, 0, 0];
        c.phase = 'windup'; c.phaseTimer = 1; c.targetPoint = [...f.pos]; c.targetId = f.id;
        g.updateCreature(0.1); equal(g.state.stats.lost, 0);
        c.phase = 'dash'; c.phaseTimer = core.CONFIG.crabDash / 2;
        g.updateCreature(0.01);
        assert(c.pos[1] > g.state.bounds.floor + 1.8, 'Crab never left the floor');
        equal(g.state.stats.lost, 1); near(c.cooldown, 8);
        const replacement = g.addFish(0, false, [...c.pos]);
        g.repelChallenge(c); c.cooldown = 0; g.catchResident(c);
        assert(g.state.fish.includes(replacement));
    });
    test('Every loss rolls upside down, rises, then dissolves over four active seconds', () => {
        for (const cause of ['predator', 'attack', 'starvation', 'health']) {
            const g = make(), f = g.state.fish[0], y = f.pos[1];
            g.state.spawnTimer = 60; g.kill(f, cause);
            const dead = g.state.dead[0];
            near(core.deathPose(dead).roll, 0); near(core.deathPose(dead).alpha, 1);
            steps(g, 1);
            near(core.deathPose(dead).roll, Math.PI); near(core.deathPose(dead).alpha, 1);
            assert(dead.pos[1] > y + 0.5);
            steps(g, 2.5); assert(core.deathPose(dead).alpha < 0.35);
            core.validateSave(envelope(g));
            steps(g, 0.6); equal(g.state.dead.length, 0);
        }
    });
    test('The electric field grows in three dimensions and kills only fish whose bodies cross it', () => {
        const g = make(), c = spawn(g, 'eel');
        c.pos = [0, 0, 0]; g.state.fish = [];
        const inside = g.addFish(0, false, [0, 0, 1.8]);
        const outside = g.addFish(0, false, [0, 0, 2.8]);
        g.releaseCreatureAttack(c);
        g.updateAttacks(0.01); assert(g.state.fish.includes(inside));
        g.updateAttacks(0.3); assert(!g.state.fish.includes(inside)); assert(g.state.fish.includes(outside));
        const a = g.state.attacks[0];
        near(core.electricRadius(a), core.CONFIG.shockRadius);
        const resumed = new core.Game('tropical', g.profile, { snapshot: g.snapshot() });
        resumed.resume(); resumed.state.fish[0].pos = [0, 0, 0];
        resumed.updateAttacks(0.01); equal(resumed.state.fish.length, 0);
    });
    test('Sparse populations breed earlier without restoring explosive near-capacity growth', () => {
        const g = make(); breedingPair(g);
        g.state.fish.forEach(f => f.hunger = 100);
        g.state.reproduction.fill(0); g.random = () => 0.01;
        g.reproduce(1); equal(g.state.stats.born, 0);
        for (let i = 0; i < 41; i++) g.reproduce(0.1);
        equal(g.state.stats.born, 1);
        assert(g.state.reproduction.every(n => n < 90));
        const saved = envelope(g); saved.session.reproduction.fill(180);
        const resumed = new core.Game('tropical', saved.profile, { snapshot: saved.session });
        assert(resumed.state.reproduction.every(n => n < 100), 'Sparse resumed tank retained the old excessive wait');
    });

    test('Both renderers use shared ink footprints and draw departed fish upside down with finite transforms', () => {
        if (typeof ZQRenderer === 'undefined') return;
        const g = make(), r = Object.create(ZQRenderer.Renderer.prototype), matrices = [];
        g.state.fish = []; g.state.dead = []; g.state.food = [];
        const gl = new Proxy({}, { get: (_, key) => /^[A-Z_]+$/.test(key) ? 0 : () => {} });
        const program = { program: {}, uniform: key => key };
        Object.assign(r, { gl, theme: g.theme, reduced: true, width: 1200, height: 800, ratio: 1,
            canvas: { width: 1200, height: 800 }, main: program, background: program, particles: program,
            palette: { water: [0, 0, 0], surface: [0, 0, 0], light: [1, 1, 1] },
            prizes: [], sceneMesh: 'scenery', cloudMesh: 'cloud',
            drawMesh: (mesh, matrix) => { if (mesh === 'cloud') matrices.push(matrix); },
            attributes() {}, particleData: () => new Float32Array(0) });
        const ellipses = [], scales = [], rotations = [];
        const ctx = new Proxy({}, {
            get: (target, key) => key in target ? target[key] : key.includes('Gradient') ? () => ({ addColorStop() {} })
                : key === 'ellipse' ? (...args) => ellipses.push(args)
                : key === 'scale' ? (...args) => scales.push(args)
                : key === 'rotate' ? value => rotations.push(value) : () => {},
            set: (target, key, value) => { target[key] = value; return true; }
        });
        Object.assign(r, { ctx, camera: { yaw: 0 },
            decor: { rocks: [], plants: [], sceneryRocks: [], sceneryPlants: [] },
            floorPolygon: () => [{ x: 0, y: 400 }, { x: 1200, y: 400 }, { x: 1200, y: 800 }],
            project: pos => ({ x: 600 + pos[0] * 40, y: 400 - pos[1] * 40, scale: 40, visible: true, depth: 10 }) });
        for (const age of [0, 3, 8, 9.75, 10]) {
            const attack = { kind: 'ink', age, life: 10, pos: [1, 1, 1], nodes: [], hitIds: [], lostBefore: 0 };
            const blobs = core.inkBlobs(attack); g.state.attacks = [attack];
            matrices.length = 0; r.drawGL(g.state, 0);
            equal(matrices.length, blobs.length);
            matrices.forEach((matrix, i) => {
                const center = ZQRenderer.transform(matrix, [0, 0, 0]);
                center.slice(0, 3).forEach((n, axis) => near(n, blobs[i].pos[axis], 1e-6));
                const edge = ZQRenderer.transform(matrix, [1, 0, 0]);
                near(edge[0] - center[0], blobs[i].radius[0], 1e-6);
                const top = ZQRenderer.transform(matrix, [0, 0.85, 0]);
                near(top[1] - center[1], blobs[i].radius[1], 1e-6);
            });
            ellipses.length = 0; r.draw2D(g.state, 0);
            equal(ellipses.length, blobs.length);
            ellipses.forEach((ellipse, i) => {
                near(ellipse[0], 600 + blobs[i].pos[0] * 40);
                near(ellipse[1], 400 - blobs[i].pos[1] * 40);
                near(ellipse[2], blobs[i].radius[0] * 40);
                near(ellipse[3], blobs[i].radius[1] * 40);
            });
        }
        g.state.attacks = [];
        g.state.dead = [{ type: 0, pos: [0, 0, 0], yaw: 0, pitch: 0, phase: 0, growth: 1, size: 1, age: 1 }];
        r.fishMeshes = ['departed'];
        let departedMatrix = null;
        r.drawMesh = (mesh, matrix) => { if (mesh === 'departed') departedMatrix = matrix; };
        r.drawGL(g.state, 0);
        assert(departedMatrix);
        const center = ZQRenderer.transform(departedMatrix, [0, 0, 0]);
        const top = ZQRenderer.transform(departedMatrix, [0, 1, 0]);
        assert(top[1] < center[1], 'WebGL departed fish did not roll upside down');
        scales.length = 0; rotations.length = 0;
        r.draw2D(g.state, 0);
        assert(scales.some(([x, y]) => x === 1 && y < -0.99), 'Compatibility renderer omitted upside-down departed fish');
        assert(rotations.length > 0 && rotations.every(Number.isFinite), 'Departed fish rotation became NaN');
    });

    test('Theme identities use distinct planting and a lighter, open Zen garden with delicate residents', () => {
        const expected = {
            koi: ['lily', 'reed'], tropical: ['branch', 'plate', 'boulder', 'fan'],
            deep: ['anemone', 'fan', 'spire'], zen: ['ribbon'], ink: ['ink-leaf']
        };
        for (const [id, forms] of Object.entries(expected))
            equal([...new Set(make(id).habitat.plants.map(p => p.form))], forms);
        const zen = make('zen'), koi = make('koi');
        equal(zen.theme.fish.map(f => f.id), ['zen-medaka', 'zen-cloud', 'zen-danio', 'zen-threadfin']);
        assert(zen.theme.fish.every(f => !koi.theme.fish.some(k => k.id === f.id)));
        assert(zen.theme.fish.reduce((sum, f) => sum + f.size, 0) < koi.theme.fish.reduce((sum, f) => sum + f.size, 0) * 0.75);
        assert(zen.habitat.rocks.every(r => Math.abs(r.pos[0]) > zen.state.bounds.width * 0.15));
        assert(zen.habitat.rocks.filter(r => r.moss).length === 5);
        const luminance = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
            .reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i], 0);
        assert(parseInt(zen.theme.water.slice(5, 7), 16) > parseInt(zen.theme.water.slice(1, 3), 16) * 2);
        assert(luminance(zen.theme.sand) > luminance(zen.theme.water) * 2);
        assert(luminance(zen.theme.sand) > luminance(koi.theme.sand));
        if (typeof ZQRenderer !== 'undefined') equal(new Set(zen.theme.fish.map(ZQRenderer.fishPreview)).size, 4);
    });
    test('Coral, mineral spires, glowing tips, and lily pads fit their shared collision envelopes throughout sway', () => {
        if (typeof ZQRenderer === 'undefined') return;
        for (const id of ['koi', 'tropical', 'deep']) {
            const g = make(id), floor = g.state.bounds.floor;
            for (let i = 0; i < g.habitat.plants.length; i++) {
                const plant = g.habitat.plants[i];
                if (id === 'koi' && plant.form !== 'lily') continue;
                const mesh = new ZQRenderer.Geometry(), base = plant.floor ?? floor;
                ZQRenderer.plantGeometry(mesh, plant, base, g.theme, () => 0.5);
                const solids = plant.form === 'lily'
                    ? g.habitat.stems.filter(s => s.pos[0] === plant.x && s.pos[2] === plant.z)
                    : [g.habitat.stems[i]];
                for (let v = 0; v < mesh.vertices.length; v += 10) {
                    const original = mesh.vertices.slice(v, v + 3), part = mesh.vertices[v + 9];
                    // Lily stalks are flexible; the rooted base and surface pad are solid.
                    if (plant.form === 'lily' && original[1] < base + plant.h - 0.001) continue;
                    if (original[1] < base) continue;
                    for (const time of [0, 2, 11, 50]) {
                        const point = [...original];
                        if (part === 4 || part === 11) {
                            const h = Math.max(0, point[1] + 3.25);
                            point[0] += Math.sin(time * 0.65 + point[0] + h * 1.7) * h * 0.065;
                            point[2] += Math.cos(time * 0.43 + point[0]) * h * 0.035;
                        }
                        assert(solids.some(s => core.rockDistance(point, s) <= 1.001), `${id} ${plant.form} escapes its solid at ${point}`);
                    }
                }
            }
        }
    });
    test('Compatibility rendering retains Zen markings and filaments and all themed plant forms', () => {
        if (typeof ZQRenderer === 'undefined') return;
        const calls = [];
        const ctx = new Proxy({}, {
            get: (target, key) => key in target ? target[key] : key.includes('Gradient') ? (...args) => {
                calls.push([key, ...args]); return { addColorStop() {} };
            }
                : (...args) => calls.push([key, ...args]),
            set: (target, key, value) => { target[key] = value; return true; }
        });
        const r = Object.create(ZQRenderer.Renderer.prototype);
        Object.assign(r, { ctx, width: 1200, height: 800, level: 'balanced', camera: { yaw: 0 }, reduced: false, particleData: () => [],
            floorPolygon: () => [{ x: 0, y: 400 }, { x: 1200, y: 400 }, { x: 1200, y: 800 }],
            project: pos => ({ x: 600 + pos[0] * 40, y: 400 - pos[1] * 40, scale: 40, visible: true, depth: 10 }), prizes: [] });
        for (const theme of Object.keys(core.THEMES)) {
            const g = make(theme);
            for (let i = 2; i < 4; i++) g.addFish(i);
            r.setTheme(g.theme, g.state.bounds);
            const decor = r.decor;
            calls.length = 0; r.draw2D(g.state, 2);
            for (const call of calls) assert(call.slice(1).filter(n => typeof n === 'number').every(Number.isFinite));
            if (theme === 'zen') {
                equal(calls.filter(c => c[0] === 'bezierCurveTo').length, 2);
                assert(calls.filter(c => c[0] === 'arc' && c[3] === 0.024).length === 12, 'Danio spots missing');
                assert(calls.some(c => c[0] === 'lineTo' && c[1] === 0.55), 'Minnow stripe missing');
            }
            if (theme === 'deep') assert(calls.some(c => c[0] === 'createRadialGradient'));
            r.draw2D(g.state, 61);
            assert(r.decor === decor, 'Compatibility drawing rebuilt its cached scenery');
        }
    });
    test('Resuming a changed solid habitat clears full visitor bodies and residents without resetting their care', () => {
        for (const theme of Object.keys(core.THEMES)) for (const kind of ['crab', 'eel', 'jellyfish']) {
            const g = make(theme), c = spawn(g, kind), obstacle = g.habitat.rocks[0];
            c.pos = [...obstacle.pos]; c.entered = true;
            g.state.fish[0].pos = [...obstacle.pos];
            g.state.fish[0].hunger = 73; g.state.fish[0].health = 82;
            const resumed = new core.Game(theme, g.profile, { snapshot: g.snapshot() });
            const visitor = resumed.state.creature, size = g.theme.visitors[c.index].size;
            const padding = core.creaturePadding(kind, size);
            for (let i = 0; i < (kind === 'eel' ? 8 : 1); i++) {
                const offset = kind === 'eel' ? (1.05 - i * 3.15 / 7) * size * 0.55 : 0;
                const point = [visitor.pos[0] + Math.cos(visitor.yaw) * offset, visitor.pos[1], visitor.pos[2] - Math.sin(visitor.yaw) * offset];
                assert(resumed.habitat.obstacles.every(o => core.rockDistance(point, o, padding) >= 1.02), `${theme} ${kind} was not cleared`);
            }
            const f = resumed.state.fish[0];
            assert(resumed.habitat.obstacles.every(o => core.rockDistance(f.pos, o, core.fishScale(f) * 0.8) >= 1.02));
            equal(f.hunger, 73); equal(f.health, 82); equal(resumed.state.stats.lost, g.state.stats.lost);
        }
    });

    test('Organic scenery stays within bounded quality budgets, adds interior planting, and reuses cached meshes', () => {
        if (typeof ZQRenderer === 'undefined') return;
        for (const theme of Object.values(core.THEMES)) for (const level of ['battery', 'balanced', 'high']) {
            const r = Object.create(ZQRenderer.Renderer.prototype);
            let builds = 0;
            Object.assign(r, { width: 1200, height: 800, level, gl: {}, releaseMesh() {},
                mesh: g => {
                    builds++;
                    assert(g.vertices.every(Number.isFinite), `${theme.id} ${level}: invalid geometry`);
                    return { count: g.vertices.length / 10 };
                } });
            const bounds = core.boundsFor(1200, 800);
            r.setTheme(theme, bounds);
            const limit = { battery: 85000, balanced: 105000, high: 125000 }[level];
            assert(r.sceneMesh.count < limit, `${theme.id} ${level}: scenery exceeds ${limit} vertices`);
            const budget = Math.max(ZQRenderer.PARAMS.quality[level].plants, theme.id === 'ink' ? 28 : 0);
            equal(r.decor.plants.length + r.decor.sceneryPlants.length, budget);
            if (theme.id === 'zen' || theme.id === 'ink') {
                const interior = r.decor.sceneryPlants.filter(p => Math.abs(p.x) < bounds.width && Math.abs(p.z) < bounds.depth);
                assert(interior.length >= 8, `${theme.id} ${level}: fuller planting disappears at lower quality`);
                assert(interior.every(p => Math.abs(p.x) > bounds.width * 0.35), 'Soft planting blocked the open center');
            }
            const mesh = r.sceneMesh, decor = r.decor, initial = builds;
            r.setTheme(theme, bounds);
            assert(r.sceneMesh === mesh && r.decor === decor);
            equal(builds, initial);
            equal(r.decor.rocks, core.createHabitat(theme.id, bounds).rocks.flatMap(rock =>
                rock.parts ? rock.parts.map(part => ({ ...part, moss: rock.moss })) : [rock]));
            assert(r.decor.rockContours.every(points => points.length === 20));
            assert(r.decor.sandContours.length === 12);
        }
    });
    test('Real sand hills rise in every world and share their heightfield with navigation and scenery', () => {
        if (typeof ZQRenderer === 'undefined') return;
        const bounds = core.boundsFor(1200, 800);
        for (const theme of Object.values(core.THEMES)) {
            const habitat = core.createHabitat(theme.id, bounds), heights = [];
            for (let x = -bounds.width; x <= bounds.width; x += 0.4) for (let z = -bounds.depth; z <= bounds.depth; z += 0.4) {
                const h = ZQRenderer.groundHeight(theme, bounds, x, z, habitat);
                assert(h >= bounds.floor && h <= bounds.floor + 2);
                heights.push(h);
            }
            assert(Math.max(...heights) - Math.min(...heights) > 0.75, `${theme.id}: floor stayed flat`);
            for (const rock of habitat.rocks)
                assert(rock.pos[1] + rock.radius[1] > ZQRenderer.groundHeight(theme, bounds, rock.pos[0], rock.pos[2], habitat));
            for (const plant of habitat.plants)
                near(ZQRenderer.groundHeight(theme, bounds, plant.x, plant.z, habitat), plant.floor);
            assert(Math.abs(ZQRenderer.groundHeight(theme, bounds, 0, 0, habitat) - bounds.floor) < 0.04);
        }
    });
    test('Eroded rocks are asymmetric within their solid ellipsoids and plant growth varies by specimen', () => {
        if (typeof ZQRenderer === 'undefined') return;
        const mesh = new ZQRenderer.Geometry(), center = [2, -2, -1], radius = [0.9, 0.6, 0.7], lengths = [];
        mesh.sphere(center, radius, [0.5, 0.6, 0.7], 6, 6, 12, 0.2);
        equal(mesh.vertices.length / 10, 6 * 6 * 12);
        for (let i = 0; i < mesh.vertices.length; i += 10) {
            const point = mesh.vertices.slice(i, i + 3);
            const d = Math.sqrt(point.reduce((sum, n, axis) => sum + ((n - center[axis]) / radius[axis]) ** 2, 0));
            assert(d <= 1.001); lengths.push(d);
        }
        assert(Math.max(...lengths) - Math.min(...lengths) > 0.2, 'Rocks remained uniformly scaled ellipsoids');
        const profiles = make('tropical').habitat.plants.map(ZQRenderer.plantProfile);
        assert(Math.max(...profiles.map(p => p.width)) - Math.min(...profiles.map(p => p.width)) > 0.15);
        assert(Math.max(...profiles.map(p => p.height)) - Math.min(...profiles.map(p => p.height)) > 0.1);
        assert(profiles.some(p => p.lean < -0.01) && profiles.some(p => p.lean > 0.01));
    });

    test('Terrain queries match both rendered triangles, stay cached, and form broad bounded slopes', () => {
        const bounds = core.boundsFor(1200, 800);
        for (const theme of Object.keys(core.THEMES)) {
            const t = core.createTerrain(theme, bounds);
            assert(t === core.createTerrain(theme, bounds));
            for (let row = 1; row < t.rows - 2; row += 3) for (let col = 1; col < t.columns - 2; col += 3) {
                const index = row * t.columns + col, a = t.heights[index], b = t.heights[index + t.columns],
                    c = t.heights[index + t.columns + 1], d = t.heights[index + 1];
                for (const [tx, tz] of [[0.2, 0.7], [0.8, 0.3]]) {
                    const expected = tz >= tx ? a * (1 - tz) + b * (tz - tx) + c * tx : a * (1 - tx) + c * tz + d * (tx - tz);
                    near(core.terrainHeight(t, t.minX + (col + tx) * t.step, t.minZ + (row + tz) * t.step), expected);
                }
                assert(Math.abs(a - b) / t.step < 1.5 && Math.abs(a - d) / t.step < 1.5, `${theme}: abrupt terrain wall`);
            }
        }
    });
    test('Food settles on local hills and terrain picking returns the visible raised sand', () => {
        for (const theme of Object.keys(core.THEMES)) {
            const g = make(theme), b = g.state.bounds;
            g.demo = true; g.state.fish = []; g.state.spawnTimer = 999;
            const pos = [-b.width * 0.48, b.surface - 0.5, -1.45];
            g.state.food = [{ pos, age: 0, speed: 0.4, phase: 0 }];
            for (let i = 0; i < 150; i++) {
                g.update(0.1);
                assert(pos[1] >= g.floorAt(pos[0], pos[2]) + 0.1 - 1e-7);
            }
            near(pos[1], g.floorAt(pos[0], pos[2]) + 0.1);
            if (typeof ZQRenderer === 'undefined') continue;
            const r = Object.create(ZQRenderer.Renderer.prototype);
            Object.assign(r, { width: 1200, height: 800, level: 'battery', reduced: true,
                camera: { ...ZQRenderer.PARAMS.camera, zoom: 1, target: [0, 0, 0], follow: null } });
            r.setTheme(g.theme, b); r.updateCamera(g.state, 0.1);
            const point = [-b.width * 0.48, g.floorAt(-b.width * 0.48, -1.45), -1.45], p = r.project(point);
            const hit = r.sandPoint(p.x, p.y, b.floor);
            assert(hit && p.visible);
            near(hit[1], g.floorAt(hit[0], hit[2]), 0.0001);
            for (let axis = 0; axis < 3; axis++) near(hit[axis], point[axis], 0.001);
        }
    });
    test('Small residents can enter hollow formations while larger bodies respect the opening', () => {
        for (const theme of ['tropical', 'deep', 'ink']) {
            const g = make(theme), rock = g.habitat.rocks.find(r => r.hollow);
            assert(rock && rock.parts.length === 3);
            const point = [rock.pos[0], g.floorAt(rock.pos[0], rock.pos[2]) + 1.05, rock.pos[2]];
            assert(rock.parts.every(part => core.rockDistance(point, part, 0.15) > 1.03), `${theme}: small body cannot fit opening`);
            assert(rock.parts.some(part => core.rockDistance(point, part, 0.85) < 1), `${theme}: large body ignores opening`);
            assert(!g.habitat.obstacles.includes(rock), 'An invisible solid filled the opening');
            assert(g.habitat.routes.some(path => path.some(p => Math.abs(p[0] - rock.pos[0]) < 0.01)));
        }
    });
    test('Habitat routes advance through distinct points and pause for urgent food and danger', () => {
        for (const theme of Object.keys(core.THEMES)) {
            const g = make(theme), f = g.state.fish[0];
            g.state.fish = [f]; f.hunger = 100; f.fear = 0;
            f.traits = { ...f.traits, shy: true, curious: false, greedy: false, lazy: false };
            const random = g.random; g.random = () => 0.2; g.chooseIntent(f); g.random = random;
            equal(f.intent, 'investigate'); assert(f.habitatRoute.length === 3);
            assert(core.distance(f.habitatRoute[0], f.habitatRoute[2]) > 0.7, `${theme}: browsing route collapsed`);
            const route = JSON.stringify(f.habitatRoute);
            f.pos = [...f.target]; f.hunger = 40;
            g.state.food = [{ pos: [f.pos[0] + 0.9, f.pos[1], f.pos[2]], age: 0, speed: 0.4, phase: 0 }];
            g.updateFish(f, 0.1); equal(f.activity, 'forage'); equal(f.routeStep, 0); equal(JSON.stringify(f.habitatRoute), route);
            g.state.food = []; f.hunger = 100; f.fear = 1;
            g.updateFish(f, 0.1); equal(f.activity, 'evade'); equal(f.routeStep, 0);
            f.fear = 0;
            for (let step = 0; step < 3; step++) {
                f.pos = [...f.target]; g.updateFish(f, 0.1);
                if (step < 2) equal(f.routeStep, step + 1);
            }
            equal(f.habitatRoute.length, 0); equal(f.visitPhase, 'dwell');
            assert(f.dwellTime > 0);
        }
    });
    test('Unforced swimming completes habitat routes while keeping residents above the actual sand', () => {
        for (const theme of Object.keys(core.THEMES)) {
            const g = new core.Game(theme, core.createProfile(), { demo: true, seed: 71437, width: 1200, height: 800 });
            let completed = 0, traversed = 0;
            for (let frame = 0; frame < 5400; frame++) {
                const before = g.state.fish.map(f => ({ id: f.id, steps: f.habitatRoute.length, step: f.routeStep }));
                g.update(1 / 30);
                for (const f of g.state.fish) {
                    const previous = before.find(p => p.id === f.id);
                    assert(f.pos[1] >= g.bottomClearance(f.pos, core.fishScale(f) * 0.8) - 1e-6, `${theme}: fish sank into a hill`);
                    if (!previous) continue;
                    if (previous.steps && f.routeStep > previous.step) traversed++;
                    if (previous.steps && previous.step === previous.steps - 1 && !f.habitatRoute.length && f.visitPhase === 'dwell') completed++;
                }
            }
            assert(traversed >= 4 && completed >= 2, `${theme}: only ${traversed} waypoints and ${completed} complete routes`);
        }
    });
    test('Landscape saves preserve placed and stored prizes and individual care', () => {
        for (const theme of Object.keys(core.THEMES)) {
            const g = make(theme), b = g.state.bounds;
            g.state.prizes = { oyster: '2026-01-01', chest: '2026-01-01' };
            for (const id of ['oyster', 'chest']) {
                const pos = g.findPrizeSpot(id); assert(pos);
                g.state.prizePositions[id] = pos;
                if (id === 'oyster') { g.state.equippedPrizes.push(id); g.refreshPrizeObstacles(); }
            }
            const old = envelope(g);
            const before = JSON.stringify(old), upgraded = core.validateSave(old);
            equal(JSON.stringify(old), before); equal(upgraded.version, core.VERSION);
            equal(upgraded.session.prizes, old.session.prizes); equal(upgraded.session.stats, old.session.stats);
            equal(upgraded.session.fish.map(f => [f.id, f.hunger, f.health, f.growth, f.traits]),
                old.session.fish.map(f => [f.id, f.hunger, f.health, f.growth, f.traits]));
            assert(upgraded.session.fish.every(f => Array.isArray(f.habitatRoute)));
            core.validateSave(upgraded);
            const resumed = new core.Game(theme, upgraded.profile, { snapshot: upgraded.session });
            for (const [id, pos] of Object.entries(resumed.state.prizePositions))
                assert(resumed.prizeMoveCandidate(id, pos).ok, `${theme}: ${id} retained an invalid slope`);
        }
    });

    test('Rendered arch caps seat on both supporting stones and base rocks intersect the sand', () => {
        if (typeof ZQRenderer === 'undefined') return;
        const spans = (mesh, x, z) => {
            const heights = [], v = mesh.vertices;
            for (let i = 0; i < v.length; i += 30) {
                const ax = v[i], az = v[i + 2], bx = v[i + 10], bz = v[i + 12], cx = v[i + 20], cz = v[i + 22];
                const denominator = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
                if (Math.abs(denominator) < 1e-10) continue;
                const a = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / denominator;
                const b = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / denominator, c = 1 - a - b;
                if (Math.min(a, b, c) >= -1e-7) heights.push(a * v[i + 1] + b * v[i + 11] + c * v[i + 21]);
            }
            return heights.length ? [Math.min(...heights), Math.max(...heights)] : null;
        };
        for (const theme of Object.keys(core.THEMES)) for (const segments of [9, 12]) {
            const g = make(theme), meshes = new Map();
            for (const rock of g.habitat.rockSolids) {
                const mesh = new ZQRenderer.Geometry();
                mesh.sphere(rock.pos, rock.radius, [0.5, 0.5, 0.5], 6, 8, segments, rock.roughness ?? 0.2);
                meshes.set(rock, mesh);
            }
            for (const rock of g.habitat.rocks) {
                if (!rock.parts && rock.roughness !== 0.06) {
                    const v = meshes.get(rock).vertices;
                    assert(v.some((n, i) => i % 10 === 1 && n <= g.floorAt(v[i - 1], v[i + 1])),
                        `${theme}: a base stone floats above its rendered sand`);
                }
                if (!rock.hollow) continue;
                const cap = rock.parts[2];
                for (const support of rock.parts.slice(0, 2)) {
                    let contact = false;
                    for (let dx = -0.3; dx <= 0.3; dx += 0.1) for (let dz = -0.3; dz <= 0.3; dz += 0.1) {
                        const x = support.pos[0] + dx, z = support.pos[2] + dz;
                        const a = spans(meshes.get(cap), x, z), b = spans(meshes.get(support), x, z);
                        if (a && b && Math.min(a[1], b[1]) - Math.max(a[0], b[0]) > 0.04) contact = true;
                    }
                    assert(contact, `${theme} ${segments}: rendered cap floats above a supporting stone`);
                }
            }
        }
    });
    test('Habitats span the tank with fish-scale groves, landmarks, and boundary exploration routes', () => {
        for (const theme of Object.keys(core.THEMES)) {
            const g = make(theme), b = g.state.bounds;
            const adultLength = g.theme.fish.reduce((sum, def) => sum + def.size * core.CONFIG.fishScale * 2.24, 0) / 4;
            assert(g.habitat.rocks.some(r => r.radius[0] * 2 >= adultLength * 2.5), `${theme}: landmarks still read as ornaments`);
            assert(g.habitat.plants.filter(p => p.h >= adultLength * 2).length >= 6, `${theme}: too few surrounding plants`);
            assert(g.habitat.plants.some(p => p.x > b.width * 0.8) && g.habitat.plants.some(p => p.x < -b.width * 0.8));
            assert(g.habitat.routes.some(path => path.some(p => p[2] > b.depth * 0.85)));
            assert(g.habitat.routes.some(path => path.some(p => Math.abs(p[0]) >= b.width * 0.8)));
            assert(g.floorAt(-b.width * 0.85, -1.5) > b.floor + 0.4);
            assert(g.floorAt(b.width * 0.85, 0) > b.floor + 0.4);
        }
    });
    test('Zoom crops the persistent aquarium and residents naturally leave and reenter the frame', () => {
        if (typeof ZQRenderer === 'undefined') return;
        const g = new core.Game('koi', core.createProfile(), { demo: true, seed: 71437, width: 1200, height: 800 });
        const r = Object.create(ZQRenderer.Renderer.prototype);
        Object.assign(r, { width: 1200, height: 800, level: 'battery', reduced: true,
            camera: { ...ZQRenderer.PARAMS.camera, zoom: ZQRenderer.PARAMS.camera.minZoom, target: [0, 0, 0], follow: null } });
        r.setTheme(g.theme, g.state.bounds);
        const bounds = JSON.stringify(g.state.bounds), seen = new Map();
        let transitions = 0, outside = 0;
        for (let frame = 0; frame < 2700; frame++) {
            g.update(1 / 30); r.updateCamera(g.state, 1 / 30);
            for (const f of g.state.fish) {
                const visible = r.project(f.pos).visible;
                if (!visible) outside++;
                if (seen.has(f.id) && seen.get(f.id) !== visible) transitions++;
                seen.set(f.id, visible);
            }
        }
        assert(outside > 30 && transitions >= 4, 'The camera still acts like a fish enclosure');
        equal(JSON.stringify(g.state.bounds), bounds);
    });
    test('Terrain saves roundtrip all placements without discarding round progress', () => {
        for (const theme of Object.keys(core.THEMES)) {
            const g = make(theme), b = g.state.bounds;
            g.state.prizes = { oyster: '2026-01-01', chest: '2026-01-01' };
            for (const id of ['oyster', 'chest']) {
                const pos = g.findPrizeSpot(id); assert(pos); g.state.prizePositions[id] = pos;
                if (id === 'oyster') { g.state.equippedPrizes.push(id); g.refreshPrizeObstacles(); }
            }
            const old = envelope(g);
            const before = JSON.stringify(old), saved = core.validateSave(old);
            equal(JSON.stringify(old), before); equal(saved.version, core.VERSION);
            equal(saved.session.prizes, old.session.prizes); equal(saved.session.stats, old.session.stats);
            equal(saved.session.score, old.session.score); equal(saved.session.bounds, old.session.bounds);
            core.validateSave(saved);
            const resumed = new core.Game(theme, saved.profile, { snapshot: saved.session });
            for (const [id, pos] of Object.entries(saved.session.prizePositions)) assert(resumed.prizeMoveCandidate(id, pos).ok);
        }
    });

    test('Default framing fills the viewport with active water instead of fitting decorative margins', () => {
        if (typeof ZQRenderer === 'undefined') return;
        for (const [width, height] of [[1200, 800], [390, 844], [844, 390], [2000, 800]]) {
            const g = make(), b = g.state.bounds;
            const r = Object.create(ZQRenderer.Renderer.prototype);
            Object.assign(r, { width, height, reduced: true,
                camera: { ...ZQRenderer.PARAMS.camera, zoom: 1, target: [0, 0, 0], follow: null } });
            const before = JSON.stringify(g.snapshot());
            r.updateCamera(g.state, 0.1);
            const points = [];
            for (const x of [-b.width, b.width]) for (const y of [b.floor, b.surface]) for (const z of [-b.depth, b.depth])
                points.push(r.project([x, y, z]));
            const occupied = axis => {
                const limit = axis === 'x' ? width : height;
                return (Math.min(limit, Math.max(...points.map(p => p[axis]))) -
                    Math.max(0, Math.min(...points.map(p => p[axis])))) / limit;
            };
            assert(occupied('x') >= 0.92 && occupied('y') >= 0.92,
                `${width}x${height}: active water only fills ${occupied('x')} by ${occupied('y')}`);
            equal(JSON.stringify(g.snapshot()), before);
        }
    });
    test('Ambient bubbles occupy the living water volume at every quality level without entering terrain', () => {
        if (typeof ZQRenderer === 'undefined') return;
        const g = make('koi'), b = g.state.bounds;
        for (const level of ['battery', 'balanced', 'high']) {
            const r = Object.create(ZQRenderer.Renderer.prototype);
            Object.assign(r, { theme: g.theme, level, reduced: false, palette: { light: [0.8, 0.9, 1] } });
            const data = r.particleData(g.state, 40), bubbles = [];
            for (let i = 0; i < data.length; i += 9) {
                const [x, y, z] = data.slice(i, i + 3);
                assert(Math.abs(x) <= b.width && Math.abs(z) <= b.depth);
                assert(y >= g.floorAt(x, z) - 1e-6 && y <= b.surface + 1e-6);
                if (data[i + 8] === 1) bubbles.push([x, y, z]);
            }
            assert(bubbles.length >= 3);
            assert(Math.max(...bubbles.map(p => p[0])) - Math.min(...bubbles.map(p => p[0])) > b.width);
            equal(Array.from(r.particleData(g.state, 40)), Array.from(data));
        }
    });
    test('Species have distinct propulsion cycles and individual residents do not share a movement clock', () => {
        const ids = ['koi-orange', 'neon', 'angel', 'ink-betta', 'angler'];
        const defs = Object.values(core.THEMES).flatMap(theme => theme.fish);
        for (const id of ids) {
            const def = defs.find(d => d.id === id), samples = [];
            let asynchronous = 0;
            for (let frame = 0; frame < 900; frame++) {
                const a = core.swimRhythm({ id: 1, age: frame / 30 }, def);
                const b = core.swimRhythm({ id: 2, age: frame / 30 }, def);
                samples.push(a.pace);
                if (Math.abs(a.pace - b.pace) > 0.15) asynchronous++;
                assert(a.pace > 0 && a.pace < 2.5 && a.propulsion >= 0 && a.propulsion <= 1);
            }
            const contrast = Math.max(...samples) / Math.min(...samples);
            assert(contrast >= (id === 'neon' ? 3 : ['angel', 'ink-betta'].includes(id) ? 5 : 1.9),
                `${id}: propulsion rhythm too subtle (${contrast})`);
            assert(asynchronous > 180, `${id}: residents synchronized their pace`);
        }
    });
    test('Actual darting and hovering swimming slows and accelerates without sacrificing urgent response', () => {
        for (const [theme, type] of [['tropical', 3], ['tropical', 2], ['ink', 0]]) {
            const g = make(theme), f = g.state.fish[0];
            f.type = type; f.size = g.theme.fish[type].size; f.traits = {};
            g.state.fish = [f]; g.state.creature = null; g.demo = true;
            g.habitat = { rocks: [], rockSolids: [], plants: [], shelters: [], routes: [], obstacles: [], ceiling: -Infinity };
            f.pos = [-4, 0, 0]; f.vel = [0, 0, 0]; f.yaw = 0; f.pitch = 0; f.hunger = 100;
            const speeds = [];
            for (let frame = 0; frame < 900; frame++) {
                f.intent = 'cruise'; f.intentTime = 100; f.target = [f.pos[0] < 0 ? 6.4 : -6.4, 0, 0];
                g.updateFish(f, 1 / 30);
                if (frame > 90) speeds.push(Math.hypot(...f.vel));
            }
            const ordered = speeds.sort((a, b) => a - b);
            assert(ordered[Math.floor(ordered.length * 0.9)] > ordered[Math.floor(ordered.length * 0.1)] * 2,
                `${theme} ${type}: actual swimming remained uniform`);
            f.fear = 1; f.target = [f.pos[0] > 0 ? -6 : 6, 0, 0];
            for (let frame = 0; frame < 15; frame++) g.updateFish(f, 1 / 30);
            equal(f.activity, 'evade'); assert(Math.hypot(...f.vel) > 0.4);
        }
    });

    const bubbleStart = f => 8 + ((f.id * 0.61803398875) % 1) * 14;
    const bubbleFish = g => {
        const f = g.state.fish[0];
        g.state.fish = [f]; g.state.creature = null; g.demo = true;
        f.pos = [0, 2, 1]; f.vel = [0.5, 0, 0]; f.yaw = 0; f.pitch = 0; f.roll = 0;
        f.hunger = 100; f.health = 100; f.fear = 0; f.burst = 0;
        f.intent = 'cruise'; f.activity = 'cruise'; f.intentTime = 30;
        f.target = [4, 2, 1]; f.habitatRoute = []; f.age = bubbleStart(f);
        return f;
    };
    test('Contented fish release five spatial bubble events per short independently timed burst in every theme', () => {
        for (const theme of Object.keys(core.THEMES)) {
            const g = make(theme), f = bubbleFish(g);
            g.drainEvents();
            for (let i = 0; i < 36; i++) g.updateFish(f, 0.05);
            const events = g.drainEvents().filter(e => e.type === 'bubble');
            equal(events.length, 5); equal(g.state.bubbles.length, 5);
            for (let i = 0; i < events.length; i++) {
                equal(events[i].fishId, f.id);
                equal(events[i].point, g.state.bubbles[i].pos);
                assert(core.distance(events[i].point, f.pos) < 1.3);
                equal(events[i].message, '');
            }
            equal(core.bubblePose(f).amount, 0);
            f.age += 5; g.updateFish(f, 0.1);
            equal(g.drainEvents().filter(e => e.type === 'bubble').length, 0);
        }
        let independent = 0;
        for (let i = 0; i < 1200; i++) {
            const a = { id: 1, age: i / 30, pitch: 0, hunger: 100, health: 100, fear: 0, burst: 0, activity: 'cruise' };
            if ((core.bubblePose(a).amount > 0) !== (core.bubblePose({ ...a, id: 2 }).amount > 0)) independent++;
        }
        assert(independent > 100, 'Residents share a bubbling clock');
    });
    test('Bubbling slows actual swimming and adds a smooth head tilt and pulsing mouth', () => {
        const g = make('koi'), f = bubbleFish(g), control = make('koi'), other = bubbleFish(control);
        other.health = 49;
        for (let i = 0; i < 20; i++) { g.updateFish(f, 0.05); control.updateFish(other, 0.05); }
        assert(Math.hypot(...f.vel) < Math.hypot(...other.vel) * 0.75, 'Bubbling fish did not slow');
        f.age = bubbleStart(f) + 0.9;
        const pose = core.bubblePose(f);
        near(pose.pitch - f.pitch, 0.22);
        assert(pose.pulse > 0.99);
        f.age += 0.15;
        assert(core.bubblePose(f).pulse < 0.02);
        f.age = bubbleStart(f) + 0.01;
        assert(core.bubblePose(f).amount < 0.04, 'Tilt enters abruptly');
    });
    test('Food, fear, nearby hazards and poor condition interrupt mouth bubbling without replaying missed pops', () => {
        for (const cause of ['food', 'fear', 'hazard', 'hunger', 'health']) {
            const g = make(), f = bubbleFish(g);
            f.age += 0.29; g.drainEvents();
            if (cause === 'food') {
                f.hunger = 60;
                g.state.food.push({ pos: [...f.pos], age: 0, speed: 0.3, phase: 0 });
            }
            if (cause === 'fear') f.fear = 2;
            if (cause === 'hazard') g.state.attacks.push({ kind: 'shock', pos: [...f.pos] });
            if (cause === 'hunger') f.hunger = 44;
            if (cause === 'health') f.health = 49;
            g.updateFish(f, 0.05);
            equal(core.bubblePose(f).amount, 0);
            equal(g.state.bubbles.length, 0);
            equal(g.drainEvents().filter(e => e.type === 'bubble').length, 0);
            f.health = 100; f.hunger = 100; f.fear = 0; g.state.attacks = [];
            g.updateFish(f, 0.05);
            equal(g.drainEvents().filter(e => e.type === 'bubble').length, 0);
        }
    });
    test('Released mouth bubbles rise independently, freeze on pause, expire and do not enter saved progress', () => {
        const g = make(), f = bubbleFish(g);
        f.age += 0.29; g.updateFish(f, 0.05);
        const bubble = g.state.bubbles[0], origin = [...bubble.pos];
        equal(origin, core.fishMouth(f));
        f.age = bubbleStart(f) + 3;
        g.state.paused = true; g.update(0.1);
        equal(bubble.pos, origin); equal(bubble.age, 0);
        g.state.paused = false; g.update(0.1);
        near(bubble.pos[0], origin[0]); near(bubble.pos[1], origin[1] + 0.065);
        const saved = envelope(g);
        assert(!Object.hasOwn(saved.session, 'bubbles'));
        const restored = new core.Game('tropical', saved.profile, { snapshot: core.validateSave(saved).session });
        equal(restored.state.bubbles, []);
        f.age = bubbleStart(f) + 4;
        steps(g, 2.5);
        equal(g.state.bubbles.length, 0);
    });
    test('Mouth bubbles join the existing particle batch in every quality and reduced-motion mode', () => {
        if (typeof ZQRenderer === 'undefined') return;
        const g = make(), f = bubbleFish(g);
        f.age += 0.29; g.updateFish(f, 0.05);
        for (const level of ['battery', 'balanced', 'high']) for (const reduced of [false, true]) {
            const r = Object.create(ZQRenderer.Renderer.prototype);
            Object.assign(r, { theme: g.theme, level, reduced, palette: { light: [0.8, 0.9, 1] } });
            const before = JSON.stringify(g.state.bubbles);
            const data = r.particleData(g.state, 0), point = g.state.bubbles[0].pos;
            const mouth = Array.from(data.slice(-9));
            point.forEach((n, i) => near(mouth[i], n, 1e-6)); equal(mouth[8], 1);
            assert(mouth[6] >= 5 && mouth[6] <= 10 && mouth[7] > 0);
            equal(JSON.stringify(g.state.bubbles), before);
        }
        for (const def of Object.values(core.THEMES).flatMap(t => t.fish)) {
            const vertices = ZQRenderer.fishGeometry(def).vertices;
            let mouth = 0;
            for (let i = 0; i < vertices.length; i += 10) if (vertices[i + 9] === 4) {
                mouth++; assert(vertices[i] > 0.68 && vertices[i] < 0.76);
            }
            assert(mouth > 0, `${def.id}: mouth has no animation marker`);
        }
    });

    const rivals = () => {
        const g = make('ink'); g.state.fish = []; g.state.spawnTimer = 60;
        const fish = breedingPair(g);
        fish.forEach(f => { f.sex = 'male'; });
        g.state.reproduction.fill(core.CONFIG.birthCooldown[1]);
        return { g, fish };
    };
    test('Fish sexes are seeded, balanced, permanent through growth, and saved for living and departed residents', () => {
        const g = make(), other = make();
        equal(g.snapshot(), other.snapshot());
        g.state.fish = [];
        for (let i = 0; i < 1000; i++) g.addFish(0, i % 2 === 0);
        const males = g.state.fish.filter(f => f.sex === 'male').length;
        assert(males > 400 && males < 600, `Random sex assignment skewed: ${males}`);
        g.state.fish = g.state.fish.slice(0, 10);
        const before = g.state.fish.map(f => f.sex), baby = g.state.fish[0];
        baby.growth = 0.9999; g.updateFish(baby, 0.1);
        equal(baby.growth, 1); equal(g.state.fish.map(f => f.sex), before);
        g.kill(baby, 'health'); equal(g.state.dead[0].sex, before[0]);
        const saved = core.validateSave(envelope(g));
        equal(saved.session.fish.map(f => f.sex), before.slice(1));
        equal(saved.session.dead[0].sex, before[0]);
    });
    test('Courtship requires same-species healthy adult male and female rather than same-sex or mixed pairs', () => {
        for (const cause of ['male', 'female', 'baby', 'species', 'hunger', 'health', 'water', 'cooldown']) {
            const g = make(); g.state.fish = [];
            const fish = breedingPair(g); g.state.reproduction.fill(0); g.random = () => 0;
            if (cause === 'male' || cause === 'female') fish.forEach(f => { f.sex = cause; });
            if (cause === 'baby') fish[1].growth = 0.9;
            if (cause === 'species') fish[1].type = 1;
            if (cause === 'hunger') fish[1].hunger = 60;
            if (cause === 'health') fish[1].health = 70;
            if (cause === 'water') g.state.tankHealth = 50;
            if (cause === 'cooldown') fish[1].socialCooldown = 90;
            for (let i = 0; i < 100; i++) g.reproduce(0.1);
            equal(g.state.stats.born, 0); equal(g.state.courtships.length, 0);
        }
    });
    test('Actual swimming completes a four-second courtship for every species without ignoring personal space', () => {
        for (const theme of Object.keys(core.THEMES)) for (let type = 0; type < 4; type++) {
            const g = make(theme); g.state.fish = []; g.state.spawnTimer = 60;
            const fish = breedingPair(g, type);
            g.state.reproduction.fill(0); g.random = () => 0;
            steps(g, 3.5, 0.1); equal(g.state.stats.born, 0);
            let courting = false;
            for (let i = 0; i < 125 && !g.state.stats.born; i++) {
                g.update(0.1); courting ||= fish.some(f => f.activity === 'court');
            }
            assert(courting && g.state.stats.born === 1, `${theme}/${type}: courtship never completed`);
            const baby = g.state.fish.find(f => f.growth < 1);
            assert(baby && ['male', 'female'].includes(baby.sex));
            assert(core.distance(baby.pos, fish[1].pos) < 1);
            equal(g.state.courtships.length, 0);
            assert(g.state.reproduction.every(n => n > 0));
            core.validateSave(envelope(g));
        }
    });
    test('Courtship interruptions cancel safely on danger, obstacles, lost parents, poor care and capacity', () => {
        for (const cause of ['visitor', 'hazard', 'obstacle', 'loss', 'water', 'hunger', 'capacity', 'timeout']) {
            const g = make(); g.state.fish = []; const fish = breedingPair(g);
            g.state.reproduction.fill(0); g.random = () => 0; g.reproduce(0.1);
            equal(g.state.courtships.length, 1);
            if (cause === 'visitor') { const c = spawn(g, 'octopus'); c.pos = [...fish[0].pos]; }
            if (cause === 'hazard') g.state.attacks = [{ kind: 'shock', pos: [...fish[0].pos] }];
            if (cause === 'obstacle') g.habitat.obstacles = [{ pos: [0.75, 1.5, 0], radius: [0.2, 1, 1] }];
            if (cause === 'loss') g.kill(fish[0], 'health');
            if (cause === 'water') g.state.tankHealth = 50;
            if (cause === 'hunger') fish[1].hunger = 60;
            if (cause === 'capacity') g.state.maxFish = 2;
            if (cause === 'timeout') g.state.courtships[0].time = core.CONFIG.courtshipLimit - 0.05;
            g.reproduce(0.1); equal(g.state.courtships.length, 0); equal(g.state.stats.born, 0);
        }
    });
    test('Only nearby adult same-species male bettas start disputes in true unobstructed 3D space', () => {
        for (const cause of ['female', 'baby', 'depth', 'height', 'species', 'other-world', 'cooldown', 'obstacle', 'danger', 'courtship']) {
            const { g, fish } = rivals();
            if (cause === 'female') fish[1].sex = 'female';
            if (cause === 'baby') fish[1].growth = 0.9;
            if (cause === 'depth') fish[1].pos[2] += 3;
            if (cause === 'height') fish[1].pos[1] -= 3;
            if (cause === 'species') fish[1].type = 1;
            if (cause === 'other-world') { g.theme = core.THEMES.tropical; g.state.themeId = 'tropical'; }
            if (cause === 'cooldown') fish[1].socialCooldown = 90;
            if (cause === 'obstacle') g.habitat.obstacles = [{ pos: [0.75, 1.5, 0], radius: [0.2, 1, 1], box: true }];
            if (cause === 'danger') { const c = spawn(g, 'octopus'); c.pos = [...fish[0].pos]; }
            if (cause === 'courtship') g.state.courtships = [{ ids: fish.map(f => f.id), type: 0, time: 0, closeTime: 0 }];
            g.updateDisputes(0.1); equal(g.state.disputes.length, 0);
        }
        const { g } = rivals(); g.updateDisputes(0.1); equal(g.state.disputes.length, 1);
    });
    test('Betta disputes display for four seconds, then fight for eight active seconds before a single loss', () => {
        const { g, fish } = rivals(); g.updateDisputes(0.1);
        for (let i = 0; i < 39; i++) g.updateDisputes(0.1);
        equal(g.state.disputes[0].phase, 'warning'); equal(g.state.stats.lost, 0);
        fish.forEach(f => equal(f.health, 100));
        g.updateDisputes(0.1); equal(g.state.disputes[0].phase, 'fight');
        for (let i = 0; i < 79; i++) g.updateDisputes(0.1);
        equal(g.state.stats.lost, 0); assert(fish.every(f => f.health < 40));
        g.updateDisputes(0.1); g.updateDisputes(0.1);
        equal(g.state.stats.lost, 1); equal(g.state.fish.length, 1); equal(g.state.disputes.length, 0);
        equal(g.state.fish[0].socialCooldown, 90);
        assert(g.drainEvents().some(e => e.message.includes('territorial fight')));
    });
    test('Protective taps win over visitor provocation and glass stress in either dispute phase', () => {
        for (const phase of ['warning', 'fight']) {
            const { g, fish } = rivals(); g.updateDisputes(0.1);
            g.state.disputes[0].phase = phase;
            const c = spawn(g, 'octopus'); c.pos = [...fish[0].pos];
            const taps = g.state.stats.taps, stress = g.state.stress, score = g.state.score, damage = g.state.damage;
            assert(g.tap([...fish[1].pos]).separated);
            equal(g.state.disputes.length, 0); equal(g.state.stats.taps, taps); equal(g.state.stress, stress);
            equal(g.state.score, score); equal(g.state.damage, damage); assert(!c.provoked);
            assert(fish.every(f => f.fear === 2 && f.socialCooldown === 90 && f.activity === 'evade'));
            assert(core.distance(fish[0].target, fish[1].target) > 4);
            g.updateDisputes(0.1); equal(g.state.disputes.length, 0);
        }
        const { g } = rivals(); g.updateDisputes(0.1);
        assert(!g.tap([-6, -1, -2]).separated); equal(g.state.stats.taps, 1);
    });
    test('Live swimming preserves intervention windows and Zen care separates males without a loss', () => {
        for (const automatic of [false, true]) {
            const { g, fish } = rivals(); g.state.auto = automatic;
            steps(g, automatic ? 2 : 13, 0.1);
            if (automatic) {
                equal(g.state.stats.lost, 0); equal(g.state.disputes.length, 0);
                assert(fish.every(f => f.socialCooldown > 85));
                assert(g.drainEvents().some(e => e.message.includes('Zen care separated')));
            } else equal(g.state.stats.lost, 1);
        }
    });
    test('Disputes and courtships persist, freeze on pause, and resume deterministically', () => {
        for (const kind of ['courtship', 'warning', 'fight']) {
            const { g, fish } = rivals();
            if (kind === 'courtship') {
                fish[1].sex = 'female'; g.state.reproduction.fill(0); g.random = () => 0;
                g.reproduce(0.1);
            } else {
                g.updateDisputes(0.1); g.state.disputes[0].phase = kind;
            }
            steps(g, 0.5, 0.1);
            const saved = core.validateSave(envelope(g)), copy = new core.Game('ink', core.clone(g.profile), { snapshot: saved.session });
            const frozen = copy.snapshot(); steps(copy, 3, 0.1); equal(copy.snapshot(), frozen);
            // Restore the RNG implementation before comparing the two continuations.
            delete g.random; copy.resume();
            steps(g, 0.5, 0.1); steps(copy, 0.5, 0.1);
            equal(copy.snapshot(), g.snapshot());
        }
    });
    test('Social save validation rejects missing sex, malformed timers and invalid or duplicate pair references', () => {
        const { g } = rivals(); g.updateDisputes(0.1);
        for (const mutate of [
            d => { delete d.session.fish[0].sex; },
            d => { d.session.fish[0].sex = 'unknown'; },
            d => { d.session.fish[0].socialCooldown = -1; },
            d => { d.session.fish[0].socialCooldown = 91; },
            d => { delete d.session.courtships; },
            d => { d.session.disputes[0].ids[1] = 999; },
            d => { d.session.disputes[0].ids[1] = d.session.disputes[0].ids[0]; },
            d => { d.session.disputes[0].phase = 'unknown'; },
            d => { d.session.disputes[0].time = 4.1; },
            d => { d.session.fish[1].sex = 'female'; },
            d => { d.session.fish[1].growth = 0.5; },
            d => { d.session.disputes.push(core.clone(d.session.disputes[0])); },
            d => { d.session.courtships.push({ type: 0, ids: d.session.disputes[0].ids, time: 0, closeTime: 0 }); }
        ]) {
            const bad = envelope(g); mutate(bad); throws(() => core.validateSave(bad));
        }
        const c = make(); c.state.fish = []; breedingPair(c); c.state.reproduction.fill(0); c.random = () => 0; c.reproduce(0.1);
        for (const mutate of [
            d => { d.session.courtships[0].ids.reverse(); },
            d => { d.session.courtships[0].type = 1; },
            d => { d.session.courtships[0].time = 17; },
            d => { d.session.courtships[0].closeTime = 1; },
            d => { d.session.courtships.push(core.clone(d.session.courtships[0])); }
        ]) { const bad = envelope(c); mutate(bad); throws(() => core.validateSave(bad)); }
    });
    test('Males use species-colored fins, flank ribbons and brighter natural patterns instead of generic bands', () => {
        const kinds = new Set(), colors = new Set();
        for (const def of Object.values(core.THEMES).flatMap(t => t.fish)) {
            const mark = core.maleMark(def); kinds.add(mark.kind);
            colors.add(mark.color);
            assert(/^#[0-9a-f]{6}$/.test(mark.color));
            assert(mark.color !== def.body);
        }
        equal([...kinds].sort(), [0, 1, 2]);
        assert(colors.size >= 15, 'Male coloration still uses a generic shared palette');
        equal(core.maleMark(core.THEMES.ink.fish[0]), { kind: 0, color: '#63dfdc' });
        equal(core.maleMark(core.THEMES.deep.fish[2]), { kind: 2, color: '#73ffe0' });
        equal(core.maleMark(core.THEMES.tropical.fish[3]), { kind: 1, color: '#eaff64' });
        equal(core.THEMES.koi.name, 'Koi Pond');
        equal(core.maleMark(core.THEMES.zen.fish[1]), { kind: 1, color: '#e598b2' });
        equal(core.maleMark(core.THEMES.zen.fish[2]), { kind: 2, color: '#e598b2' });
        equal(core.maleMark(core.THEMES.zen.fish[3]), { kind: 0, color: '#e598b2' });
        throws(() => core.maleMark({ id: 'unknown' }));
    });
    test('Social activities suppress mouth bubbling', () => {
        const g = make(), f = bubbleFish(g); f.age += 0.9;
        assert(core.bubblePose(f).pulse > 0);
        for (const activity of ['court', 'display', 'fight']) {
            f.activity = activity; equal(core.bubblePose(f).amount, 0);
        }
    });
    test('Breeding adjustments preserve care thresholds and capacity brakes while increasing sparse courtship odds', () => {
        equal(core.CONFIG.birthCooldown, [25, 45]);
        near(core.CONFIG.birthChancePerSecond, 0.05);
        near(core.CONFIG.babyGrowth, 0.02); equal(core.CONFIG.courtshipTime, 4);
        const g = make(); g.state.fish = [];
        const fish = breedingPair(g);
        fish[0].hunger = 60; assert(!g.breedingFish(fish[0]));
        fish[0].hunger = 60.01; assert(g.breedingFish(fish[0]));
        fish[0].health = 70; assert(!g.breedingFish(fish[0]));
        fish[0].health = 70.01; assert(g.breedingFish(fish[0]));
        g.state.reproduction.fill(0); g.random = () => 0.035;
        g.reproduce(1);
        equal(g.state.courtships.length, 1, 'The approved probability increase did not take effect');
        g.state.courtships = []; g.state.tankHealth = 50;
        g.reproduce(1); equal(g.state.courtships.length, 0);
        g.state.tankHealth = 100; g.state.maxFish = 2;
        g.random = () => 0; g.reproduce(1); equal(g.state.courtships.length, 0);
    });
    test('Resuming Zen care preserves the shared birth respite calculated against its smaller population cap', () => {
        const g = make(); g.state.fish = []; breedingPair(g);
        while (g.state.fish.length < 8) g.addFish(1);
        g.state.auto = true; g.state.reproduction.fill(0); g.random = () => 0;
        g.reproduce(0.1); equal(g.state.courtships.length, 1);
        g.random = () => 0.999;
        for (let i = 0; i < 41; i++) g.reproduce(0.1);
        equal(g.state.stats.born, 1);
        assert(g.state.reproduction.every(n => n > 100));
        const saved = core.validateSave(envelope(g));
        const resumed = new core.Game(g.theme.id, core.clone(g.profile), { snapshot: saved.session });
        equal(resumed.state.reproduction, g.state.reproduction);
    });

    globalThis.ZQ_TEST_RESULTS = results;
    if (typeof module !== 'undefined' && module.exports) {
        for (const result of results) console.log(`${result.passed ? 'PASS' : 'FAIL'} ${result.name}${result.error ? `: ${result.error}` : ''}`);
        if (results.some(r => !r.passed)) process.exitCode = 1;
        module.exports = results;
    }
})();
