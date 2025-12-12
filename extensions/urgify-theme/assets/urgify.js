(function () {
  'use strict';
  
  const globalConsole = (typeof window !== "undefined" && window.console) || {
    log: () => {},
    warn: () => {},
    error: () => {},
  };

  let debugEnabled =
    (typeof window !== "undefined" &&
      (window.UrgifyDebug === true ||
        (window.Shopify && window.Shopify.designMode === true))) ||
    false;

  const console = {
    log: (...args) => {
      if (debugEnabled) {
        globalConsole.log(...args);
      }
    },
    info: (...args) => {
      if (debugEnabled && typeof globalConsole.info === "function") {
        globalConsole.info(...args);
      } else if (debugEnabled) {
        globalConsole.log(...args);
      }
    },
    debug: (...args) => {
      if (debugEnabled && typeof globalConsole.debug === "function") {
        globalConsole.debug(...args);
      } else if (debugEnabled) {
        globalConsole.log(...args);
      }
    },
    warn: (...args) => {
      if (debugEnabled) {
        globalConsole.warn(...args);
      }
    },
    error: (...args) => {
      globalConsole.error(...args);
    },
  };

  if (typeof window !== "undefined") {
    try {
      Object.defineProperty(window, "UrgifyDebug", {
        get() {
          return debugEnabled;
        },
        set(value) {
          debugEnabled = Boolean(value);
        },
        configurable: true,
      });
    } catch (error) {
      globalConsole.warn("Urgify: Unable to define UrgifyDebug property", error);
    }
  }

  // Set presence flag early to prevent fallback conflicts
  window.__URGIFY_PRESENT__ = true;
  
  // Keine frühe Rückkehr! Klassen/Fixes sollen immer (neu) definiert werden.

  /**
   * Urgify - Unified Urgency Suite
   * Handles all urgency-related features: Countdown, Stock Alerts, Limited Offers, etc.
   */
  class Urgify {
    constructor() {
      this.blocks = new Map();
      this.config = window.UrgifyCore?.config || {};
      this.initialized = false;
      this.version = '578';
    }

    /**
     * Initialize all Urgify blocks on the page
     */
    init() {
      if (!this.initialized) {
        globalConsole.log(`Urgify v${this.version} initialized`);
      }
      
      // Find and initialize all Urgify blocks
      const blocks = document.querySelectorAll('[data-urgify]');
      
      blocks.forEach(block => {
        this.initBlock(block);
      });
      
      // Listen for dynamic content changes
      this.observeChanges();
      
      this.initialized = true;
    }

    /**
     * Initialize a single block
     */
    initBlock(block) {
      const blockType = block.dataset.urgify;
      const blockId = block.dataset.blockId || block.id;
      
      if (!blockType || !blockId) {
        console.warn("Block missing required data attributes:", block);
        return;
      }

      // --- robust duplicate handling in initBlock ---
      if (this.blocks.has(blockId)) {
        const existing = this.blocks.get(blockId);
        // If stored element was removed from DOM OR it's not the same element -> re-init
        if (!existing || !existing.element || !document.body.contains(existing.element) || existing.element !== block) {
          // destroy previous instance (if possible)
          try {
            if (existing.element && existing.element.__urgifyInst && typeof existing.element.__urgifyInst.destroy === 'function') {
              existing.element.__urgifyInst.destroy();
            }
          } catch (e) {
            console.warn('Urgify: error while destroying previous block instance', e);
          }
          // remove stale map entry so new init runs below
          this.blocks.delete(blockId);
          if (debugEnabled) {
            console.info('Urgify: re-initializing blockId (detected replaced DOM node):', blockId);
          }
        } else {
          // same element still in DOM -> nothing to do
          return;
        }
      }

      try {
        switch (blockType) {
          case 'countdown':
            this.initCountdown(block);
            break;
          case 'stock-alert':
            this.initStockAlert(block);
            break;
          case 'limited-offer':
            this.initLimitedOffer(block);
            break;
          case 'scarcity-banner':
            this.initScarcityBanner(block);
            break;
          case 'urgency-notification':
            this.initUrgencyNotification(block);
            break;
          default:
            console.warn(`Unknown block type: ${blockType}`);
        }
        
        this.blocks.set(blockId, { type: blockType, element: block });
      } catch (error) {
        console.error(`Error initializing ${blockType} block:`, error);
      }
    }

    /**
     * Initialize Countdown Block
     */
    initCountdown(block) {
      // The UrgifyCountdown constructor now handles everything automatically
      // It reads settings from data-settings attribute and initializes itself
      new UrgifyCountdown(block);
    }

  /**
   * Initialize Stock Alert Block
   */
  initStockAlert(block) {
    const productId = block.dataset.productId;
    const variantId = block.dataset.variantId;
    const threshold = parseInt(block.dataset.threshold) || 10;
    const criticalThreshold = parseInt(block.dataset.criticalThreshold) || 5;
    
    // Defer initialization until class is defined
    setTimeout(() => {
      if (typeof UrgifyStockAlert !== 'undefined') {
        const stockAlert = new UrgifyStockAlert(block, {
          productId,
          variantId,
          threshold,
          criticalThreshold
        });
        stockAlert.init();
      }
    }, 0);
  }

    /**
     * Initialize Limited Offer Block
     */
    initLimitedOffer(block) {
      // Defer initialization until class is defined
      setTimeout(() => {
        if (typeof UrgifyLimitedOffer !== 'undefined') {
          const offer = new UrgifyLimitedOffer(block);
          offer.init();
        }
      }, 0);
    }

    /**
     * Initialize Scarcity Banner Block
     */
    initScarcityBanner(block) {
      // Defer initialization until class is defined
      setTimeout(() => {
        if (typeof UrgifyScarcityBanner !== 'undefined') {
          const banner = new UrgifyScarcityBanner(block);
          banner.init();
        }
      }, 0);
    }

    /**
     * Initialize Urgency Notification Block
     */
    initUrgencyNotification(block) {
      // Defer initialization until class is defined
      setTimeout(() => {
        if (typeof UrgifyUrgencyNotification !== 'undefined') {
          const notification = new UrgifyUrgencyNotification(block);
          notification.init();
        }
      }, 0);
    }

    /**
     * Observe DOM changes for dynamically added blocks
     */
    observeChanges() {
      if (typeof MutationObserver !== 'undefined') {
        const observer = new MutationObserver((mutations) => {
          mutations.forEach((mutation) => {
            mutation.addedNodes.forEach((node) => {
              if (node.nodeType === Node.ELEMENT_NODE) {
                // Check if the added node is a Urgify block
                if (node.dataset && node.dataset.urgify) {
                  this.initBlock(node);
                }
                
                // Check for Urgify blocks within the added node
                const blocks = node.querySelectorAll && node.querySelectorAll('[data-urgify]');
                if (blocks) {
                  blocks.forEach(block => this.initBlock(block));
                }
              }
            });
          });
        });

        observer.observe(document.body, {
          childList: true,
          subtree: true
        });
      }
    }

    /**
     * Get block by ID
     */
    getBlock(blockId) {
      return this.blocks.get(blockId);
    }

    /**
     * Destroy a block
     */
    destroyBlock(blockId) {
      const block = this.blocks.get(blockId);
      if (block) {
        // Clean up any timers, event listeners, etc.
        this.blocks.delete(blockId);
        if (debugEnabled) {
          console.log(`Destroyed block: ${blockId}`);
        }
      }
    }
  }

  /**
   * Urgify Countdown Class - Enhanced with Countify functionality
   */
  class UrgifyCountdown {
    constructor(block, options) {
      if (!block || block.nodeType !== Node.ELEMENT_NODE) {
        return;
      }

      this.block = block;
      // make instance discoverable for debugging & avoid duplicate intervals
      this.block.__urgifyInst = this;
      this.block.__urgifyBootstrapped = true;
      this.settings = this.parseSettings();
      this.countdownInterval = null;
      this.isExpired = false;
      
      // Race-safe flip tracking - store previous values internally
      this.lastValues = {
        days: -1,
        hours: -1,
        minutes: -1,
        seconds: -1
      };

      this.init();
    }

  parseSettings() {
    const defaults = {
      countdown_style: 'digital',
      animation: 'none',
      show_days: true,
      show_hours: true,
      show_minutes: true,
      show_seconds: true,
    };

    const fallback = {};
    const epochAttr = this.block.getAttribute('data-target-epoch');
    if (epochAttr != null && epochAttr !== '' && !isNaN(Number(epochAttr))) {
      // zwingend Number: Liquid/GZIP etc. kann Strings liefern
      fallback.target_epoch = Number(epochAttr);
    }
    const dtAttr = this.block.getAttribute('data-target-datetime');
    if (dtAttr) fallback.target_datetime = dtAttr.trim();

    try {
      const settingsStr = this.block.getAttribute('data-settings');
      if (!settingsStr || settingsStr === 'null' || settingsStr === '') {
        return { ...defaults, ...fallback };
      }
      const parsed = JSON.parse(settingsStr);
      // ensure parsed target_epoch is numeric if present
      if (parsed && parsed.target_epoch != null && !isNaN(Number(parsed.target_epoch))) {
        parsed.target_epoch = Number(parsed.target_epoch);
      }
      return { ...defaults, ...fallback, ...parsed };
    } catch (e) {
      console.warn('Urgify: settings JSON parse failed — using fallbacks/defaults', e);
      return { ...defaults, ...fallback };
    }
  }

  getPartEl(kind) {
    const rawId   = (this.block.id || '').toString();
    const shortId = rawId.replace(/^urgify-countdown-/, '');

    // 1) preferred inside block
    const byIdInside = (id) => this.block.querySelector('#' + id);
    let el = byIdInside(`${kind}-${shortId}`) || byIdInside(`${kind}-${rawId}`);
    if (el) return el;

    // 2) fallback: global document search (covers cases where markup moved)
    el = document.querySelector('#' + `${kind}-${shortId}`) || document.querySelector('#' + `${kind}-${rawId}`);
    if (el) return el;

    // 3) fallback: look for data attributes on flip/circular wrappers
    const flip = this.block.querySelector(`.flip-card[data-${kind}="${rawId}"], .flip-card[data-${kind}="${shortId}"]`) ||
                 document.querySelector(`.flip-card[data-${kind}="${rawId}"], .flip-card[data-${kind}="${shortId}"]`);
    if (flip) {
      // try to return inner numeric element
      return flip.querySelector(`#${kind}-${shortId}`) || flip.querySelector(`#${kind}-${rawId}`);
    }

    return null;
  }

    init() {
      // Mindestens einer der beiden muss da sein
      if (
        !(typeof this.settings.target_epoch === 'number' && this.settings.target_epoch > 0) &&
        !this.settings.target_datetime
      ) {
        if (debugEnabled) {
          console.warn('UrgifyCountdown: No target provided (neither epoch nor datetime).');
        }
        return;
      }
      
      this.setupCountdown();
      this.updateCountdown();
    }

  setupCountdown() {
    const countdownContainer = this.block.querySelector('.countdown-container');
    if (!countdownContainer) {
      if (debugEnabled) {
        console.warn('UrgifyCountdown: Countdown container not found');
      }
      return;
    }

    // Make countdown visible
    countdownContainer.style.display = 'flex';
    countdownContainer.classList.add('is-ready');
    this.block.style.display = 'block';

    // If an interval already exists on this instance, clear it first
    if (this.countdownInterval) {
      clearInterval(this.countdownInterval);
      this.countdownInterval = null;
    }

    // Helpful debug flag
    this._lastTotalSeconds = null;

    this.countdownInterval = setInterval(() => {
      try {
        this.updateCountdown();
      } catch (err) {
        // Ensure uncaught exceptions inside updateCountdown don't silently break things
        console.error('UrgifyCountdown: error in interval updateCountdown:', err);
      }
    }, 1000);
  }

    parseIsoLocal(datetimeStr) {
      // akzeptiert: YYYY-MM-DD, YYYY-MM-DD HH:MM, YYYY-MM-DDTHH:MM, mit/ohne :SS
      if (!datetimeStr) return null;

      // Hat explizite TZ? -> Native Date reicht.
      if (/[+-]\d{2}:\d{2}|Z$/.test(datetimeStr)) {
        const d = new Date(datetimeStr);
        return isNaN(d) ? null : d;
      }

      // Space -> T
      const s = datetimeStr.replace(' ', 'T');

      // Mit Sekunde auffüllen
      const withSec = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s) ? s + ':00' : s;

      // Manuell lokal parsen (sicher in allen Browsern)
      const m = withSec.match(
        /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2}))?)?$/
      );
      if (!m) {
        const d = new Date(withSec);
        return isNaN(d) ? null : d;
      }
      const [, Y, M, D, h = '0', mnt = '0', sec = '0'] = m;
      return new Date(
        Number(Y),
        Number(M) - 1,
        Number(D),
        Number(h),
        Number(mnt),
        Number(sec),
        0
      );
    }

  updateCountdown() {
    try {
      const nowMs = Date.now();
      let targetTimeMs = null;

      if (typeof this.settings.target_epoch === 'number' && this.settings.target_epoch > 0) {
        targetTimeMs = this.settings.target_epoch * 1000;
      } else if (this.settings.target_datetime) {
        const parsed = this.parseIsoLocal(this.settings.target_datetime);
        if (parsed && !isNaN(parsed.getTime())) {
          targetTimeMs = parsed.getTime();
        }
      }

      if (!targetTimeMs || isNaN(targetTimeMs)) {
        console.error('Urgify: Invalid target datetime in countdown settings', this.settings);
        // show expired message so user sees something actionable (and stop interval)
        this.handleExpired();
        return;
      }

      const timeLeftMs = targetTimeMs - nowMs;

      if (timeLeftMs <= 0) {
        this.handleExpired();
        return;
      }

      const totalSeconds = Math.floor(timeLeftMs / 1000);
      const days = Math.floor(totalSeconds / (24 * 60 * 60));
      const hours = Math.floor((totalSeconds % (24 * 60 * 60)) / (60 * 60));
      const minutes = Math.floor((totalSeconds % (60 * 60)) / 60);
      const seconds = totalSeconds % 60;

      // Countdown update (removed console.log to reduce noise)

      // Track last total seconds to avoid unnecessary updates
      if (this._lastTotalSeconds !== totalSeconds) {
        this._lastTotalSeconds = totalSeconds;
      }

      this.isExpired = false;
      this.updateDisplay(days, hours, minutes, seconds);
    } catch (e) {
      console.error('UrgifyCountdown: uncaught error in updateCountdown', e);
      // keep interval running — don't silently die
    }
  }

    calculateAndDisplayTime(timeLeft) {
      const days = Math.floor(timeLeft / (1000 * 60 * 60 * 24));
      const hours = Math.floor((timeLeft % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((timeLeft % (1000 * 60)) / 1000);

      // Update countdown display based on style
      this.updateDisplay(days, hours, minutes, seconds);
    }

    updateDisplay(days, hours, minutes, seconds) {
      const style = this.settings.countdown_style || 'digital';

      switch (style) {
        case 'digital':
          this.updateDigitalDisplay(days, hours, minutes, seconds);
          break;
        case 'flip':
          this.updateFlipDisplay(days, hours, minutes, seconds);
          break;
        case 'circular':
          this.updateCircularDisplay(days, hours, minutes, seconds);
          break;
        case 'minimal':
          this.updateMinimalDisplay(days, hours, minutes, seconds);
          break;
        default:
          this.updateDigitalDisplay(days, hours, minutes, seconds);
      }
    }

    updateDigitalDisplay(days, hours, minutes, seconds) {
      const daysElement    = this.getPartEl('days');
      const hoursElement   = this.getPartEl('hours');
      const minutesElement = this.getPartEl('minutes');
      const secondsElement = this.getPartEl('seconds');

      if (daysElement)    daysElement.textContent    = this.padZero(days);
      if (hoursElement)   hoursElement.textContent   = this.padZero(hours);
      if (minutesElement) minutesElement.textContent = this.padZero(minutes);
      if (secondsElement) secondsElement.textContent = this.padZero(seconds);
    }

    updateFlipDisplay(days, hours, minutes, seconds) {
      // Update flip cards with animation
      this.updateFlipCard('days', days, this.block.id);
      this.updateFlipCard('hours', hours, this.block.id);
      this.updateFlipCard('minutes', minutes, this.block.id);
      this.updateFlipCard('seconds', seconds, this.block.id);
    }

    updateFlipCard(type, newValue, blockId) {
      // Race-safe: Compare with internally stored previous value, not DOM
      if (this.lastValues[type] === newValue) {
        return; // No change, no flip needed
      }

      const rawId   = blockId;
      const shortId = blockId.replace(/^urgify-countdown-/, '');

      // Find flipCard more tolerant
      let flipCard = this.block.querySelector(`.flip-card[data-${type}="${rawId}"]`) ||
                     this.block.querySelector(`.flip-card[data-${type}="${shortId}"]`);

      if (!flipCard) {
        // try to find by inner id and then climb up
        const frontById = this.block.querySelector(`#${type}-${shortId}`) || this.block.querySelector(`#${type}-${rawId}`);
        if (frontById) flipCard = frontById.closest('.flip-card');
      }

      if (!flipCard) {
        // last resort: global search (some themes move nodes)
        flipCard = document.querySelector(`.flip-card[data-${type}="${rawId}"]`) ||
                   document.querySelector(`.flip-card[data-${type}="${shortId}"]`);
      }

      if (!flipCard) {
        console.debug('Urgify: flip-card not found for', type, 'blockId', blockId);
        return;
      }

      const frontElement =
        flipCard.querySelector(`#${type}-${shortId}`) ||
        flipCard.querySelector(`#${type}-${rawId}`);
      const backElement =
        flipCard.querySelector(`#${type}-${shortId}-back`) ||
        flipCard.querySelector(`#${type}-${rawId}-back`);

      if (!frontElement || !backElement) {
        console.debug('Urgify: flip front/back not found', { type, blockId, flipCard });
        return;
      }

      const newValueStr = this.padZero(newValue);

      // Update both elements immediately
      frontElement.textContent = newValueStr;
      backElement.textContent = newValueStr;

      // force reflow to allow CSS transition retrigger
      // eslint-disable-next-line no-unused-expressions
      void flipCard.offsetWidth;

      // Trigger flip animation
      flipCard.classList.add('animating');

      // Remove animation class after animation completes
      setTimeout(() => {
        flipCard.classList.remove('animating');
        flipCard.classList.add('flipped');
      }, 600);

      // Store the new value for next comparison
      this.lastValues[type] = newValue;
    }

    updateCircularDisplay(days, hours, minutes, seconds) {
      // Update text values
      const daysElement    = this.getPartEl('days');
      const hoursElement   = this.getPartEl('hours');
      const minutesElement = this.getPartEl('minutes');
      const secondsElement = this.getPartEl('seconds');

      if (daysElement)    daysElement.textContent    = this.padZero(days);
      if (hoursElement)   hoursElement.textContent   = this.padZero(hours);
      if (minutesElement) minutesElement.textContent = this.padZero(minutes);
      if (secondsElement) secondsElement.textContent = this.padZero(seconds);

      // Update circular progress bars
      // For countdown: show progress as "remaining time" vs "total time"
      // Circle starts empty and fills up as time runs out
      
      // Calculate total time for each unit (maximum possible values)
      const maxDays = Math.max(days, 30); // At least 30 days
      const maxHours = 24;
      const maxMinutes = 60;
      const maxSeconds = 60;
      
      // Use remaining time directly for progress calculation
      // More remaining time = less filled circle, less remaining time = more filled circle
      this.updateCircularProgress('days', days, maxDays, this.block.id);
      this.updateCircularProgress('hours', hours, maxHours, this.block.id);
      this.updateCircularProgress('minutes', minutes, maxMinutes, this.block.id);
      this.updateCircularProgress('seconds', seconds, maxSeconds, this.block.id);
    }

    updateCircularProgress(type, current, total, blockId) {
      // Update circular progress for countdown
      
      // Try multiple selectors to find the circle element
      let progressBar = this.block.querySelector(`.circular-progress-bar[data-${type}="${blockId}"]`);
      
      if (!progressBar) {
        const shortId = blockId.replace(/^urgify-countdown-/, '');
        progressBar = this.block.querySelector(`.circular-progress-bar[data-${type}="${shortId}"]`);
      }
      
      if (!progressBar) {
        // Fallback: try to find by class and type
        progressBar = this.block.querySelector(`.circular-progress-bar[data-${type}]`);
      }
      
      if (!progressBar) {
        // Last resort: find any circular progress bar in this block
        const allProgressBars = this.block.querySelectorAll('.circular-progress-bar');
        
        // Try to find by position/index
        const typeIndex = ['days', 'hours', 'minutes', 'seconds'].indexOf(type);
        if (typeIndex >= 0 && allProgressBars[typeIndex]) {
          progressBar = allProgressBars[typeIndex];
        }
      }
      
      if (!progressBar) {
        return;
      }

      // find the actual circle element inside (support <svg><circle> or direct element)
      let circle = progressBar.tagName && progressBar.tagName.toLowerCase() === 'circle'
        ? progressBar
        : progressBar.querySelector('circle');

      if (!circle) {
        // Try to find circle in parent SVG
        const svg = progressBar.closest('svg');
        if (svg) {
          circle = svg.querySelector('circle.circular-progress-bar');
          if (!circle) {
            // Find any circle in the SVG
            const circles = svg.querySelectorAll('circle');
            circle = circles[circles.length - 1]; // Usually the last circle is the progress bar
          }
        }
      }

      if (!circle) {
        return;
      }

      // radius detection (use attribute if present)
      let radius = 52;
      const rAttr = circle.getAttribute && circle.getAttribute('r');
      if (rAttr && !isNaN(Number(rAttr))) {
        radius = Number(rAttr);
      }

      const circumference = 2 * Math.PI * radius;
      // protect against divide-by-zero
      const safeTotal = (typeof total === 'number' && total > 0) ? total : 1;
      
      // COUNTDOWN LOGIC: Circle fills up as remaining time decreases
      // When remaining time is high, circle should be empty (0% filled)
      // When remaining time is low, circle should be full (100% filled)
      const progress = Math.min(Math.max(current / safeTotal, 0), 1);

      // strokeDashoffset represents the "gap" - when 0, circle is full; when circumference, circle is empty
      // For countdown: invert progress so circle fills as time runs out
      // More remaining time = less filled circle = more offset
      const offset = circumference * (1 - progress);

      // Robust stroke-dasharray setting: "circumference circumference" for better browser compatibility
      const dashArray = `${circumference} ${circumference}`;

      // Track last circular values to avoid unnecessary updates
      if (this._lastCircularValues && this._lastCircularValues[type] !== current) {
        // Update circular progress values
      }

      // Apply as attributes and styles (both for broader compatibility)
      if (circle.style) {
        circle.style.strokeDasharray = dashArray;
        circle.style.strokeDashoffset = `${offset}`;
      }
      
      try { 
        circle.setAttribute('stroke-dasharray', dashArray); 
        circle.setAttribute('stroke-dashoffset', `${offset}`);
        
        // Store last value for change detection
        if (!this._lastCircularValues) this._lastCircularValues = {};
        this._lastCircularValues[type] = current;
        
        // Successfully updated circle attributes
      } catch(e){
        // Silently handle attribute setting errors
      }
    }

    updateMinimalDisplay(days, hours, minutes, seconds) {
      const daysElement    = this.getPartEl('days');
      const hoursElement   = this.getPartEl('hours');
      const minutesElement = this.getPartEl('minutes');
      const secondsElement = this.getPartEl('seconds');

      if (daysElement)    daysElement.textContent    = this.padZero(days);
      if (hoursElement)   hoursElement.textContent   = this.padZero(hours);
      if (minutesElement) minutesElement.textContent = this.padZero(minutes);
      if (secondsElement) secondsElement.textContent = this.padZero(seconds);
    }

    padZero(num) {
      return num.toString().padStart(2, '0');
    }

    handleExpired() {
      if (this.isExpired) return;
      
      this.isExpired = true;
      this.stopCountdown();

      const countdownContainer = this.block.querySelector('.countdown-container');
      if (countdownContainer) {
        countdownContainer.innerHTML = this.settings.expired_message || 'Time\'s up!';
        countdownContainer.classList.add('expired');
      }

      // Trigger custom event
      const event = new CustomEvent('urgify:countdown:expired', {
        detail: { block: this.block, settings: this.settings }
      });
      document.dispatchEvent(event);
    }

  stopCountdown() {
    if (this.countdownInterval) {
      clearInterval(this.countdownInterval);
      this.countdownInterval = null;
    }
    }

    destroy() {
      this.stopCountdown();
      try {
        if (this.block) {
          delete this.block.__urgifyInst;
          // keep bootstrapped flag maybe, but safe to remove
          delete this.block.__urgifyBootstrapped;
        }
      } catch(e){/* ignore */}
    }
  }

  /**
   * Urgify Stock Alert Class
   */
  class UrgifyStockAlert {
    constructor(block, options) {
      this.block = block;
      this.options = options;
    }

    init() {
      this.updateStockDisplay();
      
      // Listen for variant changes
      document.addEventListener('change', (event) => {
        if (event.target.name === 'id' && event.target.closest('form[action*="/cart/add"]')) {
          this.updateStockDisplay();
        }
      });
    }

    updateStockDisplay() {
      const { threshold, criticalThreshold } = this.options;
      
      // Try to get stock level from various sources
      let stockLevel = this.getStockLevel();
      
      if (stockLevel === null) {
        // Fallback to server-side rendered data
        this.showServerSideAlert();
        return;
      }

      this.displayStockAlert(stockLevel, threshold, criticalThreshold);
    }

    getStockLevel() {
      // Try Shopify Analytics first
      if (window.ShopifyAnalytics?.meta?.product) {
        const product = window.ShopifyAnalytics.meta.product;
        return product.variants?.[0]?.inventory_quantity || null;
      }

      // Try product form
      const productForm = document.querySelector('form[action*="/cart/add"]');
      if (productForm) {
        const variantSelect = productForm.querySelector('select[name="id"]');
        if (variantSelect) {
          const selectedOption = variantSelect.options[variantSelect.selectedIndex];
          const inventoryQuantity = selectedOption?.dataset?.inventoryQuantity;
          if (inventoryQuantity) {
            return parseInt(inventoryQuantity);
          }
        }
      }

      return null;
    }

    displayStockAlert(stockLevel, threshold, criticalThreshold) {
      const lowStockAlert = this.block.querySelector('.low-stock');
      const criticalStockAlert = this.block.querySelector('.critical-stock');
      const stockLevelDisplay = this.block.querySelector('.stock-level');

      // Hide all alerts first
      if (lowStockAlert) lowStockAlert.style.display = 'none';
      if (criticalStockAlert) criticalStockAlert.style.display = 'none';

      if (stockLevel > 0 && stockLevel <= criticalThreshold) {
        if (criticalStockAlert) {
          this.updateAlertMessage(criticalStockAlert, stockLevel, 'critical');
          criticalStockAlert.style.display = 'block';
        }
      } else if (stockLevel > 0 && stockLevel <= threshold) {
        if (lowStockAlert) {
          this.updateAlertMessage(lowStockAlert, stockLevel, 'low');
          lowStockAlert.style.display = 'block';
        }
      }

      // Update stock level display
      if (stockLevelDisplay) {
        const countElement = stockLevelDisplay.querySelector('.stock-level-count');
        if (countElement) {
          countElement.textContent = stockLevel;
        }
      }
    }

    updateAlertMessage(alertElement, stockLevel, type) {
      const messageElement = alertElement.querySelector('.stock-alert-message');
      if (messageElement) {
        const messageTemplate = type === 'critical' 
          ? this.block.dataset.criticalMessage 
          : this.block.dataset.alertMessage;
        
        const finalMessage = messageTemplate.replace('{{count}}', stockLevel);
        messageElement.textContent = finalMessage;
      }
    }

    showServerSideAlert() {
      // Show alerts based on server-side rendered data
      const lowStockAlert = this.block.querySelector('.low-stock');
      const criticalStockAlert = this.block.querySelector('.critical-stock');

      // Server-side stock alerts are displayed (log removed to reduce console noise)
    }
  }

  /**
   * Urgify Limited Offer Class
   */
  class UrgifyLimitedOffer {
    constructor(block) {
      this.block = block;
    }

    init() {
      // Implementation for limited offer functionality
    }
  }

  /**
   * Urgify Scarcity Banner Class
   */
  class UrgifyScarcityBanner {
    constructor(block) {
      this.block = block;
    }

    init() {
      // Scarcity Banner block initialized (log removed)
      // Implementation for scarcity banner functionality
    }
  }

  /**
   * Urgify Urgency Notification Class
   */
  class UrgifyUrgencyNotification {
    constructor(block) {
      this.block = block;
    }

    init() {
      try {
        // Ensure visible
        this.block.style.display = 'block';

        // Auto close if configured
        const delayStr = this.block.getAttribute('data-auto-close-delay');
        const delay = delayStr ? parseInt(delayStr, 10) : 0;
        if (!isNaN(delay) && delay > 0) {
          setTimeout(() => {
            this.block.style.display = 'none';
          }, delay * 1000);
        }

        // Close button handler (if present)
        const closeBtn = this.block.querySelector('.notification-close');
        if (closeBtn) {
          closeBtn.addEventListener('click', () => {
            this.block.style.display = 'none';
          });
        }

        // Announce for accessibility
        this.block.setAttribute('role', 'status');
        this.block.setAttribute('aria-live', 'polite');
      } catch (e) {
        console.error('UrgifyUrgencyNotification init error:', e);
      }
    }
  }


  // Initialize / reuse singleton
  window.Urgify = (window.Urgify instanceof Urgify) ? window.Urgify : new Urgify();
  // Export all classes for global access
  window.UrgifyCountdown = UrgifyCountdown;
  window.UrgifyStockAlert = UrgifyStockAlert;
  window.UrgifyLimitedOffer = UrgifyLimitedOffer;
  window.UrgifyScarcityBanner = UrgifyScarcityBanner;
  window.UrgifyUrgencyNotification = UrgifyUrgencyNotification;
  
  // Initialize when DOM is ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      window.Urgify.init();
    });
  } else {
    window.Urgify.init();
  }

  // Re-initialize when theme sections are loaded (for theme editor)
  document.addEventListener('shopify:section:load', (event) => {
    const countdownBlocks = event.target.querySelectorAll('[data-urgify="countdown"]');
    countdownBlocks.forEach(block => {
      new UrgifyCountdown(block);
    });
  });

})();
