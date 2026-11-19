import { type ContractMeta, MAX_UPLOAD_BODY } from '@opos/contract'
import { type AnyContractRouter, isContractProcedure } from '@orpc/contract'
import express, { type RequestHandler } from 'express'
import { fileTooLarge } from './errors'

/** The method and Express path of every route of the contract marked as taking a file. */
export function uploadRoutes(router: AnyContractRouter): { method: string; path: string }[] {
  return Object.values(router).flatMap((value: AnyContractRouter) => {
    if (!isContractProcedure(value)) return uploadRoutes(value)
    const meta = value['~orpc'].meta as ContractMeta
    if (!meta.takesFile) return []
    const { method = 'GET', path = '/' } = value['~orpc'].route
    return [{ method, path: path.replace(/\{(\w+)\}/g, ':$1') }]
  })
}

/**
 * The JSON body of a route that takes a file, up to MAX_UPLOAD_BODY: a file of 15 MB as base64
 * (docs/specs/0012-file-storage.md). It runs before the default parser, which then leaves the
 * parsed body alone; every other route keeps the default limit.
 */
export function uploadBodyParser(router: AnyContractRouter): RequestHandler {
  const json = express.json({ limit: MAX_UPLOAD_BODY })
  const parse: RequestHandler = (req, res, next) =>
    json(req, res, (error?: unknown) => {
      const tooLarge = (error as { type?: unknown } | undefined)?.type === 'entity.too.large'
      next(tooLarge ? fileTooLarge() : error)
    })
  const routes = express.Router()
  for (const { method, path } of uploadRoutes(router)) {
    routes[method.toLowerCase() as 'post' | 'put' | 'patch'](path, parse)
  }
  return routes
}
