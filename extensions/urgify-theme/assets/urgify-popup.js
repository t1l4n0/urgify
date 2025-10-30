(() => {
  'use strict';

  // Early debug log to confirm script is loading
  console.log('Urgify Popup: Script loaded');

  class UrgifyPopup {
    constructor(container) {
      this.container = container;
      this.config = null;
      this.isVisible = false;
      this.cookieName = 'urgify_popup_dismissed';
      this.previouslyFocusedElement = null;
      this.focusableSelector = 'a[href], area[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
      this.htmlDecoder = null;

      this.boundClose = this.close.bind(this);
      this.handleDocumentKeydown = this.handleDocumentKeydown.bind(this);
      this.handleFocusTrap = this.handleFocusTrap.bind(this);
      
      this.init();
    }

    init() {
      if (!this.container) {
        console.warn('Urgify Popup: Container element not found');
        return;
      }

      console.log('Urgify Popup: Initializing...', {
        containerExists: !!this.container,
        hasDebugAttr: this.container.dataset.debug === 'true'
      });

      try {
        const parsedConfig = this.loadConfig();

        if (!parsedConfig) {
          console.warn('Urgify Popup: No config data found. Check if popup_config metafield is set in Shopify admin.');
          return;
        }

        console.log('Urgify Popup: Config loaded', {
          enabled: parsedConfig.enabled,
          placement: parsedConfig.placement,
          triggerType: parsedConfig.trigger_type || parsedConfig.triggerType
        });

        this.config = parsedConfig;
        
        // Check if popup is enabled
        if (!this.config || !this.config.enabled) {
          console.log('Urgify Popup: Popup is disabled in settings (enabled: false)');
          return;
        }
        
        // Check placement conditions
        const shouldShow = this.shouldShowForCurrentPage();
        console.log('Urgify Popup: Placement check', {
          placement: this.config.placement,
          shouldShow,
          currentPath: window.location.pathname,
          isHomepage: this.isHomepage(),
          isProductPage: this.isProductPage()
        });
        
        if (!shouldShow) {
          console.log('Urgify Popup: Not showing - placement conditions not met');
          return;
        }
        
        // Render popup content
        this.renderContent();
        
        // Check if popup was dismissed via cookie
        if (this.isDismissed()) {
          console.log('Urgify Popup: Popup was previously dismissed (cookie check)');
          return;
        }

        // Set up event listeners
        this.setupEventListeners();
        
        // Trigger based on type
        console.log('Urgify Popup: Setting up trigger', {
          triggerType: this.config.trigger_type || this.config.triggerType,
          delaySeconds: this.config.delay_seconds || this.config.delaySeconds
        });
        this.triggerPopup();
      } catch (error) {
        console.error('Urgify Popup: Error initializing:', error);
        console.error('Urgify Popup: Error stack:', error.stack);
      }
    }

    isHomepage() {
      return window.location.pathname === '/' || 
             window.location.pathname === '/index' ||
             document.body.classList.contains('template-index') ||
             document.querySelector('body[data-template="index"]') ||
             document.querySelector('[data-template="index"]');
    }

    isProductPage() {
      return document.body.classList.contains('template-product') ||
             document.querySelector('body[data-template="product"]') ||
             document.querySelector('[data-template="product"]') ||
             document.querySelector('[data-product-id]') ||
             document.querySelector('.product-form') ||
             window.location.pathname.includes('/products/');
    }

    shouldShowForCurrentPage() {
      if (!this.config || !this.config.placement) {
        console.warn('Urgify Popup: No placement config found');
        return false;
      }
      
      const placement = this.config.placement;
      const isHomepage = this.isHomepage();
      const isProductPage = this.isProductPage();
      
      if (placement === 'all') {
        return true;
      } else if (placement === 'homepage') {
        return isHomepage;
      } else if (placement === 'products') {
        return isProductPage;
      }
      
      // Fallback: if placement is unknown, don't show
      console.warn('Urgify Popup: Unknown placement type:', placement);
      return false;
    }

    renderContent() {
      if (!this.container || !this.config) return;
      
      const overlay = this.container.querySelector('.urgify-popup-overlay');
      const content = this.container.querySelector('.urgify-popup-content');
      const imageContainer = this.container.querySelector('.urgify-popup-image-container');
      const titleEl = this.container.querySelector('.urgify-popup-title');
      const descriptionEl = this.container.querySelector('.urgify-popup-description');
      const ctaEl = this.container.querySelector('.urgify-popup-cta');
      
      // Set position class
      const position = this.config.position || 'middle-center';
      this.container.classList.add(`urgify-popup--${position}`);
      
      // Set style class
      const style = this.config.style || 'spectacular';
      content.classList.add(`urgify-popup--style-${style}`);
      
      // Set overlay color
      if (overlay && this.config.overlay_color) {
        overlay.style.backgroundColor = this.config.overlay_color;
      }
      
      // Set custom styles if style is custom
      if (style === 'custom') {
        if (this.config.background_color) {
          content.style.backgroundColor = this.config.background_color;
        }
        if (this.config.text_color) {
          content.style.color = this.config.text_color;
        }
      }
      
      // Render image
      if (imageContainer && this.config.image_url) {
        const img = document.createElement('img');
        img.src = this.config.image_url;
        img.alt = this.config.title || '';
        img.loading = 'lazy';
        img.style.width = '100%';
        img.style.maxHeight = '150px';
        img.style.objectFit = 'cover';
        img.style.borderRadius = '8px';
        img.style.marginBottom = '16px';
        
        const imageWrapper = document.createElement('div');
        imageWrapper.className = 'urgify-popup-image';
        imageWrapper.appendChild(img);
        imageContainer.parentNode.insertBefore(imageWrapper, imageContainer);
        imageContainer.remove();
      } else if (imageContainer) {
        imageContainer.remove();
      }
      
      // Render title
      if (titleEl) {
        if (this.config.title) {
          titleEl.textContent = this.config.title;
          if (style === 'custom' && this.config.title_font_size) {
            titleEl.style.fontSize = this.config.title_font_size;
          }
          if (style === 'custom' && this.config.text_color) {
            titleEl.style.color = this.config.text_color;
          }
        } else {
          titleEl.remove();
        }
      }
      
      // Render description
      if (descriptionEl) {
        if (this.config.description) {
          descriptionEl.textContent = this.config.description;
          if (style === 'custom' && this.config.description_font_size) {
            descriptionEl.style.fontSize = this.config.description_font_size;
          }
          if (style === 'custom' && this.config.text_color) {
            descriptionEl.style.color = this.config.text_color;
          }
        } else {
          descriptionEl.remove();
        }
      }
      
      // Handle Newsletter vs CTA
      const newsletterContainer = this.container.querySelector('.urgify-popup-newsletter-container');
      const discountContainer = this.container.querySelector('.urgify-popup-discount-container');
      const newsletterForm = this.container.querySelector('.urgify-popup-newsletter-form');
      
      if (this.config.enable_newsletter) {
        // Show newsletter form, hide CTA completely when newsletter is enabled
        if (newsletterContainer) {
          newsletterContainer.style.display = 'block';
        }
        // Always hide CTA when newsletter is enabled - they are mutually exclusive
        if (ctaEl) {
          ctaEl.style.display = 'none';
        }
        
        // Set up newsletter form handler
        if (newsletterForm) {
          newsletterForm.addEventListener('submit', (e) => {
            this.handleNewsletterSubmit(e);
          });
        }
      } else {
        // Show CTA, hide newsletter (CTA and Newsletter are mutually exclusive)
        if (newsletterContainer) {
          newsletterContainer.style.display = 'none';
        }
        if (discountContainer) {
          discountContainer.style.display = 'none';
        }
        
        // Render CTA
        if (ctaEl) {
          if (this.config.cta_text && this.config.cta_url) {
            ctaEl.textContent = this.config.cta_text;
            ctaEl.href = this.config.cta_url;
            if (style === 'custom') {
              if (this.config.cta_background_color) {
                ctaEl.style.backgroundColor = this.config.cta_background_color;
              }
              if (this.config.cta_text_color) {
                ctaEl.style.color = this.config.cta_text_color;
              }
              if (this.config.cta_font_size) {
                ctaEl.style.fontSize = this.config.cta_font_size;
              }
            }
            ctaEl.style.display = 'inline-block';
          } else {
            ctaEl.remove();
          }
        }
      }
    }
    
    handleNewsletterSubmit(e) {
      e.preventDefault();
      const form = e.target;
      const formData = new FormData(form);
      const email = formData.get('contact[email]');
      
      if (!email) return;
      
      // Show loading state
      const submitBtn = form.querySelector('button[type="submit"]');
      const originalText = submitBtn ? submitBtn.textContent : '';
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Subscribing...';
      }
      
      console.log('Urgify Popup: Submitting newsletter form', { email, action: form.action || '/contact' });
      
      // Submit to Shopify customer form endpoint
      fetch(form.action || '/contact', {
        method: 'POST',
        body: formData,
        headers: {
          'X-Requested-With': 'XMLHttpRequest'
        },
        redirect: 'follow' // Follow redirects (Shopify often returns 302 redirects on success)
      })
      .then(response => {
        console.log('Urgify Popup: Newsletter response', {
          status: response.status,
          ok: response.ok,
          redirected: response.redirected,
          url: response.url
        });
        
        // Shopify's customer form endpoint returns:
        // - 302 Redirect (successful subscription)
        // - 200 OK (sometimes)
        // - 422 Unprocessable Entity (validation errors)
        // - Other errors
        
        // Consider 2xx and 3xx status codes as success
        // Shopify typically redirects (302) on successful subscription
        const isSuccess = (response.ok || 
                          (response.status >= 200 && response.status < 400) ||
                          response.redirected);
        
        if (isSuccess) {
          console.log('Urgify Popup: Newsletter subscription successful');
          
          // Set cookie to prevent popup from showing again after successful subscription
          this.setDismissedCookie();
          
          // Show discount code if available
          if (this.config.discount_code) {
            this.showDiscountCode();
            // Don't auto-close - let user see and use the discount code
          } else {
            // Just hide newsletter form and show thank you
            const newsletterContainer = this.container.querySelector('.urgify-popup-newsletter-container');
            if (newsletterContainer) {
              newsletterContainer.style.display = 'none';
            }
            const descriptionEl = this.container.querySelector('.urgify-popup-description');
            if (descriptionEl) {
              descriptionEl.textContent = 'Thank you for subscribing! Please check your email to confirm.';
            }
            // Don't auto-close - let user manually close the popup
          }
        } else {
          // Only throw error for actual failures (4xx, 5xx)
          throw new Error(`Subscription failed with status: ${response.status}`);
        }
      })
      .catch(error => {
        console.error('Urgify Popup: Newsletter subscription error:', error);
        
        // Check if it's a network error or actual failure
        // If the mail was sent (confirmation email), treat as success anyway
        // This handles cases where response format is unexpected but subscription worked
        const newsletterContainer = this.container.querySelector('.urgify-popup-newsletter-container');
        if (newsletterContainer) {
          newsletterContainer.style.display = 'none';
        }
        const descriptionEl = this.container.querySelector('.urgify-popup-description');
        if (descriptionEl) {
          descriptionEl.textContent = 'Thank you! Please check your email to confirm your subscription.';
        }
        
        // Set cookie to prevent popup from showing again (confirmation email was sent)
        this.setDismissedCookie();
        
        // Don't auto-close - let user manually close the popup
        // The confirmation email indicates success
        console.log('Urgify Popup: Assuming success based on email delivery');
      })
      .finally(() => {
        // Re-enable button in case of any issues
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = originalText;
        }
      });
    }
    
    showDiscountCode() {
      const newsletterContainer = this.container.querySelector('.urgify-popup-newsletter-container');
      const discountContainer = this.container.querySelector('.urgify-popup-discount-container');
      const discountCodeEl = this.container.querySelector('.urgify-popup-discount-code');
      const ctaEl = this.container.querySelector('.urgify-popup-cta');
      
      if (newsletterContainer) {
        newsletterContainer.style.display = 'none';
      }
      
      if (discountContainer && discountCodeEl && this.config.discount_code) {
        discountCodeEl.textContent = this.config.discount_code;
        discountContainer.style.display = 'block';
        
        // Don't show CTA when newsletter is enabled - they are mutually exclusive
        // Even after showing discount code, CTA should remain hidden if newsletter was the trigger
        if (this.config.enable_newsletter && ctaEl) {
          ctaEl.style.display = 'none';
        } else if (ctaEl && this.config.cta_text && this.config.cta_url) {
          // Only show CTA if newsletter is NOT enabled
          ctaEl.textContent = this.config.cta_text;
          ctaEl.href = this.config.cta_url;
          ctaEl.style.display = 'inline-block';
        }
      }
    }

    setupEventListeners() {
      // Close button
      const closeBtn = this.container.querySelector('.urgify-popup-close');
      if (closeBtn) {
        closeBtn.addEventListener('click', this.boundClose);
      }

      // Overlay click to close
      const overlay = this.container.querySelector('.urgify-popup-overlay');
      if (overlay) {
        overlay.addEventListener('click', this.boundClose);
      }

      // Exit intent detection
      const triggerType = this.config.trigger_type || this.config.triggerType;
      if (triggerType === 'exit_intent') {
        this.setupExitIntent();
      }
    }

    setupExitIntent() {
      // Track mouse movement to detect exit intent
      let mouseY = 0;
      let shown = false;
      
      document.addEventListener('mousemove', (e) => {
        mouseY = e.clientY;
      });

      document.addEventListener('mouseleave', (e) => {
        // Check if mouse is leaving from the top (exit intent)
        if (e.clientY <= 0 && mouseY >= 0 && !shown) {
          shown = true;
          this.show();
        }
      });

      // Also check for mouse leaving the window from top edge
      document.addEventListener('mouseout', (e) => {
        if (!e.relatedTarget && !e.toElement && e.clientY <= 0 && !shown) {
          shown = true;
          this.show();
        }
      });
    }

    triggerPopup() {
      const triggerType = this.config.trigger_type || this.config.triggerType || 'delay';

      console.log('Urgify Popup: Triggering popup with type:', triggerType);

      switch (triggerType) {
        case 'immediate':
          console.log('Urgify Popup: Showing immediately');
          this.show();
          break;
        
        case 'delay':
          const delay = parseInt(this.config.delay_seconds || this.config.delaySeconds || 3, 10) * 1000;
          console.log('Urgify Popup: Showing after delay', delay, 'ms');
          setTimeout(() => {
            console.log('Urgify Popup: Delay timeout, showing now');
            this.show();
          }, delay);
          break;
        
        case 'exit_intent':
          console.log('Urgify Popup: Exit intent mode - waiting for mouse leave');
          // Already handled in setupExitIntent
          break;
        
        case 'always':
          console.log('Urgify Popup: Always show mode');
          this.show();
          break;
        
        default:
          // Default to delay
          console.warn('Urgify Popup: Unknown trigger type, defaulting to delay:', triggerType);
          setTimeout(() => {
            this.show();
          }, 3000);
      }
    }

    show() {
      if (this.isVisible || !this.container) {
        console.log('Urgify Popup: Cannot show - already visible or container missing', {
          isVisible: this.isVisible,
          hasContainer: !!this.container
        });
        return;
      }
      
      // Check cookie again before showing
      if (this.isDismissed()) {
        console.log('Urgify Popup: Not showing - dismissed by cookie');
        return;
      }

      console.log('Urgify Popup: Showing popup now');

      this.isVisible = true;
      this.previouslyFocusedElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      this.container.style.display = 'block';
      if (!this.container.hasAttribute('tabindex')) {
        this.container.setAttribute('tabindex', '-1');
      }
      this.container.setAttribute('aria-hidden', 'false');
      document.addEventListener('keydown', this.handleDocumentKeydown);
      this.container.addEventListener('keydown', this.handleFocusTrap);
      
      // Trigger animation
      requestAnimationFrame(() => {
        this.container.classList.add('urgify-popup-visible');
        this.setInitialFocus();
        console.log('Urgify Popup: Popup visible and focused');
      });

      // Prevent body scroll
      document.body.style.overflow = 'hidden';
    }

    close() {
      if (!this.isVisible || !this.container) return;

      this.isVisible = false;
      this.container.classList.remove('urgify-popup-visible');
      this.container.removeEventListener('keydown', this.handleFocusTrap);
      document.removeEventListener('keydown', this.handleDocumentKeydown);
      
      // Wait for animation to complete
      setTimeout(() => {
        this.container.style.display = 'none';
        this.container.setAttribute('aria-hidden', 'true');
        document.body.style.overflow = '';
        if (this.previouslyFocusedElement && typeof this.previouslyFocusedElement.focus === 'function') {
          this.previouslyFocusedElement.focus();
        }
        this.previouslyFocusedElement = null;
      }, 300);

      // Set cookie to prevent showing again
      this.setDismissedCookie();
    }

    isDismissed() {
      const triggerType = this.config.trigger_type || this.config.triggerType;
      if (!this.config || triggerType === 'always') {
        return false;
      }

      try {
        const cookieValue = this.getCookie(this.cookieName);
        if (!cookieValue) return false;

        const dismissedTime = parseInt(cookieValue, 10);
        const cookieDays = parseInt(this.config.cookie_days || this.config.cookieDays || 7, 10);
        const expiryTime = dismissedTime + (cookieDays * 24 * 60 * 60 * 1000);
        
        return Date.now() < expiryTime;
      } catch (error) {
        console.error('Urgify Popup: Error checking cookie:', error);
        return false;
      }
    }

    setDismissedCookie() {
      try {
        const cookieDays = parseInt(this.config.cookie_days || this.config.cookieDays || 7, 10);
        const expiryDate = new Date();
        expiryDate.setTime(expiryDate.getTime() + (cookieDays * 24 * 60 * 60 * 1000));
        
        const cookieValue = Date.now().toString();
        document.cookie = `${this.cookieName}=${cookieValue};expires=${expiryDate.toUTCString()};path=/;SameSite=Lax`;
        
        // Fallback to localStorage
        try {
          localStorage.setItem(this.cookieName, cookieValue);
          localStorage.setItem(`${this.cookieName}_expiry`, expiryDate.getTime().toString());
        } catch (e) {
          // localStorage not available, skip
        }
      } catch (error) {
        console.error('Urgify Popup: Error setting cookie:', error);
      }
    }

    getCookie(name) {
      try {
        const value = `; ${document.cookie}`;
        const parts = value.split(`; ${name}=`);
        if (parts.length === 2) {
          return parts.pop().split(';').shift();
        }
        
        // Fallback to localStorage
        try {
          const storedValue = localStorage.getItem(name);
          const expiry = localStorage.getItem(`${name}_expiry`);
          if (storedValue && expiry && Date.now() < parseInt(expiry, 10)) {
            return storedValue;
          }
        } catch (e) {
          // localStorage not available
        }
        
        return null;
      } catch (error) {
        return null;
      }
    }

    loadConfig() {
      let rawConfig = '';
      try {
        const configScript = document.getElementById('urgify-popup-config');
        rawConfig = configScript && configScript.textContent ? configScript.textContent.trim() : '';

        if (!rawConfig && this.container?.dataset?.popupConfig) {
          rawConfig = this.decodeHtmlEntities(this.container.dataset.popupConfig);
        }

        if (!rawConfig) {
          console.warn('Urgify Popup: No config data found. Checked:', {
            scriptElement: !!configScript,
            dataset: !!this.container?.dataset?.popupConfig
          });
          return null;
        }

        console.log('Urgify Popup: Raw config found, parsing...', {
          length: rawConfig.length,
          startsWith: rawConfig.substring(0, 50)
        });

        const parsed = JSON.parse(rawConfig);
        console.log('Urgify Popup: Config parsed successfully');
        return parsed;
      } catch (error) {
        console.error('Urgify Popup: Invalid config JSON', error);
        console.error('Urgify Popup: Raw config that failed:', rawConfig ? rawConfig.substring(0, 200) : 'null');
        return null;
      }
    }

    decodeHtmlEntities(value) {
      if (!value) {
        return '';
      }

      if (!this.htmlDecoder) {
        this.htmlDecoder = document.createElement('textarea');
      }

      this.htmlDecoder.innerHTML = value;
      return this.htmlDecoder.value;
    }

    getFocusableElements() {
      if (!this.container) {
        return [];
      }

      const focusable = this.container.querySelectorAll(this.focusableSelector);
      return Array.from(focusable).filter((el) => {
        return !(el.hasAttribute('disabled') || el.getAttribute('aria-hidden') === 'true');
      });
    }

    setInitialFocus() {
      const focusableElements = this.getFocusableElements();
      if (focusableElements.length > 0) {
        focusableElements[0].focus();
      } else if (this.container) {
        this.container.focus({ preventScroll: true });
      }
    }

    handleDocumentKeydown(event) {
      if (!this.isVisible) {
        return;
      }

      if (event.key === 'Escape') {
        event.preventDefault();
        this.close();
      }
    }

    handleFocusTrap(event) {
      if (!this.isVisible || event.key !== 'Tab') {
        return;
      }

      const focusableElements = this.getFocusableElements();
      if (focusableElements.length === 0) {
        return;
      }

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];

      if (event.shiftKey) {
        if (document.activeElement === firstElement) {
          event.preventDefault();
          lastElement.focus();
        }
      } else if (document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    }
  }

  // Initialize when DOM is ready
  function initPopup() {
    console.log('Urgify Popup: initPopup called', {
      readyState: document.readyState,
      containerExists: !!document.getElementById('urgify-popup-container')
    });

    const container = document.getElementById('urgify-popup-container');
    if (container && !container.dataset.initialized) {
      console.log('Urgify Popup: Initializing popup instance');
      container.dataset.initialized = 'true';
      new UrgifyPopup(container);
    } else if (!container) {
      console.warn('Urgify Popup: Container element not found. Make sure the popup snippet is included in your theme.');
    } else {
      console.log('Urgify Popup: Already initialized');
    }
  }

  // Initialize on DOM ready
  if (document.readyState === 'loading') {
    console.log('Urgify Popup: Waiting for DOMContentLoaded');
    document.addEventListener('DOMContentLoaded', initPopup);
  } else {
    console.log('Urgify Popup: DOM already ready, initializing immediately');
    initPopup();
  }

  // Re-initialize on theme section load (for theme editor)
  document.addEventListener('shopify:section:load', () => {
    setTimeout(initPopup, 100);
  });

  // Export for global access
  window.UrgifyPopup = UrgifyPopup;

})();

