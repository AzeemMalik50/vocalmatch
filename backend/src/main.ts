// Load .env before any module evaluation so static registrations like
// JwtModule.register({ secret: process.env.JWT_SECRET! }) see the value.
// ConfigModule.forRoot() also calls dotenv.config() but fires after
// NestFactory.create() begins wiring modules — too late for static factories.
// eslint-disable-next-line @typescript-eslint/no-require-imports
require('dotenv').config();

import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { assertRequiredEnv } from './main.guards';

async function bootstrap() {
  assertRequiredEnv();

  const app = await NestFactory.create(AppModule);

  // Helmet is intentionally minimal here. This server is a JSON API.
  // The frontend (Next.js on Vercel) sets its own CSP at the HTML layer;
  // enabling CSP here yields zero defensive value for JSON responses
  // and would break Swagger UI without an unsafe-inline allowance.
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      crossOriginEmbedderPolicy: false,
      hsts: {
        maxAge: 63072000, // 2 years
        includeSubDomains: true,
        preload: true,
      },
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
      // Helmet defaults provide:
      //   X-Content-Type-Options: nosniff
      //   X-DNS-Prefetch-Control: off
      //   X-Download-Options: noopen
      //   X-Frame-Options: DENY
      //   X-Permitted-Cross-Domain-Policies: none
    }),
  );

  const allowedOrigins =
    process.env.FRONTEND_URL?.split(',').map((s) =>
      s.trim().replace(/\/$/, ''),
    ) ?? ['http://localhost:3000'];

  console.log('🔓 CORS allowed origins:', allowedOrigins);

  const isProd = process.env.NODE_ENV === 'production';

  // Project-scoped Vercel previews. Tighter than a `*.vercel.app`
  // wildcard (which would accept ANY Vercel-hosted origin, including
  // attacker-owned previews) but loose enough to cover this project's
  // dev / staging / pr-NN preview deployments without an env-var dance
  // every time a new preview spins up. Add additional project prefixes
  // here if a sibling Vercel project also needs to call this backend.
  const PROJECT_VERCEL_PREVIEW =
    /^https:\/\/vocalmatch(?:-[a-z0-9-]+)?\.vercel\.app$/;

  app.enableCors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);

      // Allowed in BOTH dev and prod: only this project's named Vercel
      // previews. Wide-open `*.vercel.app` stays dev-only below.
      if (PROJECT_VERCEL_PREVIEW.test(origin)) return callback(null, true);

      if (!isProd) {
        // Dev / preview deployments: allow Vercel previews, Railway-hosted
        // Swagger UI, and local origins.
        if (/^https:\/\/[a-z0-9-]+\.vercel\.app$/.test(origin)) {
          return callback(null, true);
        }
        if (/^https:\/\/[a-z0-9-]+\.up\.railway\.app$/.test(origin)) {
          return callback(null, true);
        }
        if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
          return callback(null, true);
        }
      }

      console.warn(`❌ CORS blocked: ${origin}`);
      callback(new Error(`Origin ${origin} not allowed by CORS`));
    },
    credentials: true,
  });

  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      // Reject requests that include unknown body fields rather than silently
      // dropping them. Without this, mistakes like passing `votingClosesAt`
      // to an endpoint that only accepts `hours` go unnoticed and the caller
      // sees a default value applied instead of the value they sent.
      forbidNonWhitelisted: true,
    }),
  );

  const enableDocs =
    process.env.NODE_ENV !== 'production' ||
    process.env.ENABLE_DOCS === 'true';

  if (enableDocs) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('VocalMatch API')
      .setDescription(
        'REST endpoints and SSE streams powering the VocalMatch platform — ' +
          'auth, uploads, battles, voting, Red Phone challenges, and notifications.',
      )
      .setVersion('0.2.0')
      .addBearerAuth(
        { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        'bearer',
      )
      .build();
    const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
    const docsPath = 'api/docs';
    SwaggerModule.setup(docsPath, app, swaggerDocument, {
      swaggerOptions: { persistAuthorization: true },
    });
  }

  const port = process.env.PORT ?? 4000;
  await app.listen(port, '0.0.0.0');
  const publicUrl =
    process.env.PUBLIC_URL?.replace(/\/$/, '') ?? `http://localhost:${port}`;
  console.log(`🎤 VocalMatch backend running on port ${port}`);
  if (enableDocs) {
    console.log(`📚 API docs: ${publicUrl}/api/docs`);
  }
}
bootstrap();
