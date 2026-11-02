# GarMyFriend-OrangePiZero2W scope

The user's current WebPanel scope is the GC9A01 face display, PCA9685 and four
SG90 servos, with Product-level forward/backward/stop/lie/stand controls. The
rotary encoder is not required in the current composition. Preserve the shared
parts' appearance. Do not add unrelated dashboards, sensors, scenarios,
record/replay or direct expression selectors. Body commands invoke the actual
native controller against virtual I2C in the dedicated Linux simulator; the
panel must never route these commands to a physical board.

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
