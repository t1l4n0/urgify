(() => {
  'use strict';

  const globalConsole = (typeof window !== "undefined" && window.console) || {
    log: () => {},
    warn: () => {},
    error: () => {},
  };

  let debugEnabled =
    (typeof window !== "undefined" &&
      (window.UrgifyDebug === true ||
        (window.Shopify && window.Shopify.designMode === true) ||
        window.location.search.includes('urgify-debug=true'))) ||
    false;

  const console = {
    log: (...args) => {
      if (debugEnabled) {
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

  /**
   * Urgify Product Badge
   * Displays custom badges on product cards based on product metafields
   */
  class UrgifyProductBadge {
    constructor() {
      this.badgeCache = new Map();
      this.processedProducts = new Set();
      this.version = '1.0.0';
      this.initialized = false;
    }

    /**
     * Initialize the badge system
     */
    init() {
      if (this.initialized) {
        return;
      }

      console.log('Urgify Product Badge: Initializing');

      // Load badge data from script tag
      this.loadBadgeData();

      // Process existing product cards
      this.processProductCards();

      // Watch for new product cards (infinite scroll, AJAX loads, etc.)
      this.observeProductCards();

      this.initialized = true;
    }

    /**
     * Find all product cards in the DOM
     * Supports various theme structures including custom elements
     */
    findProductCards() {
      const selectors = [
        'product-card',
        '[data-product-id]',
        '[data-product-handle]',
        '.product-card',
        '.product-item',
        '.product',
        '[class*="product-card"]',
        '[class*="product-item"]',
        '[class*="product-card__"]',
        'article[data-product-handle]',
        'div[data-product-handle]',
        'li[data-product-id]', // For grid items
      ];

      const cards = [];
      const seen = new Set();
      
      for (const selector of selectors) {
        const elements = document.querySelectorAll(selector);
        elements.forEach((el) => {
          let card = el;
          
          // For custom elements like <product-card>, use the element itself
          if (el.tagName && el.tagName.toLowerCase() === 'product-card') {
            card = el;
          }
          // For list items with data-product-id, use the product-card inside
          else if (el.tagName && el.tagName.toLowerCase() === 'li' && el.hasAttribute('data-product-id')) {
            const productCard = el.querySelector('product-card, [class*="product-card"]');
            if (productCard) {
              card = productCard;
            } else {
              card = el;
            }
          }
          
          if (!seen.has(card) && !cards.includes(card)) {
            cards.push(card);
            seen.add(card);
          }
        });
      }

      return cards;
    }

    /**
     * Get product handle or ID from a product card element
     */
    getProductIdentifier(card) {
      // Try data-product-handle first (most common)
      let handle = card.getAttribute('data-product-handle');
      if (handle) {
        return { type: 'handle', value: handle };
      }

      // Try data-product-id (for custom elements like <product-card>)
      let productId = card.getAttribute('data-product-id');
      if (productId) {
        // Try to find handle from parent or link
        const parent = card.closest('[data-product-handle], li[data-product-id]');
        if (parent) {
          const parentHandle = parent.getAttribute('data-product-handle');
          if (parentHandle) {
            return { type: 'handle', value: parentHandle };
          }
        }
        // Fallback: use ID and try to find handle from link
      }

      // Try finding a link to the product (most reliable for custom elements)
      const link = card.querySelector('a[href*="/products/"]');
      if (link) {
        const href = link.getAttribute('href');
        const match = href.match(/\/products\/([^\/\?#]+)/);
        if (match) {
          return { type: 'handle', value: match[1] };
        }
      }

      // Try parent element for links (for custom elements)
      const parentLink = card.closest('a[href*="/products/"]');
      if (parentLink) {
        const href = parentLink.getAttribute('href');
        const match = href.match(/\/products\/([^\/\?#]+)/);
        if (match) {
          return { type: 'handle', value: match[1] };
        }
      }

      // Try finding product title link
      const titleLink = card.querySelector('[class*="product-title"] a, [class*="product__title"] a, h2 a, h3 a');
      if (titleLink) {
        const href = titleLink.getAttribute('href');
        const match = href.match(/\/products\/([^\/\?#]+)/);
        if (match) {
          return { type: 'handle', value: match[1] };
        }
      }

      return null;
    }

    /**
     * Find the product image container in a product card
     */
    findProductImageContainer(card) {
      // For custom elements, look for gallery or image containers
      const selectors = [
        '.card-gallery',
        '[class*="card-gallery"]',
        '[class*="product-image"]',
        '[class*="product__image"]',
        '[class*="product-card__image"]',
        '[class*="product-item__image"]',
        '[class*="product-media"]',
        'slideshow-component',
        'img[src*="products"]',
        'picture',
      ];

      for (const selector of selectors) {
        const element = card.querySelector(selector);
        if (element) {
          // Return the parent container if it's an img
          if (element.tagName === 'IMG' || element.tagName === 'PICTURE') {
            return element.parentElement || element;
          }
          // For slideshow-component, find the container inside
          if (element.tagName && element.tagName.toLowerCase() === 'slideshow-component') {
            const container = element.querySelector('.product-media-container, [class*="product-media"], .card-gallery');
            if (container) {
              return container;
            }
          }
          return element;
        }
      }

      // Fallback: return the card itself
      return card;
    }

    /**
     * Check if badge already exists on this card
     */
    hasBadge(card) {
      return card.querySelector('.urgify-product-badge') !== null;
    }

    /**
     * Load badge data from script tag injected by Liquid
     */
    loadBadgeData() {
      const scriptTag = document.getElementById('urgify-product-badges-data');
      if (scriptTag && scriptTag.textContent) {
        try {
          const badgeData = JSON.parse(scriptTag.textContent);
          // Populate cache
          Object.keys(badgeData).forEach((handle) => {
            this.badgeCache.set(handle, badgeData[handle]);
          });
          console.log(`Loaded badge data for ${Object.keys(badgeData).length} products`, badgeData);
          return badgeData;
        } catch (error) {
          console.error('Error parsing badge data:', error, scriptTag.textContent);
        }
      } else {
        console.warn('No badge data script tag found');
      }
      return {};
    }

    /**
     * Get badge data for a product handle
     */
    getBadgeData(productHandle) {
      // Check cache first
      if (this.badgeCache.has(productHandle)) {
        return this.badgeCache.get(productHandle);
      }
      
      // Also check for data attribute on the card itself (fallback)
      // This allows themes to inject badge data directly into product cards
      const cards = document.querySelectorAll(`[data-product-handle="${productHandle}"], a[href*="/products/${productHandle}"]`);
      for (const card of cards) {
        const badgeAttr = card.getAttribute('data-urgify-badge');
        if (badgeAttr) {
          try {
            const badgeData = JSON.parse(badgeAttr);
            this.badgeCache.set(productHandle, badgeData);
            return badgeData;
          } catch (e) {
            console.error('Error parsing badge data attribute:', e);
          }
        }
      }
      
      return null;
    }

    /**
     * Create badge element
     */
    createBadgeElement(badgeData) {
      const badge = document.createElement('span');
      badge.className = 'urgify-product-badge';
      badge.classList.add(`urgify-badge-${badgeData.position}`);
      badge.textContent = badgeData.text;
      badge.style.backgroundColor = badgeData.backgroundColor;
      badge.style.color = badgeData.textColor;
      
      return badge;
    }

    /**
     * Apply badge to a product card
     */
    async applyBadgeToCard(card) {
      const identifier = this.getProductIdentifier(card);
      if (!identifier) {
        console.log('No product identifier found for card', card);
        return;
      }

      // Skip if already processed
      const cacheKey = `${identifier.type}:${identifier.value}`;
      if (this.processedProducts.has(cacheKey)) {
        return;
      }

      // Skip if badge already exists
      if (this.hasBadge(card)) {
        this.processedProducts.add(cacheKey);
        return;
      }

      // Get badge data from cache
      const badgeData = this.getBadgeData(identifier.value);
      if (!badgeData) {
        console.log(`No badge data found for product: ${identifier.value}`, {
          cacheSize: this.badgeCache.size,
          cacheKeys: Array.from(this.badgeCache.keys())
        });
        this.processedProducts.add(cacheKey);
        return;
      }

      if (!badgeData || !badgeData.text) {
        console.warn(`Badge data missing text for product: ${identifier.value}`, badgeData);
        this.processedProducts.add(cacheKey);
        return;
      }

      // Find image container
      const imageContainer = this.findProductImageContainer(card);
      if (!imageContainer) {
        this.processedProducts.add(cacheKey);
        return;
      }

      // Ensure image container has position relative
      const computedStyle = window.getComputedStyle(imageContainer);
      if (computedStyle.position === 'static') {
        imageContainer.style.position = 'relative';
      }

      // Create and insert badge
      const badgeElement = this.createBadgeElement(badgeData);
      imageContainer.appendChild(badgeElement);

      this.processedProducts.add(cacheKey);
      console.log('Badge applied to product:', identifier.value);
    }

    /**
     * Process all product cards on the page
     */
    async processProductCards() {
      const cards = this.findProductCards();
      console.log(`Found ${cards.length} product cards`);

      // Process cards in batches to avoid blocking the main thread
      // Use requestIdleCallback if available for better performance
      const processBatch = async (batch) => {
        return Promise.all(batch.map(card => this.applyBadgeToCard(card)));
      };

      const batchSize = 5; // Smaller batches for better performance
      for (let i = 0; i < cards.length; i += batchSize) {
        const batch = cards.slice(i, i + batchSize);
        
        // Use requestIdleCallback for non-critical processing
        if (window.requestIdleCallback) {
          await new Promise(resolve => {
            window.requestIdleCallback(async () => {
              await processBatch(batch);
              resolve();
            }, { timeout: 1000 });
          });
        } else {
          await processBatch(batch);
          // Yield to browser between batches
          await new Promise(resolve => setTimeout(resolve, 0));
        }
      }
    }

    /**
     * Observe DOM for new product cards
     */
    observeProductCards() {
      const observer = new MutationObserver((mutations) => {
        let shouldProcess = false;

        mutations.forEach((mutation) => {
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType === 1) { // Element node
              // Check if the node is a product card
              if (this.getProductIdentifier(node)) {
                shouldProcess = true;
                return;
              }
              // Check if the node contains product cards
              if (node.querySelectorAll && this.findProductCards().length > 0) {
                shouldProcess = true;
                return;
              }
            }
          });
        });

        if (shouldProcess) {
          // Debounce processing
          clearTimeout(this.processTimeout);
          this.processTimeout = setTimeout(() => {
            this.processProductCards();
          }, 300);
        }
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true,
      });

      console.log('Product card observer initialized');
    }

    /**
     * Debug function - can be called from console: window.UrgifyProductBadge.debug()
     */
    debug() {
      console.log('=== Urgify Product Badge Debug ===');
      console.log('Badge cache:', Object.fromEntries(this.badgeCache));
      console.log('Processed products:', Array.from(this.processedProducts));
      const cards = this.findProductCards();
      console.log(`Found ${cards.length} product cards`);
      cards.forEach((card, index) => {
        const identifier = this.getProductIdentifier(card);
        console.log(`Card ${index}:`, {
          element: card,
          identifier,
          hasBadge: this.hasBadge(card),
          badgeData: identifier ? this.getBadgeData(identifier.value) : null
        });
      });
      const scriptTag = document.getElementById('urgify-product-badges-data');
      console.log('Script tag:', scriptTag ? scriptTag.textContent : 'Not found');
    }
  }

  // Initialize when DOM is ready
  function init() {
    const initBadgeSystem = () => {
      const badgeSystem = new UrgifyProductBadge();
      badgeSystem.init();
      window.UrgifyProductBadge = badgeSystem;
      
      // Use requestIdleCallback for initial processing to not block rendering
      if (window.requestIdleCallback) {
        window.requestIdleCallback(() => {
          badgeSystem.processProductCards();
        }, { timeout: 2000 });
      } else {
        // Fallback: delay processing slightly to let images load
        setTimeout(() => {
          badgeSystem.processProductCards();
        }, 500);
      }
    };

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initBadgeSystem);
    } else {
      // Use requestIdleCallback if DOM is already ready
      if (window.requestIdleCallback) {
        window.requestIdleCallback(initBadgeSystem, { timeout: 1000 });
      } else {
        setTimeout(initBadgeSystem, 0);
      }
    }
  }

  init();
})();

