# DSK Camera · Android companion

Separate Android companion app for sending one video-only camera source (CAM 2–CAM 8) to DSK-MV Switcher over a local Wi-Fi/LAN network.

## Build

From this directory:

```bash
npm install
npm run build
npx cap add android
npx cap sync android
```

Grant the Android CAMERA permission in the generated manifest, then build:

```bash
cd android
./gradlew assembleDebug
```

The CI workflow also builds and uploads a separate `dsk-camera-android-debug` artifact.

## Pairing

1. Start DSK Media Receiver on the OBS PC.
2. Open the local Receiver page on that PC and copy its pairing code.
3. Connect the DSK mixer tablet to the same Receiver and enter the PC IP, port 8765 and pairing code in DSK VIDEO.
4. Install and open DSK Camera on a phone connected to the same Wi-Fi/LAN.
5. Select an unused source CAM 2–CAM 8, enter the PC IP, port and pairing code, then start the camera.
6. The DSK mixer subscribes to the matching camera room.

Only video is captured. Camera microphone audio is deliberately disabled; audio remains in the DSK audio mixer.

## Network model and limitations

- WebSocket is used for pairing and SDP/ICE signaling.
- WebRTC sends the video directly between the phone and DSK tablet; the PC does not relay the media.
- No STUN/TURN service is configured; the initial target is a common local Wi-Fi/LAN.
- Each camera uses an independent WebRTC peer connection and a unique CAM number.
- 720p at 30 fps is a requested target, not a guaranteed device/network performance level.
- The Android WebView camera permission flow, simultaneous multi-camera operation, thermal load, bitrate, codec interoperability and reconnect behavior must be validated on real devices before release.
- The app currently allows local insecure WebSocket signaling for development. This is provisional and must be replaced with secure signaling before commercial distribution.
