'use strict';

const eejs = require('ep_etherpad-lite/node/eejs/');
// Settings are not needed here anymore
// const settings = require('ep_etherpad-lite/node/utils/Settings');

// Use eejsBlock_editbarMenuLeft to insert the button HTML and the input div
exports.eejsBlock_editbarMenuLeft = (hookName, args, cb) => {
  // Add a separator if needed (optional, follows image upload pattern)
  args.content += '<li class="separator acl-write"></li>'; 
  // Require and add the button template content
  args.content += eejs.require('ep_hyperlinked_text/templates/hyperlinkButton.ejs');
  // Add the hidden input div structure
  args.content += eejs.require('ep_hyperlinked_text/templates/hyperlinkInput.ejs'); 
  return cb();
};

// Remove the padInitToolbar hook entirely
/*
exports.padInitToolbar = (hook, args, cb) => {
  console.log('[[ep_hyperlinked_text]] Initializing hyperlink toolbar button...');
  const toolbar = args.toolbar;
  const hyperlinkButton = toolbar.button({
    command: 'hyperlink',
    localizationId: 'ep_hyperlinked_text.hyperlink',
    class: 'buttonicon hyperlink-icon' 
  });

  toolbar.registerButton('hyperlink', hyperlinkButton);
  return cb();
};
*/
