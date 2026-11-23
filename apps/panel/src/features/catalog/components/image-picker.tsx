import { useLingui } from '@lingui/react/macro'
import { MERCHANDISE_IMAGE_TYPES, type UploadedFile } from '@opos/contract'
import { type ReactNode, useState } from 'react'
import { toUpload } from '../../../shared/lib/file-upload'
import { notifyFailure } from '../../../shared/lib/notify'
import { Button, FormField, Input } from '../../../shared/ui'
import { imageProblem } from '../model/merchandise'

/**
 * Chooses an image for an item, a picture or a size chart, and hands it over as a route carries
 * it. A file of another type or over the limit is told beside the field and never sent.
 */
export function ImagePicker({
  label,
  submitLabel,
  pending,
  onSubmit,
}: {
  label: string
  submitLabel: ReactNode
  pending: boolean
  onSubmit: (file: UploadedFile) => Promise<unknown>
}) {
  const { t } = useLingui()
  const [file, setFile] = useState<File | null>(null)
  const [problem, setProblem] = useState<'type' | 'size' | null>(null)
  // A new key empties the field once its file is sent.
  const [field, setField] = useState(0)

  const choose = (chosen: File | undefined) => {
    const found = chosen ? imageProblem(chosen) : null
    setProblem(found)
    setFile(chosen && !found ? chosen : null)
  }
  /** Reading the file comes before the write, so a file that cannot be read is told here. */
  const send = async () => {
    if (!file) return
    let upload: UploadedFile
    try {
      upload = await toUpload(file)
    } catch (error) {
      notifyFailure(error)
      return
    }
    try {
      await onSubmit(upload)
      setFile(null)
      setField((key) => key + 1)
    } catch {
      // The write told its own failure; the chosen file stays, to be sent again.
    }
  }

  return (
    <div className="flex max-w-lg flex-col gap-3">
      <FormField
        label={label}
        hint={t`A JPEG, PNG or WebP image of up to 5 MB.`}
        error={
          problem === 'type'
            ? t`Choose a JPEG, PNG or WebP image.`
            : problem === 'size' && t`The image is over 5 MB. Choose a smaller one.`
        }
      >
        {(control) => (
          <Input
            key={field}
            {...control}
            type="file"
            accept={MERCHANDISE_IMAGE_TYPES.join(',')}
            onChange={(event) => choose(event.target.files?.[0])}
          />
        )}
      </FormField>
      <div>
        <Button variant="outline" disabled={!file || pending} onClick={() => void send()}>
          {submitLabel}
        </Button>
      </div>
    </div>
  )
}
