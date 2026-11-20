# KABU DATING APP

**Connect anonymously. Discover naturally.**

A real-time, anonymous, one-to-one chat application intended for an authorized Kabarak University local Wi-Fi environment. Built with React + Vite, Node.js + Express and Socket.IO.

## Features

- Temporary, randomly generated usernames; no email, phone number, real name or password registration.
- Voluntary display selection: Boy, Girl or Prefer not to say.
- Live online discovery and gender filters.
- One-to-one chat invitations with accept/decline.
- Real-time text messages and typing indicators.
- End-chat cleanup: conversation messages are held only in server memory and the conversation object is deleted when either user ends the chat or disconnects.
- Temporary in-memory user sessions with heartbeat expiry.
- Session-only block/report controls.
- Responsive dark purple interface and KABU branding.

## Requirements

- Node.js 20 or newer (Node 22 LTS recommended)
- npm 10 or newer
- Devices connected to the same permitted LAN/Wi-Fi subnet

## Run locally

1. Install dependencies from the project root:

   ```bash
   npm install
   ```

2. Create the server environment file:

   ```bash
   cp server/.env.example server/.env
   ```

   On Windows PowerShell:

   ```powershell
   Copy-Item server/.env.example server/.env
   ```

3. Start the development servers:

   ```bash
   npm run dev
   ```

4. Open the Vite URL printed in the terminal (normally `http://localhost:5173`). The API and Socket.IO server run on port `4000`.

## Test from phones on the same Wi-Fi

1. Connect the host computer and test phones to the same non-guest Wi-Fi network.
2. Find the host computer's LAN IPv4 address (`ipconfig` on Windows; `ip addr` on Linux).
3. In `server/.env`, set `CLIENT_ORIGIN` to the exact Vite origin reachable by phones, for example `http://192.168.1.20:5173`.
4. In `client/.env`, set `VITE_SERVER_URL=http://192.168.1.20:4000` (copy `client/.env.example` first if present; create the file if not).
5. Restart the servers and open `http://192.168.1.20:5173` on each phone.
6. Allow Node.js through the host computer's private-network firewall when prompted. Do not expose ports to the public internet.

For a production build, run `npm run build` at the root. Serve `client/dist` from a web server on the LAN and configure `VITE_SERVER_URL` at build time to the LAN API address. Set `CLIENT_ORIGIN` to the exact deployed frontend origin.

## Restricting access to an authorized subnet

The server can enforce IPv4 client-address ranges using CIDR allowlists. Edit `server/.env`:

```env
ALLOWED_CIDRS=192.168.1.0/24
```

Use the actual subnet approved by the university network administrator. Multiple ranges can be comma-separated. Keep this configured in production. An empty allowlist is convenient for development and allows any IP at the application layer; do not leave it empty for a restricted deployment.

**Important network reality:** a web app cannot independently prove that a device is physically on a particular Wi-Fi SSID. IP/CIDR allowlisting is a practical LAN control, not cryptographic proof of Wi-Fi association. Campus networks may use client isolation, VLANs, NAT, VPNs or proxying. Ask the network administrator to place the host and intended users on an approved VLAN/subnet, disable unwanted WAN exposure, and apply router/firewall rules. Guest Wi-Fi or client isolation may prevent devices from reaching one another.

## Privacy and safety notes

- The application does not persist chat messages or user profiles to a database. User and conversation state is in process memory only.
- Chat messages are sent over the LAN using Socket.IO. For sensitive use, deploy HTTPS/WSS with a trusted certificate even on the internal network.
- Messages disappear from the active server conversation when the conversation ends. The app cannot erase screenshots, copied text, browser memory, network equipment logs, or messages a participant independently records.
- Usernames are temporary pseudonyms, not a guarantee of anonymity. Network operators can often see device/network metadata. The current server keeps an IP address only in the live in-memory user object for network policy context; it is not shown to other users or written to an application log.
- This starter does not implement end-to-end encryption. Do not use it for sensitive or confidential communication without a security review and an E2EE design.
- The report feature acknowledges reports but does not persist or route them to moderators. A real campus deployment needs a staffed moderation process, clear community rules, escalation procedures and a privacy notice.
- Intended for adults (18+) only. The age notice in the UI is informational; production use should add an appropriate age assurance and safeguarding policy.
- Block/report state is session-only and is cleared when the server restarts. Add a privacy-preserving moderation service before public deployment.

## Project layout

```text
kabu-dating-app/
├── client/
│   ├── index.html
│   └── src/
│       ├── App.jsx
│       ├── main.jsx
│       └── styles.css
├── server/
│   ├── .env.example
│   └── src/
│       ├── index.js
│       └── network.js
├── package.json
└── README.md
```

## Useful commands

```bash
npm run dev       # React + API in development
npm run build     # Build React frontend
npm start         # Start API server (after configuring production serving separately)
```

## Before a campus-wide launch

- Obtain written authorization from Kabarak University IT/network administration.
- Confirm the intended LAN/VLAN and configure `ALLOWED_CIDRS`.
- Deploy behind HTTPS/WSS and a firewall; do not port-forward the app to the public internet.
- Add a moderation/report workflow, acceptable-use policy, abuse response, and operational owner.
- Conduct security, privacy, accessibility and load testing with consent from test participants.
