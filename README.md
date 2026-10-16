# Last Stick Standing (online)

Up to 4 players, each on their own device. Create a room, share the link, fight.
No dependencies: the server uses only Node.js built-in modules.

## Run it on your own computer (to try it first)

1. Install Node.js 18 or newer (https://nodejs.org).
2. In this folder run: `node server.js`
3. Open http://localhost:3000 in your browser. Open a second tab to test with two players.

## Put it online so friends can join from anywhere

Any host that runs Node.js works. The server reads the port from the `PORT`
environment variable, which hosts set for you. Steps for Render (free plan):

1. Create a free account at https://github.com and make a new repository. Upload every file in this folder to it.
2. Create a free account at https://render.com and choose New > Web Service.
3. Connect your GitHub repository.
4. Use these settings: Runtime `Node`, Build Command left empty (or `echo ok`), Start Command `node server.js`, Instance type `Free`.
5. Deploy. After a minute you get a web address like `https://your-game.onrender.com`.
6. Open it, press Create a room, and send the invite link to your friends.

Notes
- Free plans sleep after a while with no visitors. The first visit afterwards can take about 30 seconds.
- Rooms live in memory. If the server restarts, rooms are gone and players must make a new one.
- The page connects with `wss://` automatically when the site is on https.
- `render.yaml` is included for Render's "Blueprint" option; the manual steps above are the safest route.

## How to play

- Move: A / D (or arrow keys). Jump: W, Up or Space. Aim: mouse. Shoot or punch: left click.
- Weapons drop from above. Walk over one to pick it up. With no weapon you punch.
- Last player alive wins the round. First to the target number of round wins takes the match.
- Characters: Stick fighter (floaty, chaotic) and Blob fighter (tighter, faster). Same weapons and cards for both.
- Host controls (lobby and during the match): first-to target, allowed maps, and card rule: Off, Losers pick (everyone except the round winner), Everyone picks. Each pick has a 15 second timer.
- The first player in the room is the host. If the host leaves, the next player becomes host.

## Files

- `server.js` rooms, lobby messages, static file server
- `ws.js` small WebSocket server (no outside library)
- `game.js` authoritative game simulation (physics, weapons, cards, rounds)
- `public/data.js` maps, weapons, cards, characters (shared by server and browser)
- `public/index.html` lobby, rendering, input
- `test-bots.js` runs four bot clients through a match: `node test-bots.js`

## Known limits

- Needs a keyboard and mouse (no touch controls).
- The browser shows other players about 100 ms in the past so movement looks smooth; your own movement also waits for the server, so high ping feels laggy.
- No bots in the online version; every slot is a real player.
