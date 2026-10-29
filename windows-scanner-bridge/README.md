# Tejaswini Scanner Bridge (Windows)
This optional local helper lets the Tejaswini Solar Document Studio request a scan from Windows Image Acquisition (WIA). It binds only to `127.0.0.1`; it is not an internet-facing service.

## Requirements
- Windows 10
- Canon scanner driver installed and scanner connected by USB
- .NET Framework 4.8 developer/build tools / Visual Studio Build Tools
- The Canon model and installed driver must expose WIA. Some models expose only TWAIN; those need a TWAIN-specific adapter.

## Build the helper
Open a **Developer Command Prompt for Visual Studio** in this folder and run:
```bat
msbuild TejaswiniScannerBridge.csproj /p:Configuration=Release
```
Then run the generated `bin\Release\TejaswiniScannerBridge.exe` and keep its console window open while using the website. The website's **Connect scanner** button should report that the local bridge is available.

If Windows Firewall asks, do not allow public network access. This helper should remain local to your PC.

## Website workflow
1. Start the bridge on the same Windows PC where the Canon USB scanner is connected.
2. Open the deployed Tejaswini Solar Document Studio in the browser.
3. Open **Scanner & PDF**, choose DPI/color mode and click **Connect scanner**.
4. Click **Scan page now**. Each scanned page is automatically added to the page/file list. Click again for each additional page.
5. Choose automatic detection or manually select Model Agreement, Work Completion Report, Annexure/DCR, or Other. Choose an automatic or custom size target and create the PDF.

## Endpoints
- GET `http://127.0.0.1:8765/status`
- GET `http://127.0.0.1:8765/devices`
- POST `http://127.0.0.1:8765/scan` with JSON: `{"dpi":200,"colorMode":"grayscale"}`

## Limitations and privacy
- This is source code, not a precompiled installer; it has not yet been built or tested against the user's exact Canon model.
- A scanner driver may expose only TWAIN or use different WIA properties; the bridge may need model-specific changes.
- This version scans one page per click. Pages are returned to the browser as JPEGs; the bridge does not upload them to a server.
- OCR auto-detection is best-effort. Verify the detected document type and PDF readability before submitting official solar paperwork.

## Download a prebuilt helper (after the build workflow succeeds)
1. Open the repository's **Actions** tab.
2. Open the latest **Build Windows Scanner Bridge** run.
3. Under **Artifacts**, download `TejaswiniScannerBridge-Windows` and extract it.
4. Run `TejaswiniScannerBridge.exe` and keep the console window open while using the website.

The first workflow run is triggered when this workflow is merged to `main`. The artifact is temporary (14-day retention). It is not a signed installer, and Windows may show a security warning because it is an internally built executable. Only run it if you trust the repository and have reviewed the source.
