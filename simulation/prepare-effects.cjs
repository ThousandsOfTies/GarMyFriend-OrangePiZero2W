'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {readCsv}=require('../sources/gar-my-friend/application/hardware.cjs');
function prepare(root){
  if(process.platform!=='linux'||process.arch!=='x64'||!fs.statSync('/dev/i2c-10').isCharacterDevice())throw new Error('Requires the dedicated virtual I2C simulator');
  const product=require(path.join(root,'product.json')),directory=path.join(root,'.gar/body-sim');
  const rows=readCsv(path.join(root,product.hardware.simulation,'i2c.csv'));
  if(rows.length!==1||rows[0].dev!=='/dev/i2c-10')throw new Error('Unexpected simulator I2C');
  fs.mkdirSync(directory,{recursive:true,mode:0o700});
  for(const name of ['servo-calibration.csv','body-motions.csv'])fs.copyFileSync(path.join(root,product.hardware.physical,name),path.join(directory,name));
  fs.copyFileSync(path.join(root,product.hardware.simulation,'i2c.csv'),path.join(directory,'i2c.csv'));
  fs.writeFileSync(path.join(directory,'effects.csv'),`kind,enabled,hold_ms,stop_file\nservo,1,250,${path.join(directory,'servo.stop')}\n`);
}
if(require.main===module)prepare(path.resolve(__dirname,'..'));
module.exports={prepare};
