import { type Api } from '../../../shared/lib/api'

export const brandingOptions = (api: Api) => api.branding.get.queryOptions()

export const putLogoOptions = (api: Api) => api.branding.putLogo.mutationOptions()

export const removeLogoOptions = (api: Api) => api.branding.removeLogo.mutationOptions()
