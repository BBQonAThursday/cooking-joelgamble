// Google OAuth (server-side code flow) + a stateless, signed session cookie.
// Chosen over Netlify Identity because this is a server-rendered, multi-page app:
// a cookie is sent on every navigation and HTMX post, whereas Identity's
// Bearer-token model can't ride along on plain <a href> page loads.
const crypto = require('node:crypto');
const cookie = require('cookie');
const { OAuth2Client } = require('google-auth-library');

const SESSION_COOKIE = 'rb_session';
const STATE_COOKIE = 'rb_oauth_state';
const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

function baseUrl() {
  return (process.env.BASE_URL || 'http://localhost:3003').replace(/\/$/, '');
}
function isSecure() {
  return baseUrl().startsWith('https');
}
function oauthClient() {
  return new OAuth2Client(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    `${baseUrl()}/auth/callback`
  );
}
function allowedEmails() {
  return (process.env.ALLOWED_EMAILS || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

// Signed token: base64url(payload).base64url(HMAC-SHA256(payload)).
function sign(payload) {
  const secret = process.env.SESSION_SECRET || '';
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${sig}`;
}
function verify(token) {
  if (!token || typeof token !== 'string') return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const secret = process.env.SESSION_SECRET || '';
  const expected = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const obj = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (obj.exp && Date.now() > obj.exp) return null;
    return obj;
  } catch {
    return null;
  }
}

function setCookie(res, name, value, maxAge) {
  const prev = res.getHeader('Set-Cookie');
  const serialized = cookie.serialize(name, value, {
    httpOnly: true,
    secure: isSecure(),
    sameSite: 'lax',
    path: '/',
    maxAge
  });
  res.setHeader('Set-Cookie', prev ? [].concat(prev, serialized) : serialized);
}

// Registers session parsing, the OAuth routes, and the auth gate. Routes mounted
// AFTER this require a valid session; /login, /auth/callback, /logout do not.
function install(app) {
  app.use((req, res, next) => {
    const cookies = cookie.parse(req.headers.cookie || '');
    req.user = verify(cookies[SESSION_COOKIE]);
    next();
  });

  app.get('/login', (req, res) => {
    const state = crypto.randomBytes(16).toString('hex');
    setCookie(res, STATE_COOKIE, sign({ s: state, exp: Date.now() + 10 * 60 * 1000 }), 600);
    const url = oauthClient().generateAuthUrl({
      scope: ['openid', 'email', 'profile'],
      state,
      prompt: 'select_account'
    });
    res.redirect(url);
  });

  app.get('/auth/callback', async (req, res, next) => {
    try {
      const { code, state } = req.query;
      const cookies = cookie.parse(req.headers.cookie || '');
      const stateCookie = verify(cookies[STATE_COOKIE]);
      if (!code || !state || !stateCookie || stateCookie.s !== state) {
        return res.status(403).type('text').send('Invalid or expired sign-in attempt. Please try again.');
      }
      const client = oauthClient();
      const { tokens } = await client.getToken(String(code));
      const ticket = await client.verifyIdToken({
        idToken: tokens.id_token,
        audience: process.env.GOOGLE_CLIENT_ID
      });
      const payload = ticket.getPayload();
      const email = String(payload.email || '').toLowerCase();
      const allow = allowedEmails();
      if (allow.length && !allow.includes(email)) {
        setCookie(res, STATE_COOKIE, '', 0);
        return res
          .status(403)
          .type('html')
          .send(`<p>${email} isn't on the guest list for this recipe box. Ask Joel to add you.</p><p><a href="/logout">Try another account</a></p>`);
      }
      const session = sign({
        sub: payload.sub,
        email,
        name: payload.name || email,
        exp: Date.now() + SESSION_MAX_AGE * 1000
      });
      setCookie(res, SESSION_COOKIE, session, SESSION_MAX_AGE);
      setCookie(res, STATE_COOKIE, '', 0);
      res.redirect('/');
    } catch (err) {
      next(err);
    }
  });

  app.get('/logout', (req, res) => {
    setCookie(res, SESSION_COOKIE, '', 0);
    res.redirect('/login');
  });

  // Gate: everything mounted after this needs a valid session.
  app.use((req, res, next) => {
    if (req.user && req.user.sub) {
      req.userId = req.user.sub;
      req.userEmail = req.user.email;
      res.locals.userEmail = req.user.email;
      return next();
    }
    res.redirect('/login');
  });
}

module.exports = { install, sign, verify };
