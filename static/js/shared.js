'use strict';

// This hook is called **before** the text of a line is processed by the Changeset library.
const collectContentPre = (hook, context) => {
  // Check for the hyperlink class, e.g., "hyperlink-http%3A%2F%2Fexample.com"
  const hyperlinkClass = /(?:^| )hyperlink-([^ ]+)/.exec(context.cls);
  if (hyperlinkClass && hyperlinkClass[1]) {
    try {
      // Decode the URL from the class name
      const decodedUrl = decodeURIComponent(hyperlinkClass[1]);
      // Re-apply the 'hyperlink' attribute with its URL value
      // Etherpad uses 'key::value' format for attributes with values in doAttrib
      context.cc.doAttrib(context.state, `hyperlink::${decodedUrl}`);
    } catch (e) {
      console.error('[ep_hyperlinked_text] Error decoding/applying hyperlink attribute:', e);
    }
  }
};

// This hook is called **after** the text of a line is processed.
const collectContentPost = (hook, context) => {};

exports.collectContentPre = collectContentPre;
exports.collectContentPost = collectContentPost;
