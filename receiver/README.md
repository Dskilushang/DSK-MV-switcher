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

Open `http://127.0.0.1:8765/health` on the PC. The response should report `"status":"ready"`.

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

For each Browser source, enable **Control audio via OBS** in its properties. Keep the sources separate in the OBS Audio Mixer. Configure the OBS audio track assignments deliberately: PGM to the desired stereo program track and each ISO source to its own track. Do not route all ISO sources to one track if isolated recording is required.

## Transport notes

- WebRTC carries the audio media; the WebSocket endpoint is signaling only.
- Each stream uses a separate peer connection, preserving independent OBS source routing.
- ICE is configured without public STUN/TURN servers because this first receiver is designed for a shared LAN.
- The receiver does not expose virtual audio devices or install OBS plugins.
- The receiver currently has no pairing/authentication. HTTP/WebSocket signaling is not encrypted; WebRTC media itself is protected by DTLS-SRTP. Use only on a trusted production LAN and restrict the signaling port with the firewall.
- Browser-source audio capture and Android WebView WebSocket/WebRTC behavior require final end-to-end validation. This code is the first transport implementation, not a claim that the physical workflow has already passed testing.
