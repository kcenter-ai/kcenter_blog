// Mermaid initialization
(function() {
  var script = document.createElement('script');
  script.src = 'https://cdn.jsdelivr.net/npm/mermaid@9.1.7/dist/mermaid.min.js';
  script.onload = function() {
    mermaid.initialize({
      startOnLoad: true,
      theme: 'default',
      securityLevel: 'loose'
    });
    // Re-render code.mermaid elements after mermaid is loaded
    document.querySelectorAll('code.language-mermaid, code.mermaid').forEach(function(code) {
      var pre = code.parentElement;
      if (pre && pre.tagName === 'PRE' && !pre.classList.contains('mermaid-rendered')) {
        pre.classList.add('mermaid');
        pre.classList.add('mermaid-rendered');
        code.classList.remove('mermaid');
        code.classList.remove('language-mermaid');
      }
    });
  };
  document.head.appendChild(script);
})();