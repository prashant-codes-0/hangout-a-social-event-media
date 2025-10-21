import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  // Enable CORS
  app.enableCors();
  
  // Enable validation
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }));
  // Swagger configuration
  const config = new DocumentBuilder()
    .setTitle('🏖️ Hangout App API')
    .setDescription('A social event-based platform where users can discover, create, and join hangouts — real-world meetups organized around shared interests, venues, and sponsors.')
    .setVersion('1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'JWT',
        description: 'Enter JWT token',
        in: 'header',
      },
      'JWT-auth',
    )
    .addTag('Authentication', 'User authentication and admin endpoints')
    .addTag('Hangouts', 'Hangout management endpoints')
    .build();

  const documentFactory = () => SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, documentFactory, {
    swaggerOptions: {
      persistAuthorization: true,
    },
  });
  
  await app.listen(process.env.PORT ?? 3000);
  console.log(`🏖️ Hangout App is running on: http://localhost:${process.env.PORT ?? 3000}`);
  console.log(`📚 Swagger UI is available on: http://localhost:${process.env.PORT ?? 3000}/api`);
}
bootstrap();
