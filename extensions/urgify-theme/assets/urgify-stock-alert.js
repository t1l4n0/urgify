(() => {
  // Find all stock alert blocks on the page
  const blocks = document.querySelectorAll('[id^="urgify-stock-alert-"]');
  const autoHost = document.getElementById('urgify-stock-alert-auto');
  
  const allHosts = [...blocks];
  if (autoHost) allHosts.push(autoHost);

  allHosts.forEach(host => {
    if (!host) return;

    const blockId = host.id.includes('auto') ? 'auto' : host.id.split('-').pop();
    const cfg = window.__urgifyConfig || {};
    const threshold = parseInt(cfg.global_threshold || host.dataset.threshold, 10) || 5;
    const template = cfg.low_stock_message || host.dataset.message || host.dataset.lowMessage || 'Only {{qty}} left in stock!';
    const fontSize = cfg.font_size || host.dataset.fontSize || null;
    const textColor = cfg.text_color || host.dataset.textColor || null;
    const backgroundColor = cfg.background_color || host.dataset.backgroundColor || null;
    const animation = cfg.stock_counter_animation || host.dataset.animation || 'pulse';
    const shake = host.dataset.shake || 'disabled';
    const tracksInventory = host.dataset.tracksInventory === 'true';
    if (cfg.stock_counter_position && host.id === 'urgify-stock-alert-auto') {
      host.dataset.position = cfg.stock_counter_position;
    }

    // Varianten-Bestände aus dem Script-Tag lesen:
    let invMap = {};
    try {
      const raw = document.getElementById(`urgify-variant-qty-${blockId}`)?.textContent ||
                  document.getElementById('urgify-variant-qty-auto')?.textContent || '{}';
      invMap = JSON.parse(raw);
    } catch (e) { 
      console.warn('Urgify: Could not parse variant quantities', e);
      invMap = {}; 
    }

    const textEl = host.querySelector('.urgify-stock-alert__text');

    // Aktuelle Variant-ID ermitteln (generisch):
    function currentVariantId() {
      // häufigster Fall: hidden input name="id" im Produkt-Formular
      const input = document.querySelector('form[action*="/cart"] [name="id"], [name="id"]');
      if (input && input.value) return input.value;
      
      // Fallback: data-selected-variant-id, wenn vom Theme bereitgestellt
      const selected = document.querySelector('[data-selected-variant-id]');
      if (selected?.getAttribute('data-selected-variant-id')) {
        return selected.getAttribute('data-selected-variant-id');
      }
      
      // Weitere Fallbacks für verschiedene Themes
      const variantInput = document.querySelector('input[name="id"]:checked');
      if (variantInput) return variantInput.value;
      
      return null;
    }

    function ensurePlacement() {
      // Only auto-place the auto host; leave manually placed blocks as-is
      if (!host || host.id !== 'urgify-stock-alert-auto' || host.dataset.positionApplied === 'true') return;
      // Try to place above/below add-to-cart button
      const addToCart = document.querySelector('form[action*="/cart"] [type="submit"], form[action*="/cart"] button[name="add"]');
      if (addToCart && addToCart.closest('form')) {
        const form = addToCart.closest('form');
        // Treat any unknown/custom value as 'above' to keep behavior consistent
        if (host.dataset.position === 'custom') {
          host.dataset.position = 'above';
        }
        if (host.dataset.position === 'below') {
          form.parentNode.insertBefore(host, form.nextSibling);
        } else { // default above
          form.parentNode.insertBefore(host, form);
        }
        host.dataset.positionApplied = 'true';
      }
    }

    function render() {
      ensurePlacement();
      const id = currentVariantId();
      if (!id) {
        // Retry shortly — some themes mount product forms late
        setTimeout(render, 250);
        host.hidden = true;
        return;
      }
      
      const qty = invMap[id];
      if (!tracksInventory) {
        host.hidden = true;
        return;
      }
      if (typeof qty !== 'number' || qty <= 0) { 
        host.hidden = true; 
        return; 
      }
      
      if (qty <= threshold) {
        textEl.innerHTML = template.replace(/\{\{qty\}\}/g, qty);
        host.classList.remove('urgify-stock-alert--critical');
        // Apply advanced styles if provided
        // Apply via CSS custom properties so admin and frontend render identically
        if (fontSize) host.style.setProperty('--urgify-font-size', fontSize);
        if (textColor) {
          host.style.setProperty('--urgify-text-color', textColor);
          host.style.setProperty('--urgify-border', textColor);
        }
        if (backgroundColor) {
          host.style.setProperty('--urgify-bg', backgroundColor);
          host.style.background = backgroundColor; // ensure immediate application even if CSS var not picked up
          host.style.backgroundImage = 'none'; // override gradient fallback explicitly
          // Force background color to override any CSS animations
          host.style.setProperty('background-color', backgroundColor, 'important');
        }
        if (animation === 'none') host.style.setProperty('--urgify-animation', 'none');
        if (animation === 'pulse') host.style.setProperty('--urgify-animation', 'scarcityPulse 2s infinite');
        if (animation === 'bounce') host.style.setProperty('--urgify-animation', 'urgifyBounce 1.2s infinite');
        if (animation === 'shake') host.style.setProperty('--urgify-animation', 'criticalShake 0.5s infinite');
        if (shake === 'enabled') host.style.setProperty('--urgify-animation-critical', 'criticalShake 0.5s infinite');
        host.hidden = false;
      } else {
        host.hidden = true;
      }
    }

    // Auf Variant-Wechsel reagieren
    document.addEventListener('variant:change', render, { passive: true });
    document.addEventListener('change', (e) => { 
      if (e.target?.name === 'id') render(); 
    }, { passive: true });

    // Initial render (after DOM is ready)
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', render, { once: true });
    } else {
      render();
    }

    // Fallback observer to re-render when product form nodes appear
    const mo = new MutationObserver(() => {
      const id = currentVariantId();
      if (id) {
        render();
        mo.disconnect();
      }
    });
    mo.observe(document.documentElement, { childList: true, subtree: true });
  });
})();
