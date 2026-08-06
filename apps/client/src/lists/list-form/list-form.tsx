import { Field } from '@base-ui/react/field'
import { Form } from '@base-ui/react/form'
import { Input } from '@base-ui/react/input'
import { zodResolver } from '@hookform/resolvers/zod'
import { Controller, useForm } from 'react-hook-form'
import { z } from 'zod'
import { InfoBadge } from '../../ui/info-badge/info-badge'
import { ColorPicker } from '../color-picker/color-picker'
import styles from './list-form.module.css'

// docs/specs/lists.md — colours. A list's name and colour are edited
// together and submitted as one edit; the caller decides which of them
// actually changed and what that costs in mutations.
const listFormSchema = z.object({
  displayName: z.string().min(1),
  color: z
    .string()
    .regex(/^#[0-9A-F]{6}$/)
    .optional(),
})
export type ListFormValues = z.infer<typeof listFormSchema>

interface ListFormProps {
  initial?: ListFormValues
  submitLabel: string
  onSubmit: (values: ListFormValues) => void
  onCancel: () => void
}

export function ListForm(props: ListFormProps) {
  const {
    control,
    handleSubmit,
    formState: { isDirty },
  } = useForm<ListFormValues>({
    resolver: zodResolver(listFormSchema),
    defaultValues: {
      displayName: props.initial?.displayName ?? '',
      ...(props.initial?.color !== undefined
        ? { color: props.initial.color }
        : {}),
    },
  })
  return (
    <Form
      className={styles['form']}
      onSubmit={handleSubmit((values) => props.onSubmit(values))}
    >
      <Controller
        name="displayName"
        control={control}
        render={({
          field: { ref, name, value, onBlur, onChange },
          fieldState: { invalid },
        }) => (
          <Field.Root className={styles['field']} name={name} invalid={invalid}>
            <Input
              ref={ref}
              autoFocus
              placeholder="List name"
              value={value}
              onBlur={onBlur}
              onValueChange={onChange}
            />
          </Field.Root>
        )}
      />
      <Controller
        name="color"
        control={control}
        render={({ field: { value, onChange } }) => (
          <div className={styles['field']}>
            <span className={styles['label']}>
              Colour
              <InfoBadge label="About list colours">
                Colours use a CalDAV extension, not the core standard. Most
                servers support it; one that doesn&rsquo;t will ignore the
                colour rather than fail.
              </InfoBadge>
            </span>
            <ColorPicker value={value} onChange={onChange} />
          </div>
        )}
      />
      <div className={styles['actions']}>
        {/* Nothing to save until something changes: an untouched form would
            otherwise queue a mutation and cost a PROPPATCH that writes the
            values already on the server. `isDirty` compares against
            `defaultValues` above, so an edited list starts clean and only
            goes dirty on a real change. *(added 2026-08-03.)* */}
        <button type="submit" className={styles['submit']} disabled={!isDirty}>
          {props.submitLabel}
        </button>
        <button
          type="button"
          className={styles['cancel']}
          onClick={props.onCancel}
        >
          Cancel
        </button>
      </div>
    </Form>
  )
}
