import { accountApi } from '../../../shared/lib/api'

/** `POST /admin/accounts/reset-2fa`: needs a sign-in of the last 5 minutes. */
export const resetTwoFactorOptions = () => accountApi.admin.resetTwoFactor.mutationOptions()
