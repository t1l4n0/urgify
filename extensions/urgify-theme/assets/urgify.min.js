(function () {
  'use strict';
  
  // Prevent redefinition
  if (window.Urgify) {
    console.log("Urgify already defined, skipping redefinition.");
    return;
  }

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
      if (this.initialized) return;
      
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

      // Prevent duplicate initialization
      if (this.blocks.has(blockId)) {
        return;
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
      this.settings = this.parseSettings();
      this.countdownInterval = null;
      this.isExpired = false;

      this.init();
    }

    parseSettings() {
      try {
        const settingsStr = this.block.getAttribute('data-settings');
        return settingsStr ? JSON.parse(settingsStr) : {};
      } catch (e) {
        console.error('Error parsing countdown settings:', e);
        return {};
      }
    }

    init() {
      if (!this.settings.target_datetime) {
        console.warn('No target datetime set for countdown');
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
      this.block.style.display = 'block';

      this.countdownInterval = setInterval(() => {
        this.updateCountdown();
      }, 1000);
    }

    updateCountdown() {
      const now = new Date();
      const targetTime = this.settings.target_datetime ? new Date(this.settings.target_datetime) : null;

      if (!targetTime || isNaN(targetTime.getTime())) {
        this.stopCountdown();
        return;
      }

      const timeLeft = targetTime - now;

      if (timeLeft <= 0) {
        this.handleExpired();
        return;
      }

      this.isExpired = false;
      this.calculateAndDisplayTime(timeLeft);
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
      const blockId = this.block.id.replace('urgify-countdown-', '');
      
      const daysElement = this.block.querySelector('#days-' + blockId);
      const hoursElement = this.block.querySelector('#hours-' + blockId);
      const minutesElement = this.block.querySelector('#minutes-' + blockId);
      const secondsElement = this.block.querySelector('#seconds-' + blockId);

      if (daysElement && this.settings.show_days) daysElement.textContent = this.padZero(days);
      if (hoursElement && this.settings.show_hours) hoursElement.textContent = this.padZero(hours);
      if (minutesElement && this.settings.show_minutes) minutesElement.textContent = this.padZero(minutes);
      if (secondsElement && this.settings.show_seconds) secondsElement.textContent = this.padZero(seconds);
    }

    updateFlipDisplay(days, hours, minutes, seconds) {
      const blockId = this.block.id.replace('urgify-countdown-', '');
      
      // Update flip cards with animation
      this.updateFlipCard('days', days, blockId);
      this.updateFlipCard('hours', hours, blockId);
      this.updateFlipCard('minutes', minutes, blockId);
      this.updateFlipCard('seconds', seconds, blockId);
    }

    updateFlipCard(type, newValue, blockId) {
      const flipCard = this.block.querySelector(`[data-${type}="${blockId}"]`)?.closest('.flip-card');
      if (!flipCard) return;

      const frontElement = flipCard.querySelector(`#${type}-${blockId}`);
      const backElement = flipCard.querySelector(`#${type}-${blockId}-back`);
      
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
      const blockId = this.block.id.replace('urgify-countdown-', '');
      
      // Update text values
      const daysElement = this.block.querySelector('#days-' + blockId);
      const hoursElement = this.block.querySelector('#hours-' + blockId);
      const minutesElement = this.block.querySelector('#minutes-' + blockId);
      const secondsElement = this.block.querySelector('#seconds-' + blockId);

      if (daysElement && this.settings.show_days) daysElement.textContent = this.padZero(days);
      if (hoursElement && this.settings.show_hours) hoursElement.textContent = this.padZero(hours);
      if (minutesElement && this.settings.show_minutes) minutesElement.textContent = this.padZero(minutes);
      if (secondsElement && this.settings.show_seconds) secondsElement.textContent = this.padZero(seconds);

      // Update circular progress bars
      this.updateCircularProgress('days', days, 365, blockId);
      this.updateCircularProgress('hours', hours, 24, blockId);
      this.updateCircularProgress('minutes', minutes, 60, blockId);
      this.updateCircularProgress('seconds', seconds, 60, blockId);
    }

    updateCircularProgress(type, current, total, blockId) {
      const progressBar = this.block.querySelector(`[data-${type}="${blockId}"]`);
      if (!progressBar) return;

      const radius = 52;
      const circumference = 2 * Math.PI * radius;
      const progress = current / total;
      const offset = circumference - (progress * circumference);

      progressBar.style.strokeDasharray = circumference;
      progressBar.style.strokeDashoffset = offset;
    }

    updateMinimalDisplay(days, hours, minutes, seconds) {
      const blockId = this.block.id.replace('urgify-countdown-', '');
      
      const daysElement = this.block.querySelector('#days-' + blockId);
      const hoursElement = this.block.querySelector('#hours-' + blockId);
      const minutesElement = this.block.querySelector('#minutes-' + blockId);
      const secondsElement = this.block.querySelector('#seconds-' + blockId);

      if (daysElement && this.settings.show_days) daysElement.textContent = this.padZero(days);
      if (hoursElement && this.settings.show_hours) hoursElement.textContent = this.padZero(hours);
      if (minutesElement && this.settings.show_minutes) minutesElement.textContent = this.padZero(minutes);
      if (secondsElement && this.settings.show_seconds) secondsElement.textContent = this.padZero(seconds);
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

    // Public method to manually stop countdown
    destroy() {
      this.stopCountdown();
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

      if (stockLevel <= criticalThreshold) {
        if (criticalStockAlert) {
          this.updateAlertMessage(criticalStockAlert, stockLevel, 'critical');
          criticalStockAlert.style.display = 'block';
        }
      } else if (stockLevel <= threshold) {
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
      console.log("Urgency Notification block initialized");
      // Implementation for urgency notification functionality
    }
  }


  // Initialize Urgify
  window.Urgify = new Urgify();
  
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
