#!/usr/bin/env node
// Smoke test for a deployed AnonChat relay.
//
// Everything here goes over HTTP against a running instance, which is the only
// way to catch the class of bug where each layer is correct in isolation and the
// seam between them is not: the attachment upload that mints its own blob id, the
// Direct Message envelope whose fields the relay strips, the health endpoint a
// platform check is pointed at.
//
//   node scripts/smoke-relay.mjs https://anonchat-relay.onrender.com
//   npm run smoke -- http://127.0.0.1:3000
//
// Exits non-zero on the first failed assertion group, so it is safe in CI.
const base = (process.argv[2] ?? process.env.RELAY_URL ?? 'http://127.0.0.1:3000').replace(/\/+$/, '');

let passed = 0;
const failures = [];

function check(name, ok, detail = '') {
  if (ok) {
    passed += 1;
    console.log(`  \x1b[32mPASS\x1b[0m  ${name}`);
  } else {
    failures.push(name);
    console.log(`  \x1b[31mFAIL\x1b[0m  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

function group(title) {
  console.log(`\n\x1b[1m${title}\x1b[0m`);
}

const json = async (path, init) => {
  const res = await fetch(`${base}${path}`, init);
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { status: res.status, body };
};

const post = (path, payload) =>
  json(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

const bytes = (...values) => new Uint8Array(values);

async function main() {
  console.log(`\n\x1b[1mAnonChat relay smoke test\x1b[0m → ${base}\n`);

  // ---------------------------------------------------------------- pages
  group('Serving');
  const home = await fetch(`${base}/`);
  check('GET / serves the app', home.status === 200, `status ${home.status}`);

  // ------------------------------------------------------------- liveness
  group('Liveness');
  const health = await json('/api/health');
  check('GET /api/health is 200', health.status === 200, `status ${health.status}`);
  check(
    'GET /api/health reports a process identity and start time',
    typeof health.body?.instanceId === 'string' && typeof health.body?.startedAt === 'string',
    JSON.stringify(health.body),
  );
  console.log(
    `         tor: control=${health.body?.tor?.control} socks=${health.body?.tor?.socks}` +
      ` — ${health.body?.tor?.control ? 'Tor is up' : 'Tor is NOT running; the relay must say so'}`,
  );

  // ------------------------------------------------------------------ tor
  group('Tor reporting');
  const torStatus = await json('/api/tor-status');
  check('GET /api/tor-status is 200', torStatus.status === 200, `status ${torStatus.status}`);
  check(
    'a live circuit is only claimed when a three-hop circuit exists',
    torStatus.body?.circuitEstablished !== true || torStatus.body?.circuit?.hops?.exit != null,
    JSON.stringify(torStatus.body),
  );

  const torIp = await json('/api/tor-ip');
  check('GET /api/tor-ip is 200', torIp.status === 200, `status ${torIp.status}`);
  check(
    'GET /api/tor-ip never invents an exit address when there is no circuit',
    torIp.body?.isTor === true ? typeof torIp.body?.ip === 'string' && torIp.body.ip.length > 0 : torIp.body?.ip === null,
    JSON.stringify(torIp.body),
  );
  const torIpAgain = await json('/api/tor-ip');
  check(
    'GET /api/tor-ip is not a frozen build-time value',
    torIpAgain.body?.timestamp !== torIp.body?.timestamp,
    `${torIp.body?.timestamp} vs ${torIpAgain.body?.timestamp}`,
  );

  // ---------------------------------------------------------------- rooms
  group('Rooms');
  const created = await post('/api/relay/rooms', { name: 'smoke-test', isProtected: false });
  check('POST /api/relay/rooms creates a Room', created.status === 200 && created.body?.success === true, JSON.stringify(created.body));
  const roomId = created.body?.roomId;

  const listed = await json('/api/relay/rooms');
  check(
    'GET /api/relay/rooms lists the new Room',
    Array.isArray(listed.body?.rooms) && listed.body.rooms.some((room) => room.id === roomId),
    JSON.stringify(listed.body),
  );

  const joined = await post(`/api/relay/rooms/${roomId}/join`, { userId: 'smoke-alice', username: 'Alice', timestamp: Date.now() });
  check('POST join accepts a member', joined.status === 200 && joined.body?.success === true, JSON.stringify(joined.body));

  // ------------------------------------------------------------- messages
  group('Messages');
  const message = {
    id: 'smoke_1',
    roomId,
    userId: 'smoke-alice',
    username: 'Alice',
    encryptedContent: 'Y2lwaGVydGV4dA==',
    iv: 'aXYtMQ==',
    timestamp: Date.now(),
  };
  const sent = await post(`/api/relay/rooms/${roomId}/messages`, message);
  check('POST a message is accepted', sent.status === 200 && sent.body?.success === true, JSON.stringify(sent.body));

  const polled = await json(`/api/relay/rooms/${roomId}/messages`);
  const rows = Array.isArray(polled.body) ? polled.body : (polled.body?.messages ?? []);
  check('GET messages returns it', rows.length === 1 && rows[0].id === 'smoke_1', JSON.stringify(polled.body));

  const second = await post(`/api/relay/rooms/${roomId}/messages`, { ...message, id: 'smoke_2', iv: 'aXYtMg==', encryptedContent: 'ZGlmZmVyZW50' });
  check('POST a second distinct message is accepted', second.status === 200 && second.body?.success === true, JSON.stringify(second.body));

  const replayed = await post(`/api/relay/rooms/${roomId}/messages`, { ...message, id: 'smoke_3' });
  check('POST a replayed payload is rejected', replayed.status === 409, JSON.stringify(replayed.body));

  // ---------------------------------------------------------- attachments
  group('Attachments (the upload must land under the reserved id)');
  const reserved = await json('/api/relay/blobs/reserve', { method: 'POST' });
  check('POST blobs/reserve returns an id', reserved.status === 201 && typeof reserved.body?.blobId === 'string', JSON.stringify(reserved.body));
  const blobId = reserved.body?.blobId;

  const payload = bytes(1, 2, 3, 4, 5, 6, 7, 8);
  const upload = await fetch(`${base}/api/relay/blobs/${blobId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: payload,
  });
  const uploadBody = await upload.json().catch(() => ({}));
  check('PUT blobs/[blobId] stores the ciphertext', upload.status === 201, JSON.stringify(uploadBody));

  const download = await fetch(`${base}/api/relay/blobs/${blobId}`);
  check('GET the reserved id returns the uploaded bytes', download.status === 200, `status ${download.status}`);
  if (download.status === 200) {
    const got = new Uint8Array(await download.arrayBuffer());
    check(
      'the reserved id holds byte-identical ciphertext',
      got.length === payload.length && got.every((value, index) => value === payload[index]),
      `${got.length} bytes: [${Array.from(got).join(',')}]`,
    );
  }

  const refilled = await fetch(`${base}/api/relay/blobs/${blobId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: bytes(9, 9, 9),
  });
  check('a finalised id cannot be refilled', refilled.status === 409, `status ${refilled.status}`);

  // --------------------------------------------------------------- origin
  group('Origin policy');
  const crossOrigin = await fetch(`${base}/api/relay/rooms/${roomId}/messages`, { headers: { Origin: 'https://example.invalid' } });
  check('a cross-origin request is refused', crossOrigin.status === 403, `status ${crossOrigin.status}`);

  const missing = await fetch(`${base}/api/relay/blobs/${'f'.repeat(32)}`);
  check('an unknown blob id is honestly absent', missing.status === 404, `status ${missing.status}`);

  // ------------------------------------------------------------- sockets
  group('Socket.IO');
  try {
    const { io } = await import('socket.io-client');
    const socket = await new Promise((resolve, reject) => {
      const client = io(base, { path: '/socket.io', transports: ['websocket'], reconnection: false });
      client.once('connect', () => resolve(client));
      client.once('connect_error', reject);
      setTimeout(() => reject(new Error('timed out')), 8000);
    });
    check('a socket client connects', socket.connected);
    socket.disconnect();
  } catch (error) {
    check('a socket client connects', false, error.message);
  }

  const handshake = await fetch(`${base}/socket.io/?EIO=4&transport=polling`, {
    headers: { Origin: new URL(base).origin },
  });
  check('a same-origin browser handshake is accepted', handshake.status === 200, `status ${handshake.status}`);

  // ----------------------------------------------------------------- done
  console.log(`\n\x1b[1m${passed} passed, ${failures.length} failed\x1b[0m`);
  if (failures.length > 0) {
    console.log(`\nFailing: ${failures.join('; ')}`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(`\nSmoke test could not run: ${error.message}`);
  process.exitCode = 1;
});
