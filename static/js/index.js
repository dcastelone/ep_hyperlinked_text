'use strict';

const DEBUG = true; // Set to true to enable console logging


// Bind the event handler to the toolbar button
const postAceInit = (hook, context) => {
  const DEBUG_PASTE = DEBUG; // Use existing DEBUG flag
  if (DEBUG_PASTE) console.log('[ep_hyperlinked_text] postAceInit for paste handler setup.');

  context.ace.callWithAce((ace) => {
    const $innerIframe = $('iframe[name="ace_outer"]').contents().find('iframe[name="ace_inner"]');
    if ($innerIframe.length === 0) {
      console.error('[ep_hyperlinked_text] Could not find inner iframe (ace_inner) for paste handler.');
      return;
    }
    const $inner = $($innerIframe.contents().find('body'));
    if ($inner.length === 0) {
      console.error('[ep_hyperlinked_text] Could not get body from inner iframe for paste handler.');
      return;
    }

    $inner.on('paste', (evt) => {
      if (DEBUG_PASTE) console.log('[ep_hyperlinked_text] Paste event triggered.');
      const clipboardData = evt.originalEvent.clipboardData;
      if (!clipboardData) {
        if (DEBUG_PASTE) console.log('[ep_hyperlinked_text] No clipboard data found.');
        return;
      }

      const types = clipboardData.types;
      let htmlContent = null;
      if (types && types.includes('text/html')) {
        htmlContent = clipboardData.getData('text/html');
      }

      if (htmlContent) {
        if (DEBUG_PASTE) console.log('[ep_hyperlinked_text] HTML content found in clipboard.');
        evt.preventDefault();
        handleHtmlPaste(htmlContent, context, ace); // Pass ace editor instance
      } else {
        if (DEBUG_PASTE) console.log('[ep_hyperlinked_text] No HTML content in clipboard, allowing default paste.');
        // Allow default paste for plain text or other types
      }
    });
    if (DEBUG_PASTE) console.log('[ep_hyperlinked_text] Paste handler attached to inner editor body.');
  }, 'setupPasteHandlerForHyperlink', true);
};

