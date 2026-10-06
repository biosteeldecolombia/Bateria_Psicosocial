import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import helmet from '@fastify/helmet';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import fs from 'node:fs';
import path from 'node:path';
import type { Role } from '@sanithelp/shared';
import type { Config } from './config.js';
import type { Db } from './db/client.js';
import { loadAuth, type AuthContext } from './auth/service.js';
import { createCrypto, type Crypto } from './security/crypto.js';
import { hashPassword } from './security/passwords.js';
import { authRoutes } from './routes/auth.js';
import { adminRoutes } from './routes/admin.js';
import { campaignRoutes } from './routes/campaigns.js';
import { participationRoutes } from './routes/participation.js';
import { flowRoutes } from './routes/flow.js';
import { resultsRoutes } from './routes/results.js';
import { exportRoutes } from './routes/exports.js';
import { companyRoutes } from './routes/company.js';
import { rightsRoutes } from './routes/rights.js';
import { profileRoutes } from './routes/profile.js';

declare module 'fastify' {
  interface FastifyRequest {
    auth: AuthContext | null;
  }
  interface FastifyInstance {
    appCtx: AppContext;
    requireReady: (...roles: Role[]) => (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

export interface AppContext {
  cfg: Config;
  db: Db;
  crypto: Crypto;
  dummyHash: string;
  cookieName: string;
}

export async function buildApp(cfg: Config, db: Db): Promise<FastifyInstance> {
  const crypto = createCrypto(cfg);
  const isProd = cfg.NODE_ENV === 'production';
  const ctx: AppContext = {
    cfg,
    db,
    crypto,
    dummyHash: await hashPassword('hash-de-relleno-para-igualar-tiempos'),
    cookieName: isProd ? '__Host-sid' : 'sid',
  };

  const app = Fastify({
    logger: cfg.NODE_ENV === 'test' ? false : { level: 'info', redact: ['req.headers.cookie', 'req.headers.authorization'] },
    trustProxy: true,
    bodyLimit: 1_000_000,
  });
  app.decorate('appCtx', ctx);
  app.decorateRequest('auth', null);

  await app.register(helmet, {
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"], // Vite/estilos de preferencias de accesibilidad
        imgSrc: ["'self'", 'data:'], // data: para el QR de MFA
        fontSrc: ["'self'"],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
      },
    },
    hsts: isProd ? { maxAge: 31_536_000, includeSubDomains: true } : false,
    referrerPolicy: { policy: 'no-referrer' },
  });
  await app.register(cookie);
  // Solo API. Se limita por sesión (o IP si no hay): una oficina con muchos colaboradores detrás de una misma IP no se bloquea entre sí.
  await app.register(rateLimit, {
    global: true,
    max: 600,
    timeWindow: '1 minute',
    allowList: (req) => !req.url.startsWith('/api/'),
    keyGenerator: (req) => {
      const sid = req.cookies?.[ctx.cookieName];
      return sid ? `s:${crypto.hashToken(sid).slice(0, 24)}` : `ip:${req.ip}`;
    },
  });

  const allowedOrigin = new URL(cfg.APP_BASE_URL).origin;

  // Autenticación + protección CSRF (Origin + token por sesión) en cada petición.
  app.addHook('onRequest', async (req, reply) => {
    if (!req.url.startsWith('/api/')) return;
    req.auth = await loadAuth(db, crypto, req.cookies[ctx.cookieName]);
    reply.header('Cache-Control', 'no-store');

    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return;
    const origin = req.headers.origin;
    const originOk = origin ? origin === allowedOrigin || (cfg.NODE_ENV !== 'production' && /^https?:\/\/localhost(:\d+)?$/.test(origin)) : cfg.NODE_ENV !== 'production';
    if (!originOk) return reply.code(403).send({ error: 'Origen no permitido' });
    const isLogin = req.url.split('?')[0] === '/api/auth/login';
    if (!isLogin && req.auth && req.headers['x-csrf-token'] !== req.auth.session.csrfToken) {
      return reply.code(403).send({ error: 'Token CSRF inválido' });
    }
  });

  app.decorate('requireReady', (...roles: Role[]) => async (req: FastifyRequest, reply: FastifyReply) => {
    if (!req.auth) return reply.code(401).send({ error: 'No autenticado' });
    if (req.auth.status !== 'ready') return reply.code(403).send({ error: 'Completa los pasos de seguridad pendientes', status: req.auth.status });
    if (roles.length && !roles.includes(req.auth.user.role)) return reply.code(403).send({ error: 'Sin permiso' });
  });

  app.get('/api/health', { config: { rateLimit: false } }, async () => ({ status: 'ok' }));
  await app.register(authRoutes, { prefix: '/api/auth' });
  await app.register(adminRoutes, { prefix: '/api' });
  await app.register(campaignRoutes, { prefix: '/api' });
  await app.register(participationRoutes, { prefix: '/api/participation' });
  await app.register(flowRoutes, { prefix: '/api/participation' });
  await app.register(resultsRoutes, { prefix: '/api' });
  await app.register(exportRoutes, { prefix: '/api' });
  await app.register(companyRoutes, { prefix: '/api' });
  await app.register(rightsRoutes, { prefix: '/api' });
  await app.register(profileRoutes, { prefix: '/api' });

  // Cliente (SPA) servido desde el mismo dominio.
  const dist = path.resolve(process.cwd(), cfg.CLIENT_DIST);
  if (fs.existsSync(dist)) {
    await app.register(fastifyStatic, { root: dist, wildcard: false });
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/api/')) return reply.code(404).send({ error: 'No encontrado' });
      return reply.sendFile('index.html');
    });
  } else {
    app.setNotFoundHandler((_req, reply) => reply.code(404).send({ error: 'No encontrado' }));
  }

  app.setErrorHandler((err: Error & { statusCode?: number }, req, reply) => {
    if (err.statusCode && err.statusCode < 500) return reply.code(err.statusCode).send({ error: err.message });
    req.log.error({ err: err.message }, 'Error interno');
    return reply.code(500).send({ error: 'Error interno del servidor' });
  });

  return app;
}
