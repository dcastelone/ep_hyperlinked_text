'use strict';

const DEBUG = false; // Set to true to enable console logging

// All our colors are block elements, so we just return them.
const colors = ['black', 'red', 'green', 'blue', 'yellow', 'orange'];

// Bind the event handler to the toolbar button
const postAceInit = (hook, context) => {
  // Can potentially add handlers for the input container here if needed,
  // but postToolbarInit seems more appropriate for the main logic.
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
  // Get the manager and editorInfo directly from the bound context (`this`)
  const docMan = this.documentAttributeManager;
  const editorInfo = this.editorInfo;

  // Basic check for necessary components from `this` context
  if (!docMan || !editorInfo || !selStart || !selEnd) {
    console.error('[[ep_hyperlinked_text]] Missing docMan, editorInfo (from this), or selection range passed to doInsertLink');
    alert('Could not apply link: Invalid editor state.');
    return;
  }
  // Also check if the passed rep object is valid for multi-line check
  if (!rep || !rep.lines) {
    console.error('[[ep_hyperlinked_text]] Missing rep object needed for multi-line check.');
    // Decide if we should abort or just skip multi-line check
    // Aborting seems safer if multi-line handling is needed.
    alert('Could not apply link: Missing editor representation data.');
    return;
  }

  // --- Adjust for multi-line selection --- 
  if (selStart[0] !== selEnd[0]) {
    if (DEBUG) console.warn('[[ep_hyperlinked_text]] Multi-line selection detected. Linking only the first line.');
    try {
        // Get line length from the passed rep object
        const line = rep.lines.atIndex(selStart[0]);
        if (!line || typeof line.text !== 'string') {
             throw new Error('Line data not found in rep object.');
        }
        const lineLength = line.text.length;
        // Adjust selEnd to the end of the first line
        selEnd = [selStart[0], lineLength]; 
        if (DEBUG) console.log('[[ep_hyperlinked_text]] Adjusted selEnd for first line using rep:', selEnd);
        // Ensure selStart does not go beyond the adjusted selEnd if selection was minimal
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

  // If no URL provided (normalized to null), remove attribute
  if (!url) {
    if (DEBUG) console.log('[[ep_hyperlinked_text]] Removing hyperlink attribute from range:', selStart, selEnd);
    docMan.removeAttributeOnRange(selStart, selEnd, 'hyperlink');
  } else {
    // --- ZWSP Strategy at Both Ends --- 
    const ZWSP = '\u200B'; // Zero-Width Space

    // 1. Insert ZWSP at the START of the selection
    if (DEBUG) console.log('[[ep_hyperlinked_text]] Inserting ZWSP at start point:', selStart);
    editorInfo.ace_replaceRange(selStart, selStart, ZWSP);

    // 2. Calculate adjusted end position (original end + 1 for the first ZWSP)
    const adjustedSelEnd = [selEnd[0], selEnd[1] + 1];
    if (DEBUG) console.log('[[ep_hyperlinked_text]] Adjusted end point for second ZWSP:', adjustedSelEnd);

    // 3. Insert ZWSP at the ADJUSTED end point
    editorInfo.ace_replaceRange(adjustedSelEnd, adjustedSelEnd, ZWSP);

    // 4. Calculate the actual range for the link attribute (between the ZWSPs)
    const linkStart = [selStart[0], selStart[1] + 1]; // Position after first ZWSP
    const linkEnd = adjustedSelEnd; // Position before second ZWSP
    if (DEBUG) console.log('[[ep_hyperlinked_text]] Applying hyperlink attribute to range:', linkStart, linkEnd, 'with URL:', url);
    
    // 5. Apply the hyperlink attribute to the text between the ZWSPs
    docMan.setAttributesOnRange(linkStart, linkEnd, [['hyperlink', url]]);

    // No need to explicitly set cursor, browser behavior should be sufficient.

    // REMOVED previous single ZWSP insertion code:
    // console.log('[[ep_hyperlinked_text]] Applying hyperlink attribute to range:', selStart, selEnd, 'with URL:', url);
    // docMan.setAttributesOnRange(selStart, selEnd, [['hyperlink', url]]);
    // console.log('[[ep_hyperlinked_text]] Inserting ZWSP at end point:', selEnd);
    // editorInfo.ace_replaceRange(selEnd, selEnd, ZWSP);
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

}; // End of postToolbarInit

// Removed aceEditEvent for color selection handling

// Export necessary hooks
exports.postToolbarInit = postToolbarInit;
exports.aceInitialized = aceInitialized;
exports.postAceInit = postAceInit;
exports.aceAttribsToClasses = aceAttribsToClasses;
exports.aceCreateDomLine = exports.aceCreateDomLine;
exports.aceEditorCSS = () => ['ep_hyperlinked_text/static/css/hyperlink.css'];
