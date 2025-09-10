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
      
      console.log("Urgify initialized with config:", this.config);
    }

    /**
     * Initialize all Urgify blocks on the page
     */
    init() {
      if (this.initialized) return;
      
      console.log("Initializing Urgify blocks...");
      
      // Find and initialize all Urgify blocks
      const blocks = document.querySelectorAll('[data-urgify]');
      blocks.forEach(block => this.initBlock(block));
      
      // Listen for dynamic content changes
      this.observeChanges();
      
      this.initialized = true;
      console.log(`Urgify initialized ${blocks.length} blocks`);
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
        console.log(`Block ${blockId} already initialized`);
        return;
      }

      console.log(`Initializing ${blockType} block: ${blockId}`);

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
      const startDate = block.dataset.startDate;
      const endDate = block.dataset.endDate;
      const mode = block.dataset.countdownMode || 'countdown_to_end';
      
      if (!startDate || !endDate) {
        console.warn("Countdown block missing dates:", block);
        return;
      }

      const countdown = new UrgifyCountdown(block, {
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        mode: mode
      });
      
      countdown.start();
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
   * Urgify Countdown Class
   */
  class UrgifyCountdown {
    constructor(block, options) {
      this.block = block;
      this.options = options;
      this.timer = null;
      this.isActive = false;
    }

    start() {
      if (this.isActive) return;
      
      this.isActive = true;
      this.update();
      this.timer = setInterval(() => this.update(), 1000);
    }

    stop() {
      if (this.timer) {
        clearInterval(this.timer);
        this.timer = null;
      }
      this.isActive = false;
    }

    update() {
      const now = new Date();
      const { startDate, endDate, mode } = this.options;
      
      let targetDate, messageElement, showMessage;
      
      if (mode === 'countdown_to_start') {
        targetDate = startDate;
        messageElement = this.block.querySelector('.countdown-start-message');
        showMessage = now < startDate;
      } else {
        targetDate = endDate;
        messageElement = this.block.querySelector('.countdown-end-message');
        showMessage = now < endDate;
      }

      if (now >= targetDate) {
        this.showMessage(messageElement, showMessage);
        this.stop();
        return;
      }

      const timeLeft = targetDate - now;
      this.updateDisplay(timeLeft);
    }

    updateDisplay(timeLeft) {
      const days = Math.floor(timeLeft / (1000 * 60 * 60 * 24));
      const hours = Math.floor((timeLeft % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((timeLeft % (1000 * 60)) / 1000);

      const elements = {
        days: this.block.querySelector('.countdown-days'),
        hours: this.block.querySelector('.countdown-hours'),
        minutes: this.block.querySelector('.countdown-minutes'),
        seconds: this.block.querySelector('.countdown-seconds')
      };

      Object.entries(elements).forEach(([unit, element]) => {
        if (element) {
          element.textContent = eval(unit).toString().padStart(2, '0');
        }
      });
    }

    showMessage(messageElement, showMessage) {
      if (messageElement && showMessage) {
        messageElement.style.display = 'block';
      }
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
      console.log("Limited Offer block initialized");
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

})();
