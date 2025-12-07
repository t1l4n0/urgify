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
        (window.Shopify && window.Shopify.designMode === true))) ||
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
   * Urgify Slide-in Cart Upsell
   * Hybrid upsell logic with priority:
   * 1. Product metafield upsells (urgify.cart_upsells)
   * 2. Shopify product recommendations (Search & Discovery)
   * 3. Global fallback products from block settings
   * 
   * Always guarantees at least 3 products when possible.
   */
  class UrgifySlideCartUpsell {
    constructor(container) {
      this.container = container;
      this.blockId = container.dataset.blockId;
      this.config = this.parseConfig();
      this.initialized = false;
      this.currentCartProductIds = new Set();
    }

    /**
     * Parse configuration from data attribute
     */
    parseConfig() {
      try {
        const configStr = this.container.getAttribute('data-urgify-config');
        if (!configStr) {
          return this.getDefaultConfig();
        }
        return JSON.parse(configStr);
      } catch (error) {
        return this.getDefaultConfig();
      }
    }

    /**
     * Get default configuration
     */
    getDefaultConfig() {
      return {
        heading: 'Recommendations',
        max_products: 3,
        enable_metafield_upsells: true,
        enable_recommendations: true,
        fallback_products: [],
        show_price: true,
        show_compare_at_price: true,
        image_size: 'medium',
        button_label: 'Add to cart'
      };
    }

    /**
     * Initialize the upsell block
     */
    async init() {
      if (this.initialized) {
        return;
      }

      try {
        // For auto-injected blocks, inject into cart drawer first
        if (this.blockId === 'auto') {
          this.injectIntoCartDrawer();
        }

        // Wait for cart drawer to be available
        await this.waitForCartDrawer();
        
        // Fetch current cart
        const cart = await this.fetchCart();
        if (!cart || !cart.items || cart.items.length === 0) {
          this.renderEmpty();
          return;
        }

        // Extract product IDs from cart
        this.currentCartProductIds = new Set(
          cart.items.map(item => item.product_id)
        );

        // Resolve upsell candidates using hybrid logic
        const candidates = await this.resolveUpsellCandidates();

        if (Array.isArray(candidates) && candidates.length === 0) {
          this.renderEmpty();
          return;
        }

        // Handle both product objects and IDs
        let products = [];
        if (typeof candidates === 'object' && candidates.products) {
          // We have some products already and need to fetch more
          const remainingProducts = await this.fetchProductDetails(candidates.ids);
          products = [...candidates.products, ...remainingProducts];
        } else if (Array.isArray(candidates) && candidates.length > 0 && typeof candidates[0] === 'object') {
          // Already have full product objects
          products = candidates;
        } else {
          // Need to fetch all product details
          products = await this.fetchProductDetails(candidates);
        }

        if (products.length === 0) {
          this.renderEmpty();
          return;
        }

        // Render the upsell list
        this.render(products);
        this.initialized = true;
      } catch (error) {
        this.renderError();
      }
    }

    /**
     * Wait for cart drawer to be available in DOM
     */
    waitForCartDrawer() {
      return new Promise((resolve) => {
        // For auto-injected blocks, find the cart drawer and inject the container
        if (this.blockId === 'auto') {
          this.injectIntoCartDrawer();
        }
        
        // Check if already available
        if (this.container.closest('[id*="cart"], [class*="cart"], [class*="drawer"]')) {
          resolve();
          return;
        }

        // Wait for cart drawer to open (listen for common events)
        const checkInterval = setInterval(() => {
          if (this.blockId === 'auto') {
            this.injectIntoCartDrawer();
          }
          
          if (this.container.closest('[id*="cart"], [class*="cart"], [class*="drawer"]')) {
            clearInterval(checkInterval);
            resolve();
          }
        }, 100);

        // Timeout after 5 seconds
        setTimeout(() => {
          clearInterval(checkInterval);
          resolve(); // Resolve anyway to avoid blocking
        }, 5000);
      });
    }

    /**
     * Inject the upsell container into the cart drawer
     */
    injectIntoCartDrawer() {
      // Try to find cart drawer by common selectors
      const cartDrawerSelectors = [
        '[id*="cart-drawer"]',
        '[id*="CartDrawer"]',
        '[class*="cart-drawer"]',
        '[class*="CartDrawer"]',
        '[data-cart-drawer]',
        '[data-cart-drawer-container]',
        '.drawer[data-drawer="cart"]',
        '.js-cart-drawer',
        '#cart-drawer',
        '#CartDrawer'
      ];

      let cartDrawer = null;
      for (const selector of cartDrawerSelectors) {
        cartDrawer = document.querySelector(selector);
        if (cartDrawer) break;
      }

      if (!cartDrawer) {
        // Try to find by common cart drawer content areas
        const cartContentSelectors = [
          '[id*="cart-items"]',
          '[class*="cart-items"]',
          '[class*="cart__items"]',
          '.cart-drawer__content',
          '.cart-drawer__inner',
          '[data-cart-items]'
        ];

        for (const selector of cartContentSelectors) {
          const element = document.querySelector(selector);
          if (element) {
            cartDrawer = element.closest('[id*="cart"], [class*="cart"], [class*="drawer"]') || element.parentElement;
            if (cartDrawer) break;
          }
        }
      }

      if (cartDrawer && !cartDrawer.contains(this.container)) {
        // Find a good insertion point (usually after cart items, before cart footer)
        const cartItems = cartDrawer.querySelector('[id*="cart-items"], [class*="cart-items"], [class*="cart__items"], [data-cart-items]');
        const cartFooter = cartDrawer.querySelector('[id*="cart-footer"], [class*="cart-footer"], [class*="cart__footer"], [data-cart-footer]');
        
        if (cartFooter && cartFooter.previousElementSibling) {
          // Insert before footer
          cartFooter.parentElement.insertBefore(this.container, cartFooter);
        } else if (cartItems && cartItems.nextElementSibling) {
          // Insert after cart items
          cartItems.parentElement.insertBefore(this.container, cartItems.nextElementSibling);
        } else {
          // Fallback: append to cart drawer
          cartDrawer.appendChild(this.container);
        }
        
        this.container.style.display = '';
      }
    }

    /**
     * Fetch current cart from Shopify
     */
    async fetchCart() {
      try {
        const response = await fetch('/cart.js');
        if (!response.ok) {
          throw new Error(`Cart fetch failed: ${response.status}`);
        }
        return await response.json();
      } catch (error) {
        return null;
      }
    }

    /**
     * Resolve upsell candidates using hybrid priority logic
     * Always guarantees at least 3 products when possible
     */
    async resolveUpsellCandidates() {
      const candidates = [];
      const candidateProducts = []; // Store full product objects when available
      const MIN_PRODUCTS = 3;
      const maxProducts = Math.max(MIN_PRODUCTS, this.config.max_products || 3);

      // Step 1: Metafield-based upsells (highest priority)
      if (this.config.enable_metafield_upsells) {
        const metafieldUpsells = await this.fetchMetafieldUpsells();
        
        // Check if we got full product objects or just IDs
        if (metafieldUpsells.length > 0 && typeof metafieldUpsells[0] === 'object') {
          // Full product objects
          candidateProducts.push(...metafieldUpsells);
          candidates.push(...metafieldUpsells.map(p => p.id));
        } else {
          // Just IDs
          candidates.push(...metafieldUpsells);
        }
      }

      // Step 2: Shopify recommendations (second priority) - auto-fill to MIN_PRODUCTS
      if (this.config.enable_recommendations && candidates.length < MIN_PRODUCTS) {
        const recommendations = await this.fetchRecommendations();
        // Add recommendations until we have at least MIN_PRODUCTS
        for (const recId of recommendations) {
          if (candidates.length >= MIN_PRODUCTS) break;
          if (!candidates.includes(recId) && !this.currentCartProductIds.has(recId)) {
            candidates.push(recId);
          }
        }
      }

      // Step 3: Fallback products (third priority) - only if still below MIN_PRODUCTS
      if (candidates.length < MIN_PRODUCTS && this.config.fallback_products) {
        const fallbackIds = this.config.fallback_products
          .map(p => typeof p === 'object' ? p.id : p)
          .filter(id => id && !this.currentCartProductIds.has(id));
        
        // Add fallback products until we have MIN_PRODUCTS
        for (const fallbackId of fallbackIds) {
          if (candidates.length >= MIN_PRODUCTS) break;
          if (!candidates.includes(fallbackId)) {
            candidates.push(fallbackId);
          }
        }
      }

      // Deduplicate and exclude cart items
      const uniqueCandidateIds = Array.from(new Set(candidates))
        .filter(id => id && !this.currentCartProductIds.has(id))
        .slice(0, maxProducts);

      // If we have full product objects from metafield upsells, use those
      if (candidateProducts.length > 0) {
        const filteredProducts = candidateProducts
          .filter(p => uniqueCandidateIds.includes(p.id));
        
        // If we have at least MIN_PRODUCTS from metafields, return them (up to maxProducts)
        if (filteredProducts.length >= MIN_PRODUCTS) {
          return filteredProducts.slice(0, maxProducts);
        }
        
        // Otherwise, we'll need to fetch remaining products to reach MIN_PRODUCTS
        const remainingIds = uniqueCandidateIds
          .filter(id => !filteredProducts.some(p => p.id === id))
          .slice(0, Math.max(MIN_PRODUCTS - filteredProducts.length, maxProducts - filteredProducts.length));
        
        return { products: filteredProducts, ids: remainingIds };
      }

      // Ensure we return at least MIN_PRODUCTS if possible
      return uniqueCandidateIds.length >= MIN_PRODUCTS 
        ? uniqueCandidateIds 
        : uniqueCandidateIds; // Return what we have, even if less than MIN_PRODUCTS
    }

    /**
     * Fetch metafield-based upsells from app endpoint
     */
    async fetchMetafieldUpsells() {
      try {
        const productIds = Array.from(this.currentCartProductIds);
        if (productIds.length === 0) {
          return [];
        }

        // Extract shop domain from current URL
        const shopDomain = this.getShopDomain();
        if (!shopDomain) {
          return [];
        }

        const url = new URL('/apps/urgify/upsells', window.location.origin);
        url.searchParams.set('product_ids', productIds.join(','));
        url.searchParams.set('limit', String(this.config.max_products || 3));
        url.searchParams.set('shop', shopDomain);

        const response = await fetch(url.toString());
        if (!response.ok) {
          throw new Error(`Metafield upsells fetch failed: ${response.status}`);
        }

        const data = await response.json();
        
        // Handle both full product data and ID-only responses
        if (data.upsellProducts && Array.isArray(data.upsellProducts)) {
          // Return full product objects
          return data.upsellProducts;
        } else if (data.upsellProductIds && Array.isArray(data.upsellProductIds)) {
          // Return IDs for fallback fetching
          return data.upsellProductIds;
        }
        
        return [];
      } catch (error) {
        return [];
      }
    }

    /**
     * Fetch Shopify product recommendations
     */
    async fetchRecommendations() {
      try {
        const productIds = Array.from(this.currentCartProductIds);
        if (productIds.length === 0) {
          return [];
        }

        // Use first cart product as seed for recommendations
        const seedProductId = productIds[0];
        const limit = (this.config.max_products || 3) - this.currentCartProductIds.size;

        const url = `/recommendations/products.json?product_id=${seedProductId}&limit=${limit}`;
        const response = await fetch(url);

        if (!response.ok) {
          throw new Error(`Recommendations fetch failed: ${response.status}`);
        }

        const data = await response.json();
        const recommendedIds = (data.products || [])
          .map(p => p.id)
          .filter(id => id && !this.currentCartProductIds.has(id));

        return recommendedIds;
      } catch (error) {
        return [];
      }
    }

    /**
     * Fetch product details for rendering
     */
    async fetchProductDetails(productIds) {
      if (!productIds || productIds.length === 0) {
        return [];
      }

      try {
        // Use Shopify's recommendations API to get product data by ID
        // This is more reliable than trying to guess product handles
        const products = await Promise.all(
          productIds.map(async (productId) => {
            try {
              // Try recommendations API with product ID as seed
              const response = await fetch(`/recommendations/products.json?product_id=${productId}&limit=1`);
              if (response.ok) {
                const data = await response.json();
                const recommended = data.products?.find(p => p.id === productId);
                if (recommended) {
                  return this.normalizeProductData(recommended);
                }
              }
              
              // Fallback: try direct product fetch (requires handle, which we don't have)
              // This will likely fail, but we try anyway
              return null;
            } catch (error) {
              return null;
            }
          })
        );

        return products.filter(p => p !== null);
      } catch (error) {
        return [];
      }
    }

    /**
     * Normalize product data from different sources to consistent format
     */
    normalizeProductData(product) {
      const variant = product.variants && product.variants[0] ? product.variants[0] : null;
      
      return {
        id: product.id,
        title: product.title || '',
        handle: product.handle || '',
        url: product.url || `/products/${product.handle || ''}`,
        featured_image: product.featured_image || product.images?.[0] || null,
        variantId: variant ? variant.id : null,
        variants: variant ? [{
          id: variant.id,
          price: variant.price || 0,
          compare_at_price: variant.compare_at_price || null
        }] : []
      };
    }

    /**
     * Render the upsell list
     */
    render(products) {
      if (!products || products.length === 0) {
        this.renderEmpty();
        return;
      }

      const imageSize = this.getImageSize();
      let html = '';

      // Heading
      if (this.config.heading) {
        html += `<h3 class="urgify-upsell-heading">${this.escapeHtml(this.config.heading)}</h3>`;
      }

      // Product list
      html += '<ul class="urgify-upsell-list">';
      
      products.forEach(product => {
        // Handle both normalized format from backend and storefront format
        // Backend format: { id, title, handle, url, featuredImage, price, compareAtPrice, variantId, available }
        // Storefront format: { id, title, handle, url, featured_image, variants: [{ id, price, compare_at_price }] }
        
        const variant = product.variants && product.variants[0] ? product.variants[0] : null;
        const image = product.featuredImage || product.featured_image || product.images?.[0] || null;
        
        // Price: prefer direct price property (from backend), fallback to variant price
        const price = product.price !== undefined 
          ? product.price 
          : (variant ? (typeof variant.price === 'number' ? variant.price : parseFloat(variant.price) || 0) : 0);
        
        // Compare at price: prefer direct compareAtPrice property (from backend), fallback to variant
        const compareAtPrice = product.compareAtPrice !== undefined 
          ? product.compareAtPrice 
          : (variant && variant.compare_at_price 
              ? (typeof variant.compare_at_price === 'number' ? variant.compare_at_price : parseFloat(variant.compare_at_price) || null)
              : null);
        
        // Variant ID: prefer direct variantId (from backend), fallback to variant.id
        const variantId = product.variantId || (variant ? variant.id : null);

        html += '<li class="urgify-upsell-item">';
        
        // Product image
        if (image) {
          html += `
            <a href="${this.escapeHtml(product.url || `/products/${product.handle}`)}" class="urgify-upsell-image-link">
              <img 
                src="${this.escapeHtml(image)}" 
                alt="${this.escapeHtml(product.title || '')}"
                class="urgify-upsell-image urgify-upsell-image-${imageSize}"
                loading="lazy"
              >
            </a>
          `;
        }

        // Product info
        html += '<div class="urgify-upsell-info">';
        
        // Title
        html += `
          <a href="${this.escapeHtml(product.url || `/products/${product.handle}`)}" class="urgify-upsell-title">
            ${this.escapeHtml(product.title || '')}
          </a>
        `;

        // Price
        if (this.config.show_price && variant) {
          html += '<div class="urgify-upsell-price">';
          
          if (compareAtPrice && this.config.show_compare_at_price && compareAtPrice > price) {
            html += `<span class="urgify-upsell-price-compare">${this.formatMoney(compareAtPrice)}</span>`;
            html += `<span class="urgify-upsell-price-sale">${this.formatMoney(price)}</span>`;
          } else {
            html += `<span class="urgify-upsell-price-regular">${this.formatMoney(price)}</span>`;
          }
          
          html += '</div>';
        }

        // Add to cart button
        html += `
          <button 
            type="button"
            class="urgify-upsell-button"
            data-product-id="${this.escapeHtml(String(product.id))}"
            data-variant-id="${variantId ? this.escapeHtml(String(variantId)) : ''}"
          >
            ${this.escapeHtml(this.config.button_label || 'Add to cart')}
          </button>
        `;

        html += '</div>'; // .urgify-upsell-info
        html += '</li>'; // .urgify-upsell-item
      });

      html += '</ul>';

      this.container.innerHTML = html;

      // Attach event listeners
      this.attachEventListeners();
    }

    /**
     * Attach event listeners for add to cart buttons
     */
    attachEventListeners() {
      const buttons = this.container.querySelectorAll('.urgify-upsell-button');
      buttons.forEach(button => {
        button.addEventListener('click', async (e) => {
          e.preventDefault();
          await this.handleAddToCart(button);
        });
      });
    }

    /**
     * Handle add to cart action
     */
    async handleAddToCart(button) {
      const productId = button.dataset.productId;
      const variantId = button.dataset.variantId;

      if (!variantId) {
        return;
      }

      button.disabled = true;
      button.textContent = 'Adding...';

      try {
        const response = await fetch('/cart/add.js', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            id: variantId,
            quantity: 1
          })
        });

        if (!response.ok) {
          throw new Error(`Add to cart failed: ${response.status}`);
        }

        // Trigger cart refresh (theme-specific)
        this.refreshCart();

        // Re-initialize to update recommendations
        setTimeout(() => {
          this.initialized = false;
          this.init();
        }, 500);
      } catch (error) {
        button.textContent = this.config.button_label || 'Add to cart';
        button.disabled = false;
      }
    }

    /**
     * Refresh cart state (trigger theme cart refresh)
     */
    refreshCart() {
      // Dispatch custom event for theme to handle
      document.dispatchEvent(new CustomEvent('urgify:cart:updated'));

      // Try common theme cart refresh methods
      if (typeof window.Shopify === 'object' && window.Shopify.theme) {
        if (typeof window.Shopify.theme.cart === 'object') {
          if (typeof window.Shopify.theme.cart.refresh === 'function') {
            window.Shopify.theme.cart.refresh();
          }
        }
      }

      // Try to trigger cart drawer refresh
      const cartDrawer = document.querySelector('[id*="cart"], [class*="cart-drawer"]');
      if (cartDrawer) {
        cartDrawer.dispatchEvent(new CustomEvent('cart:refresh'));
      }
    }

    /**
     * Render empty state
     */
    renderEmpty() {
      this.container.innerHTML = '';
    }

    /**
     * Render error state
     */
    renderError() {
      this.container.innerHTML = '<div class="urgify-upsell-error">Unable to load recommendations</div>';
    }

    /**
     * Get image size class
     */
    getImageSize() {
      return this.config.image_size || 'medium';
    }

    /**
     * Get shop domain from current URL
     */
    getShopDomain() {
      try {
        const hostname = window.location.hostname;
        // Extract shop domain (e.g., shop.myshopify.com or custom domain)
        if (hostname.includes('.myshopify.com')) {
          return hostname;
        }
        // For custom domains, try to get from Shopify global
        if (typeof window.Shopify === 'object' && window.Shopify.shop) {
          return window.Shopify.shop;
        }
        // Try to extract from meta tags
        const shopMeta = document.querySelector('meta[name="shopify-checkout-api-token"]');
        if (shopMeta && shopMeta.content) {
          // Sometimes shop domain is in meta tags
          const match = shopMeta.content.match(/shop=([^&]+)/);
          if (match) {
            return match[1];
          }
        }
        // Last resort: try to get from any Shopify script
        const scripts = document.querySelectorAll('script[src*="shopify"]');
        for (const script of scripts) {
          const src = script.getAttribute('src') || '';
          const match = src.match(/https?:\/\/([^\/]+)\.myshopify\.com/);
          if (match) {
            return `${match[1]}.myshopify.com`;
          }
        }
        return null;
      } catch (error) {
        return null;
      }
    }

    /**
     * Escape HTML to prevent XSS
     */
    escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }

    /**
     * Format money (simplified - uses Shopify's money format if available)
     */
    formatMoney(cents) {
      if (typeof window.Shopify === 'object' && window.Shopify.formatMoney) {
        return window.Shopify.formatMoney(cents);
      }
      // Fallback: simple formatting
      const amount = (cents / 100).toFixed(2);
      return `$${amount}`;
    }
  }

  /**
   * Initialize all upsell blocks on the page
   */
  function initUpsellBlocks() {
    const blocks = document.querySelectorAll('.urgify-slide-cart-upsell[data-urgify="slide-cart-upsell"]');
    
    blocks.forEach(block => {
      if (!block.dataset.initialized) {
        block.dataset.initialized = 'true';
        const upsell = new UrgifySlideCartUpsell(block);
        upsell.init();
      }
    });
  }

  // Initialize on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initUpsellBlocks);
  } else {
    initUpsellBlocks();
  }

  // Re-initialize when cart drawer opens (listen for common events)
  document.addEventListener('cart:open', () => {
    // Small delay to ensure cart drawer is fully rendered
    setTimeout(initUpsellBlocks, 100);
  });
  document.addEventListener('cart:refresh', () => {
    setTimeout(initUpsellBlocks, 100);
  });
  
  // Listen for cart drawer opening via common theme events
  document.addEventListener('cart:updated', () => {
    setTimeout(initUpsellBlocks, 100);
  });
  
  // Watch for cart drawer visibility changes
  const cartDrawerObserver = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.type === 'attributes' && mutation.attributeName === 'aria-hidden') {
        const target = mutation.target;
        if (target.getAttribute('aria-hidden') === 'false') {
          // Cart drawer opened
          setTimeout(initUpsellBlocks, 200);
        }
      }
    });
  });
  
  // Observe common cart drawer elements
  const observeCartDrawer = () => {
    const cartDrawerSelectors = [
      '[id*="cart-drawer"]',
      '[id*="CartDrawer"]',
      '[class*="cart-drawer"]',
      '[data-cart-drawer]'
    ];
    
    cartDrawerSelectors.forEach(selector => {
      const element = document.querySelector(selector);
      if (element) {
        cartDrawerObserver.observe(element, {
          attributes: true,
          attributeFilter: ['aria-hidden', 'class']
        });
      }
    });
  };
  
  // Start observing when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', observeCartDrawer);
  } else {
    observeCartDrawer();
  }

  // Re-initialize when theme sections are loaded (for theme editor)
  document.addEventListener('shopify:section:load', (event) => {
    const blocks = event.target.querySelectorAll('.urgify-slide-cart-upsell[data-urgify="slide-cart-upsell"]');
    blocks.forEach(block => {
      block.dataset.initialized = 'false';
      const upsell = new UrgifySlideCartUpsell(block);
      upsell.init();
    });
  });

  // Watch for cart drawer opening (MutationObserver fallback)
  const observer = new MutationObserver(() => {
    const blocks = document.querySelectorAll('.urgify-slide-cart-upsell[data-urgify="slide-cart-upsell"]:not([data-initialized="true"])');
    if (blocks.length > 0) {
      initUpsellBlocks();
    }
    
    // Also check if cart drawer just opened and re-initialize auto blocks
    const cartDrawer = document.querySelector('[id*="cart-drawer"], [id*="CartDrawer"], [class*="cart-drawer"], [data-cart-drawer]');
    if (cartDrawer) {
      const autoBlock = document.getElementById('urgify-slide-cart-upsell-auto');
      if (autoBlock && autoBlock.dataset.initialized === 'true') {
        // Re-initialize to refresh recommendations
        autoBlock.dataset.initialized = 'false';
        setTimeout(() => {
          initUpsellBlocks();
        }, 300);
      }
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class', 'aria-hidden']
  });

})();

