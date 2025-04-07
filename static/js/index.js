'use strict';

// All our colors are block elements, so we just return them.
const colors = ['black', 'red', 'green', 'blue', 'yellow', 'orange'];

// Bind the event handler to the toolbar button
const postAceInit = (hook, context) => {
  // No longer need the color selection change handler
};

// Add specific class for hyperlink attribute, including the encoded URL
const aceAttribsToClasses = (hook, context) => {
  if (context.key === 'hyperlink' && context.value) {
    // Encode the URL to safely include it in a class name
    const encodedUrl = encodeURIComponent(context.value);
    // Return two classes: one general, one with the specific URL
    return ['hyperlink', `hyperlink-${encodedUrl}`];
  }
};

// Here we convert the class hyperlink-url into an <a> tag
exports.aceCreateDomLine = (name, context) => {
  const cls = context.cls;
  const classMentionsLink = /(?:^| )hyperlink-([^ ]+)/.exec(cls);

  if (classMentionsLink) {
    let url = '#'; // Default URL
    try {
      // Decode the URL from the class name
      url = decodeURIComponent(classMentionsLink[1]);
    } catch (e) {
      console.error('Error decoding URL from class:', classMentionsLink[1], e);
    }

    // Add the title attribute to the opening tag
    const modifier = {
      extraOpenTags: `<a href="${url}" title="${url}" target="_blank" rel="noopener noreferrer">`,
      extraCloseTags: '</a>',
      cls, // Keep original classes
    };
    return [modifier];
  }
  return [];
};

// Find out which lines are selected and assign them the hyperlink attribute.
const doInsertLink = function (url) {
  const rep = this.rep;
  const documentAttributeManager = this.documentAttributeManager;
  if (!(rep.selStart && rep.selEnd)) {
    return;
  }

  // If no URL provided or selection is collapsed, remove the attribute
  if (!url || (rep.selStart[0] === rep.selEnd[0] && rep.selStart[1] === rep.selEnd[1])) {
    documentAttributeManager.removeAttributeOnRange(rep.selStart, rep.selEnd, 'hyperlink');
  } else {
    // Apply the hyperlink attribute with the URL as its value
    documentAttributeManager.setAttributesOnRange(rep.selStart, rep.selEnd, [['hyperlink', url]]);
  }
};

// Once ace is initialized, we set ace_doInsertLink and bind it to the context
const aceInitialized = (hook, context) => {
  const editorInfo = context.editorInfo;
  editorInfo.ace_doInsertLink = doInsertLink.bind(context);
};

const postToolbarInit = (hook, context) => {
  console.log('[[ep_hyperlinked_text]] postToolbarInit hook running.');
  const editbar = context.toolbar;

  // Keep only the editbar.registerCommand block
  editbar.registerCommand('hyperlink', (buttonName, toolbar, item) => {
    console.log('[[ep_hyperlinked_text]] Hyperlink button clicked! (via registerCommand)'); 
    const currentLink = context.ace.callWithAce((ace) => {
      const rep = ace.ace_getRep();
      const documentAttributeManager = ace.documentAttributeManager;
      // Add checks for rep and selection before proceeding
      if (rep && rep.selStart && rep.selEnd && documentAttributeManager) { 
        try { // Add try-catch for safety
          const [existingLink] = documentAttributeManager.getAttributeOnRange(rep.selStart, rep.selEnd, 'hyperlink');
          console.log('[[ep_hyperlinked_text]] Existing link:', existingLink);
          // Ensure existingLink is not null/undefined before accessing index 1
          return existingLink ? existingLink[1] : ''; 
        } catch (e) {
          console.error('[[ep_hyperlinked_text]] Error getting attribute on range:', e);
          return '';
        }
      } else {
        // Log which part is missing if rep exists but selection doesn't
        if (rep) {
            console.warn('[[ep_hyperlinked_text]] Selection missing (selStart or selEnd null).');
        } else {
            console.warn('[[ep_hyperlinked_text]] ACE representation (rep) is missing.');
        }
        return '';
      }
    }, 'getLinkState', true) || '';

    console.log('[[ep_hyperlinked_text]] Current link value:', currentLink);
    let url = prompt('Enter link URL:', currentLink);
    console.log('[[ep_hyperlinked_text]] Prompt returned:', url);
    if (url !== null) { 
      // Normalize the URL
      if (url) { // Check if url is not empty string
        // Remove http:// or https:// prefix if present, then prepend https://
        url = `https://${url.replace(/^(https?:\/\/)?/, '')}`;
        console.log('[[ep_hyperlinked_text]] Normalized URL:', url);
      } else {
        // If user entered an empty string, treat it like cancelling (remove link)
        console.log('[[ep_hyperlinked_text]] Empty URL entered, removing link.');
        url = null; // Set url to null to trigger link removal in doInsertLink
      }

      // Only proceed if url is not null after normalization/check
      if (url !== null) { 
        context.ace.callWithAce((ace) => {
          console.log('[[ep_hyperlinked_text]] Calling ace_doInsertLink with:', url);
          ace.ace_doInsertLink(url);
        }, 'insertLink', true);
      }
    }
  });
};

// Removed aceEditEvent for color selection handling

// Export all hooks
exports.postToolbarInit = postToolbarInit;
exports.aceInitialized = aceInitialized;
exports.postAceInit = postAceInit;
exports.aceAttribsToClasses = aceAttribsToClasses;
// Removed aceEditEvent export
exports.aceEditorCSS = () => ['ep_hyperlinked_text/static/css/hyperlink.css']; // Updated CSS file path
