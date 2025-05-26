'use strict';
const eejs = require('ep_etherpad-lite/node/eejs/');
const Changeset = require('ep_etherpad-lite/static/js/Changeset');
const Security = require('ep_etherpad-lite/static/js/security');
const attributesModule = require('ep_etherpad-lite/static/js/attributes');
const { StringIterator } = require('ep_etherpad-lite/static/js/StringIterator');

// Iterate over pad attributes to find only the hyperlink ones and map them to [key, value] pairs.
// This function seems to be for internal use or diagnostics, not directly used by export hooks below.
const findAllHyperlinksUsedOn = (pad) => {
  const hyperlinksUsed = [];
  pad.pool.eachAttrib((key, value) => {
    if (key === 'hyperlink' && value) {
      hyperlinksUsed.push(['hyperlink', value]);
    }
  });
  return hyperlinksUsed;
};

// Add the hyperlink attribute to be supported in export.
// This tells Etherpad that 'hyperlink' is a valid attribute to find in the pool and process.
// If aceCreateDomLine's extraOpenTags are respected during export, this helps ensure the context is right.
exports.exportHtmlAdditionalTagsWithData = async (hookName, { pad, attributePool }) => {
  return ['hyperlink']; // Register 'hyperlink' attribute for export
};

// Include CSS for HTML export.
// The CSS targets the '.hyperlink a' structure created by aceCreateDomLine and styled in hyperlink.css.
exports.stylesForExport = async (hookName, padId) => {
  // Use eejs.require to load the CSS file content, similar to other plugins.
  try {
    return eejs.require('ep_hyperlinked_text/static/css/hyperlink.css', {}, module);
  } catch (e) {
    console.error('[ep_hyperlinked_text] Error loading CSS for export:', e);
    return ''; // Return empty string on error
  }
};

// Helper to find a specific attribute (like 'hyperlink') in a list of decoded attributes OR raw attrib string
const getHyperlinkUrlFromAttribs = (decodedAttribs, apool, rawOpAttribsString) => {
  // First, try the decodedAttribs way (if it ever starts working)
  if (Array.isArray(decodedAttribs)) {
    for (const attr of decodedAttribs) {
      const num = attr[0]; 
      const poolEntry = apool.getAttrib(num);
      if (poolEntry && poolEntry[0] === 'hyperlink' && poolEntry[1]) {
        console.log(`[ep_hyperlinked_text] Found hyperlink via decodedAttribs: ${poolEntry[1]}`);
        return poolEntry[1];
      }
    }
  }

  // Fallback: Try to parse rawOpAttribsString like *0*1
  // This is a more direct check if decodeAttribString is failing us.
  if (rawOpAttribsString) {
    // console.log(`[ep_hyperlinked_text] Attempting to find hyperlink in raw attrib string: "${rawOpAttribsString}"`);
    for (const key in apool.numToAttrib) {
      const attribDetails = apool.numToAttrib[key];
      if (attribDetails[0] === 'hyperlink' && attribDetails[1]) {
        const attribMarker = `*${key}`; // e.g., "*1" if key is '1'
        if (rawOpAttribsString.includes(attribMarker)) {
          console.log(`[ep_hyperlinked_text] Found hyperlink via raw string check for marker "${attribMarker}": ${attribDetails[1]}`);
          return attribDetails[1]; // Return the URL
        }
      }
    }
  }
  return null;
};

