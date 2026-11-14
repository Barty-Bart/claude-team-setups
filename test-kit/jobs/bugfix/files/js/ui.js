/*
 * ui.js — DOM screens (title, shop, game over) and the HUD.
 * Calls back into main.js through the handlers passed to createUI().
 */
(function (root) {
  'use strict';

  const Shop = root.AS.Shop;
  const World = root.AS.World;

  function $(id) {
    return document.getElementById(id);
  }

  function createUI(handlers) {
    const screens = {
      title: $('screen-title'),
      shop: $('screen-shop'),
      gameover: $('screen-gameover'),
    };
    const hud = $('hud');
    const el = {
      hpFill: $('hud-hp-fill'),
      hpText: $('hud-hp-text'),
      wave: $('hud-wave'),
      left: $('hud-left'),
      score: $('hud-score'),
      coins: $('hud-coins'),
      titleBest: $('title-best'),
      shopTitle: $('shop-title'),
      shopCoins: $('shop-coins'),
      shopHp: $('shop-hp'),
      shopList: $('shop-list'),
      btnContinue: $('btn-continue'),
      goWave: $('go-wave'),
      goScore: $('go-score'),
      goBest: $('go-best'),
      goNewBest: $('go-newbest'),
      mute: $('btn-mute'),
    };
    const hudCache = {};
    let enteringTimer = null;

    // Buttons ---------------------------------------------------------------
    $('btn-start').addEventListener('click', () => handlers.onStart());
    $('btn-restart').addEventListener('click', () => handlers.onRestart());
    $('btn-title').addEventListener('click', () => handlers.onTitle());
    el.btnContinue.addEventListener('click', () => handlers.onContinue());
    el.mute.addEventListener('click', () => handlers.onToggleMute());

    // Shop rows are built once and updated in place so focus is preserved.
    const rows = Shop.UPGRADE_LIST.map((u, i) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'upgrade';
      btn.dataset.upgrade = u.id;
      btn.innerHTML =
        '<span class="key">' + (i + 1) + '</span>' +
        '<span class="info"><span class="name"></span><span class="desc"></span></span>' +
        '<span class="price"></span>';
      btn.addEventListener('click', () => handlers.onBuy(u.id));
      btn.addEventListener('animationend', () => btn.classList.remove('bought'));
      el.shopList.appendChild(btn);
      return {
        id: u.id,
        btn,
        name: btn.querySelector('.name'),
        desc: btn.querySelector('.desc'),
        price: btn.querySelector('.price'),
      };
    });

    function setText(node, key, value) {
      if (hudCache[key] === value) return;
      hudCache[key] = value;
      node.textContent = value;
    }

    function updateHud(game) {
      const p = game.player;
      const frac = p.maxHp > 0 ? Math.max(0, p.hp / p.maxHp) : 0;
      const pct = Math.round(frac * 1000) / 10;
      if (hudCache.hpPct !== pct) {
        hudCache.hpPct = pct;
        el.hpFill.style.width = pct + '%';
        el.hpFill.classList.toggle('low', frac < 0.3);
        el.hpFill.classList.toggle('mid', frac >= 0.3 && frac < 0.6);
      }
      setText(el.hpText, 'hp', Math.ceil(p.hp) + ' / ' + p.maxHp);
      setText(el.wave, 'wave', 'Wave ' + game.wave);
      setText(el.left, 'left', World.waveRemaining(game) + ' left');
      setText(el.score, 'score', game.score.toLocaleString('en-US'));
      setText(el.coins, 'coins', String(game.coins));
    }

    function refreshShop(game, boughtId) {
      const p = game.player;
      el.shopTitle.textContent = 'Wave ' + game.wave + ' cleared';
      el.shopCoins.textContent = String(game.coins);
      el.shopHp.textContent = Math.ceil(p.hp) + ' / ' + p.maxHp;
      el.btnContinue.textContent = 'Start wave ' + (game.wave + 1);
      const offers = Shop.shopOffers({ coins: game.coins, upgrades: game.upgrades, hp: p.hp, maxHp: p.maxHp });
      offers.forEach((o, i) => {
        const r = rows[i];
        r.name.innerHTML = '';
        r.name.appendChild(document.createTextNode(o.name));
        if (o.level > 0 && o.id !== 'heal') {
          const lvl = document.createElement('span');
          lvl.className = 'lvl';
          lvl.textContent = 'Lv ' + o.level;
          r.name.appendChild(lvl);
        }
        r.desc.textContent = o.maxed ? 'Fully upgraded' : o.description;
        r.price.className = 'price';
        if (o.maxed) {
          r.price.textContent = 'MAX';
          r.price.classList.add('maxed');
        } else if (o.reason === 'fullHp') {
          r.price.textContent = 'Full HP';
          r.price.classList.add('full');
        } else {
          r.price.innerHTML = '<span class="coin-icon"></span>' + o.price;
          if (o.reason === 'coins') r.price.classList.add('short');
        }
        r.btn.disabled = !o.canBuy;
        r.btn.setAttribute('aria-label',
          o.name + (o.maxed ? ', maxed' : ', costs ' + o.price + ' coins') + '. ' + r.desc.textContent);
        if (boughtId === o.id) {
          r.btn.classList.remove('bought');
          void r.btn.offsetWidth; // restart the animation
          r.btn.classList.add('bought');
        }
      });
    }

    function showScreen(name, game) {
      for (const key in screens) screens[key].hidden = key !== name;
      hud.hidden = name !== 'playing';
      const screen = screens[name];
      if (enteringTimer) clearTimeout(enteringTimer);
      if (screen) {
        // Ignore stray taps while the panel animates in after a wave/death.
        const delayed = name === 'shop' || name === 'gameover';
        screen.classList.toggle('entering', delayed);
        if (delayed) enteringTimer = setTimeout(() => screen.classList.remove('entering'), 450);
      }
      if (name === 'title') {
        el.titleBest.textContent = game.highScore.toLocaleString('en-US');
        focus($('btn-start'));
      } else if (name === 'shop') {
        refreshShop(game);
        focus(el.btnContinue);
      } else if (name === 'gameover') {
        el.goWave.textContent = 'You fell on wave ' + game.wave;
        el.goScore.textContent = game.score.toLocaleString('en-US');
        el.goBest.textContent = Math.max(game.highScore, game.score).toLocaleString('en-US');
        el.goNewBest.hidden = !game.newHighScore;
        focus($('btn-restart'));
      } else if (name === 'playing') {
        for (const k in hudCache) delete hudCache[k];
        updateHud(game);
        if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
      }
    }

    function focus(node) {
      try { node.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
    }

    function setMuted(m) {
      el.mute.classList.toggle('muted', m);
      el.mute.setAttribute('aria-label', m ? 'Unmute sound' : 'Mute sound');
    }

    return { showScreen, updateHud, refreshShop, setMuted };
  }

  const UI = { createUI };
  (root.AS = root.AS || {}).UI = UI;
})(typeof globalThis !== 'undefined' ? globalThis : this);
