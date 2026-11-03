'use strict';
// Product paths only; mode planning and control belong to the application.
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const product = require('../product.json');
process.env.GAR_HARDWARE_DIR ||= path.join(root, product.hardware.physical);
process.env.GAR_BIN_DIR ||= path.join(root, product.build.directory);
require('../sources/gar-my-friend/tools/body.cjs').main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