exports.getLineHTMLForExport = async (hookName, context) => {
  const {attribLine, text, apool} = context;
  console.log('[ep_hyperlinked_text] getLineHTMLForExport called. Initial context.lineContent:', context.lineContent, 'for text:', text, 'Attribs:', attribLine);
  // Log the attribute pool to ensure it's correctly populated
  console.log('[ep_hyperlinked_text] Attribute Pool (apool) for this line:', JSON.stringify(apool.toJsonable()));


  let hasHyperlinkOnLine = false;
  // Ensure initialOpsForCheck is a true array
  const opsIterable = Changeset.deserializeOps(attribLine, apool);
  const initialOpsForCheck = Array.isArray(opsIterable) ? opsIterable : Array.from(opsIterable || []);


  console.log(`[ep_hyperlinked_text] For text "${text}", number of initialOpsForCheck: ${initialOpsForCheck.length}`);
  initialOpsForCheck.forEach((op, index) => {
    console.log(`[ep_hyperlinked_text]   Op (from forEach) ${index}: chars=${op.chars}, lines=${op.lines}, raw op.attribs=${op.attribs}`);
  });

  for (let i = 0; i < initialOpsForCheck.length; i++) {
    const op = initialOpsForCheck[i];
    console.log(`[ep_hyperlinked_text]   Processing Op (from for-loop) ${i}: chars=${op.chars}, lines=${op.lines}, attribs=${op.attribs}`);
    
    const decodedAttribsFromModule = attributesModule.decodeAttribString(op.attribs, apool);
    console.log(`[ep_hyperlinked_text]     Decoded from attributesModule (with apool): ${JSON.stringify(decodedAttribsFromModule)}, Type: ${typeof decodedAttribsFromModule}, IsArray: ${Array.isArray(decodedAttribsFromModule)}`);

    if (getHyperlinkUrlFromAttribs(decodedAttribsFromModule, apool, op.attribs)) {
      console.log('[ep_hyperlinked_text]       Hyperlink FOUND by getHyperlinkUrlFromAttribs (possibly via raw string check).');
      hasHyperlinkOnLine = true;
      break; 
    } else {
      console.log('[ep_hyperlinked_text]       Hyperlink NOT found by getHyperlinkUrlFromAttribs for this op.');
    }
  }

  if (!hasHyperlinkOnLine) {
    console.log('[ep_hyperlinked_text] Line does not have hyperlink, returning based on loop check. Text:', text);
    return; 
  }
  
  console.log('[ep_hyperlinked_text] HAS HYPERLINK. Attempting to process line. Text:', text, 'Attribs:', attribLine);
  console.log('[ep_hyperlinked_text] Before processing, context.lineContent (will be replaced):', context.lineContent);

  let html = '';
  let currentHyperlinkUrl = null;
  const textIter = new StringIterator(text);
  
  const lineOpsToProcess = Array.from(Changeset.deserializeOps(attribLine, apool) || []); 

  for (const op of lineOpsToProcess) {
    let numCharsToTake = op.chars;
    if (op.lines > 0) {
      // Each 'line' in op.lines accounts for one character (the newline itself)
      // that is part of op.chars but not in the current single-line 'text'.
      // Etherpad's core export processing does `chars--` if op.lines is true for an op,
      // effectively reducing the count by 1 if there's one newline.
      numCharsToTake -= op.lines;
    }

    let opText = '';
    if (numCharsToTake > 0) {
      opText = textIter.take(numCharsToTake);
    } else if (numCharsToTake < 0) {
      // This shouldn't happen with valid ops if op.chars >= op.lines
      console.warn(`[ep_hyperlinked_text] Calculated negative chars to take: ${numCharsToTake} for op: chars=${op.chars}, lines=${op.lines}, attribs=${op.attribs}. Text: "${text}"`);
    }
    // If numCharsToTake is 0 (e.g. for an op representing only a newline), opText remains ''

    const hyperlinkUrlForSegment = getHyperlinkUrlFromAttribs(attributesModule.decodeAttribString(op.attribs, apool), apool, op.attribs);

    if (hyperlinkUrlForSegment) {
      if (currentHyperlinkUrl !== hyperlinkUrlForSegment) {
        if (currentHyperlinkUrl) {
          html += '</a>'; 
        }
        html += `<a href="${Security.escapeHTMLAttribute(hyperlinkUrlForSegment)}" target="_blank" rel="noopener noreferrer">`;
        currentHyperlinkUrl = hyperlinkUrlForSegment;
      }
    } else {
      if (currentHyperlinkUrl) {
        html += '</a>'; 
        currentHyperlinkUrl = null;
      }
    }
    html += Security.escapeHTML(opText);
  }

  if (currentHyperlinkUrl) {
    html += '</a>';
  }

  context.lineContent = html; 
  console.log('[ep_hyperlinked_text] Successfully processed and returning HTML for line:', context.lineContent);
  return true; 
};
