'use strict';
// Product binding only; audio operations and diagnostics live in the application/tools.
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const product = require('../product.json');
process.env.GAR_HARDWARE_DIR ||= path.join(root, product.hardware.physical);
process.env.GAR_TOOLS_ROOT ||= path.join(root, product.components.tools);
require('../sources/gar-my-friend/tools/audio.cjs').main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
