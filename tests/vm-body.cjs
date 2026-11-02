'use strict';
const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const url = process.env.GAR_PANEL_URL || JSON.parse(fs.readFileSync('.gar/vm/panel.json')).url;

(async () => {
  const browser = await chromium.launch({channel: process.platform === 'win32' ? 'msedge' : undefined, headless: true});
  try {
    const page = await browser.newPage({viewport: {width: 1100, height: 850}}), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(url, {waitUntil: 'domcontentloaded', timeout: 30000});
    await page.waitForFunction(() => !document.querySelector('[data-mode="forward"]').disabled);
    assert.equal(await page.locator('gar-rotary').count(), 0);
    assert.equal(await page.locator('gar-sg90').count(), 4);
    const state = () => page.evaluate(async () => (await fetch('/api/state')).json());
    const active = value => value.pwm.controller.channels.some(c => !c.fullOff && c.off !== c.on);
    async function move(mode, from) {
      await page.selectOption('#start-pose', from);
      await page.locator(`[data-mode="${mode}"]`).click();
      let sawActive = false, finished = false;
      const pulses = new Set();
      for (let count = 0; count < 120; count++) {
        const value = await state();
        assert.equal(value.body.error, null);
        if (active(value)) {
          sawActive = true;
          for (const channel of value.pwm.controller.channels.filter(c => !c.fullOff && c.off !== c.on)) {
            const pulseUs = ((channel.off - channel.on + 4096) % 4096) * 1e6 / (4096 * value.pwm.controller.frequencyHz);
            assert.ok(pulseUs >= 1295 && pulseUs <= 1705, 'Active pulses must remain inside Product calibration, allowing PWM quantization');
          }
          pulses.add(value.pwm.controller.channels.slice(0, 4).map(c => c.off).join(','));
        }
        if (!value.body.running && sawActive && !active(value)) { finished = true; break; }
        await page.waitForTimeout(80);
      }
      assert.ok(sawActive && finished, `${mode}: native virtual PWM must run and finish OFF`);
      if (['forward','backward'].includes(mode)) assert.ok(pulses.size > 3, 'Real ramp samples must change, not a browser-only animation');
      await page.waitForFunction(() => !document.querySelector('[data-mode="forward"]').disabled);
    }
    await move('forward', 'stand');
    await move('backward', 'stand');
    await move('lie', 'stand');
    await page.waitForFunction(() => document.querySelector('#start-pose').value === 'lie');
    await move('stand', 'lie');
    await page.waitForFunction(() => document.querySelector('#start-pose').value === 'stand');
    await page.locator('[data-mode="forward"]').click();
    await page.waitForFunction(async () => (await (await fetch('/api/state')).json()).body.running);
    await page.waitForTimeout(350);
    await page.locator('[data-mode="stop"]').focus();
    await page.keyboard.press('Enter');
    await page.waitForFunction(async () => { const s = await (await fetch('/api/state')).json(); return !s.body.running && !s.body.stopping && s.pwm.controller.channels.every(c => c.fullOff); });
    await page.waitForFunction(() => document.querySelector('#body-status').textContent === '停止 · PWM OFF');
    assert.equal((await state()).body.error, null);
    assert.ok(Math.abs((await state()).pwm.controller.frequencyHz - 50) < 0.1);
    let matches = false;
    for (let attempt = 0; attempt < 20 && !matches; attempt++) {
      matches = await page.evaluate(async () => {
        const bytes = new Uint8Array(await (await fetch('/api/io/frame')).arrayBuffer());
        const {decodeRgb565} = await import('/gar-components/framebuffer.mjs');
        const expected = decodeRgb565(bytes, {width: 240, height: 240, littleEndian: false});
        const actual = document.querySelector('#screen').displayContext.getImageData(0, 0, 240, 240).data;
        return expected.every((value, index) => actual[index] === value);
      });
      if (!matches) await page.waitForTimeout(100);
    }
    assert.ok(matches, 'Display pixels must originate from the actual SPI driver');
    fs.mkdirSync('artifacts', {recursive: true});
    await page.screenshot({path: 'artifacts/vm-body-panel.png', fullPage: true});
    assert.deepEqual(errors, []);
    console.log('PASS: five modes through native C/CUSE I2C, PWM ramps, keyboard stop, FULL_OFF and exact SPI display pixels');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
