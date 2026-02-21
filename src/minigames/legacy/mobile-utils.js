// MODULE: minigames/mobile-utils.js
// Mobile utility functions for touch/tap abstraction and responsive helpers
// Ensures all minigames are mobile-first, touch-friendly, and responsive

(function(g){
  'use strict';

  /**
   * Check if device is mobile/touch-capable
   * @returns {boolean} True if mobile or touch device
   */
  function isMobileDevice(){
    return (
      'ontouchstart' in window ||
      navigator.maxTouchPoints > 0 ||
      navigator.msMaxTouchPoints > 0 ||
      /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
    );
  }

  /**
   * Get viewport dimensions
   * @returns {Object} Width and height of viewport
   */
  function getViewportSize(){
    return {
      width: window.innerWidth || document.documentElement.clientWidth,
      height: window.innerHeight || document.documentElement.clientHeight
    };
  }

  /**
   * Check if device is in portrait orientation
   * @returns {boolean} True if portrait
   */
  function isPortrait(){
    const viewport = getViewportSize();
    return viewport.height > viewport.width;
  }

  /**
   * Add unified touch/click event listener
   * Handles both touch and mouse events with a single handler
   * @param {HTMLElement} element - Target element
   * @param {Function} handler - Event handler function
   * @param {Object} options - Event options
   * @returns {Function} Cleanup function to remove listeners
   */
  function addTapListener(element, handler, options = {}){
    const isMobile = isMobileDevice();
    
    // Track touch state to prevent duplicate events
    let touchHandled = false;
    
    const touchHandler = (e) => {
      touchHandled = true;
      handler(e);
      
      // Reset flag after a short delay
      setTimeout(() => {
        touchHandled = false;
      }, 300);
    };
    
    const clickHandler = (e) => {
      // Prevent duplicate event if touch was just handled
      if(touchHandled){
        return;
      }
      handler(e);
    };
    
    // Add appropriate event listeners
    if(isMobile){
      element.addEventListener('touchstart', touchHandler, options);
    }
    
    // Always add click for non-touch devices and as fallback
    element.addEventListener('click', clickHandler, options);
    
    // Return cleanup function
    return () => {
      element.removeEventListener('touchstart', touchHandler);
      element.removeEventListener('click', clickHandler);
    };
  }

  /**
   * Add tap listener with visual feedback
   * Adds a pressed state class temporarily
   * @param {HTMLElement} element - Target element
   * @param {Function} handler - Event handler
   * @param {string} pressedClass - CSS class for pressed state (default 'tap-pressed')
   * @returns {Function} Cleanup function
   */
  function addTapWithFeedback(element, handler, pressedClass = 'tap-pressed'){
    const wrappedHandler = (e) => {
      // Add pressed class
      element.classList.add(pressedClass);
      
      // Call original handler
      handler(e);
      
      // Remove pressed class after animation
      setTimeout(() => {
        element.classList.remove(pressedClass);
      }, 150);
    };
    
    return addTapListener(element, wrappedHandler);
  }

  /**
   * Prevent default touch behaviors (like zoom, scroll)
   * Useful for game containers
   * @param {HTMLElement} element - Target element
   * @returns {Function} Cleanup function
   */
  function preventTouchDefaults(element){
    const handler = (e) => {
      e.preventDefault();
    };
    
    element.addEventListener('touchstart', handler, { passive: false });
    element.addEventListener('touchmove', handler, { passive: false });
    element.addEventListener('touchend', handler, { passive: false });
    
    return () => {
      element.removeEventListener('touchstart', handler);
      element.removeEventListener('touchmove', handler);
      element.removeEventListener('touchend', handler);
    };
  }

  /**
   * Get touch/click coordinates
   * Works for both touch and mouse events
   * @param {Event} event - Touch or mouse event
   * @returns {Object} {x, y} coordinates
   */
  function getEventCoordinates(event){
    if(event.touches && event.touches.length > 0){
      // Touch event
      return {
        x: event.touches[0].clientX,
        y: event.touches[0].clientY
      };
    } else if(event.changedTouches && event.changedTouches.length > 0){
      // Touch end event
      return {
        x: event.changedTouches[0].clientX,
        y: event.changedTouches[0].clientY
      };
    } else {
      // Mouse event
      return {
        x: event.clientX,
        y: event.clientY
      };
    }
  }

  /**
   * Create a responsive game container with optimal sizing
   * @param {Object} options - Container options
   * @param {number} options.maxWidth - Maximum width in pixels (default 600)
   * @param {number} options.aspectRatio - Desired aspect ratio (default null = auto)
   * @param {string} options.backgroundColor - Background color (default transparent)
   * @returns {HTMLElement} Configured container element
   */
  function createResponsiveContainer(options = {}){
    const {
      maxWidth = 600,
      aspectRatio = null,
      backgroundColor = 'transparent'
    } = options;
    
    const container = document.createElement('div');
    container.style.cssText = `
      width: 100%;
      max-width: ${maxWidth}px;
      margin: 0 auto;
      padding: 16px;
      box-sizing: border-box;
      background-color: ${backgroundColor};
    `;
    
    // Apply aspect ratio if specified
    if(aspectRatio){
      const aspectPadding = (1 / aspectRatio) * 100;
      container.style.position = 'relative';
      container.style.paddingTop = `${aspectPadding}%`;
      
      const innerContainer = document.createElement('div');
      innerContainer.style.cssText = `
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        padding: 16px;
      `;
      container.appendChild(innerContainer);
      
      return { container, inner: innerContainer };
    }
    
    return { container, inner: container };
  }

  /**
   * Create a mobile-friendly button
   * @param {string} text - Button text
   * @param {Function} handler - Click handler
   * @param {Object} options - Button options
   * @returns {HTMLElement} Button element with cleanup function attached
   */
  function createButton(text, handler, options = {}){
    const {
      primary = true,
      fullWidth = false,
      disabled = false
    } = options;
    
    const button = document.createElement('button');
    button.textContent = text;
    button.disabled = disabled;
    
    const baseStyles = `
      padding: 12px 24px;
      font-size: 1rem;
      border-radius: 8px;
      border: none;
      cursor: pointer;
      transition: all 0.15s ease;
      touch-action: manipulation;
      -webkit-tap-highlight-color: transparent;
      user-select: none;
    `;
    
    const primaryStyles = primary ? `
      background: linear-gradient(135deg, #4a90e2 0%, #357abd 100%);
      color: white;
      box-shadow: 0 2px 8px rgba(74, 144, 226, 0.3);
    ` : `
      background: #2c3a4d;
      color: #e3ecf5;
      border: 1px solid #3f4f63;
    `;
    
    const widthStyle = fullWidth ? 'width: 100%;' : '';
    
    button.style.cssText = baseStyles + primaryStyles + widthStyle;
    
    // Add hover/active effects
    button.addEventListener('mouseenter', () => {
      if(!button.disabled){
        button.style.transform = 'translateY(-1px)';
        button.style.boxShadow = primary ? '0 4px 12px rgba(74, 144, 226, 0.4)' : '0 2px 8px rgba(0,0,0,0.2)';
      }
    });
    
    button.addEventListener('mouseleave', () => {
      button.style.transform = 'translateY(0)';
      button.style.boxShadow = primary ? '0 2px 8px rgba(74, 144, 226, 0.3)' : 'none';
    });
    
    // Add tap listener with feedback
    const cleanup = addTapWithFeedback(button, handler, 'tap-pressed');
    button.__cleanup = cleanup;
    
    return button;
  }

  /**
   * Apply mobile-friendly styles to an element
   * @param {HTMLElement} element - Target element
   * @param {Object} options - Style options
   */
  function applyMobileFriendlyStyles(element, options = {}){
    const {
      disableSelect = true,
      disableTapHighlight = true,
      disableZoom = true
    } = options;
    
    const styles = [];
    
    if(disableSelect){
      styles.push('user-select: none');
      styles.push('-webkit-user-select: none');
    }
    
    if(disableTapHighlight){
      styles.push('-webkit-tap-highlight-color: transparent');
    }
    
    if(disableZoom){
      styles.push('touch-action: manipulation');
    }
    
    const existingStyles = element.style.cssText;
    element.style.cssText = existingStyles + '; ' + styles.join('; ');
  }

  /**
   * Debounce function for performance
   * @param {Function} func - Function to debounce
   * @param {number} wait - Wait time in milliseconds
   * @returns {Function} Debounced function
   */
  function debounce(func, wait){
    let timeout;
    return function executedFunction(...args){
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }

  /**
   * Throttle function for performance
   * @param {Function} func - Function to throttle
   * @param {number} limit - Minimum time between calls in milliseconds
   * @returns {Function} Throttled function
   */
  function throttle(func, limit){
    let inThrottle;
    return function(...args){
      if(!inThrottle){
        func.apply(this, args);
        inThrottle = true;
        setTimeout(() => inThrottle = false, limit);
      }
    };
  }

  /**
   * Vibrate device (if supported)
   * @param {number|Array} pattern - Vibration pattern in milliseconds
   */
  function vibrate(pattern = 50){
    if('vibrate' in navigator){
      navigator.vibrate(pattern);
    }
  }

  // Export API
  g.MinigameMobileUtils = {
    isMobileDevice,
    getViewportSize,
    isPortrait,
    addTapListener,
    addTapWithFeedback,
    preventTouchDefaults,
    getEventCoordinates,
    createResponsiveContainer,
    createButton,
    applyMobileFriendlyStyles,
    debounce,
    throttle,
    vibrate
  };

  // Add global CSS for tap feedback
  const style = document.createElement('style');
  style.textContent = `
    .tap-pressed {
      opacity: 0.7;
      transform: scale(0.98);
    }
  `;
  document.head.appendChild(style);

})(window);
