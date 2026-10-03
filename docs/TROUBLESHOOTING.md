# Troubleshooting

Logs: `%APPDATA%\Central Pro\logs\` (`app-*.log`, `error-*.log`, `security-*.log`). Version and data
folder: Settings → This computer.

| Symptom | Cause / fix |
| --- | --- |
| “The database update could not be completed. Your data was restored safely” at start | A migration failed and was rolled back automatically. Send `error-*.log` to support; reinstall the previous version meanwhile. The pre-migration copy is in `backups/pre-migration-*.db`. |
| “Central Pro could not open its database” | The file is damaged or locked by another program (antivirus, cloud sync). Close other programs; exclude the data folder from cloud sync; restore the latest backup on a fresh install if it persists. |
| “The database is busy” | Another process holds the file (a second copy, a backup tool). Only one instance can run; close the other one. |
| App opens and closes immediately | Check `error-*.log`. Missing `resources/migrations` in a custom build → rebuild with `electron-builder.config.cjs`. |
| “The disk is full. Nothing was saved.” | Free space on the disk (delete old files / old backups from the backup folder, empty the Recycle Bin). The failed operation was not saved at all; retry it. |
| Printer unavailable | The sale is saved anyway. Check Settings → Printers → printer name and paper size, print a test page. Reprint from Sales history or save as PDF. |
| Barcode scanner does nothing | Scanners act as keyboards: the cursor must not be inside another text box; the barcode must exist on a product. Try typing it in the POS search. |
| Camera (QR / photos) not working | Windows Settings → Privacy → Camera → allow desktop apps. |
| Wrong backup password | Each backup keeps the password it was made with. Try the previous password. |
| “Automatic backups are paused on this computer” | The local key copy is unavailable (new Windows profile). Enter the backup password once in Settings → Backup. |
| Backup to USB fails | The mirror folder is missing (USB removed). The main backup still succeeded; plug the drive in or choose another folder. |
| Trial ended / activation screen | Send the request code to the vendor, paste the activation key. Data is untouched; backups still work from that screen. |
| “Activation key is not for this computer” | Keys are bound to one PC. A new PC / reinstalled Windows needs a new key for the new request code. |
| User limit reached | The license tier limits active users (Basic 3, Professional 15). Deactivate a user or upgrade. |
| Forgot owner password | Sign in with the PIN; or another user with *manage users* resets it. If no admin can sign in, restore a backup whose password you know, or contact the vendor. |
| Windows SmartScreen warning at install | The installer is not code-signed: “More info → Run anyway”, or ask the vendor for a signed build. |
| Clock warning in logs | The PC clock went backwards. Fix the date/time; the license uses the latest time it has seen. |
| Trial / timed license ended early after a wrong date | The clock was set in the future at some point; the app keeps the latest time it saw. Fix the date and ask the vendor for a new key (lifetime licenses are not affected). |
| A restore was interrupted (power cut) | Nothing is lost: at the next start the previous data is put back automatically. Run the restore again. |
