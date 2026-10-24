import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
import { type NestExpressApplication } from '@nestjs/platform-express'
import { loadCatalogs } from '@opos/i18n'
import { configureApp } from './app'
import { AppModule } from './app.module'
import { loadEnv } from './config/env'

const env = loadEnv()
// A bundle that lost a catalog fails here, not on the first email it renders.
await loadCatalogs()
const app = await NestFactory.create<NestExpressApplication>(AppModule.register(env))
await configureApp(app, env)
await app.listen(env.PORT)
