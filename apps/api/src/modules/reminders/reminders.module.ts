import { Module } from '@nestjs/common'
import { CheckoutModule } from '../checkout/checkout.module'
import { PreEditionReminders } from './pre-edition-reminders.service'
import { RemindersRepository } from './reminders.repository'

/** The reminder a buyer gets before the edition (docs/specs/0011-pre-edition-reminder.md). */
@Module({
  imports: [CheckoutModule],
  providers: [RemindersRepository, PreEditionReminders],
})
export class RemindersModule {}
