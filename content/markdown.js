/**
 * Kairos Markdown Module
 * A lightweight, zero-dependency Markdown parser for the extension.
 */

(function () {
  'use strict';

  class SimpleMarkdown {
    /**
     * Parses Markdown text into HTML
     * @param {string} text - Markdown text
     * @returns {string} HTML string
     */
    static parse(text) {
      if (!text) return '';

      // Escape HTML first to prevent XSS
      let html = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

      // 1. Headers (### H3, ## H2, # H1)
      html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>');
      html = html.replace(/^## (.*$)/gim, '<h2>$1</h2>');
      html = html.replace(/^# (.*$)/gim, '<h1>$1</h1>');

      // 2. Bold (**text**)
      html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

      // 3. Italic (*text*)
      html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');

      // 4. Code Blocks (`code`)
      html = html.replace(/`(.*?)`/g, '<code>$1</code>');

      // 5. Unordered Lists (- item)
      // This is a simple implementation: replaces "- item" with <li>item</li>
      // and wraps consecutive lis in <ul> is tricky with simple regex.
      // We'll just style the list items specifically or do a block replace.
      
      // Strategy: Split by newlines, process lines
      const lines = html.split('\n');
      let inList = false;
      let processedLines = [];

      lines.forEach(line => {
        // List Item
        if (line.trim().startsWith('- ')) {
          if (!inList) {
            processedLines.push('<ul>');
            inList = true;
          }
          processedLines.push(`<li>${line.trim().substring(2)}</li>`);
        } 
        // Empty line or other content
        else {
          if (inList) {
            processedLines.push('</ul>');
            inList = false;
          }
          // Paragraphs: if line has content and isn't a header
          if (line.trim().length > 0 && !line.match(/^<h[1-6]>/)) {
            processedLines.push(`<p>${line}</p>`);
          } else {
            processedLines.push(line);
          }
        }
      });

      if (inList) processedLines.push('</ul>');

      html = processedLines.join('');

      // 6. Line breaks (convert remaining newlines to <br> if not in block tags)
      // Our paragraph logic handles most, but let's be safe for simple breaks
      // html = html.replace(/\n/g, '<br>');

      return html;
    }
  }

  // Export
  window.Kairos = window.Kairos || {};
  window.Kairos.SimpleMarkdown = SimpleMarkdown;

})();
