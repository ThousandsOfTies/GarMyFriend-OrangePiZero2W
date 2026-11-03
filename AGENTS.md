# GarMyFriend-OrangePiZero2W scope

The user's current WebPanel scope is the GC9A01 face display, PCA9685 and four
SG90 servos, USB speakerphone using PC audio, and Gemini Live conversation with
App-owned expression/body tools. Include Product-level forward/backward/stop/lie/stand controls. The
rotary encoder is not required in the current composition. Preserve the shared
parts' appearance. Do not add unrelated dashboards, sensors, scenarios,
record/replay or direct expression selectors. Body commands invoke the actual
native controller against virtual I2C in the dedicated Linux simulator; the
panel must never route these commands to a physical board.

The browser's microphone/audio is an I/O substitute. Gemini transport and reusable
speakerphone UI belong in gar-tools; App instructions, tool schemas and execution
belong in gar-my-friend. Product adapters relay tools to the running VM application
over its optional local control socket. Render only actual SPI pixels and native
I2C output. API keys stay in browser session memory; never persist or log them.

Physical USB conversation is separately opt-in via scripts/live.cjs. The common
application owns the session and invokes the same semantic tools; gar-tools owns
raw ALSA streams and the DOM-independent Gemini protocol. No physical audio is
started by the WebPanel. GEMINI_API_KEY is supplied at launch, removed from child
process environments, and never saved/logged. Body tools require explicit --body
and a confirmed --from pose; default conversation is face/audio only.

Headless Live sessions may alternatively authenticate to the shared Cloud Run
token broker. Keep the Gemini API key in the existing server-side Secret Manager.
Provision only a device-specific credential in a private Linux file (mode 0600),
never Git or logs. Ephemeral Gemini tokens remain in memory. The headless profile
starts with microphone transmission muted; a physical rotary press toggles it.
Face-only sessions retry token/session failures with backoff. Body-enabled sessions
require a newly confirmed starting pose instead of automatic reconnection.

Application behavior belongs in the `gar-my-friend` submodule at
`sources/gar-my-friend/application/`. Keep Product launch configuration in
`scripts/run-face.cjs`; it must not choose expressions. The face application reads
GPIO and writes SPI and must operate independently of the WebPanel process.
`simulation/` and `simulator/` relay physical input and driver-produced pixels;
they must not choose expressions, animate faces or generate application output.

Pin `sources/gar-my-friend` and `sources/gar-tools` to exact commits.
Commit and push shared changes before updating Product pointers.
Reuse gar-tools through the submodule. Keep reusable hardware models there,
Product wiring and face behavior here. Follow the submodule's Web simulator
design guidance when changing the part composition.

Hardware data follows GAR's CSV headers: `hardware/components.csv` owns part
numbers, `connections.csv` owns the physical wiring plan, and `gpio.csv` /
`spi.csv` own the selected runtime I/O assignment. Do not create parallel part
or pin-plan JSON files. Keep physical header numbers distinct from Linux line
offsets. Application and virtual driver startup must read I/O values from CSV.

## Board composition

The current user-selected architecture pins application, gar-tools and a separate board repository.
Read `product.json` and `docs/COMPOSITION.md`. Board/OS/resource/toolchain facts belong to
`sources/board-orangepi-zero2w/`; Product wiring and runtime choices stay here.
Keep Product hooks thin; generic build/deployment/startup mechanisms belong in gar-tools.
Never commit `.gar/device.json` or SDK/ROM/compiler bytes. Do not operate a board to test an offline refactor.
