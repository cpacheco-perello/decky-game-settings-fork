import json
import mimetypes
import os
import ssl
import time
import uuid
import urllib.request
import urllib.error
import sqlite3

# The decky plugin module is located at decky-loader/plugin
# For easy intellisense checkout the decky-loader code repo
# and add the `decky-loader/plugin/imports` path to `python.analysis.extraPaths` in `.vscode/settings.json`
import decky
import asyncio


class Plugin:
    # A normal method. It can be called from the TypeScript side using @decky/api.
    async def add(self, left: int, right: int) -> int:
        return left + right

    async def long_running(self):
        await asyncio.sleep(15)
        # Passing through a bunch of random data, just as an example
        await decky.emit("timer_event", "Hello from the backend!", True, 2)

    # Asyncio-compatible long-running code, executed in a task when the plugin is loaded
    async def _main(self):
        self.loop = asyncio.get_event_loop()
        decky.logger.info("Hello World!")

    # Function called first during the unload process, utilize this to handle your plugin being stopped, but not
    # completely removed
    async def _unload(self):
        decky.logger.info("Goodnight World!")
        pass

    # Function called after `_unload` during uninstall, utilize this to clean up processes and other remnants of your
    # plugin that may remain on the system
    async def _uninstall(self):
        decky.logger.info("Goodbye World!")
        pass

    async def start_timer(self):
        self.loop.create_task(self.long_running())

    # Migrations that should be performed before entering `_main()`.
    async def _migration(self):
        decky.logger.info("Migrating")
        # Here's a migration example for logs:
        # - `~/.config/decky-template/template.log` will be migrated to `decky.decky_LOG_DIR/template.log`
        decky.migrate_logs(os.path.join(decky.DECKY_USER_HOME,
                                        ".config", "decky-template", "template.log"))
        # Here's a migration example for settings:
        # - `~/homebrew/settings/template.json` is migrated to `decky.decky_SETTINGS_DIR/template.json`
        # - `~/.config/decky-template/` all files and directories under this root are migrated to `decky.decky_SETTINGS_DIR/`
        decky.migrate_settings(
            os.path.join(decky.DECKY_HOME, "settings", "template.json"),
            os.path.join(decky.DECKY_USER_HOME, ".config", "decky-template"))
        # Here's a migration example for runtime data:
        # - `~/homebrew/template/` all files and directories under this root are migrated to `decky.decky_RUNTIME_DIR/`
        # - `~/.local/share/decky-template/` all files and directories under this root are migrated to `decky.decky_RUNTIME_DIR/`
        decky.migrate_runtime(
            os.path.join(decky.DECKY_HOME, "template"),
            os.path.join(decky.DECKY_USER_HOME, ".local", "share", "decky-template"))

    def _guess_mime(self, path: str) -> str:
        mime, _ = mimetypes.guess_type(path)
        return mime or 'image/jpeg'

    def _normalize_path(self, p: str) -> str:
        return p.replace("file://", "", 1) if p.startswith("file://") else p

    def _read_file(self, path: str) -> bytes:
        with open(path, "rb") as f:
            return f.read()

    def _http_request(self, url: str, method: str, headers: dict, body: bytes, timeout: float = 60.0):
        req = urllib.request.Request(url, method=method, data=body, headers=headers or {})
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        opener = urllib.request.build_opener(urllib.request.HTTPSHandler(context=ctx))
        try:
            with opener.open(req, timeout=timeout) as resp:
                return resp.status, resp.read()
        except urllib.error.HTTPError as e:
            return e.code, (e.read() if hasattr(e, "read") else b"")
        except Exception as e:
            raise RuntimeError(f"HTTP request failed: {e}")

    def _chunk(self, seq, n):
        for i in range(0, len(seq), n):
            yield seq[i:i+n]

    def _build_multipart_body(self, files):
        """
        Returns: (content_type_header_value, body_bytes) for multi-part form data
        """
        boundary = f"----DeckyBoundary{int(time.time()*1000)}{uuid.uuid4().hex}"
        parts = []
        bnd = boundary.encode("ascii")

        for f in files:
            filename = f["filename"]
            mime = f["mime"]
            data = f["data"]

            # Each part: --boundary CRLF
            # Content-Disposition + Content-Type + CRLF CRLF + data + CRLF
            parts.append(b"--" + bnd + b"\r\n")
            parts.append(
                (
                    f'Content-Disposition: form-data; name="images"; filename="{filename}"\r\n'
                    f"Content-Type: {mime}\r\n\r\n"
                ).encode("utf-8")
            )
            parts.append(data)
            parts.append(b"\r\n")

        # Closing boundary
        parts.append(b"--" + bnd + b"--\r\n")
        body = b"".join(parts)
        content_type = f"multipart/form-data; boundary={boundary}"
        return content_type, body

    async def upload_images(self, paths: list, token: str) -> list:
        """
        Read local image files and upload via multipart/form-data.
        - Reject any single file > 1 MiB (single_image_max_bytes).
        - Send in batches of up to max_images_per_request.
        Returns list[str] URLs.
        """
        single_image_max_bytes = 1 * 1024 * 1024  # 1 MiB
        max_images_per_request = 7
        try:
            if not isinstance(paths, list) or len(paths) == 0:
                return []

            # Collect & validate files
            files = []
            for raw in paths:
                p = self._normalize_path(str(raw or ""))
                if not p or not os.path.isfile(p):
                    decky.logger.warning(f"upload_images: skipping non-file: {p}")
                    continue
                buf = self._read_file(p)
                if len(buf) > single_image_max_bytes:
                    raise ValueError(
                        f"Image too large: {os.path.basename(p)} is {len(buf)} bytes "
                        f"(max {single_image_max_bytes}). Images cannot be more than 1MB each."
                    )
                mime = self._guess_mime(p)
                filename = os.path.basename(p) or f"image-{uuid.uuid4().hex}"
                files.append({"filename": filename, "mime": mime, "data": buf})

            if not files:
                return []

            # Send in batches up to max_images_per_request
            all_urls: list[str] = []
            for batch_idx, batch in enumerate(self._chunk(files, max_images_per_request)):
                content_type, body = self._build_multipart_body(batch)
                headers = {
                    "Authorization": f"Bearer {token}",
                    "Accept": "application/json",
                    "Content-Type": content_type,
                    "User-Agent": "decky-plugin/asset-uploader",
                }

                status, data = self._http_request("https://asset-upload.deckverified.games/", "POST", headers, body)
                if status < 200 or status >= 300:
                    text = (data or b"").decode("utf-8", "replace")
                    raise RuntimeError(f"Asset upload failed for batch {batch_idx}: {status}\n{text}")

                try:
                    js = json.loads((data or b"{}").decode("utf-8", "replace"))
                    results = js.get("results") or []
                    for r in results:
                        if isinstance(r, dict):
                            url = r.get("url")
                            if isinstance(url, str) and url:
                                all_urls.append(url)
                except Exception as e:
                    raise RuntimeError(f"Invalid JSON from server (batch {batch_idx}): {e}")

            return all_urls
        except Exception as e:
            decky.logger.exception(f"upload_images failed: {e}")
            raise

    async def get_sys_vendor(self) -> str:
        """Return DMI system vendor from /sys/class/dmi/id/sys_vendor, or empty string on failure."""
        path = "/sys/class/dmi/id/sys_vendor"
        try:
            with open(path, 'r', encoding='utf-8', errors='ignore') as f:
                return f.read().strip()
        except Exception as e:
            try:
                decky.logger.warning(f"get_sys_vendor failed: {e}")
            except Exception:
                pass
            return ""

    def _read_mounts(self):
        try:
            with open('/proc/self/mounts', 'r', encoding='utf-8', errors='ignore') as f:
                for line in f:
                    parts = line.split()
                    if len(parts) >= 2:
                        yield parts[0], parts[1]
        except Exception:
            return []

    def _is_emmc_from_dev(self, dev_path: str) -> bool:
        """Best-effort detection for eMMC-backed block devices."""
        try:
            name = os.path.basename(str(dev_path or ''))
            if not name:
                return False

            # Direct patterns
            if name.startswith('mmcblk'):
                return True
            if name.startswith('nvme') or name.startswith('sd'):
                return False

            # Strip partition suffixes (e.g. mmcblk0p3, nvme0n1p2, sda2)
            base = name
            if 'p' in base and base.split('p')[-1].isdigit():
                base = base[:base.rfind('p')]
            else:
                base = base.rstrip('0123456789')

            if base.startswith('mmcblk'):
                return True
            if base.startswith('nvme') or base.startswith('sd'):
                return False

            # Sysfs fallback: check subsystem symlink target
            subsystem_path = f'/sys/class/block/{base}/device/subsystem'
            if os.path.exists(subsystem_path):
                target = os.path.realpath(subsystem_path).lower()
                if 'mmc' in target:
                    return True
                if 'nvme' in target or '/scsi' in target or '/ata' in target:
                    return False
        except Exception:
            pass

        return False

    async def is_emmc_storage(self) -> bool:
        """Simple check to determine if root/home is on eMMC (mmcblk) vs NVMe."""
        try:
            mounts = list(self._read_mounts())
            # Prioritize common system mounts
            priority = ['/', '/home', '/home/deck']
            for target in priority:
                for src, tgt in mounts:
                    if tgt == target and src.startswith('/dev/'):
                        return self._is_emmc_from_dev(src)
            # Fallback: scan any /dev/* mount that looks like a block device
            for src, tgt in mounts:
                if src.startswith('/dev/'):
                    name = os.path.basename(src)
                    if name.startswith('mmcblk'):
                        return True
                    return False
            return False
        except Exception as e:
            try:
                decky.logger.warning(f"is_emmc_storage failed: {e}")
            except Exception:
                pass
            return False

    def _resolve_battery_tracker_db_path(self) -> str:
        """Best-effort lookup for the Battery Tracker runtime SQLite database."""
        cached = getattr(self, '_battery_tracker_db_path', None)
        if isinstance(cached, str) and cached and os.path.isfile(cached):
            return cached

        data_root = os.path.join(decky.DECKY_HOME, 'data')
        candidates = [
            os.path.join(data_root, 'steam-deck-battery-tracker', 'battery.db'),
            os.path.join(data_root, 'Battery Tracker', 'battery.db'),
            os.path.join(data_root, 'battery-tracker', 'battery.db'),
        ]

        for path in candidates:
            if os.path.isfile(path):
                self._battery_tracker_db_path = path
                return path

        # Fallback: scan first-level plugin runtime directories under DECKY_HOME/data.
        try:
            if os.path.isdir(data_root):
                for entry in os.listdir(data_root):
                    candidate = os.path.join(data_root, entry, 'battery.db')
                    if not os.path.isfile(candidate):
                        continue

                    key = str(entry or '').lower()
                    if 'battery' in key and 'tracker' in key:
                        self._battery_tracker_db_path = candidate
                        return candidate
        except Exception:
            pass

        return ''

    async def get_battery_tracker_recent_power_data(self, lookback: int = 7):
        """
        Reads Battery Tracker's runtime DB and returns per-app average discharging power.

        Return shape:
          {
            "is_detected": bool,
            "power_data": [{"name": str, "average_power": int}]
          }
        """
        default_result = {
            'is_detected': False,
            'power_data': [],
        }

        try:
            safe_lookback = int(lookback)
        except Exception:
            safe_lookback = 7
        safe_lookback = max(1, min(30, safe_lookback))

        db_path = self._resolve_battery_tracker_db_path()
        if not db_path:
            return default_result

        con = None
        try:
            start_time = int(time.time() - 24 * safe_lookback * 3600)
            con = sqlite3.connect(db_path)
            cursor = con.cursor()

            rows = cursor.execute(
                'select app, power, status from battery where time > ?',
                (start_time,),
            ).fetchall()

            if not rows:
                return {
                    'is_detected': True,
                    'power_data': [],
                }

            per_app_powers = {}
            for app, power, status in rows:
                if status != -1:
                    continue

                name = str(app or '').strip() or 'Unknown'
                if name == 'Unknown':
                    name = 'Steam'

                try:
                    watts = float(power) / 10.0
                except Exception:
                    continue

                if watts <= 0:
                    continue

                per_app_powers.setdefault(name, []).append(watts)

            power_data = []
            for name, values in per_app_powers.items():
                if not values:
                    continue
                avg = int(sum(values) / len(values))
                power_data.append({
                    'name': name,
                    'average_power': avg,
                })

            power_data.sort(key=lambda x: -x.get('average_power', 0))
            return {
                'is_detected': True,
                'power_data': power_data,
            }
        except Exception as e:
            try:
                decky.logger.warning(f'get_battery_tracker_recent_power_data failed: {e}')
            except Exception:
                pass
            return default_result
        finally:
            try:
                if con is not None:
                    con.close()
            except Exception:
                pass
