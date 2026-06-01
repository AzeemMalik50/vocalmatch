import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const allowedOrigins =
    process.env.FRONTEND_URL?.split(',').map((s) =>
      s.trim().replace(/\/$/, ''),
    ) ?? ['http://localhost:3000'];

  console.log('🔓 CORS allowed origins:', allowedOrigins);

  app.enableCors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      // Allow any *.vercel.app subdomain (preview deployments)
      if (/^https:\/\/[a-z0-9-]+\.vercel\.app$/.test(origin)) {
        return callback(null, true);
      }
      // Allow any *.up.railway.app subdomain (Railway-hosted Swagger UI)
      if (/^https:\/\/[a-z0-9-]+\.up\.railway\.app$/.test(origin)) {
        return callback(null, true);
      }
      // Allow any localhost / 127.0.0.1 origin (dev + local Swagger UI)
      if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
        return callback(null, true);
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

  // OpenAPI / Swagger UI at /api/docs, JSON spec at /api/docs-json.
  // The CLI plugin (nest-cli.json) auto-derives @ApiProperty from
  // class-validator decorators on DTOs, so request bodies render
  // without per-field annotation. Routes and JWT auth surface
  // automatically from the controllers.
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
  // Mount at the literal /api/docs (setGlobalPrefix isn't applied to
  // SwaggerModule.setup paths, so we include the api/ prefix here).
  const docsPath = 'api/docs';
  SwaggerModule.setup(docsPath, app, swaggerDocument, {
    swaggerOptions: { persistAuthorization: true },
  });

  const port = process.env.PORT ?? 4000;
  await app.listen(port, '0.0.0.0');
  const publicUrl =
    process.env.PUBLIC_URL?.replace(/\/$/, '') ?? `http://localhost:${port}`;
  console.log(`🎤 VocalMatch backend running on port ${port}`);
  console.log(`📚 API docs: ${publicUrl}/${docsPath}`);
}
bootstrap();
