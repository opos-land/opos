import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
import { type NestExpressApplication } from '@nestjs/platform-express'
import { configureApp } from './app'
import { AppModule } from './app.module'
import { loadEnv } from './config/env'

const env = loadEnv()
const app = await NestFactory.create<NestExpressApplication>(AppModule.register(env))
configureApp(app, env)
await app.listen(env.PORT)
