import { Global, Module } from '@nestjs/common'
import { ENV, type Env } from '../../config/env'
import { FakePayController } from './fake-pay.controller'
import {
  CredentialsVault,
  PaymentProviders,
  PROVIDER_MODULES,
  providerModules,
} from './payment-providers'

/**
 * The payment providers' modules behind one port, and the vault of their credentials. The shop's
 * modules ask a provider through PaymentProviders, never a module directly.
 */
@Global()
@Module({
  // The pay page of the fake provider answers only where its module is loaded.
  controllers: [FakePayController],
  providers: [
    { provide: PROVIDER_MODULES, inject: [ENV], useFactory: (env: Env) => providerModules(env) },
    PaymentProviders,
    CredentialsVault,
  ],
  exports: [PaymentProviders, CredentialsVault, PROVIDER_MODULES],
})
export class PaymentsModule {}
