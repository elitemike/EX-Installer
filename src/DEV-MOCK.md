# EX-Installer — Dev Mock Mode

Mock mode lets you run the full UI wizard and workspace without a physical Arduino connected and without installing the Arduino CLI.

---

## How it works

Mock behaviour lives entirely in the **service layer** — the UI components have no knowledge of it and behave identically in both modes.

| Service | What is mocked |
|---|---|
| `UsbService` | `refresh()` returns fake serial ports; hot-plug subscriptions are skipped |
| `ArduinoCliService` | `isInstalled()` → `true`, `getVersion()` → `"mock (dev mode)"`, `listBoards()` → derives boards from mock ports via VID:PID, `compile()` / `upload()` → return success after a short artificial delay |

Everything else (git clone/pull, version tag listing, reading and writing `config.h`, preferences storage) runs for real even in mock mode.

---

## Default behaviour

| Command | Mock mode |
|---|---|
| `pnpm dev` | **ON** (Vite sets `import.meta.env.DEV === true`) |
| `pnpm build` + `pnpm preview` | **OFF** (production build, `DEV` is `false`) |

A small amber **DEV MOCK** badge is shown in the wizard header and the workspace top bar whenever mock mode is active.

---

## Controlling mock mode

### Turn mock OFF in `pnpm dev` (use real hardware)

Create `src/renderer/.env.development` (next to `index.html`):

```env
VITE_DEV_MOCK=false
```

Restart `pnpm dev`. The badge will disappear and real USB detection and Arduino CLI calls will be used.

### Force mock ON in a production-like build

Create `src/renderer/.env`:

```env
VITE_DEV_MOCK=true
```

Or pass it inline:

```shell
VITE_DEV_MOCK=true pnpm dev
```

---

## Customising the mock devices

Edit [`src/renderer/src/dev-mock.ts`](renderer/src/dev-mock.ts).

### Change which ports / boards appear

```ts
export const MOCK_SERIAL_PORTS: SerialDeviceInfo[] = [
    {
        path: 'MOCK_COM3',       // shown as the port in the UI
        manufacturer: 'DCC-EX',
        serialNumber: 'DCCEX-MOCK-0001',
        vendorId: '2341',        // VID used for board name lookup
        productId: '0042',       // PID — 0042 = Mega 2560
    },
    // add more entries here
]
```

The `vendorId`/`productId` values drive the board name and FQBN lookup in `ArduinoCliService.listBoards()`. Known mappings are in that service file. Common VID:PID values:

| VID:PID | Board |
|---|---|
| `2341:0042` | Arduino Mega 2560 / EX-CSB1 |
| `2341:0043` | Arduino Uno |
| `2341:0058` | Arduino Nano |
| `10c4:ea60` | ESP32 (CP2102) |

### Change the simulated compile output

```ts
export const MOCK_COMPILE_OUTPUT =
    '[MOCK] Compiling sketch...\n' +
    '[MOCK] Linking libraries...\n' +
    // add whatever lines you want to appear in the output panel
```

---

## File locations

```
src/
├── renderer/
│   ├── .env.development     ← create this to set VITE_DEV_MOCK=false
│   └── src/
│       ├── dev-mock.ts      ← mock data and DEV_MOCK flag
│       └── services/
│           ├── usb.service.ts          ← mock intercepted here
│           └── arduino-cli.service.ts  ← mock intercepted here
```
