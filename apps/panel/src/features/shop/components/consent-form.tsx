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
  linksDocument = true,
}: {
  initial: ConsentFields
  documents: EditionDocument[]
  pending: boolean
  submitLabel: ReactNode
  onSubmit: (fields: ConsentFields) => void
  onCancel?: () => void
  /** A consent that exists links its document for good: only a new one chooses it. */
  linksDocument?: boolean
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
      <FormField label={t`Acceptance`}>
        {(control) => (
          <NativeSelect
            {...control}
            value={isRequired ? 'required' : 'optional'}
            onChange={(event) => setRequired(event.target.value === 'required')}
          >
            <NativeSelectOption value="required">
              {t`Required: the buyer must accept the consent to order`}
            </NativeSelectOption>
            <NativeSelectOption value="optional">
              {t`Optional: the buyer can order without accepting the consent`}
            </NativeSelectOption>
          </NativeSelect>
        )}
      </FormField>
      {linksDocument ? (
        <FormField
          label={t`Linked document`}
          hint={t`Chosen once: a consent links its document for good.`}
        >
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
      ) : (
        <p className="text-muted-foreground text-sm">
          <Trans>
            A consent links its document for good. To link another one, add a new consent.
          </Trans>
        </p>
      )}
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
