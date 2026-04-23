const fs = require('mz/fs');
const path = require('path');
const http = require('http');
const url = require('url');
const { Readable } = require('stream');

let original = [];
let flipped = [];

(async () => {
  const framesPath = 'frames';
  const files = await fs.readdir(framesPath);

  original = await Promise.all(files.map(async (file) => {
    const frame = await fs.readFile(path.join(framesPath, file));
    return frame.toString();
  }));

  flipped = original.map(f => {
    return f
      .toString()
      .split('')
      .reverse()
      .join('')
  })
})().catch((err) => {
  console.log('Error loading frames');
  console.log(err);
});

function streamer(stream, opts) {
  const frames = opts.flip ? flipped : original;
  let index = 0;
  let timer;

  function tick() {
    
    stream.push('\u001b[2J\u001b[3J\u001b[H');

    const frame = frames[index];

    const ok = stream.push(frame);
    index = (index + 1) % frames.length;

    if (ok) {
      timer = setTimeout(tick, 500);
    } else {
      stream.once('drain', () => {
        timer = setTimeout(tick, 500);
      });
    }
  }

  tick();

  return () => {
    clearTimeout(timer);
  };
}

const validateQuery = ({ flip }) => ({ flip: String(flip).toLowerCase() === 'true' });

const server = http.createServer((req, res) => {

  if (req.url === '/healthcheck') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ status: 'ok' }));
  }

  if (
    req.headers &&
    req.headers['user-agent'] &&
    !req.headers['user-agent'].includes('curl')
  ) {
    res.writeHead(302, { Location: 'https://github.com/henri-santos/belo.live' });
    return res.end();
  }

  const stream = new Readable({ read() {} });
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
  stream.pipe(res);

  const opts = validateQuery(url.parse(req.url, true).query);
  const cleanupLoop = streamer(stream, opts);

  const onClose = () => {
    stream.push('\u001b[?25h');
    cleanupLoop();
    stream.destroy();
  };
  res.on('close', onClose);
  res.on('error', onClose);
});

const port = process.env.PORT || process.env.BELO_PORT || 3000;
server.listen(port, err => {
  if (err) throw err;
  console.log(`Servidor a correr em http://localhost:${port}`);
});