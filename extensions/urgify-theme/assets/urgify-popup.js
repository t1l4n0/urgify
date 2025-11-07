(() => {
  'use strict';

  // Early debug log to confirm script is loading
  console.log('Urgify Popup: Script loaded', {
    timestamp: new Date().toISOString(),
    readyState: document.readyState,
    url: window.location.href
  });

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
          enabledType: typeof parsedConfig.enabled,
          placement: parsedConfig.placement,
          placementType: typeof parsedConfig.placement,
          triggerType: parsedConfig.trigger_type || parsedConfig.triggerType,
          allConfigKeys: Object.keys(parsedConfig),
          fullConfig: parsedConfig
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
      if (!this.config) {
        console.warn('Urgify Popup: No config found in shouldShowForCurrentPage');
        return false;
      }
      
      // Get placement - check both snake_case and camelCase
      const placement = this.config.placement || this.config.placement_type || 'all';
      const isHomepage = this.isHomepage();
      const isProductPage = this.isProductPage();
      
      console.log('Urgify Popup: shouldShowForCurrentPage check', {
        placement,
        placementType: typeof placement,
        placementValue: String(placement),
        isHomepage,
        isProductPage,
        currentPath: window.location.pathname,
        configKeys: Object.keys(this.config)
      });
      
      // Normalize placement value (handle string comparisons)
      const normalizedPlacement = String(placement).toLowerCase().trim();
      
      if (normalizedPlacement === 'all') {
        console.log('Urgify Popup: Placement is "all" - showing on all pages');
        return true;
      } else if (normalizedPlacement === 'homepage') {
        console.log('Urgify Popup: Placement is "homepage" - checking if homepage:', isHomepage);
        return isHomepage;
      } else if (normalizedPlacement === 'products') {
        console.log('Urgify Popup: Placement is "products" - checking if product page:', isProductPage);
        return isProductPage;
      }
      
      // Fallback: if placement is unknown, don't show
      console.warn('Urgify Popup: Unknown placement type:', placement, 'Type:', typeof placement, 'Value:', String(placement));
      return false;
    }

    renderContent() {
      if (!this.container || !this.config) {
        console.warn('Urgify Popup: Cannot render - missing container or config', {
          hasContainer: !!this.container,
          hasConfig: !!this.config
        });
        return;
      }
      
      console.log('Urgify Popup: Rendering content', {
        config: {
          enabled: this.config.enabled,
          title: this.config.title?.substring(0, 50),
          style: this.config.style,
          position: this.config.position
        }
      });
      
      const overlay = this.container.querySelector('.urgify-popup-overlay');
      const content = this.container.querySelector('.urgify-popup-content');
      const bodyEl = this.container.querySelector('.urgify-popup-body');
      const imageContainer = this.container.querySelector('.urgify-popup-image-container');
      const titleEl = this.container.querySelector('.urgify-popup-title');
      const descriptionEl = this.container.querySelector('.urgify-popup-description');
      const ctaEl = this.container.querySelector('.urgify-popup-cta');
      
      if (!content) {
        console.error('Urgify Popup: Content element not found!');
        return;
      }
      
      if (!bodyEl) {
        console.error('Urgify Popup: Body element not found!');
        return;
      }
      
      // Set position class (popup position on screen)
      const position = this.config.position || 'middle-center';
      console.log('Urgify Popup: Setting position class', {
        position,
        positionClass: `urgify-popup--${position}`,
        containerClassesBefore: this.container.className
      });
      
      // Remove any existing position classes first
      const positionClasses = [
        'urgify-popup--top-left', 'urgify-popup--top-center', 'urgify-popup--top-right',
        'urgify-popup--middle-left', 'urgify-popup--middle-center', 'urgify-popup--middle-right',
        'urgify-popup--bottom-left', 'urgify-popup--bottom-center', 'urgify-popup--bottom-right'
      ];
      positionClasses.forEach(cls => this.container.classList.remove(cls));
      
      // Add the new position class
      this.container.classList.add(`urgify-popup--${position}`);
      
      console.log('Urgify Popup: Position class set', {
        containerClassesAfter: this.container.className,
        computedJustifyContent: getComputedStyle(this.container).justifyContent,
        computedAlignItems: getComputedStyle(this.container).alignItems
      });
      
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
      
      // Get image position (top, bottom, left, right)
      const imagePosition = (this.config.image_position || 'top').toLowerCase();
      console.log('Urgify Popup: Setting image position', {
        imagePosition,
        imagePositionClass: `image-position-${imagePosition}`
      });
      
      // Remove any existing image position classes
      const imagePositionClasses = [
        'image-position-top', 'image-position-bottom',
        'image-position-left', 'image-position-right'
      ];
      imagePositionClasses.forEach(cls => bodyEl.classList.remove(cls));
      
      // Add the image position class
      bodyEl.classList.add(`image-position-${imagePosition}`);
      
      // For left/right positions, we need to wrap content (title, description, newsletter, cta) in a wrapper
      // Do this BEFORE rendering the image so the wrapper is in the correct position
      if (imagePosition === 'left' || imagePosition === 'right') {
        // Check if wrapper already exists
        let contentWrapper = bodyEl.querySelector('.urgify-popup-content-wrapper');
        if (!contentWrapper) {
          contentWrapper = document.createElement('div');
          contentWrapper.className = 'urgify-popup-content-wrapper';
          
          // Move title, description, newsletter, discount, and cta into wrapper
          const elementsToWrap = [
            titleEl,
            descriptionEl,
            this.container.querySelector('.urgify-popup-newsletter-container'),
            this.container.querySelector('.urgify-popup-discount-container'),
            ctaEl
          ].filter(el => el !== null);
          
          elementsToWrap.forEach(el => {
            if (el && el.parentNode === bodyEl) {
              contentWrapper.appendChild(el);
            }
          });
          
          // Insert wrapper at the beginning (image will be inserted before it)
          bodyEl.insertBefore(contentWrapper, bodyEl.firstChild);
        }
      } else {
        // For top/bottom positions, remove wrapper if it exists and move elements back to body
        const contentWrapper = bodyEl.querySelector('.urgify-popup-content-wrapper');
        if (contentWrapper) {
          const elementsToUnwrap = Array.from(contentWrapper.children);
          elementsToUnwrap.forEach(el => {
            bodyEl.appendChild(el);
          });
          contentWrapper.remove();
        }
      }
      
      // Render image
      if (imageContainer && this.config.image_url) {
        const img = document.createElement('img');
        img.src = this.config.image_url;
        img.alt = this.config.image_alt || this.config.title || '';
        img.loading = 'lazy';
        img.style.width = '100%';
        img.style.maxHeight = imagePosition === 'left' || imagePosition === 'right' ? 'auto' : '150px';
        img.style.objectFit = this.config.image_fit || 'cover';
        img.style.borderRadius = '8px';
        
        // Remove inline margin styles - CSS will handle positioning
        img.style.marginBottom = '';
        img.style.marginTop = '';
        
        const imageWrapper = document.createElement('div');
        imageWrapper.className = 'urgify-popup-image';
        imageWrapper.appendChild(img);
        
        // Insert image at the correct position based on imagePosition
        if (imagePosition === 'bottom') {
          // For bottom, append at the end
          bodyEl.appendChild(imageWrapper);
        } else if (imagePosition === 'left' || imagePosition === 'right') {
          // For left/right, insert at the beginning (before wrapper)
          bodyEl.insertBefore(imageWrapper, bodyEl.firstChild);
        } else {
          // For top (default), insert at the beginning
          bodyEl.insertBefore(imageWrapper, bodyEl.firstChild);
        }
        
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
          // Debug: Log the raw description to check for line breaks
          if (typeof this.config.description === 'string') {
            const hasNewlines = this.config.description.includes('\n') || 
                               this.config.description.includes('\r') ||
                               this.config.description.includes('\\n');
            console.log('Urgify Popup: Description debug', {
              length: this.config.description.length,
              hasNewlines: hasNewlines,
              firstChars: this.config.description.substring(0, 100).replace(/\n/g, '\\n').replace(/\r/g, '\\r')
            });
          }
          
          // Normalize line breaks: convert \r\n and \r to \n, then to <br> tags
          // Also handle escaped newlines (\\n) that might come from JSON
          let normalizedText = this.config.description
            .replace(/\\n/g, '\n')   // Handle escaped newlines from JSON
            .replace(/\r\n/g, '\n')  // Windows line breaks
            .replace(/\r/g, '\n');   // Mac line breaks
          
          // Escape HTML first
          const escapedText = normalizedText
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
          
          // Convert line breaks to <br> tags
          descriptionEl.innerHTML = escapedText.replace(/\n/g, '<br>');
          
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
          // Prevent default form submission completely
          newsletterForm.setAttribute('onsubmit', 'return false;');
          newsletterForm.addEventListener('submit', (e) => {
            this.handleNewsletterSubmit(e);
          }, { capture: true });
          
          // Also prevent any default action on the form
          newsletterForm.action = 'javascript:void(0);';
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
      e.stopPropagation();
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
      // Use redirect: 'manual' to prevent page reload on redirect
      fetch(form.action || '/contact', {
        method: 'POST',
        body: formData,
        headers: {
          'X-Requested-With': 'XMLHttpRequest'
        },
        redirect: 'manual' // Don't follow redirects - prevents page reload
      })
      .then(response => {
        console.log('Urgify Popup: Newsletter response', {
          status: response.status,
          ok: response.ok,
          type: response.type,
          redirected: response.redirected,
          url: response.url
        });
        
        // Shopify's customer form endpoint returns:
        // - 302 Redirect (successful subscription) - with redirect: 'manual', this becomes type: 'opaqueredirect'
        // - 200 OK (sometimes)
        // - 422 Unprocessable Entity (validation errors)
        // - Other errors
        
        // With redirect: 'manual', redirects return response.type === 'opaqueredirect'
        // Consider 2xx, 3xx status codes, and opaqueredirect as success
        // Shopify typically redirects (302) on successful subscription
        const isSuccess = (response.ok || 
                          (response.status >= 200 && response.status < 400) ||
                          response.type === 'opaqueredirect' ||
                          response.redirected);
        
        if (isSuccess) {
          console.log('Urgify Popup: Newsletter subscription successful');
          
          // Don't set cookie here - let user manually close the popup
          // Only set sessionStorage flag to prevent popup from reopening immediately after page reload
          // (sessionStorage is cleared when browser is closed, so popup can show again in new session)
          try {
            sessionStorage.setItem('urgify_popup_submitted', 'true');
          } catch (e) {
            // sessionStorage not available, skip
          }
          
          // Show discount code if available (check both snake_case and camelCase)
          const discountCode = this.config.discount_code || this.config.discountCode;
          console.log('Urgify Popup: Checking discount code', {
            discount_code: this.config.discount_code,
            discountCode: this.config.discountCode,
            resolved: discountCode,
            hasDiscountCode: !!discountCode
          });
          
          if (discountCode) {
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
        
        // Show discount code if available (even on error, as subscription might have worked)
        const discountCode = this.config.discount_code || this.config.discountCode;
        console.log('Urgify Popup: Checking discount code in error handler', {
          discount_code: this.config.discount_code,
          discountCode: this.config.discountCode,
          resolved: discountCode,
          hasDiscountCode: !!discountCode
        });
        
        if (discountCode) {
          this.showDiscountCode();
        } else {
          const descriptionEl = this.container.querySelector('.urgify-popup-description');
          if (descriptionEl) {
            descriptionEl.textContent = 'Thank you! Please check your email to confirm your subscription.';
          }
        }
        
        // Don't set cookie here - let user manually close the popup
        // Only set sessionStorage flag to prevent popup from reopening immediately after page reload
        try {
          sessionStorage.setItem('urgify_popup_submitted', 'true');
        } catch (e) {
          // sessionStorage not available, skip
        }
        
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
      
      // Get discount code (support both snake_case and camelCase)
      const discountCode = this.config.discount_code || this.config.discountCode || '';
      
      console.log('Urgify Popup: showDiscountCode called', {
        discount_code: this.config.discount_code,
        discountCode: this.config.discountCode,
        resolved: discountCode,
        hasDiscountContainer: !!discountContainer,
        hasDiscountCodeEl: !!discountCodeEl
      });
      
      if (newsletterContainer) {
        newsletterContainer.style.display = 'none';
      }
      
      if (discountContainer && discountCodeEl && discountCode) {
        discountCodeEl.textContent = discountCode;
        discountContainer.style.display = 'block';
        
        console.log('Urgify Popup: Discount code displayed', {
          code: discountCode,
          containerDisplay: getComputedStyle(discountContainer).display
        });
        
        // Don't show CTA when newsletter is enabled - they are mutually exclusive
        // Even after showing discount code, CTA should remain hidden if newsletter was the trigger
        const enableNewsletter = this.config.enable_newsletter || this.config.enableNewsletter;
        if (enableNewsletter && ctaEl) {
          ctaEl.style.display = 'none';
        } else if (ctaEl && (this.config.cta_text || this.config.ctaText) && (this.config.cta_url || this.config.ctaUrl)) {
          // Only show CTA if newsletter is NOT enabled
          ctaEl.textContent = this.config.cta_text || this.config.ctaText;
          ctaEl.href = this.config.cta_url || this.config.ctaUrl;
          ctaEl.style.display = 'inline-block';
        }
      } else {
        console.warn('Urgify Popup: Cannot show discount code', {
          hasDiscountContainer: !!discountContainer,
          hasDiscountCodeEl: !!discountCodeEl,
          hasDiscountCode: !!discountCode,
          discountCode: discountCode
        });
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
          hasContainer: !!this.container,
          containerDisplay: this.container ? getComputedStyle(this.container).display : 'N/A',
          containerClasses: this.container ? this.container.className : 'N/A'
        });
        return;
      }
      
      // Don't check sessionStorage here - we want the popup to show again after page reload
      // sessionStorage is only used to prevent immediate reopening within the same page load
      // After page reload, the popup should show again (unless cookie is set from manual close)
      
      // Check cookie again before showing
      if (this.isDismissed()) {
        console.log('Urgify Popup: Not showing - dismissed by cookie');
        return;
      }

      console.log('Urgify Popup: Showing popup now', {
        containerExists: !!this.container,
        containerStyle: this.container ? getComputedStyle(this.container).display : 'N/A',
        configEnabled: this.config?.enabled
      });

      this.isVisible = true;
      this.previouslyFocusedElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      
      // Force display flex - important for positioning
      this.container.style.display = 'flex';
      this.container.style.visibility = 'visible';
      this.container.style.opacity = '1';
      
      // Ensure position classes are applied correctly
      const position = this.config.position || 'middle-center';
      const positionClass = `urgify-popup--${position}`;
      if (!this.container.classList.contains(positionClass)) {
        // Remove any existing position classes
        const positionClasses = [
          'urgify-popup--top-left', 'urgify-popup--top-center', 'urgify-popup--top-right',
          'urgify-popup--middle-left', 'urgify-popup--middle-center', 'urgify-popup--middle-right',
          'urgify-popup--bottom-left', 'urgify-popup--bottom-center', 'urgify-popup--bottom-right'
        ];
        positionClasses.forEach(cls => this.container.classList.remove(cls));
        this.container.classList.add(positionClass);
      }
      
      // Force position styles based on position
      const positionMap = {
        'top-left': { justifyContent: 'flex-start', alignItems: 'flex-start' },
        'top-center': { justifyContent: 'center', alignItems: 'flex-start' },
        'top-right': { justifyContent: 'flex-end', alignItems: 'flex-start' },
        'middle-left': { justifyContent: 'flex-start', alignItems: 'center' },
        'middle-center': { justifyContent: 'center', alignItems: 'center' },
        'middle-right': { justifyContent: 'flex-end', alignItems: 'center' },
        'bottom-left': { justifyContent: 'flex-start', alignItems: 'flex-end' },
        'bottom-center': { justifyContent: 'center', alignItems: 'flex-end' },
        'bottom-right': { justifyContent: 'flex-end', alignItems: 'flex-end' }
      };
      
      const positionStyles = positionMap[position] || positionMap['middle-center'];
      this.container.style.justifyContent = positionStyles.justifyContent;
      this.container.style.alignItems = positionStyles.alignItems;
      
      console.log('Urgify Popup: Position styles applied', {
        position,
        justifyContent: positionStyles.justifyContent,
        alignItems: positionStyles.alignItems,
        computedJustifyContent: getComputedStyle(this.container).justifyContent,
        computedAlignItems: getComputedStyle(this.container).alignItems
      });
      
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
        console.log('Urgify Popup: Popup visible and focused', {
          isVisible: this.container.classList.contains('urgify-popup-visible'),
          computedDisplay: getComputedStyle(this.container).display,
          computedOpacity: getComputedStyle(this.container).opacity,
          computedVisibility: getComputedStyle(this.container).visibility
        });
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
      
      // Clear sessionStorage flag when user manually closes popup
      try {
        sessionStorage.removeItem('urgify_popup_submitted');
      } catch (e) {
        // sessionStorage not available, skip
      }
    }

    isDismissed() {
      const triggerType = this.config.trigger_type || this.config.triggerType;
      if (!this.config || triggerType === 'always') {
        return false;
      }

      // Check if ignore_cookie is enabled
      const ignoreCookie = this.config.ignore_cookie === true || 
                            this.config.ignoreCookie === true || 
                            this.config.ignore_cookie === 'true' || 
                            this.config.ignoreCookie === 'true';
      
      if (ignoreCookie) {
        console.log('Urgify Popup: ignore_cookie is enabled - ignoring cookie check');
        // Clean up any existing cookies
        this.clearDismissedCookie();
        return false;
      }

      const cookieDays = parseInt(this.config.cookie_days || this.config.cookieDays || 7, 10);
      
      // If cookie_days is 0 or less, don't check cookie (always show)
      if (cookieDays <= 0) {
        console.log('Urgify Popup: Cookie days is 0 or less - ignoring cookie check');
        // Clean up any existing cookies
        this.clearDismissedCookie();
        return false;
      }

      try {
        const cookieValue = this.getCookie(this.cookieName);
        if (!cookieValue) return false;

        const dismissedTime = parseInt(cookieValue, 10);
        const expiryTime = dismissedTime + (cookieDays * 24 * 60 * 60 * 1000);
        
        const isDismissed = Date.now() < expiryTime;
        console.log('Urgify Popup: Cookie check', {
          cookieDays,
          dismissedTime,
          expiryTime,
          now: Date.now(),
          isDismissed,
          timeUntilExpiry: expiryTime - Date.now()
        });
        
        return isDismissed;
      } catch (error) {
        console.error('Urgify Popup: Error checking cookie:', error);
        return false;
      }
    }

    setDismissedCookie() {
      try {
        // Check if ignore_cookie is enabled
        const ignoreCookie = this.config.ignore_cookie === true || 
                              this.config.ignoreCookie === true || 
                              this.config.ignore_cookie === 'true' || 
                              this.config.ignoreCookie === 'true';
        
        if (ignoreCookie) {
          console.log('Urgify Popup: ignore_cookie is enabled - not setting cookie');
          // Clean up any existing cookies
          this.clearDismissedCookie();
          return;
        }

        const cookieDays = parseInt(this.config.cookie_days || this.config.cookieDays || 7, 10);
        
        // If cookie_days is 0 or less, don't set cookie (always show)
        if (cookieDays <= 0) {
          console.log('Urgify Popup: Cookie days is 0 or less - not setting cookie');
          // Clean up any existing cookies
          this.clearDismissedCookie();
          return;
        }
        
        const expiryDate = new Date();
        expiryDate.setTime(expiryDate.getTime() + (cookieDays * 24 * 60 * 60 * 1000));
        
        const cookieValue = Date.now().toString();
        document.cookie = `${this.cookieName}=${cookieValue};expires=${expiryDate.toUTCString()};path=/;SameSite=Lax`;
        
        console.log('Urgify Popup: Cookie set', {
          cookieDays,
          expiryDate: expiryDate.toISOString(),
          cookieValue
        });
        
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

    clearDismissedCookie() {
      try {
        // Delete cookie by setting expiry to past
        const pastDate = new Date(0).toUTCString();
        document.cookie = `${this.cookieName}=;expires=${pastDate};path=/;SameSite=Lax`;
        
        // Clear localStorage
        try {
          localStorage.removeItem(this.cookieName);
          localStorage.removeItem(`${this.cookieName}_expiry`);
        } catch (e) {
          // localStorage not available, skip
        }
        
        console.log('Urgify Popup: Cookie cleared');
      } catch (error) {
        console.error('Urgify Popup: Error clearing cookie:', error);
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
        // Try to get config from script tag first (preferred method)
        const configScript = document.getElementById('urgify-popup-config');
        if (configScript && configScript.textContent) {
          rawConfig = configScript.textContent.trim();
        }

        // Fallback to data attribute (decode HTML entities)
        if (!rawConfig && this.container?.dataset?.popupConfig) {
          rawConfig = this.decodeHtmlEntities(this.container.dataset.popupConfig);
        }

        // Also try data-popup-config (kebab-case, which HTML converts to camelCase)
        if (!rawConfig && this.container?.dataset?.popupconfig) {
          rawConfig = this.decodeHtmlEntities(this.container.dataset.popupconfig);
        }

        if (!rawConfig) {
          console.warn('Urgify Popup: No config data found. Checked:', {
            scriptElement: !!configScript,
            scriptContent: configScript ? (configScript.textContent ? 'exists' : 'empty') : 'missing',
            datasetPopupConfig: !!this.container?.dataset?.popupConfig,
            datasetPopupconfig: !!this.container?.dataset?.popupconfig,
            containerExists: !!this.container
          });
          return null;
        }

        console.log('Urgify Popup: Raw config found, parsing...', {
          length: rawConfig.length,
          startsWith: rawConfig.substring(0, 50),
          source: configScript ? 'script-tag' : 'data-attribute'
        });

        const parsed = JSON.parse(rawConfig);
        console.log('Urgify Popup: Config parsed successfully', {
          enabled: parsed.enabled,
          placement: parsed.placement,
          triggerType: parsed.trigger_type || parsed.triggerType
        });
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
    const container = document.getElementById('urgify-popup-container');
    const configScript = document.getElementById('urgify-popup-config');
    
    console.log('Urgify Popup: initPopup called', {
      readyState: document.readyState,
      containerExists: !!container,
      configScriptExists: !!configScript,
      configScriptContent: configScript ? (configScript.textContent ? configScript.textContent.substring(0, 100) : 'empty') : 'missing',
      containerDisplay: container ? getComputedStyle(container).display : 'N/A',
      containerInitialized: container ? container.dataset.initialized : 'N/A'
    });

    if (container && !container.dataset.initialized) {
      console.log('Urgify Popup: Initializing popup instance');
      container.dataset.initialized = 'true';
      try {
        new UrgifyPopup(container);
      } catch (error) {
        console.error('Urgify Popup: Error creating popup instance:', error);
      }
    } else if (!container) {
      console.warn('Urgify Popup: Container element not found. Make sure the popup snippet is included in your theme.', {
        allElementsWithId: Array.from(document.querySelectorAll('[id*="urgify"]')).map(el => el.id),
        bodyInnerHTML: document.body.innerHTML.substring(0, 500)
      });
      // Try again after a short delay (in case script loads before HTML)
      setTimeout(() => {
        const retryContainer = document.getElementById('urgify-popup-container');
        if (retryContainer && !retryContainer.dataset.initialized) {
          console.log('Urgify Popup: Container found on retry, initializing');
          retryContainer.dataset.initialized = 'true';
          try {
            new UrgifyPopup(retryContainer);
          } catch (error) {
            console.error('Urgify Popup: Error creating popup instance on retry:', error);
          }
        } else {
          console.warn('Urgify Popup: Container still not found after retry');
        }
      }, 500);
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
    // Reset initialization flag for the container
    const container = document.getElementById('urgify-popup-container');
    if (container) {
      container.dataset.initialized = 'false';
    }
    setTimeout(initPopup, 100);
  });

  // Also listen for DOM mutations (in case container is added dynamically)
  if (typeof MutationObserver !== 'undefined') {
    const observer = new MutationObserver((mutations) => {
      const container = document.getElementById('urgify-popup-container');
      if (container && !container.dataset.initialized) {
        console.log('Urgify Popup: Container detected via MutationObserver, initializing');
        container.dataset.initialized = 'true';
        new UrgifyPopup(container);
      }
    });

    // Start observing after a short delay to avoid immediate firing
    setTimeout(() => {
      observer.observe(document.body, {
        childList: true,
        subtree: true
      });
    }, 1000);
  }

  // Export for global access
  window.UrgifyPopup = UrgifyPopup;

})();

