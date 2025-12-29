(() => {
  'use strict';

  const globalConsole = (typeof window !== "undefined" && window.console) || {
    log: () => {},
    warn: () => {},
    error: () => {},
  };

  // Immediate log to confirm script is loaded (after console is defined)
  globalConsole.log('Urgify Cart Upsell Script v576 loaded');

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
   * Displays upsell products from product metafield (upsell.products)
   */
  class UrgifySlideCartUpsell {
    constructor(container) {
      this.container = container;
      this.blockId = container.dataset.blockId;
      this.config = this.parseConfig();
      this.initialized = false;
      this.currentCartProductIds = new Set();
      this.version = '594';
    }

    /**
     * Parse configuration from script tag or data attribute
     */
    parseConfig() {
      let configStr = null;
      
      try {
        // First, try to get config from script tag (more reliable for JSON)
        const configScript = document.getElementById('urgify-cart-upsell-config');
        
        if (configScript && configScript.textContent) {
          configStr = configScript.textContent.trim();
          console.log('Urgify Cart Upsell: Found config in script tag');
        } else {
          // Fallback to data attribute
          configStr = this.container.getAttribute('data-urgify-config');
          console.log('Urgify Cart Upsell: Using config from data attribute');
        }
        
        if (!configStr || configStr === '{}' || configStr === '' || configStr.trim() === '{') {
          console.log('Urgify Cart Upsell: No config string found or invalid JSON, using defaults', { configStr });
          // Check data-config-enabled as fallback
          const configEnabled = this.container.getAttribute('data-config-enabled');
          if (configEnabled === 'true') {
            const defaultConfig = this.getDefaultConfig();
            defaultConfig.enabled = true;
            return defaultConfig;
          }
          return this.getDefaultConfig();
        }
        
        // Validate JSON string before parsing (check if it looks like valid JSON)
        const trimmedStr = configStr.trim();
        if (!trimmedStr.startsWith('{') || !trimmedStr.endsWith('}')) {
          console.warn('Urgify Cart Upsell: Config string does not look like valid JSON', { configStr: trimmedStr });
          const configEnabled = this.container.getAttribute('data-config-enabled');
          if (configEnabled === 'true') {
            const defaultConfig = this.getDefaultConfig();
            defaultConfig.enabled = true;
            return defaultConfig;
          }
          return this.getDefaultConfig();
        }
        
        // Try to parse as JSON
        let config;
        try {
          config = JSON.parse(trimmedStr);
        } catch (parseError) {
          console.error('Urgify Cart Upsell: JSON parse error', parseError, { configStr: trimmedStr });
          // Fallback to defaults
          const configEnabled = this.container.getAttribute('data-config-enabled');
          if (configEnabled === 'true') {
            const defaultConfig = this.getDefaultConfig();
            defaultConfig.enabled = true;
            return defaultConfig;
          }
          return this.getDefaultConfig();
        }
        
        // Ensure enabled is a boolean (handle string "true"/"false" from Liquid)
        if (typeof config.enabled === 'string') {
          config.enabled = config.enabled === 'true' || config.enabled === '1';
        }
        
        // Also check data-config-enabled attribute as fallback/override
        const configEnabled = this.container.getAttribute('data-config-enabled');
        if (configEnabled === 'true') {
          config.enabled = true;
          console.log('Urgify Cart Upsell: Enabled via data-config-enabled attribute');
        } else if (configEnabled === 'false') {
          config.enabled = false;
          console.log('Urgify Cart Upsell: Disabled via data-config-enabled attribute');
        }
        
        console.log('Urgify Cart Upsell: Parsed config', config);
        return config;
      } catch (error) {
        console.error('Urgify Cart Upsell: Failed to parse config', error, 'Config string:', configStr || this.container.getAttribute('data-urgify-config'));
        // Fallback: check data-config-enabled attribute
        const configEnabled = this.container.getAttribute('data-config-enabled');
        if (configEnabled === 'true') {
          const defaultConfig = this.getDefaultConfig();
          defaultConfig.enabled = true;
          return defaultConfig;
        }
        return this.getDefaultConfig();
      }
    }

    /**
     * Get default configuration
     */
    getDefaultConfig() {
      return {
        enabled: false,
        heading: 'Recommendations',
        max_products: 3,
        enable_metafield_upsells: true,
        enable_recommendations: false,
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

      // Always log initialization (not just in debug mode) for troubleshooting
      console.log(`Urgify Cart Upsell v${this.version} initializing...`, {
        blockId: this.blockId,
        config: this.config,
        container: this.container
      });

      // Check if enabled in config (explicit check for false, undefined, null, or empty string)
      if (this.config.enabled === false || this.config.enabled === 'false' || this.config.enabled === 0 || !this.config.enabled) {
        console.log('Urgify Cart Upsell: Disabled in config', { enabled: this.config.enabled, config: this.config });
        this.renderEmpty();
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
        console.log('Urgify Cart Upsell: Cart fetched', cart);
        if (!cart || !cart.items || cart.items.length === 0) {
          console.log('Urgify Cart Upsell: Cart is empty');
          this.renderEmpty();
          return;
        }

        // Extract product IDs from cart
        this.currentCartProductIds = new Set(
          cart.items.map(item => item.product_id)
        );
        console.log('Urgify Cart Upsell: Cart product IDs', Array.from(this.currentCartProductIds));

        // Resolve upsell candidates from metafield
        const candidates = await this.resolveUpsellCandidates();
        console.log('Urgify Cart Upsell: Upsell candidates', candidates);

        if (Array.isArray(candidates) && candidates.length === 0) {
          console.log('Urgify Cart Upsell: No upsell candidates found');
          this.renderEmpty();
          return;
        }

        // Candidates should be full product objects from the backend
        let products = [];
        if (Array.isArray(candidates) && candidates.length > 0) {
          if (typeof candidates[0] === 'object') {
            // Already have full product objects
            products = candidates;
          } else {
            // Just IDs - fetch product details (shouldn't happen with current backend)
            products = await this.fetchProductDetails(candidates);
          }
        }

        if (products.length === 0) {
          this.renderEmpty();
          return;
        }

        // Render the upsell list
        console.log('Urgify Cart Upsell: Rendering products', products);
        this.render(products);
        this.initialized = true;
        
        console.log(`Urgify Cart Upsell v${this.version} initialized with ${products.length} product(s)`);
      } catch (error) {
        console.error('Urgify Cart Upsell: Initialization error', error);
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
        
        // Check if already available (including web components)
        const isInCartDrawer = this.container.closest('cart-drawer-component, [id*="cart"], [class*="cart"], [class*="drawer"]');
        if (isInCartDrawer) {
          resolve();
          return;
        }

        // Check if cart drawer dialog is open
        const cartDrawer = document.querySelector('cart-drawer-component dialog[open], .cart-drawer dialog[open], [class*="cart-drawer"] dialog[open]');
        if (cartDrawer && this.blockId === 'auto') {
          this.injectIntoCartDrawer();
          if (this.container.closest('cart-drawer-component, [id*="cart"], [class*="cart"], [class*="drawer"]')) {
            resolve();
            return;
          }
        }

        // Wait for cart drawer to open (listen for common events and mutations)
        const checkInterval = setInterval(() => {
          if (this.blockId === 'auto') {
            this.injectIntoCartDrawer();
          }
          
          const isInCartDrawer = this.container.closest('cart-drawer-component, [id*="cart"], [class*="cart"], [class*="drawer"]');
          if (isInCartDrawer) {
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
     * Places it as a sibling of cart-drawer__inner within the dialog, so it appears side-by-side
     */
    injectIntoCartDrawer() {
      // First, try to find the dialog directly (most reliable)
      const dialog = document.querySelector('cart-drawer-component dialog[open], cart-drawer-component dialog.cart-drawer__dialog, .cart-drawer dialog[open], .cart-drawer dialog.cart-drawer__dialog');
      
      if (!dialog) {
        // Try to find cart drawer component first
        const cartDrawer = document.querySelector('cart-drawer-component');
        if (cartDrawer) {
          const dialogInDrawer = cartDrawer.querySelector('dialog');
          if (dialogInDrawer) {
            // Use this dialog
            const cartInner = dialogInDrawer.querySelector('.cart-drawer__inner');
            
        if (cartInner && !dialogInDrawer.contains(this.container)) {
          // Insert before cart-drawer__inner so it appears on the left
          dialogInDrawer.insertBefore(this.container, cartInner);
          // Remove inline display:none style if present
          this.container.style.display = '';
          this.container.style.removeProperty('display');
          this.container.classList.add('urgify-cart-upsell-sidebar');
          
          // Add class to dialog to enable flex layout
          dialogInDrawer.classList.add('urgify-has-upsell');
          
          if (debugEnabled) {
            console.log('Urgify Cart Upsell: Injected into dialog before cart-drawer__inner');
          }
          return;
        }
          }
        }
      } else {
        // Found dialog directly
        const cartInner = dialog.querySelector('.cart-drawer__inner');
        
        if (cartInner && !dialog.contains(this.container)) {
          // Insert before cart-drawer__inner so it appears on the left
          dialog.insertBefore(this.container, cartInner);
          // Remove inline display:none style if present
          this.container.style.display = '';
          this.container.style.removeProperty('display');
          this.container.classList.add('urgify-cart-upsell-sidebar');
          
          // Add class to dialog to enable flex layout
          dialog.classList.add('urgify-has-upsell');
          
          if (debugEnabled) {
            console.log('Urgify Cart Upsell: Injected into dialog before cart-drawer__inner');
          }
          return;
        } else if (!dialog.contains(this.container)) {
          // If no cart-drawer__inner, append to dialog
          dialog.appendChild(this.container);
          // Remove inline display:none style if present
          this.container.style.display = '';
          this.container.style.removeProperty('display');
          this.container.classList.add('urgify-cart-upsell-sidebar');
          
          // Add class to dialog to enable flex layout
          dialog.classList.add('urgify-has-upsell');
          
          if (debugEnabled) {
            console.log('Urgify Cart Upsell: Appended to dialog (no cart-drawer__inner found)');
          }
          return;
        }
      }
      
      // Fallback: Try to find cart drawer by common selectors
      const cartDrawerSelectors = [
        'cart-drawer-component',
        '[id*="cart-drawer"]',
        '[class*="cart-drawer"]',
        '[data-cart-drawer]'
      ];

      let cartDrawer = null;
      for (const selector of cartDrawerSelectors) {
        cartDrawer = document.querySelector(selector);
        if (cartDrawer) break;
      }

      if (cartDrawer && !cartDrawer.contains(this.container)) {
        const dialogInDrawer = cartDrawer.querySelector('dialog');
        const cartInner = cartDrawer.querySelector('.cart-drawer__inner');
        
        if (dialogInDrawer && cartInner) {
          dialogInDrawer.insertBefore(this.container, cartInner);
          // Remove inline display:none style if present
          this.container.style.display = '';
          this.container.style.removeProperty('display');
          this.container.classList.add('urgify-cart-upsell-sidebar');
          
          // Add class to dialog to enable flex layout
          dialogInDrawer.classList.add('urgify-has-upsell');
          
          if (debugEnabled) {
            console.log('Urgify Cart Upsell: Injected via fallback method');
          }
        } else if (cartDrawer) {
          cartDrawer.appendChild(this.container);
          // Remove inline display:none style if present
          this.container.style.display = '';
          this.container.style.removeProperty('display');
          this.container.classList.add('urgify-cart-upsell-sidebar');
          
          // Try to find dialog and add class
          const dialogInCartDrawer = cartDrawer.querySelector('dialog');
          if (dialogInCartDrawer) {
            dialogInCartDrawer.classList.add('urgify-has-upsell');
          }
          
          if (debugEnabled) {
            console.log('Urgify Cart Upsell: Appended to cart drawer (fallback)');
          }
        }
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
     * Resolve upsell candidates from product metafield (upsell.products)
     */
    async resolveUpsellCandidates() {
      const maxProducts = this.config.max_products || 3;
      const candidates = [];
      const candidateProducts = []; // Store full product objects when available

      // Fetch metafield-based upsells
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

      // Deduplicate and exclude cart items
      const uniqueCandidateIds = Array.from(new Set(candidates))
        .filter(id => id && !this.currentCartProductIds.has(id))
        .slice(0, maxProducts);

      // If we have full product objects from metafield upsells, use those
      if (candidateProducts.length > 0) {
        const filteredProducts = candidateProducts
          .filter(p => uniqueCandidateIds.includes(p.id))
          .slice(0, maxProducts);
        
        return filteredProducts;
      }

      return uniqueCandidateIds;
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
          const match = src.match(/https?:\/\/([^/]+)\.myshopify\.com/);
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
    console.log(`Urgify Cart Upsell: Found ${blocks.length} block(s) to initialize`);
    
    blocks.forEach((block, index) => {
      if (!block.dataset.initialized) {
        console.log(`Urgify Cart Upsell: Initializing block ${index + 1}`, block);
        block.dataset.initialized = 'true';
        const upsell = new UrgifySlideCartUpsell(block);
        upsell.init();
      } else {
        console.log(`Urgify Cart Upsell: Block ${index + 1} already initialized`);
      }
    });
  }

  // Initialize on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initUpsellBlocks);
  } else {
    initUpsellBlocks();
  }
  
  // Also check immediately if cart drawer is already open
  setTimeout(() => {
    const openDialog = document.querySelector('cart-drawer-component dialog[open], cart-drawer-component dialog, .cart-drawer dialog[open], .cart-drawer dialog');
    if (openDialog) {
      initUpsellBlocks();
      // Also try to inject immediately
      const blocks = document.querySelectorAll('.urgify-slide-cart-upsell[data-urgify="slide-cart-upsell"]');
      blocks.forEach(block => {
        if (block.dataset.blockId === 'auto') {
          const upsell = new UrgifySlideCartUpsell(block);
          upsell.injectIntoCartDrawer();
        }
      });
    }
  }, 100);

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
  
  // Listen for dialog open events (for web component cart drawers)
  document.addEventListener('click', (e) => {
    const target = e.target;
    // Check if clicked element opens cart drawer
    if (target && (target.closest('[aria-label*="cart" i]') || target.closest('[data-testid*="cart" i]') || target.closest('cart-icon'))) {
      setTimeout(() => {
        const dialog = document.querySelector('cart-drawer-component dialog[open]');
        if (dialog) {
          setTimeout(initUpsellBlocks, 300);
        }
      }, 100);
    }
  });
  
  // Watch for cart drawer visibility changes
  const cartDrawerObserver = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.type === 'attributes') {
        const target = mutation.target;
        
        // Check for dialog open attribute
        if (mutation.attributeName === 'open' && target.tagName === 'DIALOG') {
          if (target.hasAttribute('open')) {
            // Cart drawer dialog opened
            setTimeout(() => {
              initUpsellBlocks();
              // Also try to inject immediately
              const blocks = document.querySelectorAll('.urgify-slide-cart-upsell[data-urgify="slide-cart-upsell"]:not([data-initialized="true"])');
              blocks.forEach(block => {
                if (block.dataset.blockId === 'auto') {
                  const upsell = new UrgifySlideCartUpsell(block);
                  upsell.injectIntoCartDrawer();
                  upsell.init();
                }
              });
            }, 200);
          }
        }
        
        // Check for aria-hidden
        if (mutation.attributeName === 'aria-hidden') {
          if (target.getAttribute('aria-hidden') === 'false') {
            // Cart drawer opened
            setTimeout(() => {
              initUpsellBlocks();
              const blocks = document.querySelectorAll('.urgify-slide-cart-upsell[data-urgify="slide-cart-upsell"]:not([data-initialized="true"])');
              blocks.forEach(block => {
                if (block.dataset.blockId === 'auto') {
                  const upsell = new UrgifySlideCartUpsell(block);
                  upsell.injectIntoCartDrawer();
                  upsell.init();
                }
              });
            }, 200);
          }
        }
        
        // Check for class changes that might indicate opening
        if (mutation.attributeName === 'class') {
          const cartDrawer = target.closest('cart-drawer-component, .cart-drawer, [class*="cart-drawer"]');
          if (cartDrawer) {
            const dialog = cartDrawer.querySelector('dialog[open]');
            if (dialog) {
              setTimeout(() => {
                initUpsellBlocks();
                const blocks = document.querySelectorAll('.urgify-slide-cart-upsell[data-urgify="slide-cart-upsell"]:not([data-initialized="true"])');
                blocks.forEach(block => {
                  if (block.dataset.blockId === 'auto') {
                    const upsell = new UrgifySlideCartUpsell(block);
                    upsell.injectIntoCartDrawer();
                    upsell.init();
                  }
                });
              }, 200);
            }
          }
        }
      }
      
      // Watch for added nodes (cart drawer might be dynamically added)
      if (mutation.type === 'childList') {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === 1) { // Element node
            if (node.matches && (node.matches('cart-drawer-component') || node.querySelector('cart-drawer-component'))) {
              setTimeout(() => {
                initUpsellBlocks();
                const blocks = document.querySelectorAll('.urgify-slide-cart-upsell[data-urgify="slide-cart-upsell"]:not([data-initialized="true"])');
                blocks.forEach(block => {
                  if (block.dataset.blockId === 'auto') {
                    const upsell = new UrgifySlideCartUpsell(block);
                    upsell.injectIntoCartDrawer();
                    upsell.init();
                  }
                });
              }, 200);
            }
            if (node.matches && node.matches('dialog[open]') && node.closest('cart-drawer-component')) {
              setTimeout(() => {
                initUpsellBlocks();
                const blocks = document.querySelectorAll('.urgify-slide-cart-upsell[data-urgify="slide-cart-upsell"]:not([data-initialized="true"])');
                blocks.forEach(block => {
                  if (block.dataset.blockId === 'auto') {
                    const upsell = new UrgifySlideCartUpsell(block);
                    upsell.injectIntoCartDrawer();
                    upsell.init();
                  }
                });
              }, 200);
            }
          }
        });
      }
    });
  });
  
  // Observe common cart drawer elements
  const observeCartDrawer = () => {
    const cartDrawerSelectors = [
      'cart-drawer-component',
      'cart-drawer-component dialog',
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
          attributeFilter: ['open', 'aria-hidden', 'class'],
          childList: true,
          subtree: true
        });
      }
    });
    
    // Also observe the document body for dynamically added cart drawers
    cartDrawerObserver.observe(document.body, {
      childList: true,
      subtree: true
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

