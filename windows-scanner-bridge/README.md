# Tejaswini Scanner Bridge (Windows)
This optional local helper allows the website to request a single scan through the Windows Image Acquisition (WIA) driver. Keep it local; it binds only to 127.0.0.1.

## Requirements
- Windows 10
- Canon scanner driver installed and scanner connected by USB
- .NET Framework 4.8 developer/build tools to compile this project
- The Canon model/driver must expose WIA support. Some Canon devices expose only TWAIN; those need a TWAIN-specific bridge instead.

## Build
Open a Developer Command Prompt for Visual Studio and run:
```bat
msbuild TejaswiniScannerBridge.csproj /p:Configuration=Release
```
Run `bin\Release\TejaswiniScannerBridge.exe` and keep its window open. If Windows Firewall prompts, do not allow public network access; the helper only binds to loopback.

## Endpoints
- GET http://127.0.0.1:8765/status
- GET http://127.0.0.1:8765/devices
- POST http://127.0.0.1:8765/scan with JSON: {"dpi":200,"colorMode":"grayscale"}

## Important
This helper is source code and has not been compiled or tested against the user's Canon device. Device-specific WIA properties can vary. Scans are returned to the browser as JPEG data and are not uploaded to a server by the helper. Do not expose this service to the LAN or internet.
