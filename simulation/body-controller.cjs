'use strict';
const fs = require('node:fs');
const path = require('node:path');
const {readCsv} = require('../sources/gar-my-friend/application/hardware.cjs');
const {processJob} = require('../sources/gar-my-friend/application/process-job.cjs');

const MODES = ['forward', 'backward', 'stop', 'lie', 'stand'];

function validateBodyInput(value) {
  if (!value || Array.isArray(value) || typeof value !== 'object' || !MODES.includes(value.mode)) throw new Error('Invalid body mode');
  const keys = Object.keys(value).sort().join(',');
  if (value.mode === 'stop') {
    if (keys !== 'mode') throw new Error('stop takes only mode');
  } else if (keys !== 'from,mode' || !['stand','lie'].includes(value.from)) throw new Error('Body motion needs from=stand|lie');
}

/** Product command adapter. Native C writes virtual I2C; this never draws PWM. */
class BodyController {
  constructor({root, environment, job = processJob} = {}) {
    this.root = root;
    this.job = job;
    this.current = null;
    this.stopping = null;
    this.closed = false;
    this.mode = 'stop';
    this.error = null;
    this.ready = false;
    try {
      if (environment !== 'virtualbox-linux' || process.platform !== 'linux' || process.arch !== 'x64') throw new Error('Body controls require the dedicated x64 Linux simulator');
      const product = JSON.parse(fs.readFileSync(path.join(root, 'product.json'), 'utf8'));
      const physical = path.join(root, product.hardware.physical);
      const i2c = readCsv(path.join(root, product.hardware.simulation, 'i2c.csv'));
      if (i2c.length !== 1 || i2c[0].dev !== '/dev/i2c-10' || i2c[0].driver !== 'pca9685' || !fs.statSync('/dev/i2c-10').isCharacterDevice()) throw new Error('Virtual I2C device is unavailable');
      this.directory = path.join(root, '.gar/body-sim');
      fs.mkdirSync(this.directory, {recursive: true, mode: 0o700});
      for (const name of ['servo-calibration.csv', 'body-motions.csv']) fs.copyFileSync(path.join(physical, name), path.join(this.directory, name));
      fs.copyFileSync(path.join(root, product.hardware.simulation, 'i2c.csv'), path.join(this.directory, 'i2c.csv'));
      const stopFile = path.join(this.directory, 'servo.stop');
      fs.writeFileSync(path.join(this.directory, 'effects.csv'), `kind,enabled,hold_ms,stop_file\nservo,1,250,${stopFile}\n`);
      this.env = {...process.env, GAR_HARDWARE_DIR: this.directory, GAR_BIN_DIR: path.join(root, 'build')};
      this.binary = path.join(root, 'build/gar-servoctl');
      if (!fs.existsSync(this.binary)) throw new Error('Build the simulator servo controller first');
      this.ready = true;
    } catch (error) { this.error = error.message; }
  }

  configuration() {
    const product = JSON.parse(fs.readFileSync(path.join(this.root, 'product.json'), 'utf8'));
    const physical = path.join(this.root, product.hardware.physical);
    return readCsv(path.join(physical, 'servo-calibration.csv')).map(servo => ({
      name: servo.name, channel: Number(servo.channel), role: servo.role,
      minPulseUs: Number(servo.min_us), maxPulseUs: Number(servo.max_us),
    }));
  }

  state() { return {ready: this.ready, running: Boolean(this.current), stopping: Boolean(this.stopping), mode: this.mode, error: this.error}; }

  async command(input) {
    validateBodyInput(input);
    if (this.closed || !this.ready) throw Object.assign(new Error(this.error || 'Body simulator is closed'), {status: 503});
    if (input.mode === 'stop') return this.stop();
    if (this.current || this.stopping) throw Object.assign(new Error('Body motion is already running'), {status: 409});
    const args = [path.join(this.root, 'sources/gar-my-friend/tools/body.cjs'), input.mode, '--from', input.from];
    const task = this.job(process.execPath, args, {env: this.env, timeoutMs: 35000});
    this.current = task;
    this.mode = input.mode;
    this.error = null;
    task.promise.catch(error => { if (!this.stopping && !this.closed) this.error = error.message; })
      .finally(() => { if (this.current === task) this.current = null; });
    return this.state();
  }

  stop() {
    if (this.stopping) return this.stopping;
    this.stopping = (async () => {
      const active = this.current;
      active?.cancel();
      if (active) await active.promise.catch(() => {});
      // A separate native off also interrupts any other virtual owner safely.
      await this.job(process.execPath, [path.join(this.root, 'sources/gar-my-friend/tools/body.cjs'), 'stop'], {env: this.env, timeoutMs: 7000}).promise;
      this.mode = 'stop';
      this.error = null;
    })().catch(error => { this.error = error.message; throw error; }).finally(() => { this.stopping = null; });
    return this.stopping;
  }

  async close() {
    if (this.closed) return this.stopping;
    this.closed = true;
    if (this.ready) await this.stop();
  }
}

module.exports = {BodyController, validateBodyInput};
