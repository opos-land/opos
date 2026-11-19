import { type DynamicModule, Module } from '@nestjs/common'
import { ENV, type Env } from '../../config/env'
import { FileStorage, S3FileStorage } from './file-storage'
import { FILE_KINDS, FilesService } from './files.service'
import { ImageServer } from './image-server'
import { defineKinds, type FileKind } from './kinds'
import { FileSweep } from './sweep.service'

/**
 * The storage of files, a part of the core with no route of its own: the features that take files
 * call FilesService from their own routes.
 */
@Module({})
export class FilesModule {
  static register(kinds: readonly FileKind[]): DynamicModule {
    return {
      module: FilesModule,
      global: true,
      providers: [
        // A wrong declaration stops the API on start.
        { provide: FILE_KINDS, useValue: defineKinds(kinds) },
        { provide: FileStorage, inject: [ENV], useFactory: (env: Env) => new S3FileStorage(env) },
        { provide: ImageServer, inject: [ENV], useFactory: (env: Env) => new ImageServer(env) },
        FilesService,
        FileSweep,
      ],
      exports: [FilesService, FileSweep],
    }
  }
}
