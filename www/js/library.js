/* Voice to Short — procedural, keyword-driven scene library (v1.3).
   Adds ~40 character actions, ~200 props (hand-drawn + Twemoji icons), 10 more settings, a keyword → visual matcher,
   a keyword icon-card fallback and a per-beat match score. Loaded after scenes.js; extends VTS.scenes in place. */
(function () {
  'use strict';
  const VTS = (window.VTS = window.VTS || {});
  const S = VTS.scenes; if (!S) return;
  const W = 1080; const TAU = Math.PI * 2;
  const clamp01 = (v) => Math.max(0, Math.min(1, v));
  const ease = (v) => { v = clamp01(v); return v * v * (3 - 2 * v); };

  // ======================= emoji icons (Twemoji, CC-BY 4.0) =======================
  const EDATA = VTS.EMOJI_DATA || [];
  const EFILES = new Set(EDATA.map((r) => r[0]));
  const ELABEL = new Map(EDATA.map((r) => [r[0], r[1]]));
  const EWORD = new Map(); // word -> [file, rank]
  EDATA.forEach(([f, label, tags, g], i) => {
    const rank = (g === 0 ? 3 : g === 8 ? 2 : 0) + (label.split(' ').length > 2 ? 1 : 0);
    label.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2).forEach((w, k) => { const r = rank + k * 0.5; const cur = EWORD.get(w); if (!cur || cur[1] > r) EWORD.set(w, [f, r]); });
    String(tags || '').toLowerCase().split(/\s+/).filter((w) => w.length > 2).forEach((w) => { const r = rank + 2; const cur = EWORD.get(w); if (!cur || cur[1] > r) EWORD.set(w, [f, r]); });
  });
  function emojiFile(ch) { // emoji character -> bundled file name
    if (!ch) return '';
    const cps = Array.from(String(ch)).map((c) => c.codePointAt(0).toString(16));
    const a = cps.join('-'); if (EFILES.has(a)) return a;
    const b = cps.filter((c) => c !== 'fe0f').join('-'); if (EFILES.has(b)) return b;
    return EFILES.has(cps[0]) ? cps[0] : '';
  }
  const EMO = {
    base: VTS.EMOJI_BASE || 'emoji/', cache: new Map(), imgs: new Map(), bigs: new Map(), pending: new Map(), OL: '#1d1b2e',
    get(file) { const c = this.cache.get(file); if (c) return c; if (!this.pending.has(file)) this.load([file]); return null; },
    load(files) {
      return Promise.all(files.filter((f) => f && EFILES.has(f)).map((f) => {
        if (this.cache.has(f)) return true;
        if (this.pending.has(f)) return this.pending.get(f);
        const p = new Promise((resolve) => {
          const img = new Image(); img.decoding = 'async';
          img.onload = () => { try { this.imgs.set(f, img); this.cache.set(f, this.raster(img)); } catch (_) { /* ignore */ } resolve(true); };
          img.onerror = () => resolve(false);
          img.src = this.base + f + '.svg';
        });
        this.pending.set(f, p); return p;
      }));
    },
    big(file) { let c = this.bigs.get(file); if (c) return c; const img = this.imgs.get(file); if (!img) return this.get(file); c = this.raster(img, 512); this.bigs.set(file, c); if (this.bigs.size > 6) this.bigs.delete(this.bigs.keys().next().value); return c; },
    raster(img, N) { // sticker: emoji + bold dark outline so it matches the flat outlined style
      N = N || 256; const pad = Math.round(N * 0.086); const ow = N / 36.5; const c = document.createElement('canvas'); c.width = N; c.height = N; const x = c.getContext('2d');
      const s = document.createElement('canvas'); s.width = N; s.height = N; const sx = s.getContext('2d');
      sx.drawImage(img, pad, pad, N - pad * 2, N - pad * 2); sx.globalCompositeOperation = 'source-in'; sx.fillStyle = this.OL; sx.fillRect(0, 0, N, N);
      for (let k = 0; k < 16; k++) { const a = k / 16 * TAU; x.drawImage(s, Math.cos(a) * ow, Math.sin(a) * ow); }
      x.drawImage(img, pad, pad, N - pad * 2, N - pad * 2);
      return c;
    },
  };
  function emojiForWord(word) {
    const w = String(word || '').toLowerCase(); if (w.length < 3) return '';
    for (const c of lemmas(w)) { const hit = EWORD.get(c); if (hit) return hit[0]; }
    return '';
  }

  // ======================= props =======================
  // id: [label, emoji file or '' (hand-drawn), animation, category]
  const P = {};
  const addProps = (cat, spec) => spec.trim().split(/\s*;\s*/).forEach((row) => { if (!row) return; const [id, label, e, anim] = row.split(':'); P[id] = { label, e: e || '', anim: anim || 'bob', cat }; });
  addProps('art', 'pencil:Pencil::tilt; sketchbook:Sketchbook::bob; paintbrush:Paintbrush::tilt; palette:Paint palette:1f3a8:bob; crayon:Crayon:1f58d:tilt; pen:Pen::tilt; framed-picture:Framed picture:1f5bc:swing; scissors:Scissors:2702:snip; ruler:Ruler:1f4cf:tilt; easel:Easel canvas::bob; thread:Yarn:1f9f6:bob; paint-canvas:Canvas::bob');
  addProps('study', 'open-book:Open book::bob; books:Stack of books:1f4da:bob; backpack:Backpack:1f392:bob; grad-cap:Graduation cap:1f393:bounce; memo:Memo:1f4dd:tilt; pushpin:Pushpin:1f4cc:bounce; magnifier:Magnifying glass:1f50d:swing; globe:Globe:1f30d:spin; school:School:1f3eb:bob; bookmark:Bookmark:1f516:swing; microscope:Microscope:1f52c:bob; test-tube:Test tube:1f9ea:shake; abacus:Abacus:1f9ee:bob; straight-a:Grade A+:1f170:bounce');
  addProps('work', 'laptop:Laptop:1f4bb:bob; computer:Computer:1f5a5:bob; keyboard:Keyboard:2328:bob; briefcase:Briefcase:1f4bc:swing; chart-up:Chart going up:1f4c8:pop; chart-down:Chart going down:1f4c9:pop; bar-chart:Bar chart:1f4ca:pop; email:Email:1f4e7:fly; envelope:Envelope:2709:fly; folder:Folder:1f4c1:bob; gear:Gear:2699:spin; robot:Robot:1f916:bob; camera:Camera:1f4f7:flash; video-camera:Video camera:1f4f9:bob; tv:TV:1f4fa:flicker; headphones:Headphones:1f3a7:bounce; microphone:Microphone:1f3a4:bob; plug:Plug:1f50c:swing; rocket:Rocket:1f680:fly; trophy:Trophy:1f3c6:bounce; medal:Medal:1f3c5:swing; target:Target:1f3af:pulse; hourglass:Hourglass:23f3:flip; stopwatch:Stopwatch:23f1:shake; bell:Bell:1f514:swing; code-window:Code window::pop; printer:Printer:1f5a8:bob; satellite:Satellite:1f4e1:bob; link:Link:1f517:swing; lock:Lock:1f512:shake; key:Key:1f511:swing; shield:Shield:1f6e1:pulse; puzzle:Puzzle piece:1f9e9:tilt; wrench:Wrench:1f527:tilt; hammer:Hammer:1f528:tilt; magnet:Magnet:1f9f2:pulse');
  addProps('fitness', 'dumbbell:Dumbbell::bob; sneaker:Running shoe:1f45f:bounce; biceps:Flexed biceps:1f4aa:pulse; basketball:Basketball:1f3c0:bounce; soccer:Football:26bd:bounce; tennis:Tennis:1f3be:bounce; bicycle:Bicycle:1f6b2:bob; yoga-mat:Yoga mat::bob; water-bottle:Water bottle::bob; boxing-glove:Boxing glove:1f94a:shake; skateboard:Skateboard:1f6f9:bob; volleyball:Volleyball:1f3d0:bounce');
  addProps('food', 'apple:Apple:1f34e:bob; banana:Banana:1f34c:tilt; avocado:Avocado:1f951:bob; salad:Salad:1f957:bob; pizza:Pizza:1f355:spin; burger:Burger:1f354:bob; fries:Fries:1f35f:bob; donut:Donut:1f369:spin; cake:Cake:1f370:bob; birthday-cake:Birthday cake:1f382:bob; cookie:Cookie:1f36a:spin; bread:Bread:1f35e:bob; egg:Egg:1f95a:bob; frying-pan:Frying pan:1f373:shake; pot:Pot of food:1f372:steam; rice:Rice bowl:1f35a:steam; noodles:Noodles:1f35c:steam; carrot:Carrot:1f955:tilt; broccoli:Broccoli:1f966:bob; glass-water:Glass of water::bob; milk:Milk:1f95b:bob; juice:Drink:1f964:bob; tea:Tea:1f375:steam; wine:Wine:1f377:tilt; chocolate:Chocolate:1f36b:bob; candy:Candy:1f36c:spin; ice-cream:Ice cream:1f366:bob; fork-knife:Fork and knife:1f374:bob; plate:Plate of food::bob; strawberry:Strawberry:1f353:bob; lemon:Lemon:1f34b:bob; watermelon:Watermelon:1f349:bob; chili:Chili:1f336:shake; honey:Honey:1f36f:bob; cheese:Cheese:1f9c0:bob; takeout:Takeout box:1f961:bob; soda:Soda can::bob');
  addProps('money', 'money-bag:Money bag:1f4b0:bounce; banknote:Banknote:1f4b5:fly; money-wings:Money flying away:1f4b8:fly; coin:Coin:1fa99:spin; credit-card:Credit card:1f4b3:tilt; receipt:Receipt:1f9fe:swing; bank:Bank:1f3e6:bob; cart:Shopping cart:1f6d2:bob; shopping-bags:Shopping bags:1f6cd:swing; gem:Gem:1f48e:spin; price-tag:Price tag:1f3f7:swing; money-jar:Savings jar::bob; wallet:Wallet:1f45b:bob; piggy:Piggy bank::bounce; calculator:Calculator::bob');
  addProps('health', 'pill:Pill:1f48a:spin; syringe:Syringe:1f489:tilt; stethoscope:Stethoscope:1fa7a:swing; hospital:Hospital:1f3e5:bob; thermometer:Thermometer:1f321:shake; bandage:Bandage:1fa79:tilt; tooth:Tooth:1f9b7:bob; lungs:Lungs:1fac1:pulse; anatomical-heart:Heart (organ):1fac0:pulse; soap:Soap:1f9fc:bob; toothbrush:Toothbrush:1faa5:shake; shower:Shower:1f6bf:drip; bathtub:Bathtub:1f6c1:bob; sponge:Sponge:1f9fd:bob; bed:Bed:1f6cf:bob; eye:Eye:1f441:blink; ear:Ear:1f442:bob; nose:Nose:1f443:bob; muscle:Muscle:1f4aa:pulse; water-drop:Water drop:1f4a7:drip; dna:DNA:1f9ec:spin');
  addProps('home', 'house:House:1f3e0:bob; couch:Couch:1f6cb:bob; door:Door:1f6aa:swing; window:Window:1fa9f:bob; candle:Candle:1f56f:flicker; broom:Broom:1f9f9:swing; basket:Basket:1f9fa:bob; bucket:Bucket:1faa3:bob; potted-plant:Potted plant:1fab4:tilt; chair:Chair:1fa91:bob; teddy:Teddy bear:1f9f8:bob; toilet-paper:Toilet paper:1f9fb:bob; package:Package:1f4e6:bounce; gift:Gift:1f381:bounce; balloon:Balloon:1f388:float; party-popper:Party popper:1f389:pop; watering-can:Watering can::tilt; trash:Trash can::bob');
  addProps('nature', 'rain:Rain cloud:1f327:drip; snowflake:Snowflake:2744:spin; tree:Tree:1f333:tilt; pine:Pine tree:1f332:tilt; flower:Flower:1f33c:tilt; rose:Rose:1f339:tilt; seedling:Seedling:1f331:grow; leaf:Leaf:1f343:float; mountain:Mountain:26f0:bob; wave:Wave:1f30a:tilt; fire:Fire:1f525:flicker; rainbow:Rainbow:1f308:bob; lightning:Lightning:26a1:flash; star:Star:2b50:spin; dog:Dog:1f415:bounce; cat:Cat:1f408:bob; bird:Bird:1f426:fly; butterfly:Butterfly:1f98b:fly; bee:Bee:1f41d:fly; turtle:Turtle:1f422:bob; snail:Snail:1f40c:bob; fish:Fish:1f41f:float; sunflower:Sunflower:1f33b:tilt; cactus:Cactus:1f335:bob; earth:Earth:1f30e:spin; sunrise:Sunrise:1f305:bob');
  addProps('time', 'watch:Watch:231a:bob; hourglass-done:Hourglass (done):231b:flip; date:Date:1f4c5:bob; spiral-calendar:Planner:1f5d3:bob');
  addProps('symbols', 'broken-heart:Broken heart:1f494:shake; hundred:100:1f4af:pop; check:Check mark:2705:pop; cross:Cross mark:274c:shake; warning:Warning:26a0:pulse; no-entry:No entry:26d4:pulse; stop-sign:Stop sign:1f6d1:pulse; anger:Anger:1f4a2:pulse; collision:Boom:1f4a5:pop; dizzy:Dizzy:1f4ab:spin; sweat-drops:Sweat:1f4a6:drip; thought-balloon:Thought balloon:1f4ad:float; crystal-ball:Crystal ball:1f52e:pulse; dice:Dice:1f3b2:spin; crown:Crown:1f451:bounce; unlock:Unlocked:1f513:swing; infinity:Infinity:267e:pulse; recycle:Recycle:267b:spin; plus:Plus:2795:pop; minus:Minus:2796:pop; new:New:1f195:pop; free:Free:1f193:pop; sos:SOS:1f198:pulse; smile:Smiling face:1f60a:bob; grin:Grinning face:1f601:bounce; laugh:Laughing face:1f602:shake; cry-face:Crying face:1f62d:shake; angry-face:Angry face:1f620:shake; scared-face:Scared face:1f631:shake; think-face:Thinking face:1f914:tilt; sleepy-face:Sleepy face:1f634:bob; mind-blown:Mind blown:1f92f:pop; cool:Cool face:1f60e:bob; nerd:Nerd face:1f913:bob; love-face:Heart eyes:1f60d:pulse; hug-face:Hugging face:1f917:bob; party-face:Party face:1f973:bounce; yawn-face:Yawning face:1f971:bob; sick-face:Sick face:1f912:bob; money-face:Money face:1f911:bounce');
  addProps('social', 'handshake:Handshake:1f91d:pulse; thumbs-up:Thumbs up:1f44d:bounce; thumbs-down:Thumbs down:1f44e:bounce; clap:Clapping:1f44f:shake; wave-hand:Waving hand:1f44b:swing; pray-hands:Folded hands:1f64f:pulse; speaking-head:Speaking head:1f5e3:bob; people:People:1f465:bob; love-letter:Love letter:1f48c:fly; ring:Ring:1f48d:spin; raised-hands:Raised hands:1f64c:bounce; writing-hand:Writing hand:270d:tilt; selfie:Selfie:1f933:bob; eyes:Eyes:1f440:blink; brain-emoji:Brain:1f9e0:pulse');
  addProps('travel', 'airplane:Airplane:2708:fly; car:Car:1f697:bob; bus:Bus:1f68c:bob; train:Train:1f686:bob; map:Map:1f5fa:bob; luggage:Luggage:1f9f3:bob; compass:Compass:1f9ed:spin; tent:Tent:26fa:bob; beach:Beach:1f3d6:bob; ticket:Ticket:1f3ab:tilt; fuel:Fuel pump:26fd:bob; city:City:1f3d9:bob; world-map:World map:1f5fa:bob; ship:Ship:1f6a2:tilt; taxi:Taxi:1f695:bob');
  addProps('music', 'music-notes:Music notes:1f3b6:float; music-note:Music note:1f3b5:float; guitar:Guitar:1f3b8:tilt; piano:Piano:1f3b9:bob; drum:Drum:1f941:bounce; violin:Violin:1f3bb:tilt; trumpet:Trumpet:1f3ba:tilt; radio:Radio:1f4fb:bob; speaker:Speaker:1f50a:pulse');
  addProps('sports', 'football:American football:1f3c8:spin; baseball:Baseball:26be:spin; ping-pong:Ping pong:1f3d3:bounce; goal:Goal net:1f945:bob; gamepad:Game controller:1f3ae:shake; joystick:Joystick:1f579:tilt; chess:Chess:265f:bob; dart:Bullseye:1f3af:pulse; flag:Chequered flag:1f3c1:swing; mountain-top:Summit flag:1f6a9:swing');
  // v1.4 hand-drawn psychology topic props (drawn in comedy.js)
  addProps('psych', 'social-battery:Social battery::pulse; anxiety-meter:Anxiety meter::shake; overthink-yarn:Overthinking tangle::spin0; dopamine-meter:Dopamine meter::pulse; burnout-match:Burnt-out match::bob; people-pleaser:People-pleaser sign::bounce; red-flag:Red flag::swing; green-flag:Green flag::swing; attachment-hearts:Attachment hearts::pulse; habit-tracker:Habit tracker::bob; motivation-fuel:Motivation fuel gauge::bob; discipline-streak:Streak flame::pulse; self-care:Self-care kit::bob; exam-f:Failed exam::tilt; sleep-debt:Sleep debt::bob; screen-time:Screen time::bob; notif-badge:Notification badge::bounce; brain-loading:Brain loading::bob; tomorrow-calendar:"Tomorrow" calendar::bob; money-burn:Burning money::bob; boundary-wall:Boundary wall::bob; therapy-couch:Therapy couch::bob; inner-critic:Inner critic::shake; comfort-zone:Comfort zone::pulse; confidence-meter:Confidence meter::pulse; cortisol-alarm:Cortisol alarm::shake');
  // v1.6: car radio (hand-drawn, turns down), more vehicles, outdoor bits
  addProps('v16', 'car-radio:Car radio (volume knob)::bob; scooter:Scooter:1f6f5:bob; motorbike:Motorbike:1f3cd:bob; umbrella:Umbrella:2602:swing; traffic-light:Traffic light:1f6a6:blink; bus-stop-sign:Bus stop sign:1f68f:bob; beach-umbrella:Beach umbrella:1f3d6:bob; sunglasses:Sunglasses:1f576:bob');
  // legacy (hand-drawn in scenes.js) props get a category + label here too
  S.PROPS.forEach(([id, label]) => { if (!P[id]) P[id] = { label, e: '', anim: 'legacy', cat: 'mind' }; });
  // hand-drawn custom props implemented in this file
  const CUSTOM = new Set(['pencil', 'sketchbook', 'paintbrush', 'pen', 'easel', 'paint-canvas', 'open-book', 'code-window', 'dumbbell', 'yoga-mat', 'water-bottle', 'glass-water', 'plate', 'money-jar', 'piggy', 'calculator', 'watering-can', 'trash', 'soda',
    'social-battery', 'anxiety-meter', 'overthink-yarn', 'dopamine-meter', 'burnout-match', 'people-pleaser', 'red-flag', 'green-flag', 'attachment-hearts', 'habit-tracker', 'motivation-fuel', 'discipline-streak', 'self-care', 'exam-f', 'sleep-debt', 'screen-time', 'notif-badge', 'brain-loading', 'tomorrow-calendar', 'money-burn', 'boundary-wall', 'therapy-couch', 'inner-critic', 'comfort-zone', 'confidence-meter', 'cortisol-alarm', 'car-radio']);
  Object.keys(P).forEach((id) => { if (!P[id].e && P[id].anim !== 'legacy' && !CUSTOM.has(id)) delete P[id]; });
  Object.keys(P).forEach((id) => { if (!S.PROP_IDS.includes(id)) { S.PROPS.push([id, P[id].label]); S.PROP_IDS.push(id); } });

  // ======================= settings =======================
  const NEW_SETTINGS = [['art-studio', 'Art studio'], ['gym', 'Gym'], ['kitchen', 'Kitchen'], ['library', 'Library'], ['bathroom', 'Bathroom'], ['bus', 'Bus / commute'],
    ['stage', 'Stage'], ['shop', 'Shop'], ['living-room', 'Living room'],
    // v1.6
    ['hallway', 'Hallway / corridor'], ['car-interior', 'Car (inside, driving)'], ['beach', 'Beach'], ['rooftop-night', 'City rooftop · night'], ['bus-stop', 'Bus stop'], ['supermarket', 'Supermarket aisle'],
    ['mountain-trail', 'Mountain trail'], ['rainy-street', 'Rainy city street'], ['school-yard', 'School yard'], ['train-platform', 'Train / subway platform'],
    ['keyword-card', 'Keyword icon card']];
  NEW_SETTINGS.forEach(([id, l]) => { if (!S.SET_IDS.includes(id)) { S.SETTINGS.push([id, l]); S.SET_IDS.push(id); } });
  const DESKY = { office: 1352, classroom: 1375, cafe: 1392, library: 1380, 'art-studio': 1380, kitchen: 1360, shop: 1370 };

  // ======================= actions =======================
  // base: desk (seated behind a table) | stand | sit | floor | move | two | lie.  hold: items in hands.  work: animated object the action works on.
  const A = {};
  const act = (id, label, base, ok, extra, arms) => { A[id] = Object.assign({ id, label, base, ok, hold: [], work: '', props: [], emo: 'neutral' }, extra || {}); A[id].arms = arms || null; };
  const swing = (t, f) => Math.sin(t * f);
  // --- art / study / work
  act('drawing', 'Drawing / sketching', 'desk', ['art-studio', 'bedroom-day', 'cafe', 'library', 'classroom', 'office', 'park'], { hold: [{ item: 'pencil', hand: 'R' }], work: 'sketchbook', props: [], emo: 'happy' },
    (sp, t) => { sp.armL = { x: -80, y: -40, bend: -1 }; sp.look = { x: 0.55, y: 0.85 }; sp.headTilt = 0.1; sp.headDy = 8; sp.mouth = 'smile'; });
  act('painting', 'Painting', 'stand', ['art-studio', 'park', 'bedroom-day'], { hold: [{ item: 'paintbrush', hand: 'R' }, { item: 'palette', hand: 'L', size: 120, dy: -10 }], work: 'easel', emo: 'happy' },
    (sp, t) => { sp.armL = { x: -120, y: -96, bend: -1 }; sp.look = { x: 0.7, y: -0.1 }; sp.headTilt = 0.08; sp.mouth = 'smile'; });
  act('writing', 'Writing / journaling', 'desk', ['bedroom-day', 'office', 'library', 'cafe', 'classroom'], { hold: [{ item: 'pen', hand: 'R' }], work: 'notepad', emo: 'calm' },
    (sp) => { sp.armL = { x: -80, y: -40, bend: -1 }; sp.look = { x: 0.5, y: 0.85 }; sp.headDy = 8; });
  act('reading', 'Reading', 'stand', ['library', 'bedroom-day', 'living-room', 'park', 'cafe', 'bus'], { hold: [{ item: 'open-book', hand: 'both' }], emo: 'calm' },
    (sp, t) => { sp.armL = { x: -46, y: -118, bend: -1 }; sp.armR = { x: 46, y: -118, bend: 1 }; sp.handsFront = true; sp.look = { x: 0, y: 0.85 }; sp.headDy = 10; sp.headTilt = Math.sin(t * 0.7) * 0.04; });
  act('studying', 'Studying', 'desk', ['library', 'classroom', 'bedroom-day', 'cafe'], { hold: [{ item: 'pencil', hand: 'R' }], work: 'study', props: ['books'], emo: 'neutral' },
    (sp, t) => { sp.armL = { x: -40, y: -150, el: { x: -110, y: -60 }, bend: -1 }; sp.look = { x: 0.3, y: 0.8 }; sp.headTilt = -0.12; sp.headDy = 6; sp.mouth = 'hmm'; });
  act('typing', 'Typing', 'desk', ['office', 'cafe', 'library', 'bedroom-day', 'living-room'], { work: 'laptop', emo: 'neutral' }, (sp, t) => typingArms(sp, t));
  act('coding', 'Coding', 'desk', ['office', 'bedroom-night', 'cafe', 'library'], { work: 'laptop', props: ['code-window'], emo: 'neutral' }, (sp, t) => { typingArms(sp, t); sp.mouth = 'hmm'; });
  act('working-laptop', 'Working at laptop', 'desk', ['office', 'cafe', 'library', 'living-room'], { work: 'laptop', emo: 'neutral' }, (sp, t) => typingArms(sp, t));
  act('presenting', 'Presenting', 'stand', ['office', 'classroom', 'stage'], { work: 'board', emo: 'happy' },
    (sp, t) => { sp.armL = { x: -210, y: -250 + swing(t, 1.4) * 14, bend: -1 }; sp.armR = { x: 110, y: -60 - Math.max(0, swing(t, 2.6)) * 60, bend: 1 }; sp.look = { x: -0.6, y: -0.2 }; sp.mouth = 'talk'; sp.headTilt = -0.06; });
  // --- food / drink / home
  act('cooking', 'Cooking', 'stand', ['kitchen'], { hold: [{ item: 'frying-pan', hand: 'R', size: 150, dx: 70, dy: -10 }], work: 'stove', props: [], emo: 'happy' },
    (sp, t) => { const k = Math.max(0, swing(t, 5)) * 24; sp.armR = { x: 120, y: -110 - k, bend: 1 }; sp.armL = { x: -70, y: -120, bend: -1 }; sp.look = { x: 0.5, y: 0.6 }; sp.mouth = 'smile'; });
  act('eating', 'Eating', 'desk', ['kitchen', 'cafe', 'living-room'], { hold: [{ item: 'fork', hand: 'R' }], work: 'plate', emo: 'happy' },
    (sp, t) => { const k = ease((Math.sin(t * 2.4) + 1) / 2); sp.armR = { x: 60 - k * 40, y: -40 - k * 196, bend: 1 }; sp.armL = { x: -80, y: -40, bend: -1 }; sp.mouth = k > 0.8 ? 'o' : 'smile'; sp.look = { x: 0.2, y: 0.5 - k * 0.5 }; });
  act('drinking-water', 'Drinking water', 'stand', ['kitchen', 'gym', 'park', 'office', 'bedroom-day'], { hold: [{ item: 'glass-water', hand: 'R' }], props: ['water-drop'], emo: 'calm' },
    (sp, t) => { const k = ease((Math.sin(t * 1.6) + 1) / 2); sp.armR = { x: 70 - k * 44, y: -110 - k * 128, bend: 1 }; sp.headTilt = -k * 0.18; sp.mouth = k > 0.7 ? 'o' : 'smile'; sp.look = { x: 0.2, y: -0.2 * k }; });
  act('drinking-coffee', 'Drinking coffee / tea', 'stand', ['cafe', 'kitchen', 'office', 'bedroom-day'], { hold: [{ item: 'coffee-cup', hand: 'R' }], emo: 'calm' },
    (sp, t) => { const k = ease((Math.sin(t * 1.3) + 1) / 2); sp.armR = { x: 64 - k * 40, y: -110 - k * 120, bend: 1 }; sp.armL = { x: -40, y: -110, bend: -1 }; sp.handsFront = true; sp.mouth = 'smile'; });
  act('cleaning', 'Cleaning', 'stand', ['living-room', 'kitchen', 'bedroom-day'], { hold: [{ item: 'broom', hand: 'both', size: 300 }], props: ['sparkles'], emo: 'happy' },
    (sp, t) => { const k = swing(t, 3.2); sp.armL = { x: -30 + k * 60, y: -140, bend: -1 }; sp.armR = { x: 30 + k * 60, y: -40, bend: 1 }; sp.tilt = k * 0.05; sp.look = { x: k * 0.4, y: 0.8 }; sp.handsFront = true; });
  act('gardening', 'Gardening', 'stand', ['park', 'bedroom-day'], { hold: [{ item: 'watering-can', hand: 'R' }], work: 'plants', props: ['sun'], emo: 'happy' },
    (sp, t) => { sp.armR = { x: 150, y: -90, bend: 1 }; sp.armL = { x: -80, y: -40, bend: -1 }; sp.look = { x: 0.7, y: 0.7 }; sp.headTilt = 0.12; sp.mouth = 'smile'; });
  act('shopping', 'Shopping', 'move', ['shop', 'street'], { hold: [{ item: 'shopping-bags', hand: 'R', size: 150, dy: 60 }, { item: 'shopping-bags', hand: 'L', size: 130, dy: 60 }], props: ['price-tag'], emo: 'happy' },
    (sp) => { sp.armL = { x: -100, y: 20, bend: -1 }; sp.armR = { x: 100, y: 20, bend: 1 }; });
  act('showering', 'Showering', 'stand', ['bathroom'], { work: 'shower', props: ['soap'], emo: 'calm' },
    (sp, t) => { const k = swing(t, 6) * 16; sp.armL = { x: -60 + k, y: -330, bend: -1 }; sp.armR = { x: 60 - k, y: -330, bend: 1 }; sp.handsFront = true; sp.mouth = 'smile'; });
  // --- body / fitness / rest
  act('exercising', 'Exercising (jumping jacks)', 'stand', ['gym', 'park', 'living-room'], { props: ['stopwatch'], emo: 'happy' },
    (sp, t) => { const k = (Math.sin(t * 7) + 1) / 2; sp.armL = { x: -100 - 100 * k, y: -20 - 300 * k, bend: -1 }; sp.armR = { x: 100 + 100 * k, y: -20 - 300 * k, bend: 1 }; sp.legL = { x: -40 - 60 * k, y: 190, bend: 1 }; sp.legR = { x: 40 + 60 * k, y: 190, bend: -1 }; sp.hipY = -Math.abs(Math.sin(t * 7)) * 24; sp.mouth = 'grin'; });
  act('lifting', 'Lifting weights', 'stand', ['gym'], { hold: [{ item: 'dumbbell', hand: 'R' }, { item: 'dumbbell', hand: 'L' }], props: ['biceps'], emo: 'happy' },
    (sp, t) => { const k = ease((Math.sin(t * 3) + 1) / 2); sp.armL = { x: -96, y: -20 - k * 150, el: { x: -92, y: -60 }, bend: -1 }; sp.armR = { x: 96, y: -20 - k * 150, el: { x: 92, y: -60 }, bend: 1 }; sp.mouth = k > 0.6 ? 'grit' : 'flat'; sp.hipY = 4; });
  act('yoga', 'Yoga', 'floor', ['gym', 'park', 'living-room', 'abstract-mind-space'], { work: 'yoga-mat', emo: 'calm' },
    (sp, t) => { sp.lotus = false; sp.armL = { x: -14, y: -410, bend: -1 }; sp.armR = { x: 14, y: -410, bend: 1 }; sp.legR = { x: -6, y: 60, bend: 1 }; sp.legL = { x: -30, y: 190, bend: 1 }; sp.tilt = Math.sin(t * 0.8) * 0.02; sp.mouth = 'smile'; sp.eyesClosed = true; });
  act('stretching', 'Stretching', 'stand', ['gym', 'park', 'bedroom-day', 'living-room', 'office'], { emo: 'calm' },
    (sp, t) => { const k = Math.sin(t * 1.2); sp.tilt = k * 0.16; sp.armL = { x: -40 + k * 60, y: -410, bend: -1 }; sp.armR = { x: 40 + k * 60, y: -410, bend: 1 }; sp.mouth = 'smile'; });
  act('waking-up', 'Waking up', 'stand', ['bedroom-day'], { props: ['alarm', 'sun'], emo: 'tired' },
    (sp, t) => { const k = ease((Math.sin(t * 1.1) + 1) / 2); sp.armL = { x: -80 - 40 * k, y: -200 - 190 * k, bend: -1 }; sp.armR = { x: 80 + 40 * k, y: -200 - 190 * k, bend: 1 }; sp.mouth = k > 0.5 ? 'o' : 'flat'; sp.headTilt = -0.1 * k; });
  // --- music / fun
  act('dancing', 'Dancing', 'stand', ['stage', 'living-room', 'bedroom-day', 'park'], { props: ['music-notes'], emo: 'happy' },
    (sp, t) => { const k = Math.sin(t * 5); const b = Math.abs(Math.sin(t * 5)); sp.tilt = k * 0.1; sp.hipY = -b * 20; sp.armL = { x: -150, y: k > 0 ? -330 : -60, bend: -1 }; sp.armR = { x: 150, y: k > 0 ? -60 : -330, bend: 1 }; sp.legL = { x: -60 + k * 20, y: 190 - (k > 0 ? 30 : 0), bend: 1 }; sp.legR = { x: 60 + k * 20, y: 190 - (k < 0 ? 30 : 0), bend: -1 }; sp.mouth = 'grin'; });
  act('singing', 'Singing', 'stand', ['stage', 'bedroom-day', 'living-room'], { hold: [{ item: 'microphone', hand: 'R', size: 110, rot: -0.5 }], props: ['music-notes'], emo: 'happy' },
    (sp, t) => { sp.armR = { x: 34, y: -226, bend: 1 }; sp.armL = { x: -170, y: -240 + swing(t, 2) * 30, bend: -1 }; sp.mouth = 'o'; sp.headTilt = -0.1 + swing(t, 1.5) * 0.06; sp.eyesClosed = true; });
  act('playing-guitar', 'Playing guitar', 'stand', ['stage', 'bedroom-day', 'park', 'living-room'], { hold: [{ item: 'guitar', hand: 'body', size: 300 }], props: ['music-notes'], emo: 'happy' },
    (sp, t) => { const k = swing(t, 8) * 16; sp.armR = { x: 36, y: -64 + k, bend: 1 }; sp.armL = { x: -150, y: -150, bend: -1 }; sp.handsFront = true; sp.headTilt = swing(t, 2.5) * 0.08; sp.mouth = 'smile'; });
  act('gaming', 'Gaming', 'sit', ['living-room', 'bedroom-night', 'bedroom-day'], { hold: [{ item: 'gamepad', hand: 'both', size: 130 }], work: 'tv', emo: 'surprised' },
    (sp, t) => { const k = Math.sin(t * 9) * 5; sp.armL = { x: -36, y: -110 + k, bend: -1 }; sp.armR = { x: 36, y: -110 - k, bend: 1 }; sp.handsFront = true; sp.look = { x: 0.7, y: 0 }; sp.tilt = swing(t, 1.4) * 0.06; });
  act('photographing', 'Taking photos', 'stand', ['street', 'park', 'stage'], { hold: [{ item: 'camera', hand: 'both', size: 130 }], emo: 'happy' },
    (sp, t) => { sp.armL = { x: -46, y: -262, bend: -1 }; sp.armR = { x: 46, y: -262, bend: 1 }; sp.handsFront = true; sp.cameraFace = true; });
  act('listening-music', 'Listening to music', 'stand', ['bedroom-day', 'bus', 'street', 'park', 'living-room'], { props: ['music-notes'], emo: 'happy', headphones: true },
    (sp, t) => { sp.headTilt = swing(t, 4) * 0.1; sp.hipY = -Math.abs(swing(t, 4)) * 8; sp.armR = { x: 70, y: -290, bend: 1 }; sp.eyesClosed = true; sp.mouth = 'smile'; });
  // --- money
  act('paying', 'Paying', 'stand', ['shop', 'cafe'], { hold: [{ item: 'credit-card', hand: 'R', size: 110 }], props: ['receipt'], emo: 'neutral' },
    (sp, t) => { sp.armR = { x: 190, y: -150 + swing(t, 2) * 8, bend: 1 }; sp.armL = { x: -80, y: -20, bend: -1 }; sp.look = { x: 0.8, y: 0 }; });
  act('counting-money', 'Counting money', 'desk', ['office', 'bedroom-day', 'shop', 'kitchen'], { hold: [{ item: 'banknote', hand: 'L', size: 120 }, { item: 'banknote', hand: 'R', size: 100 }], work: 'cash-stack', emo: 'happy' },
    (sp, t) => { const k = Math.max(0, swing(t, 6)) * 30; sp.armL = { x: -40, y: -110, bend: -1 }; sp.armR = { x: 60 + k, y: -100 - k * 0.6, bend: 1 }; sp.handsFront = true; sp.look = { x: 0, y: 0.7 }; sp.mouth = 'smile'; });
  act('saving-money', 'Saving money (jar)', 'desk', ['bedroom-day', 'kitchen', 'office', 'living-room'], { hold: [{ item: 'coin', hand: 'R', size: 70 }], work: 'money-jar', emo: 'happy' },
    (sp) => { sp.armL = { x: -80, y: -40, bend: -1 }; sp.look = { x: 0.6, y: 0.6 }; sp.mouth = 'smile'; });
  // --- phone / social
  act('talking-phone', 'Talking on the phone', 'stand', ['street', 'office', 'living-room', 'bedroom-day'], { hold: [{ item: 'phone-ear', hand: 'R' }], props: ['speech-bubbles'], emo: 'neutral' },
    (sp, t) => { sp.armR = { x: 70, y: -300, el: { x: 128, y: -170 }, bend: 1 }; sp.armL = { x: -120, y: -110 - Math.max(0, swing(t, 2)) * 60, bend: -1 }; sp.mouth = 'talk'; sp.headTilt = 0.1; });
  act('texting', 'Texting', 'stand', ['street', 'bus', 'bedroom-day', 'living-room', 'cafe'], { hold: [{ item: 'phone-hands', hand: 'both' }], props: ['speech-bubbles'], emo: 'neutral' },
    (sp, t) => { const k = Math.max(0, Math.sin(t * 9)) * 6; sp.armL = { x: -24, y: -150, bend: -1 }; sp.armR = { x: 24, y: -150 - k, bend: 1 }; sp.handsFront = true; sp.look = { x: 0, y: 0.8 }; sp.headDy = 10; });
  act('hugging', 'Hugging', 'two', ['park', 'living-room', 'street', 'void', 'cafe'], { props: ['heart'], emo: 'happy' }, null);
  act('arguing', 'Arguing', 'two', ['living-room', 'office', 'street', 'kitchen', 'void'], { props: ['anger', 'speech-bubbles'], emo: 'angry' }, null);
  // v1.6: one arm up and waving from the elbow, the other relaxed; works solo, in pairs (mirrored) and with an extra behind (scene.behind)
  function waveArms(sp, t, o) {
    const m = o && (o.mirror || o.pair === -1) ? -1 : 1; const a = -Math.PI / 2 + Math.sin(t * 9) * 0.55; const el = { x: m * 148, y: -214 };
    const hand = { x: el.x + Math.cos(a) * 96 * m, y: el.y + Math.sin(a) * 96, el, bend: m };
    if (m > 0) { sp.armR = hand; sp.armL = { x: -92, y: -6, bend: -1 }; } else { sp.armL = hand; sp.armR = { x: 92, y: -6, bend: 1 }; }
    sp.headTilt = m * (0.06 + Math.sin(t * 4.5) * 0.03); sp.tilt = -m * 0.02; sp.mouth = 'grin'; sp.look = { x: m * 0.3, y: 0 };
  }
  act('waving', 'Waving (one arm)', 'stand', ['street', 'park', 'void', 'stage', 'classroom', 'hallway', 'school-yard', 'beach', 'bus-stop', 'train-platform', 'supermarket'], { emo: 'happy', multi: true, free2: true }, waveArms);
  act('walking-toward', 'Two people walking toward each other', 'two', ['hallway', 'street', 'park', 'school-yard', 'supermarket', 'train-platform', 'beach', 'office'], { emo: 'awkward', multi: true, free2: true }, null);
  act('high-five', 'High-five', 'two', ['school-yard', 'park', 'street', 'office', 'gym', 'hallway', 'void'], { emo: 'happy', multi: true, free2: true }, null);
  act('driving', 'Driving (hands on the wheel)', 'drive', ['car-interior'], { emo: 'neutral' },
    (sp, t) => { sp.seated = true; sp.facing = 1; sp.tilt = Math.sin(t * 1.3) * 0.025; sp.headTilt = Math.sin(t * 0.9) * 0.03; sp.look = { x: 0.85, y: 0 }; sp.legL = { x: 120, y: 175, bend: -1 }; sp.legR = { x: 150, y: 175, bend: -1 }; });
  act('cycling', 'Riding a bicycle', 'move', ['street', 'park', 'beach', 'mountain-trail', 'school-yard', 'rainy-street'], { emo: 'happy' }, (sp, t, o) => {
    const f = 1; const a = t * 7.5; sp.facing = f; sp.tilt = 0.12; sp.hipY = 0; sp.look = { x: 0.9, y: 0 };
    sp.legL = { x: 10 + Math.cos(a) * 40, y: 128 + Math.sin(a) * 40, bend: -1 }; sp.legR = { x: 10 + Math.cos(a + Math.PI) * 40, y: 128 + Math.sin(a + Math.PI) * 40, bend: -1 };
    sp.armR = { x: 150, y: -96, bend: 1 }; sp.armL = { x: 136, y: -100, bend: 1 }; sp.mouth = 'grin'; });
  act('pointing', 'Pointing', 'stand', ['void', 'street', 'classroom', 'office', 'hallway', 'park', 'supermarket'], { emo: 'surprised' },
    (sp, t) => { sp.armR = { x: 236, y: -236 + Math.sin(t * 3) * 6, el: { x: 150, y: -210 }, bend: 1 }; sp.armL = { x: -92, y: -6, bend: -1 }; sp.look = { x: 0.9, y: -0.2 }; sp.headTilt = 0.06; });
  act('shrugging', 'Shrugging', 'stand', ['void', 'office', 'street', 'living-room', 'classroom', 'hallway'], { emo: 'bored' },
    (sp, t) => { const k = Math.abs(Math.sin(t * 2.2)) * 12; sp.armL = { x: -168, y: -178 - k, el: { x: -126, y: -96 }, bend: -1 }; sp.armR = { x: 168, y: -178 - k, el: { x: 126, y: -96 }, bend: 1 }; sp.headTilt = 0.16; sp.headDy = 6 - k * 0.4; sp.mouth = 'hmm'; });
  act('arms-crossed', 'Arms crossed', 'stand', ['void', 'office', 'living-room', 'street', 'hallway', 'school-yard'], { emo: 'side-eye' },
    (sp, t) => { sp.armL = { x: 54, y: -112, el: { x: -56, y: -86 }, bend: -1 }; sp.armR = { x: -50, y: -126, el: { x: 60, y: -100 }, bend: 1 }; sp.handsFront = true; sp.tilt = Math.sin(t * 1.1) * 0.015; sp.headTilt = -0.08; });
  act('hiding-face', 'Hiding face', 'stand', ['void', 'living-room', 'bedroom-day', 'office', 'hallway', 'street'], { emo: 'awkward' },
    (sp, t) => { const peek = Math.sin(t * 1.6) > 0.6 ? 18 : 0; sp.armL = { x: -40 - peek, y: -282, bend: -1 }; sp.armR = { x: 40, y: -282, bend: 1 }; sp.handsFront = true; sp.headDy = 10; sp.tilt = Math.sin(t * 6) * 0.012; });
  act('jumping', 'Jumping', 'stand', ['park', 'beach', 'school-yard', 'void', 'street', 'mountain-trail'], { emo: 'happy' },
    (sp, t) => { const j = Math.abs(Math.sin(t * 3.6)); sp.hipY = -j * 150; sp.armL = { x: -170, y: -300 - j * 30, bend: -1 }; sp.armR = { x: 170, y: -300 - j * 30, bend: 1 }; sp.legL = { x: -60, y: 190 - j * 70, bend: 1 }; sp.legR = { x: 60, y: 190 - j * 70, bend: -1 }; sp.mouth = 'grin'; });
  act('tripping', 'Tripping / falling', 'stand', ['street', 'hallway', 'school-yard', 'park', 'supermarket', 'void'], { emo: 'shocked' },
    (sp, t) => { const c = (t % 2.4) / 2.4; const k = c < 0.6 ? c / 0.6 : 1; const f = 1; sp.facing = f; sp.tilt = f * (0.15 + k * 0.55); sp.hipY = k * 40;
      sp.armL = { x: 60 + Math.sin(t * 16) * 50, y: -300, bend: 1 }; sp.armR = { x: 190 + Math.sin(t * 14) * 40, y: -250, bend: 1 }; sp.legL = { x: -120 * f, y: 120, bend: 1 }; sp.legR = { x: 40 * f, y: 190, bend: -1 }; sp.look = { x: 0.6, y: 0.6 }; });
  act('sneaking', 'Sneaking / tiptoeing', 'move', ['hallway', 'living-room', 'office', 'void', 'supermarket', 'street'], { emo: 'nervous' }, (sp, t, o) => {
    const f = o && o.facing ? o.facing : 1; const p = t * 3; sp.facing = f; sp.hipY = 40 + Math.abs(Math.sin(p)) * -10; sp.tilt = 0.08 * f;
    sp.legL = { x: (Math.sin(p) * 46 - 10) * f, y: 186 - Math.max(0, Math.cos(p)) * 30, bend: -f }; sp.legR = { x: (Math.sin(p + Math.PI) * 46 - 10) * f, y: 186 - Math.max(0, Math.cos(p + Math.PI)) * 30, bend: -f };
    sp.armL = { x: 70 * f, y: -200, bend: f }; sp.armR = { x: 110 * f, y: -230, bend: f }; sp.handsFront = true; sp.look = { x: -0.8 * f, y: 0 }; });
  act('sitting-couch', 'Sitting on the couch', 'sit', ['living-room'], { emo: 'calm' },
    (sp, t) => { sp.tilt = -0.04; sp.armL = { x: -150, y: -70, bend: -1 }; sp.armR = { x: 150, y: -70, bend: 1 }; sp.headTilt = Math.sin(t * 0.7) * 0.05; sp.legL = { x: -80, y: 160, bend: -1 }; sp.legR = { x: 80, y: 160, bend: 1 }; });
  act('checking-watch', 'Checking the time (waiting)', 'stand', ['bus-stop', 'train-platform', 'street', 'office', 'hallway', 'rainy-street'], { emo: 'anxious' },
    (sp, t) => { sp.armL = { x: 30, y: -150, el: { x: -60, y: -80 }, bend: -1 }; sp.armR = { x: 92, y: -6, bend: 1 }; sp.handsFront = true; sp.look = { x: -0.1, y: 0.75 }; sp.headDy = 8; sp.tilt = Math.sin(t * 2.4) * 0.02; sp.watch = true; });
  act('holding-umbrella', 'Holding an umbrella', 'stand', ['rainy-street', 'street', 'bus-stop', 'park', 'beach', 'school-yard'], { emo: 'neutral', umbrella: true },
    (sp, t) => { sp.armR = { x: 40, y: -200 + Math.sin(t * 2) * 4, el: { x: 120, y: -120 }, bend: 1 }; sp.armL = { x: -92, y: -6, bend: -1 }; sp.handsFront = true; sp.look = { x: 0.2, y: -0.3 }; });
  act('crying', 'Crying', 'sit', ['bedroom-night', 'bedroom-day', 'void', 'living-room'], { props: ['cloud'], emo: 'sad' },
    (sp, t) => { sp.armL = { x: -34, y: -262, bend: -1 }; sp.armR = { x: 34, y: -262, bend: 1 }; sp.handsFront = true; sp.headDy = 14; sp.tilt = swing(t, 9) * 0.015; sp.crying = true; });
  act('laughing', 'Laughing', 'stand', ['living-room', 'cafe', 'park', 'stage', 'void'], { props: ['laugh'], emo: 'happy' },
    (sp, t) => { const k = Math.sin(t * 14); sp.tilt = k * 0.03; sp.headTilt = -0.2 + k * 0.05; sp.armL = { x: -40, y: -40, bend: -1 }; sp.armR = { x: 40, y: -40, bend: 1 }; sp.handsFront = true; sp.mouth = 'grin'; sp.eyesClosed = true; });
  act('praying', 'Praying / gratitude', 'stand', ['void', 'abstract-mind-space', 'park', 'bedroom-day'], { props: ['sparkles'], emo: 'calm' },
    (sp, t) => { sp.armL = { x: -6, y: -170, el: { x: -80, y: -100 }, bend: -1 }; sp.armR = { x: 6, y: -170, el: { x: 80, y: -100 }, bend: 1 }; sp.handsFront = true; sp.eyesClosed = true; sp.mouth = 'smile'; sp.glow = true; });
  act('commuting', 'Commuting', 'sit', ['bus'], { hold: [{ item: 'phone-hands', hand: 'R' }], emo: 'tired' },
    (sp, t) => { sp.armL = { x: -60, y: -330, bend: -1 }; sp.armR = { x: 30, y: -140, bend: 1 }; sp.look = { x: 0.1, y: 0.7 }; sp.tilt = Math.sin(t * 1.7) * 0.02; });
  function typingArms(sp, t) { const k = Math.sin(t * 18) * 5; sp.armL = { x: -60, y: -46 + k, bend: -1 }; sp.armR = { x: 60, y: -46 - k, bend: 1 }; sp.look = { x: 0.1, y: 0.6 }; }
  // legacy poses as actions (keep their scenes.js implementations)
  const LEG = { 'lying-awake': ['bedroom-night'], 'sitting-head-in-hands': ['bedroom-day', 'void', 'office'], walking: ['park', 'street'], 'standing-thinking': ['void', 'abstract-mind-space'], talking: ['void', 'classroom'], celebrating: ['park', 'void'], stressed: ['void', 'office'], 'scrolling-phone': ['phone-screen', 'bedroom-night'], sleeping: ['bedroom-night'], meditating: ['abstract-mind-space', 'park'], running: ['park', 'street'] };
  Object.entries(LEG).forEach(([id, ok]) => { if (!A[id]) A[id] = { id, label: (S.POSES.find((p) => p[0] === id) || [id, id])[1], base: 'legacy', ok, hold: [], work: '', props: [], emo: 'neutral', arms: null }; });
  Object.keys(A).forEach((id) => { if (!S.POSE_IDS.includes(id)) { S.POSES.push([id, A[id].label]); S.POSE_IDS.push(id); } });

  // ======================= lexicon (keyword → visual) =======================
  // "word,word | a=action | p=prop,prop | s=setting | w=weight"   (words are base forms; the lemmatizer handles -s/-ing/-ed/irregulars)
  const LEX_SRC = `
wave,waving,waved,wave back,waved back|a=waving|p=wave-hand|w=3.2
steps away,walking toward,walk toward,coming toward,someone you know,bump into,run into|a=walking-toward|s=hallway|w=3.3
hallway,corridor,hall,locker,lockers|s=hallway|w=2.8
drive,driving,drove,driver,steering,steering wheel,windshield,dashboard,car music,car radio|a=driving|s=car-interior|w=3.1
radio,volume,turn down,turned down,turn the music down|p=car-radio|s=car-interior|w=2.9
car|a=driving|p=car|s=car-interior|w=2.6
typed,deleted,backspace,delete,paragraph|a=texting|p=speech-bubbles|w=2.7
point,pointing,pointed|a=pointing|w=2.4
shrug,shrugging,shrugged,whatever,idk|a=shrugging|w=2.6
crossed arms,arms crossed,cross my arms|a=arms-crossed|w=3
hide,hiding,hid,hide my face|a=hiding-face|w=2.6
high five,high-five,high fived|a=high-five|w=3.2
bike,bicycle,cycling,cycle,biking,ride a bike|a=cycling|p=bicycle|s=street|w=3
jump,jumping,jumped|a=jumping|w=2.6
trip,tripping,tripped,stumble,stumbled,fall over,fell over|a=tripping|w=2.9
sneak,sneaking,sneaky,tiptoe,tiptoeing,snuck|a=sneaking|w=2.9
couch,sofa,netflix|a=sitting-couch|s=living-room|w=2.7
waiting,late,running late,checking the time|a=checking-watch|w=2.3
umbrella|a=holding-umbrella|p=umbrella|s=rainy-street|w=3
beach,sand,ocean,seaside,vacation|s=beach|p=beach-umbrella|w=2.8
rooftop,roof,skyline|s=rooftop-night|w=2.8
bus stop,the bus|s=bus-stop|p=bus|w=3
supermarket,grocery,groceries,aisle,checkout|s=supermarket|w=2.8
trail,mountain,summit,hike up|s=mountain-trail|w=2.6
schoolyard,school yard,playground,recess|s=school-yard|w=2.8
platform,subway,metro,train station|s=train-platform|p=train|w=2.8
scooter|p=scooter|w=2.5
motorbike,motorcycle|p=motorbike|w=2.5
social battery,introvert,introverts,introverted,socialising,socializing,social event,small talk|p=social-battery|w=3.2
anxiety,anxious,worry,worried,worrying,nervous,panic,panicking|p=anxiety-meter|w=2.6
overthink,overthinking,overthinker,overthinkers,ruminate,ruminating,rumination,spiral,spiralling,spiraling,replaying|p=overthink-yarn|w=3.2
dopamine,reward system,doomscroll,doomscrolling,instant gratification,cheap dopamine|p=dopamine-meter|w=3.2
burnout,burned out,burnt out,drained|p=burnout-match|w=3.2
people pleaser,people pleasing,people-pleasing,pleaser,approval|p=people-pleaser|w=3.2
red flag,red flags,toxic|p=red-flag|w=3.2
green flag,green flags|p=green-flag|w=3.2
attachment,attachment style,avoidant,clingy,anxiously attached|p=attachment-hearts|w=3.2
habit,habits,routine,routines,tracker|p=habit-tracker|w=2.6
motivation,motivated,unmotivated|p=motivation-fuel|w=2.8
discipline,disciplined,consistency,consistent,streak|p=discipline-streak|w=2.8
self care,self-care,selfcare,recharge|p=self-care|w=2.8
exam,exams,test,tests,grade,grades,fail,failed,failing|a=studying|p=exam-f,books|s=library|w=2.6
sleep debt,insomnia,sleepless|p=sleep-debt|w=2.8
screen time,screentime,phone addiction,addicted,addiction|p=screen-time|w=3
notification,notifications,unread,texts,texting|p=notif-badge|w=2.6
procrastinate,procrastinating,procrastination,procrastinator,tomorrow,putting off|p=tomorrow-calendar|w=3.2
impulse buy,impulse buying,spending,broke,online shopping|p=money-burn|w=2.8
boundary,boundaries|p=boundary-wall|w=3.2
therapy,therapist,therapists,counsellor,counselor|p=therapy-couch|w=3
inner critic,self-talk,negative self-talk,imposter,impostor|p=inner-critic|w=3
comfort zone|p=comfort-zone|w=3.2
confidence,confident,insecure,insecurity,self-esteem|p=confidence-meter|w=2.8
cortisol,stress response,fight or flight,amygdala|p=cortisol-alarm|w=2.8
sketch,draw,doodle,drawing,sketchbook,sketching,illustrate,illustration,sketchpad,artwork,drawer|a=drawing|p=pencil,sketchbook|s=art-studio|w=3
pencil|a=drawing|p=pencil|w=2.5
art,artist,creative,creativity|a=painting|p=palette|s=art-studio|w=2
paint,painting,painter,brush,canvas,watercolor,watercolour|a=painting|p=paintbrush,palette,easel|s=art-studio|w=3
color,colour,crayon|p=crayon,palette|w=1.5
write,writing,writer,journal,journaling,diary,notes,note,essay,letter,pen|a=writing|p=pen,memo|w=2.5
read,reading,reader,book,novel,page,chapter,library|a=reading|p=open-book,books|s=library|w=2.5
study,studying,student,exam,test,homework,learn,learning,revise,revision,grade,course,class,lecture,school,college,university|a=studying|p=books,grad-cap|s=library|w=2.5
teach,teacher,lesson,classroom|a=talking|p=books|s=classroom|w=2
type,typing,keyboard|a=typing|p=laptop|s=office|w=2.5
code,coding,program,programming,developer,software,app,website,computer,laptop,tech|a=coding|p=laptop,code-window|s=office|w=2.5
work,job,career,office,boss,meeting,email,inbox,deadline,project,task,productive,productivity,business|a=working-laptop|p=briefcase,email|s=office|w=2
present,presentation,pitch,speech,audience,slide|a=presenting|p=bar-chart|s=stage|w=2.5
cook,cooking,recipe,chef,kitchen,meal,dinner,lunch,breakfast,fry|a=cooking|p=frying-pan,pot|s=kitchen|w=2.5
eat,eating,food,snack,hungry,diet,nutrition|a=eating|p=plate,fork-knife|s=kitchen|w=2.5
water,hydrate,hydration,thirsty,drink|a=drinking-water|p=glass-water,water-drop|w=2.5
coffee,caffeine,espresso,latte,tea|a=drinking-coffee|p=coffee|s=cafe|w=2.5
exercise,workout,fitness,training,cardio,sweat|a=exercising|p=sneaker,stopwatch|s=gym|w=2.5
gym,lift,weight,weights,dumbbell,strength,muscle,strong|a=lifting|p=dumbbell,biceps|s=gym|w=2.5
run,running,jog,jogging,marathon,sprint|a=running|p=sneaker|s=park|w=2.5
yoga|a=yoga|p=yoga-mat|w=3
stretch,stretching,flexible,posture|a=stretching|w=2.5
sleep,asleep,nap,bed,bedtime,rest,dream|a=sleeping|p=zzz,moon,bed|s=bedroom-night|w=2.5
wake,morning,alarm,sunrise,early|a=waking-up|p=alarm,sun|s=bedroom-day|w=2.5
shower,bath,wash,clean-up,hygiene,soap|a=showering|p=shower,soap|s=bathroom|w=2.5
walk,walking,stroll,steps,hike,hiking|a=walking|p=sneaker|s=park|w=2
dance,dancing,dancer|a=dancing|p=music-notes|s=stage|w=3
sing,singing,singer,song,karaoke|a=singing|p=microphone,music-notes|s=stage|w=3
guitar,band,musician,instrument|a=playing-guitar|p=guitar,music-notes|s=stage|w=3
music,playlist,headphones,listen,podcast,album|a=listening-music|p=headphones,music-notes|w=2.5
game,gaming,gamer,videogame,controller,console|a=gaming|p=gamepad,tv|s=living-room|w=3
photo,photograph,photography,camera,picture,selfie|a=photographing|p=camera|w=3
garden,gardening,plant,plants,grow,seed,flower,water-the-plants|a=gardening|p=watering-can,seedling|s=park|w=2.5
clean,cleaning,tidy,declutter,mess,messy,chore|a=cleaning|p=broom,sparkles|s=living-room|w=2.5
shop,shopping,buy,purchase,store,mall,sale,spend,spending|a=shopping|p=shopping-bags,cart,price-tag|s=shop|w=2.5
pay,paying,payment,bill,bills,card,checkout,cost,price,expensive|a=paying|p=credit-card,receipt|s=shop|w=2.5
money,cash,dollar,income,salary,earn,rich,wealth,wealthy,finance,financial,budget|a=counting-money|p=money-bag,banknote|w=2.5
save,saving,savings,jar,piggy,frugal|a=saving-money|p=money-jar,coin|w=2.5
invest,investing,investment,stock,stocks,compound|p=chart-up,money-bag|s=office|w=2.5
debt,loan,broke|p=money-wings,chains|w=2.5
phone,call,calling,ring|a=talking-phone|p=phone|w=2
text,texting,message,chat,dm,reply|a=texting|p=speech-bubbles|w=2.5
scroll,scrolling,social,instagram,tiktok,feed,notification,screen,doomscroll|a=scrolling-phone|p=phone|s=phone-screen|w=2.5
hug,hugging,embrace,cuddle|a=hugging|p=heart|w=3
argue,arguing,argument,fight,conflict|a=arguing|p=anger,speech-bubbles|w=3
cry,crying,tears,sob|a=crying|p=cloud|w=3
laugh,laughing,funny,joke,humor,humour|a=laughing|p=laugh|w=3
pray,prayer,grateful,gratitude,thankful,faith|a=praying|p=pray-hands,sparkles|w=2.5
meditate,meditation,mindful,mindfulness,breathe,breath,breathing,inhale,exhale|a=meditating|p=sparkles|s=abstract-mind-space|w=2.5
commute,commuting,bus,train,subway,metro|a=commuting|p=bus|s=bus|w=2.5
travel,trip,vacation,holiday,flight,airport,plane|p=airplane,luggage,world-map|w=2.5
hello,hi,greet,welcome|a=waving|p=wave-hand|w=1.5
think,thinking,overthink,thought,idea,ideas,wonder,imagine|a=standing-thinking|p=thought-bubbles|w=1.5
brain,mind,memory,neuron,dopamine,cortisol,focus,attention|p=brain|s=abstract-mind-space|w=2
stress,stressed,anxiety,anxious,panic,overwhelm,overwhelmed,pressure|a=stressed|p=question-marks,weights|w=2
sad,lonely,alone,depressed,hurt,heartbreak|a=sitting-head-in-hands|p=cloud,broken-heart|w=2
happy,joy,celebrate,win,success,succeed,achieve,achievement,goal,victory|a=celebrating|p=trophy,confetti|w=2
talk,talking,speak,conversation,tell,explain|a=talking|p=speech-bubbles|w=1.2
friend,friends,friendship,together|a=hugging|p=heart,people|w=2
love,relationship,partner,date,dating,crush|p=heart,love-letter|w=2
time,clock,minute,minutes,hour,hours|p=clock|w=1.5
day,daily,everyday,habit,routine,consistent,consistency,week,weekly,calendar|p=calendar,check|w=1.2
year,month,plan,planning,schedule|p=calendar,checklist|w=1.2
list,checklist,todo,to-do|p=checklist|w=2
night,tonight,midnight|p=moon|s=bedroom-night|w=1.2
sun,sunlight,sunny,outside,outdoor,outdoors,nature,park,fresh-air|p=sun,tree|s=park|w=1.5
rain,rainy,storm|p=rain|w=2
energy,tired,exhausted,burnout,fatigue|p=battery|w=2
idea,creative,insight,lightbulb|p=lightbulb|w=2
fear,scared,afraid|p=scared-face|w=2
angry,anger,mad,frustrated|p=anger|w=2
heart,kind,kindness,care,compassion|p=heart|w=1.5
doctor,health,healthy,medicine,sick,ill,hospital|p=stethoscope,pill|w=2
pill,medication,vitamin,supplement|p=pill|w=2.5
teeth,tooth,dentist,brush-teeth|p=toothbrush,tooth|w=2.5
home,house,room,apartment|p=house|s=living-room|w=1.5
dog,puppy|p=dog|w=2.5
cat,kitten|p=cat|w=2.5
car,drive,driving|p=car|s=street|w=2.5
city,street,road,town|s=street|w=1.2
fire,burn,hot|p=fire|w=1.5
star,dream,goal,aim,target|p=target,star|w=1.2
rocket,launch,grow,growth,progress,improve,better|p=chart-up,rocket|w=1.2
fail,failure,mistake,wrong|p=cross,chart-down|w=1.5
check,correct,right,done,finish,complete|p=check|w=1
gift,present,birthday|p=gift|w=1.5
party|p=party-popper,confetti|w=2
movie,film,tv,television,netflix,watch|p=tv|s=living-room|w=2
ball,soccer,football|p=soccer|w=2.5
basketball|p=basketball|w=3
bike,bicycle,cycling,cycle|p=bicycle|w=2.5
swim,swimming,pool|p=wave|w=2
eye,eyes,see,look,observe,notice,watching|p=eyes|w=1.5
hand,hands|p=wave-hand|w=1
pizza|p=pizza|w=3
apple,fruit|p=apple|w=2.5
salad,vegetable,vegetables,healthy-food|p=salad,broccoli|w=2.5
sugar,candy,sweet,dessert|p=candy,donut|w=2.5
cake|p=cake|w=3
bread|p=bread|w=3
coin,coins|p=coin|w=2.5
bank|p=bank|w=2.5
calculator,calculate,math,maths,numbers|p=calculator,abacus|w=2.5
lock,secure,security,password,privacy|p=lock,key|w=2
key,unlock|p=key|w=2
chart,data,statistic,statistics,analytics|p=bar-chart|w=2.5
science,experiment,lab|p=microscope,test-tube|w=2.5
world,global,earth,planet|p=earth|w=2
tree,forest|p=tree|w=2
mountain,climb|p=mountain-top,stairs|w=2
sea,ocean,beach|p=beach,wave|w=2.5
snow,winter,cold|p=snowflake|w=2
map,direction,navigate|p=map,compass|w=2
luggage,suitcase|p=luggage|w=3
ticket|p=ticket|w=3
gift-card,voucher,coupon,discount,deal|p=price-tag|w=2
receipt,expense,expenses,track|p=receipt,checklist|w=2
wallet,purse|p=wallet|w=3
jar|p=money-jar|w=2
candle|p=candle|w=3
plant|p=potted-plant|w=2
mirror,reflection|p=mirror|w=2
chain,trapped,stuck|p=chains|w=2
ladder,stairs,climb-up,level|p=stairs|w=2
battery,charge|p=battery|w=2.5
alarm|p=alarm|w=3
`;
  const LEX = new Map();
  LEX_SRC.trim().split('\n').forEach((line) => {
    const [words, ...rest] = line.split('|'); const e = { a: '', p: [], s: '', w: 1 };
    rest.forEach((kv) => { const [k, v] = kv.split('='); if (k === 'a') e.a = v; else if (k === 'p') e.p = v.split(',').filter((x) => P[x]); else if (k === 's') e.s = v; else if (k === 'w') e.w = Number(v) || 1; });
    words.split(',').forEach((w) => { const key = w.trim().replace(/-/g, ' '); if (key && !LEX.has(key)) LEX.set(key, e); });
  });
  const IRR = { ran: 'run', ate: 'eat', eaten: 'eat', drank: 'drink', drunk: 'drink', wrote: 'write', written: 'write', slept: 'sleep', woke: 'wake', woken: 'wake', bought: 'buy', spent: 'spend', paid: 'pay', thought: 'think',
    felt: 'feel', drew: 'draw', drawn: 'draw', sang: 'sing', sung: 'sing', taught: 'teach', made: 'make', went: 'go', saw: 'see', seen: 'see', fought: 'fight', grew: 'grow', grown: 'grow', swam: 'swim', rode: 'ride', flew: 'fly',
    lost: 'lose', won: 'win', kept: 'keep', left: 'leave', met: 'meet', built: 'build', hung: 'hang', sat: 'sit', stood: 'stand', told: 'tell', knew: 'know', gave: 'give', took: 'take', brought: 'bring', children: 'child',
    teeth: 'tooth', feet: 'foot', mice: 'mouse', people: 'people', studies: 'study', studied: 'study', better: 'better', earnt: 'earn', learnt: 'learn', dreamt: 'dream', sketches: 'sketch', drawings: 'drawing' };
  function lemmas(w) {
    w = String(w || '').toLowerCase().replace(/[’']s$/, '').replace(/[^a-z0-9-]/g, '');
    const out = [w]; if (IRR[w]) out.unshift(IRR[w]);
    const add = (x) => { if (x && x.length > 1 && !out.includes(x)) out.push(x); };
    if (w.endsWith('ies')) add(w.slice(0, -3) + 'y');
    if (/(ches|shes|sses|xes|zes)$/.test(w)) add(w.slice(0, -2));
    if (w.endsWith('s') && !w.endsWith('ss')) add(w.slice(0, -1));
    if (w.endsWith('ing') && w.length > 5) { const b = w.slice(0, -3); add(b); add(b + 'e'); if (/(.)\1$/.test(b)) add(b.slice(0, -1)); }
    if (w.endsWith('ed') && w.length > 4) { const b = w.slice(0, -2); add(b); add(b + 'e'); add(w.slice(0, -1)); if (/(.)\1$/.test(b)) add(b.slice(0, -1)); if (b.endsWith('i')) add(b.slice(0, -1) + 'y'); }
    if (w.endsWith('ers') && w.length > 5) { add(w.slice(0, -3)); add(w.slice(0, -2)); }
    if (w.endsWith('er') && w.length > 5) { add(w.slice(0, -2)); add(w.slice(0, -1)); }
    if (w.endsWith('ly') && w.length > 5) add(w.slice(0, -2));
    return out;
  }
  const STOP = new Set(('a an the and or but so if then than that this these those there here it its it\'s is are was were be been being am do does did done doing have has had having ' +
    'i me my mine you your yours we us our they them their he him his she her hers what which who whom whose why how when where while because since until about above after again against all ' +
    'almost also always any anyone anything as at away back before below between both by can can\'t cannot could couldn\'t down during each even ever every few for from further get gets getting got go goes going gone ' +
    'just keep know let like made make makes many may maybe might more most much must need needs never no nor not nothing now of off often on once one only onto other others out over own quite rather ' +
    're really right same say says see seem seems should shouldn\'t show simply since some something sometimes soon still such sure take tell than thing things think though through to too toward try ' +
    'under up upon us very want wants way ways well what whatever will with within without won\'t would yet you\'ll you\'re you\'ve actually probably start stop instead enough less little lot lots least ' +
    'give given use used using feel feels felt put new good bad big small first last next best worst three two four five ten step steps follow save share comment subscribe tip tips reason reasons ' +
    'people person someone everyone yourself myself thing truth fact point part kind sort type whole real true simple easy hard trick secret').split(/\s+/));
  const WORD_RE = /[A-Za-z][A-Za-z’'-]*/g;
  function tokens(text) { return (String(text || '').match(WORD_RE) || []).map((w) => w.toLowerCase().replace(/’/g, "'")); }
  function lexLookup(word) { for (const c of lemmas(word)) { const e = LEX.get(c); if (e) return { key: c, e }; } return null; }
  // All literal keyword hits in a line, strongest first.
  function analyze(text) {
    const tk = tokens(text); const hits = []; const content = []; const used = new Set();
    for (let i = 0; i < tk.length; i++) { // bigrams first ("save money", "fresh air", "brush teeth")
      if (i + 1 < tk.length) { const bg = tk[i] + ' ' + tk[i + 1]; const e = LEX.get(bg); if (e) { hits.push({ word: bg, key: bg, e, i }); used.add(i); used.add(i + 1); continue; } }
    }
    tk.forEach((w, i) => {
      if (used.has(i)) return; const clean = w.replace(/'.*$/, '');
      if (clean.length < 3 || STOP.has(w) || STOP.has(clean)) return;
      content.push(clean);
      const h = lexLookup(clean); if (h) hits.push({ word: clean, key: h.key, e: h.e, i });
    });
    hits.sort((a, b) => b.e.w - a.e.w || a.i - b.i);
    return { hits, content };
  }

  // ======================= scene building from keywords =======================
  const baseNormalize = S.normalizeScene;
  const uniq = (a) => Array.from(new Set(a.filter(Boolean)));
  // A keyword is shown when the scene does its action, or shows ALL of its objects (pencil AND sketchbook), or is in its place.
  function coveredBy(sc, e) { return (!!e.a && sc.pose === e.a) || (e.p.length > 0 && e.p.every((p) => sc.props.includes(p))) || (!!e.s && !e.a && !e.p.length && sc.setting === e.s); }
  const GENERIC_POSES = new Set(['talking', 'standing-thinking', 'waving', 'pointing', 'standing']);
  function settingFor(action, cur, prev, prefer) {
    const a = A[action]; if (!a) return cur;
    if (prefer === 'setting' || a.ok.includes(cur)) return cur;
    if (prev && a.ok.includes(prev.setting)) return prev.setting;
    return a.ok[0];
  }
  function applyEntry(sc, e, prev, prefer, keep) {
    if (e.a && prefer !== 'pose-keep') { sc.pose = e.a; sc.setting = settingFor(e.a, e.s && A[e.a] && A[e.a].ok.includes(e.s) ? e.s : sc.setting, prev, prefer); }
    else if (e.s && !keep && prefer !== 'setting' && !(A[sc.pose] && A[sc.pose].base !== 'legacy')) sc.setting = e.s;
    sc.props = uniq(e.p.concat(sc.props)).slice(0, 4);
  }
  function normalizeScene(raw, text, step, prev, prefer) {
    const r = raw && typeof raw === 'object' ? Object.assign({}, raw) : {};
    if (r.action && !r.pose) r.pose = r.action;
    const hasRaw = !!(raw && typeof raw === 'object' && (r.setting || r.pose));
    let sc = baseNormalize(r, text, step, prev, prefer);
    sc.keywords = uniq((Array.isArray(r.keywords) ? r.keywords : []).concat(Array.isArray(r.objects) ? r.objects : []).map((k) => String(k).toLowerCase().trim().slice(0, 24))).slice(0, 6);
    sc.icon = r.icon && EFILES.has(String(r.icon)) ? String(r.icon) : emojiFile(r.icon);
    sc.iconWord = String(r.iconWord || '').slice(0, 20);
    { // v1.6: extra characters + weather survive the base repairs
      const n = Number(r.count || r.characterCount || (typeof r.characters === 'number' ? r.characters : 0)) || 0;
      if (n >= 2 && A[sc.pose] && A[sc.pose].multi) sc.count = 2;
      sc.behind = n >= 3 || r.behind === true || r.behind === 'true' || /behind/i.test(String(r.extra || ''));
      if (!raw || !raw.edited) { if (!sc.behind && /\b(behind (you|me|him|her|them)|person behind)\b/i.test(String(text || '')) && /wav/i.test(String(text || ''))) sc.behind = true; }
      sc.weather = r.weather || ''; sc.weatherAuto = !r.weather || r.weatherAuto === true;
    }
    if (r.edited) { sc.edited = true; fixup(sc); weather16(sc, text, prev); return sc; } // the user picked this in the editor: validate only
    // map Gemini's free-form objects/keywords into props
    sc.keywords.forEach((k) => { const h = lexLookup(k.split(/\s+/).pop()); if (h) h.e.p.slice(0, 1).forEach((p) => { if (!sc.props.includes(p) && sc.props.length < 4) sc.props.push(p); }); });
    const an = analyze(text);
    if (!hasRaw && an.hits.length) sc.props = sc.props.filter((p) => an.hits.some((h) => h.e.p.includes(p))); // drop the old regex-fallback props when the lexicon found literal words
    const strong = an.hits.filter((h) => h.e.w >= 1.5);
    const main = strong[0] || an.hits[0];
    if (main) {
      if (!coveredBy(sc, main.e)) applyEntry(sc, main.e, prev, prefer, hasRaw);
      else if (main.e.a && main.e.w >= 2.5 && GENERIC_POSES.has(sc.pose) && A[main.e.a]) applyEntry(sc, main.e, prev, prefer, hasRaw); // strong action keyword beats a generic pose
      // make room for the second literal keyword too
      const second = an.hits.find((h) => h !== main && !coveredBy(sc, h.e) && h.e.p.length);
      if (second) sc.props = uniq(sc.props.slice(0, 2).concat(second.e.p.slice(0, 1)).concat(sc.props.slice(2))).slice(0, 4);
      if (!sc.iconWord) sc.iconWord = main.word;
    } else {
      // no library match: Gemini keyword or a content word → keyword icon card (never an unrelated scene)
      const kwFromGemini = sc.keywords.map((k) => ({ k, h: lexLookup(k.split(/\s+/).pop()) }));
      const g = kwFromGemini.find((x) => x.h);
      if (g) applyEntry(sc, g.h.e, prev, prefer, hasRaw);
      else {
        const words = sc.keywords.concat(an.content.slice().sort((a, b) => b.length - a.length));
        let icon = sc.icon; let word = sc.iconWord || sc.keywords[0] || '';
        if (!icon) for (const w of words) { const f = emojiForWord(w); if (f) { icon = f; word = w; break; } }
        if (icon || word) {
          if (!hasRaw || !sc.props.length || prefer === 'card') { sc.setting = 'keyword-card'; sc.pose = 'standing-thinking'; }
          sc.icon = icon; sc.iconWord = word;
        } else if (prev && !hasRaw) { sc = Object.assign({}, prev, { callout: sc.callout, keywords: [], camera: sc.camera, cont: true }); }
      }
    }
    if (!r.emotion && A[sc.pose] && A[sc.pose].emo) sc.emotion = A[sc.pose].emo;
    fixup(sc); weather16(sc, text, prev);
    return sc;
  }
  function weather16(sc, text, prev) { if (VTS.scenesV16) VTS.scenesV16.weatherFix(sc, text, prev); else { sc.weather = ''; sc.weatherAuto = true; } }
  function fixup(sc) {
    const a = A[sc.pose];
    if (a && a.base === 'two') sc.count = 2; else if (sc.count === 2 && sc.pose !== 'talking' && !(a && a.multi)) sc.count = 1;
    sc.behind = !!sc.behind && sc.setting !== 'phone-screen' && sc.setting !== 'keyword-card' && sc.setting !== 'car-interior' && !(a && a.base === 'sit');
    if (sc.setting === 'car-interior' && sc.count === 2) sc.count = 1;
    if (a && a.base === 'legacy' && sc.setting === 'keyword-card') sc.pose = 'standing-thinking';
    if (sc.setting === 'keyword-card' && a && a.base !== 'legacy') sc.setting = a.ok[0];
    // work item / default props for the action come first so the action always reads
    if (a) sc.props = uniq((a.props || []).filter((p) => !sc.props.includes(p)).slice(0, Math.max(0, 1 - sc.props.length)).concat(sc.props)).slice(0, 4);
    sc.props = sc.props.filter((p) => !(a && a.hold.some((h) => h.item === p)) && !(a && a.work === p));
    if (!Array.isArray(sc.keywords)) sc.keywords = [];
    sc.icon = sc.icon || ''; sc.iconWord = sc.iconWord || '';
  }
  // 0–100: how much of the line's literal, drawable keywords the scene shows. null = nothing literal to draw (abstract line).
  function matchScore(text, sc) {
    if (!sc) return 0;
    const an = analyze(text); const seen = new Set(); let denom = 0; let hit = 0; const missing = [];
    an.hits.forEach((h) => { if (seen.has(h.key)) return; seen.add(h.key); denom += h.e.w >= 1.5 ? 1 : 0.5; if (coveredBy(sc, h.e) || h.e.p.some((p) => sc.props.includes(p))) hit += h.e.w >= 1.5 ? 1 : 0.5; else missing.push(h.word); });
    if (!an.hits.length) {
      const words = an.content.filter((w) => emojiForWord(w));
      if (!words.length) return { score: null, missing: [] };
      denom = 1; if (sc.setting === 'keyword-card' && sc.icon && (words.includes(sc.iconWord) || sc.keywords.some((k) => words.includes(k)))) hit = 1; else if (sc.icon) hit = 0.7; else missing.push(words[0]);
    }
    let score = Math.round(100 * hit / Math.max(0.5, denom));
    const main = an.hits.find((h) => h.e.w >= 1.5); if (main && coveredBy(sc, main.e)) score = Math.max(score, 75);
    return { score: Math.min(100, score), missing };
  }
  // Long videos: no endless repeats. Long runs in one setting rotate through the action's other valid settings.
  // Long videos must not loop one scene: rotate settings among each action's valid places (keeps the keyword action),
  // vary "continuation" beats (abstract lines) with gentle actions, and alternate camera moves.
  const GENTLE = ['talking', 'standing-thinking', 'walking', 'waving', 'reading', 'drinking-coffee', 'listening-music'];
  function diversify(scenes) {
    let run = 0; let rot = 0; const used = {}; const recent = [];
    for (let i = 0; i < scenes.length; i++) {
      const sc = scenes[i]; if (!sc) continue;
      if (sc.edited || sc.setting === 'keyword-card') { recent.push(sc.setting + '|' + sc.pose); run = 0; continue; }
      const prev = scenes[i - 1];
      const a = A[sc.pose]; const ok = a ? a.ok : [];
      const combo = () => sc.setting + '|' + sc.pose;
      const freq = recent.slice(-16).filter((c) => c === combo()).length;
      run = prev && prev.setting === sc.setting ? run + 1 : 0;
      if ((run >= 4 || freq >= 4) && ok.length > 1) {
        const alts = ok.filter((x) => x !== sc.setting && x !== (prev && prev.setting)).sort((x, y) => (used[x] || 0) - (used[y] || 0));
        if (alts.length) { const ns = alts[rot++ % Math.min(2, alts.length)]; const old = sc.setting; for (let j = i; j < Math.min(scenes.length, i + 4) && scenes[j].setting === old && !scenes[j].edited; j++) { const aj = A[scenes[j].pose]; if (!aj || aj.ok.includes(ns)) scenes[j].setting = ns; } run = 0; }
      }
      if (sc.cont && prev && prev.pose === sc.pose && recent.slice(-6).filter((c) => c === combo()).length >= 2) { // abstract line repeating the last scene
        const g = GENTLE.filter((x) => x !== sc.pose && (!A[x] || A[x].base === 'legacy' || A[x].ok.includes(sc.setting) || ['talking', 'standing-thinking'].includes(x)));
        if (g.length) sc.pose = g[(i + rot) % g.length];
      }
      if (prev && sc.pose === prev.pose && sc.setting === prev.setting && sc.camera === prev.camera) sc.camera = ['zoom-in', 'pan', 'static'][(i + rot) % 3];
      used[sc.setting] = (used[sc.setting] || 0) + 1; recent.push(combo());
    }
    return scenes;
  }

  const baseDescribe = S.describe;
  function describe(sc) {
    const a = A[sc.pose]; const set = (S.SETTINGS.find((x) => x[0] === sc.setting) || [sc.setting, sc.setting])[1];
    const props = (sc.props || []).map((p) => (P[p] ? P[p].label : p).toLowerCase()); const kws = sc.keywords || [];
    if (sc.setting === 'keyword-card') return 'a big friendly illustrated icon of "' + (sc.iconWord || kws[0] || '') + '" with a small character reacting';
    return 'a character ' + (a ? a.label.toLowerCase() : sc.pose) + ' (' + sc.emotion + ') in a ' + set.toLowerCase() + (props.length ? ', with ' + props.join(', ') : '') + (kws.length ? '; must clearly show: ' + kws.join(', ') : '');
  }
  function iconsFor(sc) { // emoji files a scene needs (preload before rendering)
    const out = []; if (!sc || typeof sc !== 'object') return out; if (sc.icon) out.push(sc.icon);
    (sc.props || []).forEach((p) => { if (P[p] && P[p].e) out.push(P[p].e); });
    const a = A[sc.pose]; if (a) { (a.hold || []).forEach((h) => { const f = ITEM_E[h.item] || (P[h.item] && P[h.item].e); if (f) out.push(f); }); (WORK_E[a.work] || []).forEach((f) => out.push(f)); }
    (SET_E[sc.setting] || []).forEach((f) => out.push(f));
    return uniq(out);
  }

  // ======================= drawing =======================
  const ITEM_E = { 'coffee-cup': '2615', fork: '1f374', microphone: '1f3a4', guitar: '1f3b8', gamepad: '1f3ae', camera: '1f4f7', 'frying-pan': '1f373', broom: '1f9f9', 'shopping-bags': '1f6cd', 'credit-card': '1f4b3', banknote: '1f4b5', coin: '1fa99', palette: '1f3a8' };
  const WORK_E = { plate: ['1f35d'], plants: ['1f331', '1f33c', '1f337'], 'cash-stack': ['1f4b5'], stove: ['1f525'], study: ['1f4da'] };
  const SET_E = { kitchen: ['1fad6', '1f34e', '1f95b'], 'living-room': ['1fab4', '1f5bc'], 'art-studio': ['1f58c', '1f5bc', '1f3a8'], gym: ['1f3c6', '1f4aa'], library: ['1f30d', '1f56f'], bathroom: ['1f9fc', '1faa5', '1fab4'], shop: ['1f34e', '1f95b', '1f35e', '1f36b', '1f96b', '1f9c3'], stage: ['1f3b6'], bus: [] };
  function rr(ctx, x, y, w, h, r) { r = Math.min(r, w / 2, h / 2); ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  const popIn = (a) => { a = clamp01(a); const c1 = 1.70158; const c3 = c1 + 1; return 1 + c3 * Math.pow(a - 1, 3) + c1 * Math.pow(a - 1, 2); };
  function emoji(ctx, file, x, y, size, rot, alpha) {
    const c = file && EMO.get(file); if (!c) return false;
    ctx.save(); ctx.translate(x, y); if (rot) ctx.rotate(rot); if (alpha != null) ctx.globalAlpha *= alpha; ctx.drawImage(c, -size / 2, -size / 2, size, size); ctx.restore(); return true;
  }
  function hashN(n) { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }
  const ST = S.Stage.prototype;

  // ---------- simple line drawings the pencil/brush draws progressively ----------
  const circ = (cx, cy, r, a0, a1, n) => { const out = []; for (let k = 0; k <= n; k++) { const a = a0 + (a1 - a0) * k / n; out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); } return out; };
  const DRAWINGS = [
    [circ(0, -0.05, 0.42, -2.2, 4.1, 24), [[-0.32, -0.3], [-0.38, -0.72], [-0.1, -0.44]], [[0.1, -0.44], [0.38, -0.72], [0.32, -0.3]], circ(-0.16, -0.08, 0.05, 0, TAU, 8), circ(0.16, -0.08, 0.05, 0, TAU, 8), [[-0.06, 0.08], [0, 0.14], [0.06, 0.08]], [[-0.2, 0.06], [-0.62, 0.0]], [[-0.2, 0.12], [-0.6, 0.18]], [[0.2, 0.06], [0.62, 0.0]], [[0.2, 0.12], [0.6, 0.18]]], // cat
    [[[-0.5, 0.55], [-0.5, -0.05], [0.5, -0.05], [0.5, 0.55], [-0.5, 0.55]], [[-0.62, 0.0], [0, -0.55], [0.62, 0.0]], [[-0.12, 0.55], [-0.12, 0.2], [0.12, 0.2], [0.12, 0.55]], [[0.24, 0.05], [0.42, 0.05], [0.42, 0.2], [0.24, 0.2], [0.24, 0.05]], [[0.3, -0.3], [0.3, -0.52], [0.42, -0.52], [0.42, -0.2]]], // house
    [[[0, 0.62], [0.02, 0.1]], circ(0, -0.12, 0.12, 0, TAU, 12), circ(0, -0.4, 0.15, 0.6, 2.6, 8), circ(0.26, -0.18, 0.15, -1.2, 1.4, 8), circ(-0.26, -0.18, 0.15, 1.8, 4.4, 8), circ(0.18, 0.1, 0.15, -0.3, 2.2, 8), circ(-0.18, 0.1, 0.15, 1.0, 3.5, 8), [[0.02, 0.4], [0.24, 0.26], [0.1, 0.44]]], // flower
    [[[-0.66, 0.5], [-0.3, -0.18], [-0.06, 0.2], [0.2, -0.4], [0.66, 0.5], [-0.66, 0.5]], circ(0.42, -0.45, 0.14, 0, TAU, 12), [[-0.3, -0.18], [-0.2, -0.02]], [[0.2, -0.4], [0.3, -0.22]], [[-0.55, 0.62], [0.55, 0.62]]], // mountains
  ];
  function strokesLen(dr) { let L = 0; dr.forEach((s) => { for (let k = 1; k < s.length; k++) L += Math.hypot(s[k][0] - s[k - 1][0], s[k][1] - s[k - 1][1]); }); return L; }
  // draws strokes up to progress p in [0,1]; returns the current pen tip (local units)
  function drawStrokes(ctx, dr, p, sx, sy) {
    const total = strokesLen(dr); let left = total * clamp01(p); let tip = dr[0][0];
    ctx.beginPath();
    for (const s of dr) {
      if (left <= 0) break; ctx.moveTo(s[0][0] * sx, s[0][1] * sy); tip = s[0];
      for (let k = 1; k < s.length; k++) {
        const d = Math.hypot(s[k][0] - s[k - 1][0], s[k][1] - s[k - 1][1]);
        if (left >= d) { ctx.lineTo(s[k][0] * sx, s[k][1] * sy); left -= d; tip = s[k]; }
        else { const f = left / d; tip = [s[k - 1][0] + (s[k][0] - s[k - 1][0]) * f, s[k - 1][1] + (s[k][1] - s[k - 1][1]) * f]; ctx.lineTo(tip[0] * sx, tip[1] * sy); left = 0; break; }
      }
    }
    ctx.stroke();
    return [tip[0] * sx, tip[1] * sy];
  }

  // ---------- work items (the thing the action works on) ----------
  function deskTop(L) { return L.deskY || DESKY[L.deskKind] || 1380; }
  function workGeom(st, scene, L, kind, t, lt, x) {
    const a = A[scene.pose]; if (!a || !a.work) return null;
    const sc = L.scale || 1.08; const dy = deskTop(L); const g = { name: a.work, x, dy, sc };
    switch (a.work) {
      case 'sketchbook': case 'notepad': {
        g.cx = x + 190 * sc; g.cy = dy - 104; g.w = 330; g.h = 236; g.rot = -0.07;
        const cyc = a.work === 'sketchbook' ? 6 : 5; const n = Math.floor(lt / cyc); g.phase = (lt % cyc) / cyc; g.p = clamp01(g.phase / 0.78); g.n = n;
        if (a.work === 'sketchbook') { g.dr = DRAWINGS[n % DRAWINGS.length]; g.local = tipOf(g.dr, g.p, g.w * 0.36, g.h * 0.4); }
        else { const lines = 5; const pl = g.p * lines; const li = Math.min(lines - 1, Math.floor(pl)); const f = pl - li; g.local = [-g.w * 0.36 + f * g.w * 0.7, -g.h * 0.3 + li * g.h * 0.15 + Math.sin(f * 40) * 3]; }
        g.tip = rot2(g.local, g.rot, g.cx, g.cy); g.targetR = [g.tip[0] + 26, g.tip[1] - 34]; break;
      }
      case 'study': { g.cx = x + 40; g.cy = dy - 16; const k = (Math.sin(lt * 1.6) + 1) / 2; g.tip = [g.cx + 40 + k * 110, g.cy - 30 + Math.floor(lt / 1.9) % 3 * 12]; g.targetR = [g.tip[0] + 22, g.tip[1] - 36]; break; }
      case 'money-jar': { g.cx = x + 210 * sc; g.cy = dy - 110; const ph = (lt % 1.6) / 1.6; g.ph = ph; g.targetR = [g.cx + 10, g.cy - 150 - (ph < 0.3 ? (0.3 - ph) * 120 : 0)]; break; }
      case 'easel': { g.cx = x + 360; g.cy = L.groundY - 520; g.w = 300; g.h = 350; const cyc = 7; g.n = Math.floor(lt / cyc); g.p = clamp01(((lt % cyc) / cyc) / 0.85); g.tip = paintTip(g); g.targetR = [g.tip[0] - 40, g.tip[1] + 40]; break; }
      case 'plants': { g.cx = x + 330; g.cy = L.groundY - 40; break; }
      case 'board': { g.cx = x - 400; g.cy = L.groundY - 700; g.targetL = [g.cx + 150 + Math.sin(lt * 1.3) * 40, g.cy - 20 + Math.sin(lt * 0.9) * 30]; break; }
      case 'tv': { g.cx = x + 380; g.cy = L.groundY - 470; break; }
      default: break;
    }
    return g;
  }
  function rot2(p, r, cx, cy) { const c = Math.cos(r); const s = Math.sin(r); return [cx + p[0] * c - p[1] * s, cy + p[0] * s + p[1] * c]; }
  function tipOf(dr, p, sx, sy) { const total = strokesLen(dr); let left = total * clamp01(p); for (const s of dr) for (let k = 1; k < s.length; k++) { const d = Math.hypot(s[k][0] - s[k - 1][0], s[k][1] - s[k - 1][1]); if (left > d) left -= d; else { const f = left / Math.max(1e-6, d); return [(s[k - 1][0] + (s[k][0] - s[k - 1][0]) * f) * sx, (s[k - 1][1] + (s[k][1] - s[k - 1][1]) * f) * sy]; } } const s = dr[dr.length - 1]; return [s[s.length - 1][0] * sx, s[s.length - 1][1] * sy]; }
  const PAINT = [['#ff8a4c', -0.35, -0.3, 0.3, -0.34], ['#4cb7ff', -0.4, 0.05, 0.35, 0.0], ['#8ad16b', -0.3, 0.32, 0.25, 0.28], ['#ffd166', -0.1, -0.12, 0.2, -0.16], ['#ef6f9c', 0.05, 0.18, 0.38, 0.16]];
  function paintTip(g) { const n = PAINT.length; const pp = g.p * n; const k = Math.min(n - 1, Math.floor(pp)); const f = pp - k; const s = PAINT[k]; return [g.cx + (s[1] + (s[3] - s[1]) * f) * g.w, g.cy + (s[2] + (s[4] - s[2]) * f) * g.h + Math.sin(f * 12) * 6]; }

  function drawWorkBack(st, ctx, g, t, lt) {
    const c = (h) => st.c(h);
    if (g.name === 'easel') {
      ctx.lineCap = 'round';
      [[-0.42, 1], [0.42, 1], [0, 1.02]].forEach(([dx]) => { ctx.beginPath(); ctx.moveTo(g.cx + dx * 40, g.cy - g.h * 0.55); ctx.lineTo(g.cx + dx * g.w * 0.9, g.cy + g.h * 0.5 + 330); ctx.lineWidth = 22; ctx.strokeStyle = st.OL; ctx.stroke(); ctx.lineWidth = 12; ctx.strokeStyle = c('#b5835a'); ctx.stroke(); });
      rr(ctx, g.cx - g.w / 2, g.cy - g.h / 2, g.w, g.h, 8); st.fs(ctx, c('#fbf7ef'));
      ctx.save(); rr(ctx, g.cx - g.w / 2 + 10, g.cy - g.h / 2 + 10, g.w - 20, g.h - 20, 4); ctx.clip(); ctx.lineCap = 'round';
      const n = PAINT.length; const pp = g.p * n;
      PAINT.forEach((s, k) => { const f = clamp01(pp - k); if (f <= 0) return; ctx.beginPath(); ctx.moveTo(g.cx + s[1] * g.w, g.cy + s[2] * g.h); const steps = 12; for (let i = 1; i <= Math.ceil(steps * f); i++) { const q = Math.min(f, i / steps); ctx.lineTo(g.cx + (s[1] + (s[3] - s[1]) * q) * g.w, g.cy + (s[2] + (s[4] - s[2]) * q) * g.h + Math.sin(q * 12) * 6); } ctx.lineWidth = 34; ctx.strokeStyle = st.c(s[0]); ctx.stroke(); });
      ctx.restore();
      rr(ctx, g.cx - g.w / 2 - 20, g.cy + g.h / 2 - 6, g.w + 40, 22, 6); st.fs(ctx, c('#9c6a44'), 5);
    } else if (g.name === 'board') {
      rr(ctx, g.cx - 10, g.cy - 230, 420, 330, 18); st.fs(ctx, c('#f7f7f2'));
      ctx.beginPath(); ctx.rect(g.cx + 190, g.cy + 100, 16, 380); st.fs(ctx, c('#6d6f7e'), 5);
      const bars = [0.35, 0.5, 0.42, 0.72, 0.95]; const grow = clamp01(lt / 1.6);
      bars.forEach((h, i) => { const bh = h * 220 * clamp01(grow * 1.6 - i * 0.15); ctx.beginPath(); ctx.rect(g.cx + 40 + i * 70, g.cy + 70 - bh, 46, bh); st.fs(ctx, st.c(i === 4 ? st.art.accent : st.art.accent2), 5); });
      ctx.beginPath(); ctx.moveTo(g.cx + 30, g.cy + 72); ctx.lineTo(g.cx + 390, g.cy + 72); ctx.lineWidth = 5; ctx.strokeStyle = st.OL; ctx.stroke();
      emoji(ctx, '1f4c8', g.cx + 360, g.cy - 170, 90, Math.sin(t * 2) * 0.1);
    } else if (g.name === 'tv') {
      ctx.beginPath(); ctx.rect(g.cx - 110, g.cy + 130, 220, 250); st.fs(ctx, c('#6b4e3d'));
      rr(ctx, g.cx - 210, g.cy - 140, 420, 270, 18); st.fs(ctx, c('#23263a'));
      const hue = (t * 40) % 360; ctx.fillStyle = 'hsl(' + hue + ',70%,' + (55 + 8 * Math.sin(t * 9)) + '%)'; ctx.fillRect(g.cx - 190, g.cy - 122, 380, 234);
      ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.fillRect(g.cx - 170 + ((t * 120) % 300), g.cy + 40, 40, 40); emoji(ctx, '1f47e', g.cx + Math.sin(t * 2) * 90, g.cy - 30, 110);
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; const gl = ctx.createRadialGradient(g.cx - 200, g.cy, 20, g.cx - 300, g.cy + 40, 520); gl.addColorStop(0, 'hsla(' + hue + ',80%,60%,0.28)'); gl.addColorStop(1, 'hsla(' + hue + ',80%,60%,0)'); ctx.fillStyle = gl; ctx.fillRect(g.cx - 820, g.cy - 480, 1000, 960); ctx.restore();
    }
  }
  function drawWorkFront(st, ctx, g, t, lt, scene) {
    const c = (h) => st.c(h);
    if (g.name === 'sketchbook' || g.name === 'notepad') {
      ctx.save(); ctx.translate(g.cx, g.cy); ctx.rotate(g.rot);
      ctx.fillStyle = 'rgba(0,0,0,0.18)'; rr(ctx, -g.w / 2 + 10, -g.h / 2 + 14, g.w, g.h, 14); ctx.fill();
      rr(ctx, -g.w / 2, -g.h / 2, g.w, g.h, 14); st.fs(ctx, c(g.name === 'sketchbook' ? '#3d4a6b' : '#c0584f'));
      rr(ctx, -g.w / 2 + 14, -g.h / 2 + 12, g.w - 28, g.h - 24, 8); st.fs(ctx, c('#fffdf6'), 4);
      if (g.name === 'sketchbook') { ctx.fillStyle = c('#aab4c8'); for (let k = 0; k < 9; k++) { ctx.beginPath(); ctx.arc(-g.w / 2 + 40 + k * 32, -g.h / 2 + 6, 7, 0, TAU); ctx.fill(); } }
      ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = c('#2b2b3a');
      if (g.name === 'sketchbook') { ctx.lineWidth = 6; drawStrokes(ctx, g.dr, g.p, g.w * 0.36, g.h * 0.4); if (g.phase > 0.8) { ctx.fillStyle = st.ea('#fff4b0', 0.9 * Math.sin((g.phase - 0.8) / 0.2 * Math.PI)); ctx.font = '900 44px Montserrat, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('✦', g.w * 0.32, -g.h * 0.22); } }
      else { ctx.lineWidth = 5; const lines = 5; const pl = g.p * lines; for (let li = 0; li < lines; li++) { const f = clamp01(pl - li); if (f <= 0) break; ctx.beginPath(); const y0 = -g.h * 0.3 + li * g.h * 0.15; for (let k = 0; k <= 40 * f; k++) { const q = k / 40; ctx.lineTo(-g.w * 0.36 + q * g.w * 0.7, y0 + Math.sin(q * 40) * 3); } ctx.stroke(); } }
      ctx.restore();
    } else if (g.name === 'study') {
      emoji(ctx, '1f4da', g.cx - 250, g.cy - 70, 150);
      ctx.save(); ctx.translate(g.cx + 100, g.cy); ctx.beginPath(); ctx.moveTo(-190, -60); ctx.quadraticCurveTo(-100, -80, 0, -58); ctx.quadraticCurveTo(100, -80, 190, -60); ctx.lineTo(210, 10); ctx.quadraticCurveTo(100, -8, 0, 12); ctx.quadraticCurveTo(-100, -8, -210, 10); ctx.closePath(); st.fs(ctx, c('#fffdf6'));
      ctx.beginPath(); ctx.moveTo(0, -58); ctx.lineTo(0, 12); ctx.lineWidth = 4; ctx.strokeStyle = st.OL; ctx.stroke();
      ctx.strokeStyle = st.ea('#6b7280', 0.8); ctx.lineWidth = 4; for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.moveTo(-170, -40 + k * 14); ctx.lineTo(-30, -44 + k * 14); ctx.moveTo(30, -44 + k * 14); ctx.lineTo(170, -40 + k * 14); ctx.stroke(); }
      ctx.strokeStyle = st.ea('#ffd166', 0.8); ctx.lineWidth = 9; const k2 = Math.floor(lt / 1.9) % 3; ctx.beginPath(); ctx.moveTo(40, -44 + k2 * 14); ctx.lineTo(40 + ((Math.sin(lt * 1.6) + 1) / 2) * 110, -44 + k2 * 14); ctx.stroke(); ctx.restore();
    } else if (g.name === 'laptop') {
      const x = g.x; const y = g.dy;
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; const gl = ctx.createRadialGradient(x, y - 240, 10, x, y - 240, 260); gl.addColorStop(0, st.ea('#bfe3ff', 0.25)); gl.addColorStop(1, st.ea('#bfe3ff', 0)); ctx.fillStyle = gl; ctx.fillRect(x - 280, y - 520, 560, 520); ctx.restore();
      ctx.beginPath(); ctx.moveTo(x - 170, y - 4); ctx.lineTo(x - 150, y - 210); ctx.lineTo(x + 150, y - 210); ctx.lineTo(x + 170, y - 4); ctx.closePath(); st.fs(ctx, c('#c9ced8'));
      ctx.beginPath(); ctx.arc(x, y - 110, 20, 0, TAU); ctx.fillStyle = st.ea('#ffffff', 0.85); ctx.fill();
      rr(ctx, x - 200, y - 10, 400, 18, 8); st.fs(ctx, c('#a9afbb'), 5);
    } else if (g.name === 'plate') {
      const x = g.x + 30; const y = g.dy - 10;
      ctx.beginPath(); ctx.ellipse(x, y, 170, 40, 0, 0, TAU); st.fs(ctx, c('#f3f4f6')); ctx.beginPath(); ctx.ellipse(x, y - 4, 118, 26, 0, 0, TAU); ctx.fillStyle = c('#e5e7eb'); ctx.fill();
      emoji(ctx, '1f35d', x, y - 50, 150); emoji(ctx, '1f964', x + 250, y - 70, 120);
      for (let k = 0; k < 3; k++) { const ph = (t * 0.6 + k / 3) % 1; ctx.strokeStyle = st.ea('#ffffff', 0.6 * (1 - ph)); ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(x - 40 + k * 40, y - 110 - ph * 90); ctx.quadraticCurveTo(x - 20 + k * 40, y - 140 - ph * 90, x - 40 + k * 40, y - 170 - ph * 90); ctx.stroke(); }
    } else if (g.name === 'cash-stack') {
      for (let k = 0; k < 5; k++) { rr(ctx, g.x - 40 + (k % 2) * 8, g.dy - 20 - k * 16, 200, 26, 4); st.fs(ctx, c('#7cc47a'), 4); }
      emoji(ctx, '1f4b0', g.x + 260, g.dy - 80, 150, Math.sin(t * 2) * 0.08);
    } else if (g.name === 'money-jar') {
      moneyJar(st, ctx, g.cx, g.cy, 1, lt, g.ph);
    } else if (g.name === 'plants') {
      [0, 1, 2].forEach((k) => { const px = g.cx + (k - 1) * 150; const py = g.cy; ctx.beginPath(); ctx.moveTo(px - 60, py - 110); ctx.lineTo(px + 60, py - 110); ctx.lineTo(px + 45, py); ctx.lineTo(px - 45, py); ctx.closePath(); st.fs(ctx, c('#c96f4a'));
        const gr = clamp01((lt - k * 0.8) / 2.2); emoji(ctx, gr > 0.8 ? ['1f33c', '1f337', '1f33b'][k] : '1f331', px, py - 110 - 60 * gr, 70 + 70 * gr); });
    } else if (g.name === 'stove') {
      const y = 1450; ctx.beginPath(); ctx.rect(0, y, W, 480); st.fs(ctx, c('#e9e3da')); ctx.beginPath(); ctx.rect(0, y, W, 34); st.fs(ctx, c('#b9aa98'));
      rr(ctx, g.x + 20, y - 26, 300, 30, 10); st.fs(ctx, c('#3b3f52'));
      for (let k = 0; k < 5; k++) { const fx = g.x + 110 + k * 26; const fh = 30 + 16 * Math.sin(t * 14 + k * 2); ctx.beginPath(); ctx.moveTo(fx - 12, y - 26); ctx.quadraticCurveTo(fx, y - 26 - fh, fx + 12, y - 26); ctx.fillStyle = st.e(k % 2 ? '#ffb347' : '#ff6b3d'); ctx.fill(); }
      [[180, 1600], [540, 1600], [900, 1600]].forEach(([dx, dy2]) => { rr(ctx, dx - 150, dy2, 300, 220, 14); ctx.lineWidth = 5; ctx.strokeStyle = st.ea('#8a7a68', 0.7); ctx.stroke(); ctx.fillStyle = c('#b9aa98'); ctx.fillRect(dx - 40, dy2 + 30, 80, 12); });
    } else if (g.name === 'yoga-mat') { /* drawn behind */ }
  }
  function moneyJar(st, ctx, x, y, s, lt, ph) {
    const c = (h) => st.c(h); const h = 190 * s; const w = 150 * s;
    const fill = clamp01(0.25 + (lt % 12) / 16);
    ctx.save(); rr(ctx, x - w / 2, y - h / 2, w, h, 36 * s); ctx.clip();
    ctx.fillStyle = st.ea('#dff3ff', 0.35); ctx.fillRect(x - w, y - h, w * 2, h * 2);
    for (let k = 0; k < 22 * fill; k++) { const cx = x - w * 0.34 + (k % 4) * w * 0.22 + (Math.floor(k / 4) % 2) * 10 * s; const cy = y + h / 2 - 16 * s - Math.floor(k / 4) * 24 * s; ctx.beginPath(); ctx.ellipse(cx, cy, 22 * s, 12 * s, 0, 0, TAU); ctx.fillStyle = st.c('#f7c948'); ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = st.c('#b8860b'); ctx.stroke(); }
    ctx.restore();
    rr(ctx, x - w / 2, y - h / 2, w, h, 36 * s); ctx.lineWidth = 6; ctx.strokeStyle = st.OL; ctx.stroke();
    ctx.fillStyle = st.ea('#ffffff', 0.5); rr(ctx, x - w * 0.36, y - h * 0.36, 14 * s, h * 0.5, 7 * s); ctx.fill();
    rr(ctx, x - w * 0.42, y - h / 2 - 22 * s, w * 0.84, 28 * s, 8 * s); st.fs(ctx, c('#b5835a'), 5);
    if (ph != null && ph < 0.55) { const k = ph / 0.55; const cy = y - h / 2 - 120 * s + k * (h * 0.6 + 120 * s); if (k < 0.3 || true) emoji(ctx, '1fa99', x, cy, 60 * s, k * 6); }
  }

  // ---------- held items ----------
  function drawHeld(st, ctx, h, A, t, g, scene) {
    const sc = A.scale || 1; const size = (h.size || 100) * sc;
    let x; let y;
    if (h.hand === 'R') [x, y] = A.handR; else if (h.hand === 'L') [x, y] = A.handL;
    else if (h.hand === 'body') { x = A.hip[0]; y = A.hip[1] - 110 * sc; } else { x = (A.handR[0] + A.handL[0]) / 2; y = (A.handR[1] + A.handL[1]) / 2; }
    x += (h.dx || 0) * sc; y += (h.dy || 0) * sc;
    const c = (hx) => st.c(hx);
    switch (h.item) {
      case 'pencil': case 'pen': case 'paintbrush': {
        const tip = g && g.tip ? g.tip : [x - 26 * sc, y + 40 * sc]; const back = [x + (x - tip[0]) * 0.9, y + (y - tip[1]) * 0.9];
        ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(tip[0], tip[1]); ctx.lineTo(back[0], back[1]); ctx.lineWidth = 22 * sc + 10; ctx.strokeStyle = st.OL; ctx.stroke();
        ctx.lineWidth = 22 * sc; ctx.strokeStyle = c(h.item === 'pencil' ? '#ffcf3f' : h.item === 'pen' ? '#3b82f6' : '#b5835a'); ctx.stroke();
        const k = 0.22; const mid = [tip[0] + (back[0] - tip[0]) * k, tip[1] + (back[1] - tip[1]) * k];
        ctx.beginPath(); ctx.moveTo(tip[0], tip[1]); ctx.lineTo(mid[0], mid[1]); ctx.lineWidth = 20 * sc; ctx.strokeStyle = c(h.item === 'paintbrush' ? PAINT[(g && g.p ? Math.floor(g.p * PAINT.length) : 0) % PAINT.length][0] : '#f1d3a8'); ctx.stroke();
        if (h.item === 'pencil') { ctx.beginPath(); ctx.arc(back[0], back[1], 11 * sc, 0, TAU); ctx.fillStyle = c('#ef8fa0'); ctx.fill(); }
        break;
      }
      case 'open-book': {
        const flip = (t % 3) / 3; ctx.save(); ctx.translate(x, y - 10 * sc); ctx.scale(sc, sc);
        [-1, 1].forEach((s) => { ctx.beginPath(); ctx.moveTo(0, -60); ctx.quadraticCurveTo(s * 70, -80, s * 130, -64); ctx.lineTo(s * 130, 50); ctx.quadraticCurveTo(s * 70, 34, 0, 56); ctx.closePath(); st.fs(ctx, c(s < 0 ? '#fffdf6' : '#f7f1e3')); });
        ctx.strokeStyle = st.ea('#6b7280', 0.7); ctx.lineWidth = 4; for (let k = 0; k < 4; k++) [-1, 1].forEach((s) => { ctx.beginPath(); ctx.moveTo(s * 20, -40 + k * 20); ctx.lineTo(s * 110, -46 + k * 20); ctx.stroke(); });
        if (flip < 0.3) { const a = flip / 0.3; const px = 130 * Math.cos(a * Math.PI); ctx.beginPath(); ctx.moveTo(0, -60); ctx.quadraticCurveTo(px * 0.5, -80 - Math.sin(a * Math.PI) * 30, px, -64); ctx.lineTo(px, 50); ctx.quadraticCurveTo(px * 0.5, 34, 0, 56); ctx.closePath(); st.fs(ctx, c('#ffffff')); }
        ctx.beginPath(); ctx.moveTo(-134, 52); ctx.quadraticCurveTo(-70, 40, 0, 62); ctx.quadraticCurveTo(70, 40, 134, 52); ctx.lineWidth = 12; ctx.strokeStyle = c(st.art.accent); ctx.stroke(); ctx.restore(); break;
      }
      case 'glass-water': { ctx.save(); ctx.translate(x - 6 * sc, y - 40 * sc); ctx.scale(sc, sc); ctx.beginPath(); ctx.moveTo(-34, -60); ctx.lineTo(34, -60); ctx.lineTo(26, 50); ctx.lineTo(-26, 50); ctx.closePath(); ctx.fillStyle = st.ea('#e6f6ff', 0.6); ctx.fill(); ctx.save(); ctx.clip(); ctx.fillStyle = st.c('#5cc8ff'); ctx.fillRect(-40, -20 + Math.sin(t * 3) * 3, 80, 80); ctx.restore(); ctx.beginPath(); ctx.moveTo(-34, -60); ctx.lineTo(34, -60); ctx.lineTo(26, 50); ctx.lineTo(-26, 50); ctx.closePath(); ctx.lineWidth = 5; ctx.strokeStyle = st.OL; ctx.stroke(); ctx.restore(); break; }
      case 'dumbbell': { ctx.save(); ctx.translate(x, y); ctx.scale(sc, sc); ctx.beginPath(); ctx.rect(-62, -9, 124, 18); st.fs(ctx, c('#9aa0ad'), 5); [-1, 1].forEach((s) => { rr(ctx, s * 58 - 18, -38, 36, 76, 8); st.fs(ctx, c('#3b3f52'), 5); }); ctx.restore(); break; }
      case 'watering-can': { ctx.save(); ctx.translate(x + 40 * sc, y); ctx.scale(sc, sc); rr(ctx, -50, -40, 110, 90, 16); st.fs(ctx, c('#4cb7a0')); ctx.beginPath(); ctx.moveTo(55, 10); ctx.lineTo(150, -40); ctx.lineWidth = 16; ctx.strokeStyle = st.OL; ctx.stroke(); ctx.lineWidth = 8; ctx.strokeStyle = c('#4cb7a0'); ctx.stroke(); ctx.restore();
        for (let k = 0; k < 7; k++) { const ph = (t * 1.4 + k / 7) % 1; ctx.beginPath(); ctx.ellipse(x + 40 * sc + 150 * sc + ph * 80, y - 40 * sc + ph * ph * 330, 5, 9, 0, 0, TAU); ctx.fillStyle = st.ea('#5cc8ff', 1 - ph * 0.6); ctx.fill(); } break; }
      case 'phone-ear': { ctx.save(); ctx.translate(x - 4 * sc, y - 20 * sc); ctx.rotate(-0.25); ctx.scale(sc, sc); st.phoneShape(ctx, 56, 104, true, t); ctx.restore(); break; }
      case 'phone-hands': { ctx.save(); ctx.translate(x, y - 34 * sc); ctx.rotate(-0.06); ctx.scale(sc, sc); st.phoneShape(ctx, 70, 120, true, t); ctx.restore(); break; }
      default: {
        const f = ITEM_E[h.item] || (P[h.item] && P[h.item].e); let rot = h.rot || 0;
        if (h.item === 'broom') rot = 0.5 + Math.sin(t * 3.2) * 0.25;
        if (h.item === 'frying-pan') rot = -0.2 + Math.sin(t * 5) * 0.12;
        emoji(ctx, f, x, y, size, rot);
        if (h.item === 'coffee-cup' || h.item === 'frying-pan') for (let k = 0; k < 3; k++) { const ph = (t * 0.7 + k / 3) % 1; ctx.strokeStyle = st.ea('#ffffff', 0.55 * (1 - ph)); ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(x - 20 + k * 20, y - size * 0.45 - ph * 80); ctx.quadraticCurveTo(x - 4 + k * 20, y - size * 0.6 - ph * 80, x - 20 + k * 20, y - size * 0.75 - ph * 80); ctx.stroke(); }
        if (h.item === 'camera' && (t % 2.4) < 0.12) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; const gl = ctx.createRadialGradient(x, y, 10, x, y, 420); gl.addColorStop(0, 'rgba(255,255,255,0.9)'); gl.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = gl; ctx.fillRect(x - 420, y - 420, 840, 840); ctx.restore(); }
      }
    }
    // hand(s) on top so the item is gripped
    const hand = (p) => { ctx.beginPath(); ctx.arc(p[0], p[1], 21 * sc, 0, TAU); st.fs(ctx, A.skin || '#f2c6a0', st.lw); };
    if (h.hand === 'R' || h.hand === 'both') hand(A.handR);
    if (h.hand === 'L' || h.hand === 'both') hand(A.handL);
    if (h.hand === 'body') hand(A.handR);
  }

  // ---------- props (emoji + custom) with animation ----------
  const baseProp = ST.prop;
  ST.prop = function (name, ctx, x, y, sc, age, t, env) {
    const p = P[name]; if (!p || p.anim === 'legacy') return baseProp.call(this, name, ctx, x, y, sc, age, t, env);
    const k = popIn(age / 0.35); if (k <= 0) return;
    const ph = hashN(name.length * 13 + name.charCodeAt(0)) * 6; const size = 170 * sc;
    ctx.save(); ctx.translate(x, y); ctx.scale(k, k);
    let rot = 0; let dx = 0; let dy = Math.sin(t * 1.6 + ph) * 8; let s = 1; let alpha = 1;
    switch (p.anim) {
      case 'spin': rot = t * 1.2; break; case 'swing': rot = Math.sin(t * 2.2 + ph) * 0.22; break; case 'pulse': s = 1 + Math.sin(t * 4 + ph) * 0.07; break;
      case 'float': dy = Math.sin(t * 1.1 + ph) * 22; dx = Math.sin(t * 0.7 + ph) * 12; break; case 'shake': dx = Math.sin(t * 22) * 5; rot = Math.sin(t * 19) * 0.06; break;
      case 'tilt': rot = Math.sin(t * 1.5 + ph) * 0.14; break; case 'bounce': dy = -Math.abs(Math.sin(t * 3.4 + ph)) * 34; break; case 'fly': dx = Math.sin(t * 0.9 + ph) * 36; dy = Math.sin(t * 2.1 + ph) * 16; rot = Math.sin(t * 0.9 + ph) * 0.12; break;
      case 'flicker': alpha = 0.82 + 0.18 * Math.sin(t * 17 + ph); break; case 'flip': rot = ((t % 3) < 0.5 ? (t % 3) / 0.5 : 1) * Math.PI; break; case 'grow': s = 0.6 + 0.4 * clamp01(age / 2); break;
      case 'blink': s = 1; break; case 'pop': s = 1 + Math.max(0, Math.sin(t * 2.5 + ph)) * 0.06; break; default: break;
    }
    ctx.translate(dx, dy); ctx.rotate(rot); ctx.scale(s, s); ctx.globalAlpha *= alpha;
    if (p.e) {
      if (p.anim === 'blink') { const b = (t + ph) % 3.2 < 0.15 ? 0.15 : 1; ctx.scale(1, b); }
      ctx.fillStyle = 'rgba(0,0,0,0.16)'; ctx.beginPath(); ctx.ellipse(6, size * 0.46, size * 0.32, size * 0.07, 0, 0, TAU); ctx.fill();
      emoji(ctx, p.e, 0, 0, size);
      if (p.anim === 'steam') for (let q = 0; q < 3; q++) { const f = (t * 0.7 + q / 3) % 1; ctx.strokeStyle = this.ea('#ffffff', 0.6 * (1 - f)); ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(-30 + q * 30, -size * 0.45 - f * 70); ctx.quadraticCurveTo(-12 + q * 30, -size * 0.6 - f * 70, -30 + q * 30, -size * 0.75 - f * 70); ctx.stroke(); }
      if (p.anim === 'drip') for (let q = 0; q < 4; q++) { const f = (t * 1.3 + q / 4) % 1; ctx.beginPath(); ctx.ellipse(-40 + q * 26, size * 0.3 + f * 120, 6, 10, 0, 0, TAU); ctx.fillStyle = this.ea('#5cc8ff', 1 - f); ctx.fill(); }
      if (p.anim === 'flash' && (t + ph) % 2 < 0.2) { ctx.strokeStyle = this.e('#fff4b0'); ctx.lineWidth = 7; for (let q = 0; q < 8; q++) { const a = q / 8 * TAU; ctx.beginPath(); ctx.moveTo(Math.cos(a) * size * 0.55, Math.sin(a) * size * 0.55); ctx.lineTo(Math.cos(a) * size * 0.75, Math.sin(a) * size * 0.75); ctx.stroke(); } }
    } else customProp(this, ctx, name, size, t, age);
    ctx.restore();
  };
  function customProp(st, ctx, name, size, t, age) {
    const c = (h) => st.c(h); const u = size / 170;
    ctx.save(); ctx.scale(u, u);
    switch (name) {
      case 'pencil': case 'pen': case 'paintbrush': ctx.rotate(-0.8); rr(ctx, -16, -90, 32, 150, 8); st.fs(ctx, c(name === 'pencil' ? '#ffcf3f' : name === 'pen' ? '#3b82f6' : '#b5835a')); ctx.beginPath(); ctx.moveTo(-16, 60); ctx.lineTo(0, 100); ctx.lineTo(16, 60); ctx.closePath(); st.fs(ctx, c(name === 'paintbrush' ? st.art.accent : '#f1d3a8')); if (name === 'pencil') { rr(ctx, -16, -104, 32, 22, 8); st.fs(ctx, c('#ef8fa0')); } break;
      case 'sketchbook': rr(ctx, -80, -60, 160, 120, 10); st.fs(ctx, c('#3d4a6b')); rr(ctx, -70, -52, 140, 104, 6); st.fs(ctx, c('#fffdf6'), 4); ctx.lineWidth = 4; ctx.strokeStyle = c('#2b2b3a'); ctx.lineCap = 'round'; drawStrokes(ctx, DRAWINGS[Math.floor(t / 4) % DRAWINGS.length], (t % 4) / 3, 55, 45); break;
      case 'easel': case 'paint-canvas': rr(ctx, -70, -80, 140, 160, 6); st.fs(ctx, c('#fbf7ef')); PAINT.slice(0, 3).forEach((s, i) => { ctx.beginPath(); ctx.moveTo(s[1] * 140, s[2] * 160); ctx.lineTo(s[3] * 140 * clamp01(t / 2 - i * 0.3 + 1), s[4] * 160); ctx.lineWidth = 16; ctx.lineCap = 'round'; ctx.strokeStyle = c(s[0]); ctx.stroke(); }); break;
      case 'open-book': [-1, 1].forEach((s) => { ctx.beginPath(); ctx.moveTo(0, -40); ctx.quadraticCurveTo(s * 45, -54, s * 85, -42); ctx.lineTo(s * 85, 34); ctx.quadraticCurveTo(s * 45, 22, 0, 38); ctx.closePath(); st.fs(ctx, c('#fffdf6')); }); break;
      case 'code-window': { rr(ctx, -110, -80, 220, 160, 16); st.fs(ctx, c('#1f2433')); ctx.fillStyle = c('#ef6f6c'); [0, 1, 2].forEach((k) => { ctx.fillStyle = c(['#ef6f6c', '#f6bd60', '#8ad16b'][k]); ctx.beginPath(); ctx.arc(-88 + k * 20, -60, 6, 0, TAU); ctx.fill(); });
        const n = Math.floor((t * 3) % 8); const cols = ['#7dd3fc', '#f9a8d4', '#fde68a', '#a7f3d0']; for (let k = 0; k < Math.min(6, n); k++) { ctx.fillStyle = c(cols[k % 4]); ctx.fillRect(-90 + (k % 3) * 16, -36 + k * 18, 60 + ((k * 37) % 80), 8); } ctx.fillStyle = c('#ffffff'); if ((t * 2) % 1 < 0.5) ctx.fillRect(-90 + 70, -36 + Math.min(5, n) * 18, 6, 12); break; }
      case 'dumbbell': ctx.beginPath(); ctx.rect(-62, -9, 124, 18); st.fs(ctx, c('#9aa0ad'), 5); [-1, 1].forEach((s) => { rr(ctx, s * 58 - 18, -38, 36, 76, 8); st.fs(ctx, c('#3b3f52'), 5); }); break;
      case 'yoga-mat': rr(ctx, -80, -30, 160, 60, 30); st.fs(ctx, c(st.art.accent2)); ctx.beginPath(); ctx.arc(60, 0, 30, 0, TAU); st.fs(ctx, c(mixc(st.art.accent2))); break;
      case 'water-bottle': rr(ctx, -30, -70, 60, 140, 20); st.fs(ctx, c('#5cc8ff')); rr(ctx, -20, -90, 40, 24, 6); st.fs(ctx, c('#3b3f52')); break;
      case 'glass-water': ctx.beginPath(); ctx.moveTo(-40, -60); ctx.lineTo(40, -60); ctx.lineTo(30, 60); ctx.lineTo(-30, 60); ctx.closePath(); ctx.fillStyle = st.ea('#5cc8ff', 0.7); ctx.fill(); ctx.lineWidth = 6; ctx.strokeStyle = st.OL; ctx.stroke(); break;
      case 'plate': ctx.beginPath(); ctx.ellipse(0, 20, 100, 30, 0, 0, TAU); st.fs(ctx, c('#f3f4f6')); emoji(ctx, '1f957', 0, -10, 110); break;
      case 'money-jar': moneyJar(st, ctx, 0, 0, 0.8, t, (t % 1.6) / 1.6); break;
      case 'piggy': { ctx.beginPath(); ctx.ellipse(0, 10, 90, 64, 0, 0, TAU); st.fs(ctx, c('#f5a3b7')); [-50, 40].forEach((lx) => { rr(ctx, lx, 50, 22, 36, 6); st.fs(ctx, c('#f5a3b7')); }); ctx.beginPath(); ctx.ellipse(86, 14, 20, 24, 0, 0, TAU); st.fs(ctx, c('#f08aa3')); ctx.beginPath(); ctx.moveTo(20, -46); ctx.lineTo(40, -80); ctx.lineTo(50, -40); ctx.closePath(); st.fs(ctx, c('#f08aa3')); ctx.fillStyle = st.OL; ctx.beginPath(); ctx.arc(52, -8, 6, 0, TAU); ctx.fill(); ctx.fillRect(-20, -52, 40, 8); const f = (t % 1.5) / 1.5; if (f < 0.6) emoji(ctx, '1fa99', 0, -140 + f * 150, 60, f * 5); break; }
      case 'calculator': rr(ctx, -60, -85, 120, 170, 14); st.fs(ctx, c('#3b3f52')); rr(ctx, -46, -70, 92, 40, 6); st.fs(ctx, c('#b6e3a8'), 4); for (let k = 0; k < 9; k++) { rr(ctx, -46 + (k % 3) * 32, -18 + Math.floor(k / 3) * 32, 26, 24, 5); st.fs(ctx, c((Math.floor(t * 4) % 9) === k ? st.art.accent : '#e5e7eb'), 3); } break;
      case 'watering-can': rr(ctx, -60, -40, 110, 90, 16); st.fs(ctx, c('#4cb7a0')); ctx.beginPath(); ctx.moveTo(45, 10); ctx.lineTo(120, -40); ctx.lineWidth = 16; ctx.strokeStyle = st.OL; ctx.stroke(); ctx.lineWidth = 8; ctx.strokeStyle = c('#4cb7a0'); ctx.stroke(); break;
      case 'trash': ctx.beginPath(); ctx.moveTo(-56, -50); ctx.lineTo(56, -50); ctx.lineTo(44, 70); ctx.lineTo(-44, 70); ctx.closePath(); st.fs(ctx, c('#9aa0ad')); rr(ctx, -66, -70, 132, 22, 8); st.fs(ctx, c('#6d6f7e')); break;
      case 'soda': rr(ctx, -40, -70, 80, 140, 16); st.fs(ctx, c('#ef6f6c')); ctx.fillStyle = c('#ffffff'); ctx.fillRect(-40, -12, 80, 18); break;
      default: if (VTS.comedy && VTS.comedy.drawProp) VTS.comedy.drawProp(st, ctx, name, t, age); break;
    }
    ctx.restore();
  }
  function mixc(h) { return h; }

  // ======================= settings: layout + backgrounds =======================
  const baseKind = ST.kindFor; const baseLayout = ST.layout; const baseStatic = ST.staticBg; const baseDyn = ST.dynamicBg; const baseFront = ST.furnitureFront;
  const NEWSET = new Set(NEW_SETTINGS.map((x) => x[0]));
  ST.kindFor = function (setting, pose) {
    if (setting === 'keyword-card') return 'card';
    const a = A[pose];
    if (a && a.base !== 'legacy') return a.base === 'two' ? 'stand' : a.base;
    if (NEWSET.has(setting)) { if (pose === 'walking' || pose === 'running') return 'move'; if (pose === 'meditating') return 'floor'; if (pose === 'sitting-head-in-hands') return 'sit'; if (pose === 'lying-awake' || pose === 'sleeping') return 'sit'; return 'stand'; }
    return baseKind.call(this, setting, pose);
  };
  ST.layout = function (setting, kind, scene) {
    const L = NEWSET.has(setting) ? { charX: 540, groundY: 1720, scale: 1.12, caption: 'top', anchors: { wall: [[860, 900]], table: [], sky: [], float: [[210, 930], [870, 930], [200, 1260], [880, 1260]] }, scroll: false } : baseLayout.call(this, setting, kind, scene);
    const a = scene && A[scene.pose];
    if (NEWSET.has(setting) && scene && scene.count === 2) { L.charX = 350; L.charX2 = 760; L.scale = Math.min(L.scale, 1.0); }
    if (NEWSET.has(setting)) {
      if (setting === 'bus') { L.groundY = 1700; if (kind === 'sit') { L.seatY = 1420; L.charX = 560; L.scale = 1.06; } }
      if (setting === 'stage') { L.groundY = 1700; L.scale = 1.16; }
      if (setting === 'living-room' && kind === 'sit') { L.seatY = 1400; L.groundY = 1700; L.couch = true; }
      if (kind === 'move' && ['shop', 'bus', 'stage', 'gym', 'kitchen', 'library', 'bathroom', 'living-room', 'art-studio'].includes(setting)) L.pace = true;
    }
    if (kind === 'desk' && (!L.desk || NEWSET.has(setting))) { L.desk = 'table'; L.deskKind = setting; L.seatY = 1400; L.scale = 1.08; L.groundY = 1640; L.deskY = DESKY[setting] || 1380; L.charX = 540; }
    if (kind === 'desk' && L.desk && !L.deskY) L.deskY = DESKY[setting] || 1380;
    if (a && a.work) {
      if (['sketchbook', 'notepad', 'money-jar'].includes(a.work)) L.charX = 440;
      if (a.work === 'easel' || a.work === 'plants') L.charX = 380;
      if (a.work === 'board') L.charX = 720;
      if (a.work === 'tv') L.charX = 400;
      if (a.work === 'stove') { L.charX = 460; L.groundY = 1740; }
      if (a.work === 'shower') L.charX = 470;
    }
    if (scene && scene.pose === 'hugging') { L.charX = 450; L.charX2 = 640; }
    if (scene && scene.pose === 'arguing') { L.charX = 330; L.charX2 = 770; }
    if (kind === 'card') { L.charX = 800; L.groundY = 1880; L.scale = 0.8; }
    return L;
  };
  const vg = (ctx, y0, y1, stops) => { const g = ctx.createLinearGradient(0, y0, 0, y1); stops.forEach(([o, col]) => g.addColorStop(o, col)); return g; };
  ST.staticBg = function (ctx, setting, kind, L) {
    if (!NEWSET.has(setting) || setting === 'keyword-card') return baseStatic.call(this, ctx, setting, kind, L);
    const c = (h) => this.c(h); const e = (h) => this.e(h); const fs = (f, lw) => this.fs(ctx, f, lw);
    const floor = (y, a, b, planks) => { ctx.fillStyle = vg(ctx, y, 1920, [[0, c(a)], [1, c(b)]]); ctx.fillRect(0, y, W, 1920 - y); if (planks) { ctx.strokeStyle = this.ca('#000000', 0.12); ctx.lineWidth = 4; for (let yy = y + 60; yy < 1920; yy += 70) { ctx.beginPath(); ctx.moveTo(0, yy); ctx.lineTo(W, yy); ctx.stroke(); } } ctx.fillStyle = this.ca('#000000', 0.15); ctx.fillRect(0, y, W, 14); };
    const wall = (a, b) => { ctx.fillStyle = vg(ctx, 0, 1500, [[0, c(a)], [1, c(b)]]); ctx.fillRect(0, 0, W, 1500); };
    const win = (x, y, w, h, sky) => { ctx.fillStyle = vg(ctx, y, y + h, sky || [[0, e('#7cc8f7')], [1, e('#d6f0ff')]]); ctx.fillRect(x, y, w, h); ctx.lineWidth = 20; ctx.strokeStyle = c('#fff7ee'); ctx.strokeRect(x, y, w, h); ctx.lineWidth = 10; ctx.beginPath(); ctx.moveTo(x + w / 2, y); ctx.lineTo(x + w / 2, y + h); ctx.stroke(); };
    const shelf = (x, y, w, rows, colors) => { for (let r = 0; r < rows; r++) { const yy = y + r * 150; let xx = x + 10; let k = 0; while (xx < x + w - 30) { const bw = 26 + ((k * 7 + r * 3) % 4) * 8; const bh = 90 + ((k * 13 + r) % 3) * 18; rr(ctx, xx, yy + 120 - bh, bw, bh, 4); fs(c(colors[(k + r) % colors.length]), 4); xx += bw + 4; k++; } ctx.beginPath(); ctx.rect(x, yy + 120, w, 16); fs(c('#8a6450'), 4); } };
    switch (setting) {
      case 'art-studio': {
        wall('#f6e7d3', '#efd6ba'); win(80, 560, 380, 520); floor(1480, '#caa27c', '#b07f5b', true);
        ctx.fillStyle = this.ca('#ffffff', 0.18); ctx.beginPath(); ctx.moveTo(80, 1080); ctx.lineTo(460, 1080); ctx.lineTo(700, 1920); ctx.lineTo(0, 1920); ctx.closePath(); ctx.fill();
        ['#ff8a4c', '#4cb7ff', '#8ad16b'].forEach((col, k) => { rr(ctx, 600 + k * 150, 640 + (k % 2) * 60, 120, 150, 6); fs(c('#fbf7ef')); ctx.beginPath(); ctx.arc(660 + k * 150, 715 + (k % 2) * 60, 36, 0, TAU); ctx.fillStyle = c(col); ctx.fill(); });
        ctx.beginPath(); ctx.rect(560, 1000, 460, 18); fs(c('#8a6450'));
        [620, 700, 790, 880, 960].forEach((x, k) => { rr(ctx, x, 920, 50, 80, 8); fs(c(['#e9c58f', '#c7d2fe', '#fecaca', '#bbf7d0', '#fde68a'][k])); ctx.strokeStyle = this.OL; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(x + 18, 920); ctx.lineTo(x + 10, 860); ctx.moveTo(x + 32, 920); ctx.lineTo(x + 40, 870); ctx.stroke(); });
        for (let k = 0; k < 12; k++) { ctx.fillStyle = this.ca(['#ff8a4c', '#4cb7ff', '#ffd166', '#ef6f9c'][k % 4], 0.35); ctx.beginPath(); ctx.ellipse(120 + hashN(k) * 840, 1560 + hashN(k + 7) * 320, 18 + hashN(k + 3) * 20, 8, 0, 0, TAU); ctx.fill(); }
        break;
      }
      case 'gym': {
        wall('#dfe6ee', '#c9d3de'); ctx.fillStyle = c(this.art.accent); ctx.fillRect(0, 1180, W, 40); ctx.fillStyle = c(this.art.accent2); ctx.fillRect(0, 1230, W, 18);
        rr(ctx, 90, 560, 900, 520, 10); fs(vg(ctx, 560, 1080, [[0, e('#eaf6ff')], [1, e('#b9d7ea')]])); ctx.strokeStyle = this.ca('#ffffff', 0.6); ctx.lineWidth = 16; ctx.beginPath(); ctx.moveTo(260, 600); ctx.lineTo(160, 1040); ctx.moveTo(420, 600); ctx.lineTo(320, 1040); ctx.stroke();
        ctx.beginPath(); ctx.rect(120, 1330, 840, 20); fs(c('#3b3f52')); for (let k = 0; k < 6; k++) { const x = 170 + k * 140; ctx.beginPath(); ctx.rect(x - 40, 1296, 80, 10); fs(c('#9aa0ad'), 4); [-1, 1].forEach((s) => { rr(ctx, x + s * 40 - 12, 1276, 24, 50, 5); fs(c('#3b3f52'), 4); }); }
        floor(1480, '#3a3f52', '#2a2e3d', false); ctx.strokeStyle = this.ca('#ffffff', 0.08); ctx.lineWidth = 3; for (let x = 0; x < W; x += 120) { ctx.beginPath(); ctx.moveTo(x, 1480); ctx.lineTo(x - 200, 1920); ctx.stroke(); }
        break;
      }
      case 'kitchen': {
        wall('#fbf3e6', '#f3e4cc'); ctx.fillStyle = c('#e6f0f3'); ctx.fillRect(0, 900, W, 420); ctx.strokeStyle = this.ca('#9fb8c2', 0.5); ctx.lineWidth = 3; for (let y = 900; y < 1320; y += 60) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); } for (let x = 0; x < W; x += 60) { ctx.beginPath(); ctx.moveTo(x, 900); ctx.lineTo(x, 1320); ctx.stroke(); }
        [0, 1, 2, 3].forEach((k) => { rr(ctx, 40 + k * 250, 420, 230, 360, 10); fs(c('#8fb9a8')); ctx.fillStyle = c('#e7c48e'); ctx.fillRect(40 + k * 250 + (k % 2 ? 20 : 190), 740, 16, 30); });
        win(360, 440, 360, 300); ctx.beginPath(); ctx.rect(0, 1300, W, 36); fs(c('#d9c7ae')); ctx.beginPath(); ctx.rect(0, 1336, W, 190); fs(c('#8fb9a8')); for (let k = 0; k < 5; k++) { ctx.fillStyle = c('#e7c48e'); ctx.fillRect(90 + k * 210, 1360, 60, 12); }
        rr(ctx, 860, 700, 200, 800, 20); fs(c('#e5e7eb')); ctx.fillStyle = c('#9aa0ad'); ctx.fillRect(880, 980, 12, 90); ctx.fillRect(880, 1120, 12, 90); ctx.beginPath(); ctx.moveTo(860, 1100); ctx.lineTo(1060, 1100); ctx.lineWidth = 5; ctx.strokeStyle = this.OL; ctx.stroke();
        floor(1520, '#e8d5b7', '#d3bb96', false); ctx.strokeStyle = this.ca('#000000', 0.08); ctx.lineWidth = 3; for (let x = -400; x < W + 400; x += 110) { ctx.beginPath(); ctx.moveTo(x, 1520); ctx.lineTo(x + 250, 1920); ctx.stroke(); ctx.beginPath(); ctx.moveTo(x, 1920); ctx.lineTo(x + 250, 1520); ctx.stroke(); }
        break;
      }
      case 'library': {
        wall('#6b4e3d', '#5a3f31'); shelf(20, 380, 320, 7, ['#c0584f', '#3d6b8a', '#e9b872', '#5b8c5a', '#8b5a9c', '#d98a4e']); shelf(740, 380, 320, 7, ['#3d6b8a', '#e9b872', '#c0584f', '#8b5a9c', '#5b8c5a', '#d98a4e']);
        rr(ctx, 380, 560, 320, 420, 160); fs(vg(ctx, 560, 980, [[0, e('#ffe8b0')], [1, e('#f6c67a')]])); ctx.lineWidth = 12; ctx.strokeStyle = c('#4a3428'); ctx.beginPath(); ctx.moveTo(540, 560); ctx.lineTo(540, 980); ctx.moveTo(380, 760); ctx.lineTo(700, 760); ctx.stroke();
        floor(1470, '#7a2f35', '#5e2429', false); ctx.fillStyle = this.ca('#ffd98f', 0.08); ctx.beginPath(); ctx.ellipse(540, 1700, 520, 160, 0, 0, TAU); ctx.fill();
        break;
      }
      case 'bathroom': {
        wall('#e3f2f7', '#cfe7ef'); ctx.strokeStyle = this.ca('#8fb8c6', 0.45); ctx.lineWidth = 3; for (let y = 60; y < 1500; y += 90) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); } for (let x = 0; x < W; x += 90) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 1500); ctx.stroke(); }
        rr(ctx, 780, 700, 240, 320, 110); fs(vg(ctx, 700, 1020, [[0, e('#f4fbff')], [1, e('#cde7f3')]])); rr(ctx, 760, 1120, 280, 60, 20); fs(c('#ffffff')); ctx.beginPath(); ctx.rect(880, 1180, 40, 300); fs(c('#e5e7eb'));
        ctx.beginPath(); ctx.rect(60, 330, 620, 14); fs(c('#9aa0ad'), 4); for (let k = 0; k < 7; k++) { ctx.beginPath(); ctx.moveTo(40 + k * 16, 344); ctx.quadraticCurveTo(60 + k * 16, 900, 30 + k * 18, 1480); ctx.lineTo(60 + k * 18, 1480); ctx.quadraticCurveTo(90 + k * 16, 900, 70 + k * 16, 344); ctx.closePath(); ctx.fillStyle = c(k % 2 ? '#9ad0ec' : '#b6def2'); ctx.fill(); }
        floor(1480, '#f2f4f7', '#dfe3ea', false); ctx.strokeStyle = this.ca('#000000', 0.06); ctx.lineWidth = 3; for (let x = 0; x < W; x += 110) { ctx.beginPath(); ctx.moveTo(x, 1480); ctx.lineTo(x, 1920); ctx.stroke(); }
        break;
      }
      case 'bus': {
        wall('#e9edf2', '#d7dde6'); for (let k = 0; k < 3; k++) { rr(ctx, 40 + k * 350, 520, 300, 420, 30); ctx.fillStyle = c('#20283a'); ctx.fill(); }
        ctx.beginPath(); ctx.rect(0, 1000, W, 24); fs(c(this.art.accent)); ctx.fillStyle = c('#cfd6e0'); ctx.fillRect(0, 1024, W, 480);
        ctx.strokeStyle = c('#9aa0ad'); ctx.lineWidth = 16; ctx.beginPath(); ctx.moveTo(0, 360); ctx.lineTo(W, 360); ctx.stroke(); ctx.lineWidth = 18; [300, 820].forEach((x) => { ctx.beginPath(); ctx.moveTo(x, 360); ctx.lineTo(x, 1640); ctx.stroke(); });
        for (let k = 0; k < 6; k++) { ctx.strokeStyle = this.OL; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(90 + k * 180, 360); ctx.lineTo(90 + k * 180, 430); ctx.stroke(); ctx.beginPath(); ctx.arc(90 + k * 180, 452, 22, 0, TAU); ctx.lineWidth = 9; ctx.strokeStyle = c('#f6bd60'); ctx.stroke(); }
        floor(1500, '#5a6072', '#434859', false); ctx.fillStyle = c('#f6bd60'); for (let x = 0; x < W; x += 80) ctx.fillRect(x, 1510, 40, 8);
        break;
      }
      case 'stage': {
        ctx.fillStyle = vg(ctx, 0, 1500, [[0, c('#1b1030')], [1, c('#2d1a45')]]); ctx.fillRect(0, 0, W, 1500);
        [[-1, 0], [1, W]].forEach(([s, x0]) => { for (let k = 0; k < 5; k++) { ctx.beginPath(); ctx.moveTo(x0 + s * -k * 40, 0); ctx.quadraticCurveTo(x0 - s * (80 + k * 40), 700, x0 - s * (40 + k * 40), 1500); ctx.lineTo(x0 - s * (k * 40 + 70), 1500); ctx.quadraticCurveTo(x0 - s * (110 + k * 40), 700, x0 - s * (k * 40 + 40), 0); ctx.closePath(); ctx.fillStyle = c(k % 2 ? '#a12a3a' : '#c23b4b'); ctx.fill(); } });
        ctx.fillStyle = c('#a12a3a'); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(W, 0); ctx.lineTo(W, 230); for (let k = 10; k >= 0; k--) ctx.quadraticCurveTo(k * 108 + 54, 300, k * 108, 230); ctx.closePath(); ctx.fill();
        ctx.fillStyle = vg(ctx, 1460, 1920, [[0, c('#b5835a')], [1, c('#7a5236')]]); ctx.fillRect(0, 1460, W, 460); ctx.strokeStyle = this.ca('#000000', 0.15); ctx.lineWidth = 4; for (let x = 0; x < W; x += 90) { ctx.beginPath(); ctx.moveTo(x, 1460); ctx.lineTo(x + (x - 540) * 0.4, 1920); ctx.stroke(); }
        break;
      }
      case 'shop': {
        wall('#fff4e6', '#ffe7cc'); for (let r = 0; r < 4; r++) { ctx.beginPath(); ctx.rect(40, 560 + r * 200, 1000, 18); fs(c('#b5835a'), 4); for (let k = 0; k < 9; k++) { const x = 70 + k * 108; const h2 = 90 + ((k * 7 + r * 5) % 3) * 22; rr(ctx, x, 560 + r * 200 - h2, 80, h2, 8); fs(c(['#ef6f6c', '#f6bd60', '#8ad16b', '#4cb7ff', '#b794f4', '#f9a8d4'][(k + r * 2) % 6]), 4); ctx.fillStyle = this.ca('#ffffff', 0.7); ctx.fillRect(x + 14, 560 + r * 200 - h2 + 24, 52, 14); } }
        ctx.fillStyle = c(this.art.accent); ctx.beginPath(); ctx.moveTo(0, 300); for (let k = 0; k <= 10; k++) { ctx.lineTo(k * 108, 300); ctx.quadraticCurveTo(k * 108 + 54, 400, k * 108 + 108, 300); } ctx.lineTo(W, 240); ctx.lineTo(0, 240); ctx.closePath(); ctx.fill();
        floor(1470, '#e2e8f0', '#cbd5e1', false); ctx.strokeStyle = this.ca('#000000', 0.06); ctx.lineWidth = 3; for (let x = 0; x < W; x += 120) { ctx.beginPath(); ctx.moveTo(x, 1470); ctx.lineTo(x, 1920); ctx.stroke(); }
        break;
      }
      case 'living-room': {
        wall('#e8e1f5', '#d9cfee'); win(640, 560, 340, 420); ctx.fillStyle = c('#b39ddb'); ctx.fillRect(0, 1180, W, 18);
        rr(ctx, 90, 640, 200, 150, 8); fs(c('#fbf7ef')); ctx.fillStyle = c(this.art.accent2); ctx.beginPath(); ctx.moveTo(110, 770); ctx.lineTo(170, 690); ctx.lineTo(230, 770); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.rect(360, 1120, 16, 360); fs(c('#3b3f52'), 4); ctx.beginPath(); ctx.moveTo(300, 1120); ctx.lineTo(436, 1120); ctx.lineTo(400, 1020); ctx.lineTo(336, 1020); ctx.closePath(); fs(e('#ffe3a3'));
        floor(1480, '#c9a27e', '#b08866', true); ctx.fillStyle = c(this.art.accent2); ctx.beginPath(); ctx.ellipse(540, 1740, 460, 120, 0, 0, TAU); ctx.fill();
        break;
      }
      default: baseStatic.call(this, ctx, 'void', kind, L);
    }
  };
  ST.dynamicBg = function (ctx, setting, kind, L, t, lt, scene) {
    if (!NEWSET.has(setting)) return baseDyn.call(this, ctx, setting, kind, L, t, lt, scene);
    const decor = SET_E[setting] || [];
    if (setting === 'bus') { // scenery scrolling past the windows
      for (let k = 0; k < 3; k++) { ctx.save(); rr(ctx, 40 + k * 350, 520, 300, 420, 30); ctx.clip(); ctx.fillStyle = this.e('#8fd0f5'); ctx.fillRect(40 + k * 350, 520, 300, 420);
        for (let b = 0; b < 12; b++) { const x = ((b * 170 - lt * 260) % 2040 + 2040) % 2040 - 300; const h = 120 + hashN(b) * 220; ctx.fillStyle = this.e(['#5b7fbf', '#7a8fb8', '#4a5f8f'][b % 3]); ctx.fillRect(x, 940 - h, 130, h); ctx.fillStyle = this.ea('#fff6d8', 0.7); for (let w2 = 0; w2 < 4; w2++) ctx.fillRect(x + 20 + (w2 % 2) * 50, 960 - h + Math.floor(w2 / 2) * 50, 26, 26); }
        ctx.restore(); }
    } else if (setting === 'stage') {
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; [[240, 1.1], [840, 0.8], [540, 1.4]].forEach(([x, f], k) => { const sw = Math.sin(t * f + k) * 120; const g = ctx.createLinearGradient(x, 0, x + sw, 1700); g.addColorStop(0, this.ea(['#ffd166', '#67e8f9', '#f9a8d4'][k], 0.3)); g.addColorStop(1, this.ea('#ffffff', 0)); ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(x - 30, 0); ctx.lineTo(x + 30, 0); ctx.lineTo(x + sw + 260, 1720); ctx.lineTo(x + sw - 260, 1720); ctx.closePath(); ctx.fill(); }); ctx.restore();
    } else if (setting === 'kitchen') { emoji(ctx, decor[0], 150, 1250, 110); emoji(ctx, decor[1], 300, 1265, 80); emoji(ctx, decor[2], 700, 1255, 100); }
    else if (setting === 'art-studio') { emoji(ctx, decor[2], 900, 1440, 130, -0.2); }
    else if (setting === 'living-room') { emoji(ctx, decor[0], 960, 1380, 190, Math.sin(t) * 0.03); }
    else if (setting === 'library') { emoji(ctx, decor[1], 540, 1060, 80, 0, 0.85 + 0.15 * Math.sin(t * 9)); }
    else if (setting === 'bathroom') { emoji(ctx, decor[0], 840, 1095, 70); emoji(ctx, decor[1], 960, 1090, 70, 0.4); }
    else if (setting === 'gym') { emoji(ctx, decor[0], 540, 1110, 90); }
  };
  ST.furnitureFront = function (ctx, setting, kind, L, pose, t) {
    if (L.desk !== 'table') return baseFront.call(this, ctx, setting, kind, L, pose, t);
    const top = L.deskY || 1380; const col = { library: ['#6b4a36', '#553827'], 'art-studio': ['#d8b48c', '#c49a6c'], kitchen: ['#e9e3da', '#cfc3b3'], shop: ['#f3ece2', '#d9cbb8'] }[setting] || ['#c99468', '#a87550'];
    ctx.beginPath(); ctx.rect(30, top, 1020, 40); this.fs(ctx, this.c(col[0]));
    ctx.beginPath(); ctx.rect(70, top + 40, 940, 1920 - top); this.fs(ctx, this.c(col[1]));
    ctx.fillStyle = this.ca('#000000', 0.08); ctx.fillRect(70, top + 40, 940, 24);
  };
  const baseBack = ST.furnitureBack;
  ST.furnitureBack = function (ctx, setting, kind, L, t) {
    if (L.couch) { const c = (h) => this.c(h); rr(ctx, 170, 1180, 740, 300, 60); this.fs(ctx, c('#7c6fb0')); rr(ctx, 130, 1300, 120, 260, 40); this.fs(ctx, c('#6a5ea0')); rr(ctx, 830, 1300, 120, 260, 40); this.fs(ctx, c('#6a5ea0')); rr(ctx, 230, 1380, 620, 150, 30); this.fs(ctx, c('#8d80c2')); return; }
    if (setting === 'bus' && kind === 'sit') { const c = (h) => this.c(h); rr(ctx, L.charX - 170, 1060, 340, 380, 40); this.fs(ctx, c('#3d6b8a')); rr(ctx, L.charX - 190, 1400, 380, 80, 24); this.fs(ctx, c('#355d78')); return; }
    if (kind === 'sit' && /^bedroom/.test(setting)) { const c = (h) => this.c(h); rr(ctx, L.charX - 260, L.seatY - 40, 520, 70, 26); this.fs(ctx, c('#e8e3f5')); rr(ctx, L.charX - 270, L.seatY + 20, 540, L.groundY - L.seatY - 20, 16); this.fs(ctx, c(setting === 'bedroom-night' ? '#5b7fbf' : this.art.accent2)); baseBack.call(this, ctx, setting, kind, L, t); return; }
    if (kind === 'sit' && NEWSET.has(setting)) { const c = (h) => this.c(h); const topY = L.groundY - 150 * L.scale + 4; rr(ctx, L.charX - 170, topY - 10, 340, L.groundY - topY + 10, 18); this.fs(ctx, c(this.art.accent2)); return; }
    return baseBack.call(this, ctx, setting, kind, L, t);
  };

  // ======================= scene hooks used by scenes.js =======================
  function pairArms(pose, sp, t, pair) {
    const s = pair || 1; // +1 = left person facing right, -1 = right person facing left
    if (pose === 'hugging') {
      const sq = Math.sin(t * 2.2) * 6;
      sp.armR = { x: s * 150 + sq, y: -170, bend: s }; sp.armL = { x: s * 120 - sq, y: -200, bend: s }; if (s < 0) { const tmp = sp.armR; sp.armR = { x: sp.armL.x, y: sp.armL.y, bend: -1 }; sp.armL = { x: tmp.x, y: tmp.y, bend: -1 }; }
      sp.handsFront = s > 0; sp.tilt = s * 0.08; sp.headTilt = s * 0.18; sp.eyesClosed = true; sp.mouth = 'smile'; sp.look = { x: s * 0.6, y: 0 };
    } else if (pose === 'arguing') {
      const g = Math.sin(t * 5 + (s < 0 ? 1.6 : 0));
      const point = { x: s * 200, y: -200 - Math.max(0, g) * 40, bend: s };
      if (s > 0) { sp.armR = point; sp.armL = { x: -100, y: -60 - Math.max(0, -g) * 80, bend: -1 }; } else { sp.armL = point; sp.armR = { x: 100, y: -60 - Math.max(0, -g) * 80, bend: 1 }; }
      sp.tilt = s * 0.05; sp.mouth = g > -0.2 ? 'talk' : 'frown'; sp.look = { x: s * 0.8, y: 0 }; sp.headDy = -Math.abs(g) * 4;
    }
  }
  function extPose(pose, sp, t, o) {
    const a = A[pose]; if (!a) return;
    if (a.base === 'sit') sp.seated = true;
    if (a.base === 'two') { pairArms(pose, sp, t, o && o.pair); return; }
    if (a.arms) a.arms(sp, t, o || {});
  }
  function afterCharacter(st, ctx, sp, info) {
    const a = A[info.pose]; const sc = info.scale; const hw = info.toWorld(info.headLocal[0], info.headLocal[1]);
    if (a && a.headphones) {
      ctx.save(); ctx.translate(hw[0], hw[1]); ctx.rotate((sp.tilt || 0) + (sp.headTilt || 0)); ctx.scale(sc, sc);
      ctx.lineWidth = 16; ctx.strokeStyle = st.OL; ctx.beginPath(); ctx.arc(0, 0, 104, Math.PI * 1.08, Math.PI * 1.92); ctx.stroke();
      ctx.lineWidth = 9; ctx.strokeStyle = st.c(st.art.accent); ctx.beginPath(); ctx.arc(0, 0, 104, Math.PI * 1.08, Math.PI * 1.92); ctx.stroke();
      [-1, 1].forEach((s) => { rr(ctx, s * 100 - 20, -30, 40, 70, 16); st.fs(ctx, st.c(st.art.accent)); });
      ctx.restore();
    }
    if (sp.crying) { // streams of falling tears
      ctx.fillStyle = st.ea('#7cc8f7', 0.9);
      for (let k = 0; k < 4; k++) { const ph = (info.t * 1.3 + k * 0.25) % 1; const side = k % 2 ? 1 : -1; const x = hw[0] + side * (40 + ph * 30) * sc; const y = hw[1] + (20 + ph * 180) * sc; ctx.globalAlpha = 1 - ph; ctx.beginPath(); ctx.ellipse(x, y, 9 * sc, 13 * sc, 0, 0, TAU); ctx.fill(); }
      ctx.globalAlpha = 1;
    }
    if (sp.glow) { const hy = info.toWorld(0, -170); const g = ctx.createRadialGradient(hy[0], hy[1], 10, hy[0], hy[1], 260 * sc); g.addColorStop(0, st.ea('#fff3b0', 0.4 + 0.1 * Math.sin(info.t * 2))); g.addColorStop(1, st.ea('#fff3b0', 0)); ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = g; ctx.fillRect(hy[0] - 280 * sc, hy[1] - 280 * sc, 560 * sc, 560 * sc); ctx.restore(); }
  }
  function pre(st, ctx, scene, L, kind, t, lt, x) {
    const a = A[scene.pose];
    if (a && a.work === 'yoga-mat') { ctx.beginPath(); ctx.ellipse(x, L.groundY + 6, 290 * L.scale, 42 * L.scale, 0, 0, TAU); st.fs(ctx, st.c(st.art.accent2)); ctx.strokeStyle = st.ea('#ffffff', 0.35); ctx.lineWidth = 4; for (let k = -2; k <= 2; k++) { ctx.beginPath(); ctx.moveTo(x + k * 100 * L.scale, L.groundY - 20 * L.scale); ctx.lineTo(x + k * 100 * L.scale, L.groundY + 30 * L.scale); ctx.stroke(); } return null; }
    const g = workGeom(st, scene, L, kind, t, lt, x); if (!g) return null;
    drawWorkBack(st, ctx, g, t, lt);
    return { g, targetR: g.targetR, targetL: g.targetL };
  }
  function post(st, ctx, scene, L, kind, Ach, X, t, lt, sh) {
    const a = A[scene.pose]; const g = X && X.g;
    if (g) drawWorkFront(st, ctx, g, t, lt, scene);
    if (scene.pose === 'showering' && Ach && Ach.head) { // shower head + falling water
      const hx = Ach.head.x; const top = Ach.head.y - 300;
      ctx.lineWidth = 14; ctx.strokeStyle = st.c('#9aa0ad'); ctx.beginPath(); ctx.moveTo(hx + 200, top - 120); ctx.lineTo(hx + 200, top - 60); ctx.quadraticCurveTo(hx + 200, top - 20, hx + 60, top - 10); ctx.stroke();
      rr(ctx, hx - 80, top - 30, 160, 40, 18); st.fs(ctx, st.c('#cbd5e1'));
      ctx.strokeStyle = st.ea('#7cc8f7', 0.75); ctx.lineWidth = 6; ctx.lineCap = 'round';
      for (let k = 0; k < 14; k++) { const x = hx - 70 + k * 10.8 + Math.sin(k * 3.1) * 6; const ph = (lt * 2.4 + hashN(k)) % 1; const y0 = top + 20 + ph * 380; ctx.globalAlpha = 1 - ph * 0.6; ctx.beginPath(); ctx.moveTo(x + (x - hx) * ph * 0.5, y0); ctx.lineTo(x + (x - hx) * (ph + 0.12) * 0.5, y0 + 60); ctx.stroke(); }
      ctx.globalAlpha = 1;
    }
    if (a && a.hold && a.hold.length && Ach && Ach.handR && Ach.handL) a.hold.forEach((h) => drawHeld(st, ctx, h, Ach, t, g, scene));
  }
  function wrapText(ctx, text, maxW) { const words = String(text).split(/\s+/); const lines = []; let cur = ''; words.forEach((w) => { const n = cur ? cur + ' ' + w : w; if (ctx.measureText(n).width > maxW && cur) { lines.push(cur); cur = w; } else cur = n; }); if (cur) lines.push(cur); return lines.slice(0, 3); }
  function card(st, ctx, scene, L, t, lt, sh) {
    const H = 1920; const acc = st.c(st.art.accent); const acc2 = st.c(st.art.accent2);
    const g = ctx.createLinearGradient(0, 0, W, H); g.addColorStop(0, st.c('#fff4e0')); g.addColorStop(1, st.c('#ffe1d0')); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.save(); ctx.globalAlpha = 0.18; ctx.fillStyle = acc; for (let k = 0; k < 18; k++) { const x = hashN(k) * W; const y = ((hashN(k + 30) * H) - lt * (20 + hashN(k + 9) * 30) + H * 4) % H; ctx.beginPath(); ctx.arc(x, y, 10 + hashN(k + 4) * 26, 0, TAU); ctx.fill(); } ctx.restore();
    const ap = popIn(lt / 0.55); const bob = Math.sin(t * 1.8) * 14; const cx = 540; const cy = 960 + bob; const size = 600 * Math.max(0.01, ap);
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(Math.sin(t * 0.9) * 0.03);
    ctx.fillStyle = 'rgba(0,0,0,0.12)'; rr(ctx, -size / 2 + 14, -size / 2 + 22, size, size, 70 * ap); ctx.fill();
    rr(ctx, -size / 2, -size / 2, size, size, 70 * ap); st.fs(ctx, st.c('#ffffff'), 10);
    const file = scene.icon || emojiForWord(scene.iconWord || scene.keywords[0]);
    const img = file && (EMO.big(file) || EMO.get(file));
    if (img) { const es = size * 0.8; const sq = 1 + Math.sin(t * 3) * 0.02; ctx.drawImage(img, -es / 2, -es / 2 * sq, es, es * sq); }
    else { ctx.font = '900 110px Montserrat, "Arial Black", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = acc; const lines = wrapText(ctx, String(scene.iconWord || scene.keywords[0] || '?').toUpperCase(), size * 0.8); lines.forEach((ln, i) => ctx.fillText(ln, 0, (i - (lines.length - 1) / 2) * 120 * ap)); }
    ctx.restore();
    const word = String(scene.iconWord || scene.keywords[0] || '').toUpperCase();
    if (word && img) { const pa = clamp01((lt - 0.3) / 0.4); ctx.save(); ctx.globalAlpha = pa; ctx.font = '900 64px Montserrat, "Arial Black", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; const w = Math.min(760, ctx.measureText(word).width + 90); rr(ctx, 540 - w / 2, 1320 - 50 + (1 - pa) * 30, w, 100, 50); st.fs(ctx, acc2, 8); ctx.fillStyle = '#ffffff'; ctx.fillText(word, 540, 1322 + (1 - pa) * 30, 700); ctx.restore(); }
    // small character reacting (points at the card)
    const pose = st.positive(scene.emotion) ? 'celebrating' : scene.emotion === 'surprised' ? 'celebrating' : 'talking';
    ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.beginPath(); ctx.ellipse(L.charX, L.groundY + 4, 120, 20, 0, 0, TAU); ctx.fill();
    const Ach = st.character(ctx, L.charX, L.groundY, L.scale, pose, scene.emotion, t, { seed: 0, targetL: pose === 'talking' ? [L.charX - 230, L.groundY - 520 + Math.sin(t * 3) * 14] : null });
    return Ach;
  }
  VTS.sceneExt = { pose: extPose, afterCharacter, pre, post, card };

  // ======================= exports =======================
  function preload(scenes) { const files = new Set(); (scenes || []).forEach((sc) => { if (sc) iconsFor(sc).forEach((f) => files.add(f)); }); Object.values(SET_E).forEach((a) => a.forEach((f) => files.add(f))); return EMO.load(Array.from(files)); }
  Object.assign(S, { normalizeScene, fixupScene: fixup, matchScore, analyze, diversify, describe, iconsFor, ACTIONS: A, PROPS_META: P, EMO, emojiForWord, emojiFile, preload, lexLookup, EMOJI_COUNT: EFILES.size });
})();