// New function to handle HTML paste logic
const handleHtmlPaste = function(html, outerContext, aceEditor) {
  const DEBUG_PASTE = DEBUG;
  if (DEBUG_PASTE) console.log('[ep_hyperlinked_text] handleHtmlPaste received HTML:', html.substring(0, 200));

  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = html;

  const segments = [];

  function extractSegmentsRecursive(node, inheritedUrl) {
    if (node.nodeType === Node.TEXT_NODE) {
      segments.push({text: node.textContent, url: inheritedUrl});
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      let currentUrl = inheritedUrl;
      if (node.nodeName === 'A' && node.getAttribute('href')) {
        const href = node.getAttribute('href');
        if (href && href.trim() !== '' && !href.trim().toLowerCase().startsWith('javascript:')) {
          if (!/^(https?:\/\/|mailto:|ftp:|file:|#|\/)/i.test(href)) {
            currentUrl = `http://${href}`;
          } else {
            currentUrl = href;
          }
        } else {
          currentUrl = null;
        }
      }

      if (node.childNodes.length > 0) {
        for (let i = 0; i < node.childNodes.length; i++) {
          extractSegmentsRecursive(node.childNodes[i], currentUrl);
        }
      } else if (node.textContent && node.textContent.length > 0 && node.nodeName !== 'A') {
        segments.push({text: node.textContent, url: currentUrl});
      }
    }
  }

  for (let i = 0; i < tempDiv.childNodes.length; i++) {
    extractSegmentsRecursive(tempDiv.childNodes[i], null);
  }

  if (DEBUG_PASTE) console.log('[ep_hyperlinked_text] Extracted Segments:', JSON.stringify(segments));

  if (segments.length === 0 && tempDiv.textContent.length > 0) {
      if (DEBUG_PASTE) console.log('[ep_hyperlinked_text] No segments, but HTML has text. Inserting plain text of HTML.');
      segments.push({text: tempDiv.textContent, url: null});
  }

  if (segments.length === 0) {
    if (DEBUG_PASTE) console.log('[ep_hyperlinked_text] No segments extracted, doing nothing further.');
    return;
  }

  // The actual document modification logic, to be wrapped in ace_callWithAce
  const performPasteInAceContext = (ace) => {
    const rep = ace.ace_getRep();
    let selStart = rep.selStart;
    let selEnd = rep.selEnd;
    // const docMan = outerContext.documentAttributeManager; // No longer needed

    if (DEBUG_PASTE) console.log(`[ep_hyperlinked_text ACE_CONTEXT] Initial selection: START L${selStart[0]}C${selStart[1]}, END L${selEnd[0]}C${selEnd[1]}`);

    if (selStart[0] !== selEnd[0] || selStart[1] !== selEnd[1]) {
      if (DEBUG_PASTE) console.log('[ep_hyperlinked_text ACE_CONTEXT] Clearing existing selection.');
      ace.ace_performDocumentReplaceRange(selStart, selEnd, '');
      selEnd = selStart;
      if (DEBUG_PASTE) console.log(`[ep_hyperlinked_text ACE_CONTEXT] Selection after clearing: START L${selStart[0]}C${selStart[1]}, END L${selEnd[0]}C${selEnd[1]}`);
    }

    let currentLine = selStart[0];
    let currentCol = selStart[1];

    // Detect if the insertion target line is part of an ep_tables5 table
    const docMan = outerContext.documentAttributeManager;
    let isTableLine = docMan && !!docMan.getAttributeOnLine(currentLine, 'tbljson');
    if (!isTableLine) {
      // Fallback: inspect DOM for a dataTable element on the same line
      try {
        const lineEntry = rep.lines.atIndex(currentLine);
        if (lineEntry && lineEntry.lineNode && lineEntry.lineNode.querySelector('table.dataTable[data-tblId]')) {
          isTableLine = true;
        }
      } catch {}
    }

    if (DEBUG_PASTE) console.log(`[ep_hyperlinked_text ACE_CONTEXT] Starting insertion at L${currentLine}C${currentCol}`);

    for (let segIdx = 0; segIdx < segments.length; segIdx++) {
      const segment = segments[segIdx];
      if (DEBUG_PASTE) console.log(`[ep_hyperlinked_text ACE_CONTEXT] Processing Segment ${segIdx}:`, JSON.stringify(segment));
      
      let textToInsert = segment.text;
      if (isTableLine) textToInsert = textToInsert.replace(/\n+/g, ' ');

      // Insert a conditional leading space if needed between segments
      if (segIdx > 0) {
        const previousSegment = segments[segIdx - 1];
        if (previousSegment.text.length > 0 &&  // Previous segment had text
            textToInsert.length > 0 &&          // Current segment has text
            !/\s$/.test(previousSegment.text) && // Previous segment does not end with whitespace
            !/^\s/.test(textToInsert)) {         // Current segment does not start with whitespace
          
          if (DEBUG_PASTE) console.log(`[ep_hyperlinked_text ACE_CONTEXT] Segment ${segIdx}: Inserting conditional leading space.`);
          const spaceInsertPos = [currentLine, currentCol];
          ace.ace_performDocumentReplaceRange(spaceInsertPos, spaceInsertPos, ' ');
          // Update cursor position after inserting the space
          const repAfterSpace = ace.ace_getRep();
          currentLine = repAfterSpace.selEnd[0];
          currentCol = repAfterSpace.selEnd[1];
          if (DEBUG_PASTE) console.log(`[ep_hyperlinked_text ACE_CONTEXT] Segment ${segIdx}: Cursor after conditional space L${currentLine}C${currentCol}`);
        }
      }

      // Insert the actual text of the segment (if it has any)
      if (textToInsert.length > 0) {
        const actualTextStartLine = currentLine;
        const actualTextStartCol = currentCol;
        
        if (DEBUG_PASTE) console.log(`[ep_hyperlinked_text ACE_CONTEXT] Segment ${segIdx}: Before inserting "${textToInsert.replace(/\n/g, "<NL>")}" at L${actualTextStartLine}C${actualTextStartCol}`);
        ace.ace_performDocumentReplaceRange([actualTextStartLine, actualTextStartCol], [actualTextStartLine, actualTextStartCol], textToInsert);
        if (DEBUG_PASTE) console.log(`[ep_hyperlinked_text ACE_CONTEXT] Segment ${segIdx}: After inserting text.`);

        // Update cursor position to be after the inserted text
        const repAfterText = ace.ace_getRep();
        const textEndLine = repAfterText.selEnd[0];
        const textEndCol = repAfterText.selEnd[1];

        // Apply attributes if there's a URL
        if (segment.url) {
          if (DEBUG_PASTE) console.log(`[ep_hyperlinked_text ACE_CONTEXT] Segment ${segIdx}: Applying link ${segment.url} to text "${textToInsert.replace(/\n/g, "<NL>")}"`);
          
          let applyLine = actualTextStartLine;
          let applyCol = actualTextStartCol;
          const linesOfSegment = textToInsert.split('\n');

          for (let i = 0; i < linesOfSegment.length; i++) {
            const linePart = linesOfSegment[i];
            if (DEBUG_PASTE) console.log(`[ep_hyperlinked_text ACE_CONTEXT] Segment ${segIdx}, LinePart ${i}: Text "${linePart}" for attribute`);
            if (linePart.length > 0) {
              const attrRangeStart = [applyLine, applyCol];
              const attrRangeEnd = [applyLine, applyCol + linePart.length];
              if (DEBUG_PASTE) console.log(`  [ep_hyperlinked_text ACE_CONTEXT] Segment ${segIdx}, LinePart ${i}: Before applying hyperlink '${segment.url}' to range [L${attrRangeStart[0]}C${attrRangeStart[1]}] - [L${attrRangeEnd[0]}C${attrRangeEnd[1]}] using ace.ace_performDocumentApplyAttributesToRange`);
              try {
                ace.ace_performDocumentApplyAttributesToRange(attrRangeStart, attrRangeEnd, [['hyperlink', segment.url]]);
                if (DEBUG_PASTE) console.log(`  [ep_hyperlinked_text ACE_CONTEXT] Segment ${segIdx}, LinePart ${i}: After applying hyperlink.`);
              } catch (e) {
                if (DEBUG_PASTE) console.error(`  [ep_hyperlinked_text ACE_CONTEXT] Segment ${segIdx}, LinePart ${i}: ERROR applying hyperlink:`, e);
                if (DEBUG_PASTE) console.error(`  [ep_hyperlinked_text ACE_CONTEXT] Error details - Method: ace.ace_performDocumentApplyAttributesToRange, URL: ${segment.url}, RangeStart: L${applyRangeStart[0]}C${applyRangeStart[1]}, RangeEnd: L${applyRangeEnd[0]}C${applyRangeEnd[1]}`);
              }
            }
            if (i < linesOfSegment.length - 1) { // If there's another line in this segment
              applyLine++;
              applyCol = 0; // Next line part starts at column 0
              if (DEBUG_PASTE) console.log(`  [ep_hyperlinked_text ACE_CONTEXT] Segment ${segIdx}, LinePart ${i}: Newline in segment, next attr part starts L${applyLine}C${applyCol}`);
            }
          }
        }
        currentLine = textEndLine;
        currentCol = textEndCol;
      } else {
        if (DEBUG_PASTE) console.log(`[ep_hyperlinked_text ACE_CONTEXT] Segment ${segIdx} has no text to insert, skipping text insertion.`);
      }
      if (DEBUG_PASTE) console.log(`[ep_hyperlinked_text ACE_CONTEXT] Segment ${segIdx}: Cursor after segment processing L${currentLine}C${currentCol}`);
    }

    if (DEBUG_PASTE) console.log(`[ep_hyperlinked_text ACE_CONTEXT] Finished processing all segments. Final cursor L${currentLine}C${currentCol}`);
    ace.ace_performSelectionChange([currentLine, currentCol], [currentLine, currentCol], false);
    ace.ace_focus();
    if (DEBUG_PASTE) console.log('[ep_hyperlinked_text ACE_CONTEXT] performPasteInAceContext finished.');
  };

  // Call the paste logic within the Ace call stack
  if (DEBUG_PASTE) console.log('[ep_hyperlinked_text] Calling performPasteInAceContext via ace_callWithAce.');
  aceEditor.ace_callWithAce(performPasteInAceContext, 'handleHyperlinkPaste', true);
  if (DEBUG_PASTE) console.log('[ep_hyperlinked_text] Returned from ace_callWithAce for performPasteInAceContext.');

};

// Add specific class for hyperlink attribute
const aceAttribsToClasses = (hook, context) => {
  if (context.key === 'hyperlink' && context.value) {
    const encodedUrl = encodeURIComponent(context.value);
    return ['hyperlink', `hyperlink-${encodedUrl}`];
  }
};

// Convert the class hyperlink-url into an <a> tag
exports.aceCreateDomLine = (name, context) => {
  const cls = context.cls;
  const classMentionsLink = /(?:^| )hyperlink-([^ ]+)/.exec(cls);

  if (classMentionsLink) {
    let url = '#';
    try {
      url = decodeURIComponent(classMentionsLink[1]);
    } catch (e) {
      console.error('Error decoding URL from class:', classMentionsLink[1], e);
    }
    const modifier = {
      extraOpenTags: `<a href="${url}" title="${url}" target="_blank" rel="noopener noreferrer">`,
      extraCloseTags: '</a>',
      cls,
    };
    return [modifier];
  }
  return [];
};

// Find out which lines are selected and assign them the hyperlink attribute.
// Accepts url, selStart, selEnd, and the captured rep object.
// Uses this context for editorInfo/docMan.
const doInsertLink = function (url, selStart, selEnd, rep) {
  const editorInfo = this.editorInfo;
  const docMan = this.documentAttributeManager; // Use docMan from the context

  if (!docMan || !editorInfo || !selStart || !selEnd) {
    console.error('[[ep_hyperlinked_text]] Missing docMan, editorInfo (from this), or selection range passed to doInsertLink');
    alert('Could not apply link: Invalid editor state.');
    return;
  }
  if (!rep || !rep.lines) {
    console.error('[[ep_hyperlinked_text]] Missing rep object needed for multi-line check.');
    alert('Could not apply link: Missing editor representation data.');
    return;
  }

  // --- Adjust for multi-line selection --- 
  if (selStart[0] !== selEnd[0]) {
    if (DEBUG) console.warn('[[ep_hyperlinked_text]] Multi-line selection detected. Linking only the first line.');
    try {
        const line = rep.lines.atIndex(selStart[0]);
        if (!line || typeof line.text !== 'string') {
             throw new Error('Line data not found in rep object.');
        }
        const lineLength = line.text.length;
        selEnd = [selStart[0], lineLength]; 
        if (DEBUG) console.log('[[ep_hyperlinked_text]] Adjusted selEnd for first line using rep:', selEnd);
        if (selStart[1] > selEnd[1]) {
             selStart[1] = selEnd[1];
             if (DEBUG) console.log('[[ep_hyperlinked_text]] Adjusted selStart to match end of short line:', selStart);
        }
    } catch (e) {
        console.error('[[ep_hyperlinked_text]] Error getting line length from rep to adjust multi-line selection:', e);
        alert('Could not adjust multi-line selection using rep data. Aborting link operation.');
        return;
    }
  }
  // --- End adjustment --- 

  if (!url) {
    if (DEBUG) console.log('[[ep_hyperlinked_text]] Removing hyperlink attribute from range:', selStart, selEnd, 'by setting to empty string.');
    docMan.setAttributesOnRange(selStart, selEnd, [['hyperlink', '']]); // Set to empty string to remove/disable
    if (DEBUG) console.log('[[ep_hyperlinked_text]] Called docMan.setAttributesOnRange(selStart, selEnd, [["hyperlink", ""]])');
  } else {
    // --- ZWSP Strategy at Both Ends --- 
    const ZWSP = '\u200B'; // Zero-Width Space

    if (DEBUG) console.log('[[ep_hyperlinked_text]] Inserting ZWSP at start point:', selStart);
    editorInfo.ace_replaceRange(selStart, selStart, ZWSP);

    const adjustedSelEnd = [selEnd[0], selEnd[1] + 1];
    if (DEBUG) console.log('[[ep_hyperlinked_text]] Adjusted end point for second ZWSP:', adjustedSelEnd);

    editorInfo.ace_replaceRange(adjustedSelEnd, adjustedSelEnd, ZWSP);

    const linkStart = [selStart[0], selStart[1] + 1]; 
    const linkEnd = adjustedSelEnd; 
    if (DEBUG) console.log('[[ep_hyperlinked_text]] Applying hyperlink attribute to range:', linkStart, linkEnd, 'with URL:', url);
    
    docMan.setAttributesOnRange(linkStart, linkEnd, [['hyperlink', url]]);
    if (DEBUG) console.log('[[ep_hyperlinked_text]] Called docMan.setAttributesOnRange(linkStart, linkEnd, [["hyperlink", url]])');

    // Set cursor after the final ZWSP.
    const finalCursorPos = [linkEnd[0], linkEnd[1] + 1];
    // We need to use ace_callWithAce to reliably set selection if this function is called from a non-ace context in the future,
    // but for now, ace_doInsertLink is called from within an ace_callWithAce context.
    // Directly using editorInfo.ace_setSelectionRange might be okay here if the call chain ensures it.
    // However, the most robust way for editorInfo to manipulate selection is often via ace_callWithAce if there's any doubt.
    // For now, let's leave it out to minimize changes from originally working ZWSP addition logic.
    // editorInfo.ace_setSelectionRange(finalCursorPos, finalCursorPos);
  }
};

// Once ace is initialized, bind doInsertLink to the context
const aceInitialized = (hook, context) => {
  const editorInfo = context.editorInfo;
  editorInfo.ace_doInsertLink = doInsertLink.bind(context);
};

// Handle toolbar interaction using the non-blocking input
const postToolbarInit = (hook, context) => {
  if (DEBUG) console.log('[[ep_hyperlinked_text]] postToolbarInit hook running.');
  const editbar = context.toolbar;
  const hyperlinkInputContainer = $('#hyperlink-input-container');
  const hyperlinkInputField = $('#hyperlink-input-field');
  const hyperlinkOkButton = $('#hyperlink-input-ok');
  const hyperlinkCancelButton = $('#hyperlink-input-cancel');
  const hyperlinkRemoveButton = $('#hyperlink-input-remove'); // New button

  // Store selection info AND rep object here
  let storedSelStart = null;
  let storedSelEnd = null;
  let storedRep = null; // Added to store the rep object

  editbar.registerCommand('hyperlink', (buttonName, toolbar, item) => {
    if (DEBUG) console.log('[[ep_hyperlinked_text]] Hyperlink button clicked!');

    // Use setTimeout to slightly delay state capture
    setTimeout(() => {
        if (DEBUG) console.log('[[ep_hyperlinked_text]] Attempting selection capture inside setTimeout.');
        // Reset stored selection and rep
        storedSelStart = null;
        storedSelEnd = null;
        storedRep = null; // Reset storedRep
        let hadValidSelection = false;

        // 1. Get selection range AND rep object using callWithAce
        context.ace.callWithAce((ace) => {
          const rep = ace.ace_getRep();
          if (DEBUG) console.log('[[ep_hyperlinked_text]] Inside callWithAce: rep?', !!rep, 'selStart?', !!(rep && rep.selStart), 'selEnd?', !!(rep && rep.selEnd));
          // Check rep, selStart, selEnd validity
          if (rep && rep.selStart && rep.selEnd) {
            // Check non-collapsed
            if (!(rep.selStart[0] === rep.selEnd[0] && rep.selStart[1] === rep.selEnd[1])) {
              storedSelStart = rep.selStart;
              storedSelEnd = rep.selEnd;
              storedRep = rep; // Store the rep object
              hadValidSelection = true;
              if (DEBUG) console.log('[[ep_hyperlinked_text]] Stored selection and rep:', storedSelStart, storedSelEnd, storedRep);
            } else {
              if (DEBUG) console.warn('[[ep_hyperlinked_text]] Selection is collapsed.');
            }
          } else {
            console.error('[[ep_hyperlinked_text]] Could not get valid rep or selection range.');
          }
        }, 'getSelectionAndRepDelayed', true);

        // 2. If no valid selection, alert and do nothing else
        if (!hadValidSelection) {
          alert('Please select text before creating a link.');
          hyperlinkInputContainer.hide(); // Ensure input is hidden
          return;
        }

        // 3. Show and position the input container - CENTERED
        hyperlinkInputField.val(''); // Clear input field
        // const buttonElement = $(item.$el); // No longer needed for positioning
        // const pos = buttonElement.offset(); // No longer needed
        
        // Apply CSS for fixed centering
        hyperlinkInputContainer.css({
          position: 'fixed', // Use fixed positioning
          top: '50%',        // Center vertically
          left: '50%',       // Center horizontally
          transform: 'translate(-50%, -50%)', // Adjust for element size
          // Optional: Add some better styling
          padding: '15px',
          'border-radius': '5px',
          'box-shadow': '0 4px 8px rgba(0,0,0,0.2)'
          // Ensure background and border from template are still applied or redefined here if needed
          // background-color: '#f0f0f0', 
          // border: '1px solid #ccc', 
          // z-index: 1000 // Ensure it's on top
        }).show();
        hyperlinkInputField.focus(); // Focus the input field

    }, 10); // Delay execution slightly (10ms)

  }); // End of registerCommand handler

  // Add keypress listener for Enter key on the input field
  hyperlinkInputField.on('keypress', (e) => {
    // Check if the key pressed is Enter (key code 13)
    if (e.which === 13) {
      e.preventDefault(); // Prevent default Enter behavior (like form submission)
      if (DEBUG) console.log('[[ep_hyperlinked_text]] Enter key pressed in input field.');
      hyperlinkOkButton.click(); // Trigger the OK button's click handler
    }
  });

  // 4. Handle OK button click
  hyperlinkOkButton.on('click', () => {
    if (DEBUG) console.log('[[ep_hyperlinked_text]] OK button clicked.');
    let url = hyperlinkInputField.val();
    hyperlinkInputContainer.hide();

    // Check if we have stored selection AND rep
    if (!storedSelStart || !storedSelEnd || !storedRep) {
      console.error('[[ep_hyperlinked_text]] Cannot apply link: Stored selection or rep is missing.');
      alert('An error occurred: Could not retrieve editor context information.');
      // Clear potentially partially stored info
      storedSelStart = null;
      storedSelEnd = null;
      storedRep = null;
      return;
    }

    // Normalize URL
    if (url === '') {
      if (DEBUG) console.log('[[ep_hyperlinked_text]] Empty URL entered, treating as removal.');
      url = null;
    } else if (url) { // Non-empty, non-null string
      url = `https://${url.replace(/^(https?:\/\/)?/, '')}`;
      if (DEBUG) console.log('[[ep_hyperlinked_text]] Normalized URL:', url);
    }

    // Apply the change using callWithAce
    context.ace.callWithAce((ace) => {
        if (DEBUG) console.log(`[[ep_hyperlinked_text]] Calling bound ace.ace_doInsertLink with URL: ${url}, stored selection, and stored rep`);
        // Pass storedRep as the last argument
        ace.ace_doInsertLink(url, storedSelStart, storedSelEnd, storedRep);

    }, 'applyStoredLinkChangeViaBoundFnWithRep', true);

    // Clear stored info after use
    storedSelStart = null;
    storedSelEnd = null;
    storedRep = null; // Clear storedRep
  });

  // 5. Handle Cancel button click
  hyperlinkCancelButton.on('click', () => {
     if (DEBUG) console.log('[[ep_hyperlinked_text]] Cancel button clicked.');
     hyperlinkInputContainer.hide();
     // Clear stored info
     storedSelStart = null;
     storedSelEnd = null;
     storedRep = null; // Clear storedRep
  });

  // 6. Handle Remove Link button click (New Handler)
  hyperlinkRemoveButton.on('click', () => {
    if (DEBUG) console.log('[[ep_hyperlinked_text]] Remove Link button clicked.');
    hyperlinkInputContainer.hide();

    // Check if we have stored selection AND rep (similar to OK button)
    if (!storedSelStart || !storedSelEnd || !storedRep) {
      console.error('[[ep_hyperlinked_text]] Cannot remove link: Stored selection or rep is missing.');
      // No alert needed here, as user might not have intended to remove if no selection was active
      // Clear potentially partially stored info
      storedSelStart = null;
      storedSelEnd = null;
      storedRep = null;
      return;
    }

    // Call doInsertLink with null URL to remove the attribute
    context.ace.callWithAce((ace) => {
        if (DEBUG) console.log('[[ep_hyperlinked_text]] Calling bound ace.ace_doInsertLink with NULL URL to remove link.');
        ace.ace_doInsertLink(null, storedSelStart, storedSelEnd, storedRep);
    }, 'removeStoredLinkViaBoundFnWithRep', true);

    // Clear stored info after use
    storedSelStart = null;
    storedSelEnd = null;
    storedRep = null;
  });

}; // End of postToolbarInit

// Removed aceEditEvent for color selection handling

// Export necessary hooks
exports.postToolbarInit = postToolbarInit;
exports.aceInitialized = aceInitialized;
exports.postAceInit = postAceInit;
exports.aceAttribsToClasses = aceAttribsToClasses;
exports.aceCreateDomLine = exports.aceCreateDomLine;
exports.aceEditorCSS = () => ['ep_hyperlinked_text/static/css/hyperlink.css'];
