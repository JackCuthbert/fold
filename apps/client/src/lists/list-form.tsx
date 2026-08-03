import { Field } from '@base-ui/react/field'
import { Form } from '@base-ui/react/form'
import { Input } from '@base-ui/react/input'
import { zodResolver } from '@hookform/resolvers/zod'
import { Controller, useForm } from 'react-hook-form'
import { z } from 'zod'
import { ExtensionBadge } from '../extension-badge'
import { ColorPicker } from './color-picker'
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

export function ListForm(props: {
  initial?: ListFormValues
  submitLabel: string
  onSubmit: (values: ListFormValues) => void
  onCancel: () => void
}) {
  const { control, handleSubmit } = useForm<ListFormValues>({
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
              <ExtensionBadge label="About list colours">
                Colours use a CalDAV extension, not the core standard. Most
                servers support it; one that doesn&rsquo;t will ignore the
                colour rather than fail.
              </ExtensionBadge>
            </span>
            <ColorPicker value={value} onChange={onChange} />
          </div>
        )}
      />
      <div className={styles['actions']}>
        <button type="submit" className={styles['submit']}>
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
