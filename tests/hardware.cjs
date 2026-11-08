'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const {loadHardware}=require('../sources/gar-my-friend/application/hardware.cjs');
const root=path.resolve(__dirname,'..');

test('Product binds the same application to VM and verified Orange Pi CSV profiles',()=>{
  const vm=loadHardware(path.join(root,'hardware'));
  const board=loadHardware(path.join(root,'hardware/orangepi-zero2w'));
  assert.deepEqual(vm.display,{spi:'/dev/spidev0.0',chip:'/dev/gpiochip0',dc:16,hz:24000000});
  assert.deepEqual(vm.rotary,{chip:'/dev/gpiochip0',clock:20,data:21,switch:22,bias:'pull-up'});
  assert.deepEqual(board.display,{spi:'/dev/spidev1.0',chip:'/dev/gpiochip1',dc:228,hz:16000000,reset:262});
  assert.equal(board.rotary,null,'The owner currently has no KY-040 connected to the physical board');
});
