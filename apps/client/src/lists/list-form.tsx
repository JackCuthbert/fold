import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { z } from 'zod'

const listFormSchema = z.object({ displayName: z.string().min(1) })
type ListForm = z.infer<typeof listFormSchema>

export function ListNameForm(props: {
  initial?: string
  submitLabel: string
  onSubmit: (displayName: string) => void
  onCancel: () => void
}) {
  const { register, handleSubmit } = useForm<ListForm>({
    resolver: zodResolver(listFormSchema),
    defaultValues: { displayName: props.initial ?? '' },
  })
  return (
    <form
      className="list-form"
      onSubmit={handleSubmit((values) => props.onSubmit(values.displayName))}
    >
      <input autoFocus placeholder="List name" {...register('displayName')} />
      <button type="submit">{props.submitLabel}</button>
      <button type="button" onClick={props.onCancel}>
        Cancel
      </button>
    </form>
  )
}
