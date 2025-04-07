'use strict';
const eejs = require('ep_etherpad-lite/node/eejs/');

// Iterate over pad attributes to find only the hyperlink ones and map them to [key, value] pairs.
const findAllHyperlinksUsedOn = (pad) => {
  const hyperlinksUsed = [];
  pad.pool.eachAttrib((key, value) => {
    if (key === 'hyperlink' && value) {
      hyperlinksUsed.push(['hyperlink', value]);
    }
  });
  return hyperlinksUsed;
};

// Add the hyperlink attribute and its value ['hyperlink', url] to be supported in export.
// Etherpad core should handle creating spans with these attributes based on the attribs pool.
exports.exportHtmlAdditionalTagsWithData = async (hookName, { pad }) => findAllHyperlinksUsedOn(pad);

// Include CSS for HTML export.
// The CSS targets the `.hyperlink` class added by `aceAttribsToClasses`.
exports.stylesForExport = async (hookName, padId) => eejs
    .require('ep_hyperlinked_text/static/css/hyperlink.css');

// No longer needed: Remove getLineHTMLForExport.
// The core export mechanism combined with `aceAttribsToClasses` adding the `.hyperlink`
// and `hyperlink-ENCODEDURL` classes, and `aceCreateDomLine` adding the `<a>` tag
// in the live editor should be sufficient.
// The `exportHtmlAdditionalTagsWithData` ensures the attribute data is available for export.
// Exports.getLineHTMLForExport = async (hookName, context) => {
//   // ... previous logic removed ...
// };
