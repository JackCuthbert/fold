import { Field } from '@base-ui/react/field'
import { Form } from '@base-ui/react/form'
import { Input } from '@base-ui/react/input'
import { zodResolver } from '@hookform/resolvers/zod'
import { Controller, useForm } from 'react-hook-form'
import { z } from 'zod'
import styles from './list-form.module.css'

const listFormSchema = z.object({ displayName: z.string().min(1) })
type ListForm = z.infer<typeof listFormSchema>

export function ListNameForm(props: {
  initial?: string
  submitLabel: string
  onSubmit: (displayName: string) => void
  onCancel: () => void
}) {
  const { control, handleSubmit } = useForm<ListForm>({
    resolver: zodResolver(listFormSchema),
    defaultValues: { displayName: props.initial ?? '' },
  })
  return (
    <Form
      className={styles['form']}
      onSubmit={handleSubmit((values) => props.onSubmit(values.displayName))}
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
