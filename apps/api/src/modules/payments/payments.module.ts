import { Global, Module } from '@nestjs/common'
import { ENV, type Env } from '../../config/env'
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
  providers: [
    { provide: PROVIDER_MODULES, inject: [ENV], useFactory: (env: Env) => providerModules(env) },
    PaymentProviders,
    CredentialsVault,
  ],
  exports: [PaymentProviders, CredentialsVault],
})
export class PaymentsModule {}
