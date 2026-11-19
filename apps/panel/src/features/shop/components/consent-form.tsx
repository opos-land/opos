import { Trans, useLingui } from '@lingui/react/macro'
import { type EditionDocument } from '@opos/contract'
import { type ReactNode, useState } from 'react'
import { Button, FormField, NativeSelect, NativeSelectOption, Textarea } from '../../../shared/ui'

export interface ConsentFields {
  text: string
  isRequired: boolean
  documentId: string | null
}

/**
 * The fields of a consent, for a new one and for one changed in place: the sentence the buyer
 * accepts, whether the buyer must, and the document of the edition it links. The wording is the
 * convention's own.
 */
export function ConsentForm({
  initial,
  documents,
  pending,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial: ConsentFields
  documents: EditionDocument[]
  pending: boolean
  submitLabel: ReactNode
  onSubmit: (fields: ConsentFields) => void
  onCancel?: () => void
}) {
  const { t } = useLingui()
  const [text, setText] = useState(initial.text)
  const [isRequired, setRequired] = useState(initial.isRequired)
  const [documentId, setDocumentId] = useState(initial.documentId ?? '')
  const sentence = text.trim()

  return (
    <form
      noValidate
      className="flex max-w-lg flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault()
        if (sentence) onSubmit({ text: sentence, isRequired, documentId: documentId || null })
      }}
    >
      <FormField
        label={t`Sentence the buyer accepts`}
        hint={t`Shown at the checkout beside a checkbox, in your own words, up to 1000 characters.`}
      >
        {(control) => (
          <Textarea
            {...control}
            rows={3}
            maxLength={1000}
            value={text}
            onChange={(event) => setText(event.target.value)}
          />
        )}
      </FormField>
      <FormField label={t`The buyer`}>
        {(control) => (
          <NativeSelect
            {...control}
            value={isRequired ? 'required' : 'optional'}
            onChange={(event) => setRequired(event.target.value === 'required')}
          >
            <NativeSelectOption value="required">{t`must accept it to order`}</NativeSelectOption>
            <NativeSelectOption value="optional">{t`may accept it or not`}</NativeSelectOption>
          </NativeSelect>
        )}
      </FormField>
      <FormField label={t`Linked document`}>
        {(control) => (
          <NativeSelect
            {...control}
            value={documentId}
            onChange={(event) => setDocumentId(event.target.value)}
          >
            <NativeSelectOption value="">{t`None`}</NativeSelectOption>
            {documents.map((document) => (
              <NativeSelectOption key={document.id} value={document.id}>
                {document.title}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        )}
      </FormField>
      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={!sentence || pending}>
          {submitLabel}
        </Button>
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel}>
            <Trans>Cancel</Trans>
          </Button>
        )}
      </div>
    </form>
  )
}
