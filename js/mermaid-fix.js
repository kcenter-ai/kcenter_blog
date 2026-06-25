// Ultimate Mermaid fix - handles the space-prefixed class issue
(function() {
  function fixMermaidClasses() {
    // Fix code elements with space-prefixed ' mermaid' class
    var codeElements = document.querySelectorAll('code[class*="mermaid"]');

    codeElements.forEach(function(code) {
      var pre = code.parentElement;
      // Fix the class - remove leading space
      code.className = 'mermaid';
      // Add mermaid class to pre element
      if (pre && pre.tagName === 'PRE') {
        pre.classList.add('mermaid');
      }
    });
  }

  // Override mermaid.init to fix classes before rendering
  function installMermaidFix() {
    if (typeof mermaid === 'undefined') return false;
    if (typeof mermaid.init !== 'function') return false;

    // Store original init
    var originalInit = mermaid.init;

    // Override with our version
    mermaid.init = function(nodes) {
      // Always fix classes first
      fixMermaidClasses();

      // Call original with elements that have .mermaid class
      if (!nodes) {
        nodes = document.querySelectorAll('.mermaid');
      }
      return originalInit.call(mermaid, nodes);
    };

    return true;
  }

  // Wait for mermaid to load, then install our fix
  function waitForMermaid() {
    if (typeof mermaid === 'undefined') {
      setTimeout(waitForMermaid, 100);
      return;
    }

    installMermaidFix();

    // Also run immediately in case DOM is already ready
    fixMermaidClasses();

    // And re-init mermaid if it exists
    if (typeof mermaid.init === 'function') {
      mermaid.init(document.querySelectorAll('.mermaid'));
    }
  }

  // Register for Fluid's refresh callback AFTER mermaid loads
  if (typeof Fluid !== 'undefined' && Fluid.events) {
    var originalRegister = Fluid.events.registerRefreshCallback;
    Fluid.events.registerRefreshCallback = function(callback) {
      // Fix classes before any callback
      fixMermaidClasses();
      // Install our fix
      installMermaidFix();
      // Call original register
      originalRegister.call(Fluid.events, callback);
    };
  }

  // Start waiting for mermaid
  waitForMermaid();
})();
