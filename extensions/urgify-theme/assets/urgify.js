(function () {
  'use strict';
  
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
      
      // Urgify initialized
    }

    /**
     * Initialize all Urgify blocks on the page
     */
    init() {
      // Find and initialize all Urgify blocks
      const blocks = document.querySelectorAll('[data-urgify]');
      blocks.forEach(block => this.initBlock(block));
      
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
          console.info('Urgify: re-initializing blockId (detected replaced DOM node):', blockId);
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
      
      const stockAlert = new UrgifyStockAlert(block, {
        productId,
        variantId,
        threshold,
        criticalThreshold
      });
      
      stockAlert.init();
    }

    /**
     * Initialize Limited Offer Block
     */
    initLimitedOffer(block) {
      const offer = new UrgifyLimitedOffer(block);
      offer.init();
    }

    /**
     * Initialize Scarcity Banner Block
     */
    initScarcityBanner(block) {
      const banner = new UrgifyScarcityBanner(block);
      banner.init();
    }

    /**
     * Initialize Urgency Notification Block
     */
    initUrgencyNotification(block) {
      const notification = new UrgifyUrgencyNotification(block);
      notification.init();
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
        console.log(`Destroyed block: ${blockId}`);
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
      if (!settingsStr) return { ...defaults, ...fallback };
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
        console.warn('No target provided (neither epoch nor datetime).');
        return;
      }
      
      this.setupCountdown();
      this.updateCountdown();
    }

  setupCountdown() {
    const countdownContainer = this.block.querySelector('.countdown-container');
    if (!countdownContainer) {
      console.warn('Countdown container not found');
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

    console.info('UrgifyCountdown: starting interval for', this.block.id);

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

      // DEBUG: only log when value changes (avoids noisy console)
      if (this._lastTotalSeconds !== totalSeconds) {
        console.debug('UrgifyCountdown update:', {
          blockId: this.block.id,
          totalSeconds, days, hours, minutes, seconds
        });
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
      // blockId is raw (e.g. 'urgify-countdown-abc123')
      const rawId   = blockId;
      const shortId = blockId.replace(/^urgify-countdown-/, '');

      // find the card using either raw or short data-* id
      const flipCard =
        this.block.querySelector(`.flip-card[data-${type}="${rawId}"]`) ||
        this.block.querySelector(`.flip-card[data-${type}="${shortId}"]`);
      if (!flipCard) return;

      // find front/back using either raw or short ids
      const frontElement =
        flipCard.querySelector(`#${type}-${shortId}`) ||
        flipCard.querySelector(`#${type}-${rawId}`);
      const backElement =
        flipCard.querySelector(`#${type}-${shortId}-back`) ||
        flipCard.querySelector(`#${type}-${rawId}-back`);
      if (!frontElement || !backElement) return;

      const currentValue = frontElement.textContent;
      const newValueStr = this.padZero(newValue);

      // Only flip if value actually changed
      if (currentValue !== newValueStr) {
        // Check if card is currently flipped
        const isFlipped = flipCard.classList.contains('flipped');
        
        if (isFlipped) {
          // Card is on back side, update front and flip back
          frontElement.textContent = newValueStr;
          flipCard.classList.remove('flipped');
        } else {
          // Card is on front side, update back and flip forward
          backElement.textContent = newValueStr;
          flipCard.classList.add('flipped');
        }
      }
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
      this.updateCircularProgress('days', days, 365, this.block.id);
      this.updateCircularProgress('hours', hours, 24, this.block.id);
      this.updateCircularProgress('minutes', minutes, 60, this.block.id);
      this.updateCircularProgress('seconds', seconds, 60, this.block.id);
    }

    updateCircularProgress(type, current, total, blockId) {
      const progressBar = this.block.querySelector(`.circular-progress-bar[data-${type}="${blockId}"]`) ||
                         this.block.querySelector(`.circular-progress-bar[data-${type}="${blockId.replace(/^urgify-countdown-/, '')}"]`);
      if (!progressBar) return;

      const radius = 52;
      const circumference = 2 * Math.PI * radius;
      const progress = current / total;
      const offset = circumference - (progress * circumference);

      progressBar.style.strokeDasharray = circumference;
      progressBar.style.strokeDashoffset = offset;
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

      if (criticalStockAlert && criticalStockAlert.style.display !== 'none') {
        console.log("Showing server-side critical stock alert");
      } else if (lowStockAlert && lowStockAlert.style.display !== 'none') {
        console.log("Showing server-side low stock alert");
      }
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
      console.log("Scarcity Banner block initialized");
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
  // Export the countdown class for inline bootstrap fallbacks
  window.UrgifyCountdown = UrgifyCountdown;
  
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
