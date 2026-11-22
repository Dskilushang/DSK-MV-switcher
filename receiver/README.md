# DSK Audio Receiver

Companion LAN receiver for DSK-MV Switcher. It accepts nine independent WebRTC audio sessions:

- `pgm`: one stereo PGM stream (left/right)
- `iso-1` through `iso-8`: eight independent ISO streams, one per mixer channel

## Requirements

- Windows 10/11 or another Node.js 20+ desktop environment
- DSK Audio Receiver and the DSK tablet/phone on the same local network
- OBS Studio with the Browser Source feature available

## Start on the OBS computer

From this directory:

```sh
npm install
npm start
```

The receiver listens on port 8765 by default. Set `DSK_RECEIVER_PORT` to change it. It binds to all network interfaces; restrict access to a trusted LAN and allow the chosen TCP signaling port in the computer firewall. WebRTC media also uses dynamically negotiated UDP ports; allow Node.js/OBS WebRTC traffic on the Windows Private network profile.

Open `http://127.0.0.1:8765` on the PC itself. Copy the generated pairing code shown there into the DSK Audio panel. The code is stored locally in `receiver/.receiver-token` and is not committed to Git. The health endpoint is available at `http://127.0.0.1:8765/health`.

Find the PC's LAN IPv4 address (for example, 192.168.1.100) and enter it in DSK Audio > Liaison PC / OBS. The default signaling port is 8765.

## Add the nine audio sources in OBS

Create nine separate **Browser** sources. Use the PC loopback address, not the tablet address:

| OBS source | URL |
|---|---|
| DSK PGM | `http://127.0.0.1:8765/obs/pgm` |
| DSK ISO 1 | `http://127.0.0.1:8765/obs/iso-1` |
| DSK ISO 2 | `http://127.0.0.1:8765/obs/iso-2` |
| DSK ISO 3 | `http://127.0.0.1:8765/obs/iso-3` |
| DSK ISO 4 | `http://127.0.0.1:8765/obs/iso-4` |
| DSK ISO 5 | `http://127.0.0.1:8765/obs/iso-5` |
| DSK ISO 6 | `http://127.0.0.1:8765/obs/iso-6` |
| DSK ISO 7 | `http://127.0.0.1:8765/obs/iso-7` |
| DSK ISO 8 | `http://127.0.0.1:8765/obs/iso-8` |

The `/obs/...` pages are restricted to loopback access and are intended to be opened by OBS on the same PC. For each Browser source, enable **Control audio via OBS** in its properties. Keep the sources separate in the OBS Audio Mixer. Configure the OBS audio track assignments deliberately: PGM to the desired stereo program track and each ISO source to its own track. Do not route all ISO sources to one track if isolated recording is required.

## Transport notes

- WebRTC carries the audio media; the WebSocket endpoint is signaling only.
- Each stream uses a separate peer connection, preserving independent OBS source routing.
- ICE is configured without public STUN/TURN servers because this first receiver is designed for a shared LAN.
- The receiver does not expose virtual audio devices or install OBS plugins.
- The sender and receiver signaling sessions require the generated pairing code. The code is displayed only on the local PC page and stored in an ignored local file. HTTP/WebSocket signaling is not encrypted; WebRTC media itself is protected by DTLS-SRTP. Use only on a trusted production LAN and restrict the signaling port with the firewall.
- Browser-source audio capture and Android WebView WebSocket/WebRTC behavior require final end-to-end validation. This code is the first transport implementation, not a claim that the physical workflow has already passed testing.

## DSK Video · remote phone cameras (CAM 2–8)

The signaling server also reserves seven independent video rooms: `cam-2` through `cam-8`. The DSK mixer connects as the receiver for these rooms. Each phone camera connects as a sender; video media travels directly over WebRTC on the local network, while the PC relays only SDP/ICE signaling.

On a phone, open the camera sender page at:

```text
http://<PC-LAN-IP>:8765/camera
```

Choose an unused camera number (CAM 2–CAM 8), enter the pairing code, select the front or rear camera, and start the feed. In DSK-MV Switcher, open Settings > DSK VIDEO, enter the same PC address, port and pairing code, then connect CAM 2–8. A phone must use a different CAM number from every other connected phone.

**Important Android/browser limitation:** camera capture through `getUserMedia()` requires a secure context. A plain HTTP page opened through a LAN IP is not a secure context in modern browsers, so Android may block camera permission even when the user grants it. The page explicitly detects this and refuses to pretend the camera is running. For a production deployment, serve the sender through trusted HTTPS or package it as the native **DSK Camera** Android companion app. The native companion packaging and real-device permission flow are not included in this first signaling/receiver increment.

The seven video rooms use peer-to-peer WebRTC with no STUN/TURN service configured. This is intended for devices on the same Wi-Fi/LAN. Network isolation, client isolation, firewall rules, codec negotiation and sustained multi-camera bandwidth still require end-to-end testing.
