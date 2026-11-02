'use strict';
// Product binding only. The running application owns voice, face and body tools.
const path=require('node:path'),root=path.resolve(__dirname,'..'),product=require('../product.json');
process.env.GAR_HARDWARE_DIR ||= path.join(root,product.hardware.physical);
process.env.GAR_TOOLS_ROOT ||= path.join(root,product.components.tools);
process.env.GAR_BIN_DIR ||= path.join(root,product.build.directory);
require('../sources/gar-my-friend/tools/live.cjs').main().catch(error=>{console.error(error.message);process.exitCode=1;});
